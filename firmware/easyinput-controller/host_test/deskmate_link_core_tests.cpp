#include "deskmate_link_core.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <string_view>

using namespace deskmate::easyinput;

namespace {
int failures = 0;

void check(bool passed, const char* expression, const char* file, int line) {
    if (passed) return;
    std::cerr << file << ':' << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

#define CHECK(expression) check((expression), #expression, __FILE__, __LINE__)

std::uint8_t nibble(char value) {
    if (value >= '0' && value <= '9') return static_cast<std::uint8_t>(value - '0');
    return static_cast<std::uint8_t>(value - 'A' + 10);
}

LinkWireFrame from_hex(std::string_view hex) {
    LinkWireFrame wire{};
    CHECK((hex.size() % 2) == 0);
    CHECK(hex.size() / 2 <= wire.bytes.size());
    wire.length = static_cast<std::uint16_t>(hex.size() / 2);
    for (std::size_t index = 0; index < wire.length; ++index) {
        wire.bytes[index] = static_cast<std::uint8_t>(
            (nibble(hex[index * 2]) << 4u) | nibble(hex[index * 2 + 1]));
    }
    return wire;
}

bool same_wire(const LinkWireFrame& left, std::string_view right_hex) {
    const LinkWireFrame right = from_hex(right_hex);
    return left.length == right.length &&
           std::equal(left.bytes.begin(), left.bytes.begin() + left.length,
                      right.bytes.begin());
}

bool parse_wire(const LinkWireFrame& wire, LinkFrame& frame,
                LinkStreamParser* parser_out = nullptr) {
    LinkStreamParser local;
    LinkStreamParser& parser = parser_out == nullptr ? local : *parser_out;
    bool ready = false;
    for (std::size_t index = 0; index < wire.length; ++index) {
        ready = parser.push(wire.bytes[index], static_cast<std::uint32_t>(index), frame) || ready;
    }
    return ready;
}

LinkFrame response(LinkMessageType type, std::uint32_t sequence,
                   const std::uint8_t* payload, std::uint16_t length,
                   LinkFrameFlag flag = LinkFrameFlag::Response) {
    LinkFrame frame{};
    frame.flag = flag;
    frame.type = static_cast<std::uint8_t>(type);
    frame.sequence = sequence;
    frame.payload_length = length;
    if (length != 0) std::copy_n(payload, length, frame.payload.begin());
    return frame;
}

void golden_vectors_roundtrip() {
    struct Vector {
        const char* name;
        const char* hex;
        std::uint8_t type;
        LinkFrameFlag flag;
    };
    const std::array<Vector, 9> vectors = {{
        {"hello_request", "444D4C4B01010100010000000700010101443322118228", 1, LinkFrameFlag::Request},
        {"hello_response", "444D4C4B010201000100000008000201DDCCBBAA8000F8E6", 1, LinkFrameFlag::Response},
        {"capabilities_request", "444D4C4B01010200020000000000B961", 2, LinkFrameFlag::Request},
        {"capabilities_response", "444D4C4B01020200020000000A0003000000030000008000CBA6", 2, LinkFrameFlag::Response},
        {"status_request", "444D4C4B01010300030000000000CA63", 3, LinkFrameFlag::Request},
        {"status_response", "444D4C4B01020300030000000B00DDCCBBAA04030201030100ECC3", 3, LinkFrameFlag::Response},
        {"set_agent_state_request", "444D4C4B010104000400000005004030201002652E", 4, LinkFrameFlag::Request},
        {"set_agent_state_response", "444D4C4B010204000400000005004030201002C6A3", 4, LinkFrameFlag::Response},
        {"busy_error", "444D4C4B01040400050000000100048F33", 4, LinkFrameFlag::Error},
    }};
    for (const auto& vector : vectors) {
        const LinkWireFrame expected = from_hex(vector.hex);
        LinkFrame decoded{};
        CHECK(parse_wire(expected, decoded));
        CHECK(decoded.type == vector.type);
        CHECK(decoded.flag == vector.flag);
        LinkWireFrame encoded{};
        CHECK(encode_deskmate_link_frame(decoded, encoded));
        CHECK(same_wire(encoded, vector.hex));
        (void)vector.name;
    }
}

void parser_recovers_from_noise_and_failures() {
    const LinkWireFrame good =
        from_hex("444D4C4B01010300030000000000CA63");
    const std::array<const char*, 4> bad = {{
        "444D4C4B0201010007000000070001010144332211CF96",
        "444D4C4B0103010008000000070001010144332211D226",
        "444D4C4B0101010109000000070001010144332211B958",
        "444D4C4B01010300030000000000CA62",
    }};
    LinkStreamParser parser;
    LinkFrame frame{};
    const std::array<std::uint8_t, 7> noise = {'x', 'D', 'M', 'x', 0, 1, 2};
    for (std::uint8_t byte : noise) CHECK(!parser.push(byte, 0, frame));
    for (const char* hex : bad) {
        const LinkWireFrame wire = from_hex(hex);
        for (std::size_t index = 0; index < wire.length; ++index) {
            CHECK(!parser.push(wire.bytes[index], 1, frame));
        }
    }
    const LinkWireFrame oversized =
        from_hex("444D4C4B010103000A0000008100");
    for (std::size_t index = 0; index < oversized.length; ++index) {
        CHECK(!parser.push(oversized.bytes[index], 2, frame));
    }
    bool ready = false;
    for (std::size_t index = 0; index < good.length; ++index) {
        ready = parser.push(good.bytes[index], 3, frame) || ready;
    }
    CHECK(ready);
    CHECK(frame.type == static_cast<std::uint8_t>(LinkMessageType::GetStatus));
    CHECK(parser.diagnostics().accepted_frames == 1);
    CHECK(parser.diagnostics().version_errors == 1);
    CHECK(parser.diagnostics().crc_errors == 1);
    CHECK(parser.diagnostics().length_errors == 1);
    CHECK(parser.diagnostics().framing_errors >= 3);
}

void parser_timeout_and_concatenation() {
    const LinkWireFrame first =
        from_hex("444D4C4B01010200020000000000B961");
    const LinkWireFrame second =
        from_hex("444D4C4B01010300030000000000CA63");
    LinkStreamParser parser;
    LinkFrame frame{};
    for (std::size_t index = 0; index < 8; ++index) {
        CHECK(!parser.push(first.bytes[index], 0, frame));
    }
    parser.expire(kDeskMateLinkInterByteTimeoutMs);
    CHECK(parser.diagnostics().inter_byte_timeouts == 1);
    unsigned frames = 0;
    for (const LinkWireFrame* wire : {&first, &second}) {
        for (std::size_t index = 0; index < wire->length; ++index) {
            if (parser.push(wire->bytes[index], 200, frame)) ++frames;
        }
    }
    CHECK(frames == 2);
}

void controller_handshake_status_and_state() {
    LinkController controller;
    controller.start(0x11223344, 0);
    LinkWireFrame wire{};
    CHECK(controller.poll(0, wire));
    CHECK(same_wire(wire, "444D4C4B01010100010000000700010101443322118228"));

    const std::array<std::uint8_t, 8> hello = {2, 1, 0xdd, 0xcc, 0xbb, 0xaa, 0x80, 0};
    controller.receive(response(LinkMessageType::Hello, 1, hello.data(), hello.size()), 1);
    CHECK(controller.snapshot().state == LinkControllerState::Connected);
    CHECK(controller.poll(1, wire));
    CHECK(same_wire(wire, "444D4C4B01010200020000000000B961"));

    const std::array<std::uint8_t, 10> capabilities = {
        3, 0, 0, 0, 3, 0, 0, 0, 0x80, 0};
    controller.receive(response(LinkMessageType::GetCapabilities, 2,
                                capabilities.data(), capabilities.size()), 2);
    CHECK(controller.poll(2, wire));
    CHECK(same_wire(wire, "444D4C4B01010300030000000000CA63"));

    const std::array<std::uint8_t, 11> status = {
        0xdd, 0xcc, 0xbb, 0xaa, 4, 3, 2, 1, 3, 1, 0};
    controller.receive(response(LinkMessageType::GetStatus, 3, status.data(), status.size()), 3);
    CHECK(controller.snapshot().agent_state == LinkAgentState::Working);
    CHECK(controller.snapshot().status_flags == 1);
    CHECK(controller.queue_agent_state(LinkAgentState::Thinking, 0x10203040));
    CHECK(controller.poll(3, wire));
    CHECK(same_wire(wire, "444D4C4B010104000400000005004030201002652E"));

    const std::array<std::uint8_t, 5> state = {0x40, 0x30, 0x20, 0x10, 2};
    controller.receive(response(LinkMessageType::SetAgentState, 4,
                                state.data(), state.size()), 4);
    controller.receive(response(LinkMessageType::SetAgentState, 4,
                                state.data(), state.size()), 4);
    CHECK(controller.snapshot().unexpected_frames == 1);
}

void controller_retries_disconnect_and_does_not_replay() {
    LinkController controller;
    controller.start(0x11223344, 0);
    LinkWireFrame wire{};
    CHECK(controller.poll(0, wire));
    const std::array<std::uint8_t, 8> hello = {2, 1, 0xdd, 0xcc, 0xbb, 0xaa, 0x80, 0};
    controller.receive(response(LinkMessageType::Hello, 1, hello.data(), hello.size()), 1);
    CHECK(controller.poll(1, wire));
    const std::array<std::uint8_t, 10> capabilities = {
        3, 0, 0, 0, 3, 0, 0, 0, 0x80, 0};
    controller.receive(response(LinkMessageType::GetCapabilities, 2,
                                capabilities.data(), capabilities.size()), 2);
    CHECK(controller.queue_agent_state(LinkAgentState::Working, 7));

    std::uint32_t start = 2;
    for (unsigned failure = 0; failure < 3; ++failure) {
        CHECK(controller.poll(start, wire));
        CHECK(controller.poll(start + 250, wire));
        CHECK(controller.poll(start + 500, wire));
        CHECK(!controller.poll(start + 750, wire));
        start += 2750;
    }
    const auto failed = controller.snapshot();
    CHECK(failed.state == LinkControllerState::Waiting);
    CHECK(failed.request_timeouts == 3);
    CHECK(failed.retries == 6);
    CHECK(!controller.queue_agent_state(LinkAgentState::Working, 7));
    const std::uint32_t reconnect_due = start - 1000;
    CHECK(!controller.poll(reconnect_due - 1, wire));
    CHECK(controller.poll(reconnect_due, wire));
    LinkFrame hello_retry{};
    CHECK(parse_wire(wire, hello_retry));
    CHECK(hello_retry.type == static_cast<std::uint8_t>(LinkMessageType::Hello));
    const std::array<std::uint8_t, 8> restarted_hello = {
        2, 1, 4, 3, 2, 1, 0x80, 0};
    controller.receive(response(LinkMessageType::Hello, hello_retry.sequence,
                                restarted_hello.data(), restarted_hello.size()),
                       reconnect_due + 1);
    CHECK(controller.snapshot().peer_restarts == 1);
    CHECK(controller.poll(reconnect_due + 1, wire));
    LinkFrame next{};
    CHECK(parse_wire(wire, next));
    CHECK(next.type ==
          static_cast<std::uint8_t>(LinkMessageType::GetCapabilities));
}

void malformed_response_fails_closed() {
    LinkController controller;
    controller.start(1, 0);
    LinkWireFrame wire{};
    CHECK(controller.poll(0, wire));
    const std::array<std::uint8_t, 1> invalid = {0};
    controller.receive(response(LinkMessageType::Hello, 1, invalid.data(), invalid.size()), 1);
    CHECK(controller.snapshot().semantic_errors == 1);
    CHECK(controller.snapshot().state == LinkControllerState::Waiting);
}

void errors_and_unmatched_frames_fail_closed() {
    LinkController controller;
    controller.start(1, 0);
    LinkWireFrame wire{};
    const std::array<std::uint8_t, 1> busy = {
        static_cast<std::uint8_t>(LinkErrorCode::Busy)};

    for (unsigned failure = 0; failure < 3; ++failure) {
        const std::uint32_t now =
            failure * (kDeskMateLinkHelloIntervalMs + 2);
        CHECK(controller.poll(now, wire));
        LinkFrame request{};
        CHECK(parse_wire(wire, request));

        controller.receive(
            response(LinkMessageType::Hello, request.sequence + 1,
                     busy.data(), busy.size(), LinkFrameFlag::Error),
            now + 1);
        CHECK(controller.snapshot().unexpected_frames == failure + 1);

        controller.receive(
            response(LinkMessageType::Hello, request.sequence,
                     busy.data(), busy.size(), LinkFrameFlag::Error),
            now + 2);
    }

    const auto snapshot = controller.snapshot();
    CHECK(snapshot.state == LinkControllerState::Waiting);
    CHECK(snapshot.semantic_errors == 3);
    CHECK(snapshot.last_error == LinkErrorCode::Busy);
    CHECK(!controller.poll(2 * (kDeskMateLinkHelloIntervalMs + 2) + 3,
                           wire));
}

}  // namespace

int main() {
    golden_vectors_roundtrip();
    parser_recovers_from_noise_and_failures();
    parser_timeout_and_concatenation();
    controller_handshake_status_and_state();
    controller_retries_disconnect_and_does_not_replay();
    malformed_response_fails_closed();
    errors_and_unmatched_frames_fail_closed();
    if (failures != 0) {
        std::cerr << "deskmate_link_core_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "deskmate_link_core_tests: PASS\n";
    return 0;
}
