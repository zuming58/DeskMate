#include "motion_preset_bridge_core.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using namespace deskmate::easyinput;

namespace {
int failures = 0;

void check(bool passed, const char* expression, const char* file, int line) {
    if (passed) return;
    std::cerr << file << ':' << line << ": CHECK failed: " << expression
              << '\n';
    ++failures;
}

#define CHECK(expression) check((expression), #expression, __FILE__, __LINE__)

std::uint8_t nibble(char value) {
    if (value >= '0' && value <= '9') {
        return static_cast<std::uint8_t>(value - '0');
    }
    return static_cast<std::uint8_t>(
        std::toupper(static_cast<unsigned char>(value)) - 'A' + 10);
}

std::vector<std::uint8_t> from_hex(const std::string& hex) {
    std::vector<std::uint8_t> bytes;
    CHECK((hex.size() % 2) == 0);
    for (std::size_t index = 0; index + 1 < hex.size(); index += 2) {
        bytes.push_back(static_cast<std::uint8_t>(
            (nibble(hex[index]) << 4u) | nibble(hex[index + 1])));
    }
    return bytes;
}

std::string vector_hex(const char* path, const char* name) {
    std::ifstream input(path, std::ios::binary);
    CHECK(input.good());
    std::ostringstream output;
    output << input.rdbuf();
    const std::string json = output.str();
    const std::string marker = std::string("\"") + name + "\"";
    const auto item = json.find(marker);
    CHECK(item != std::string::npos);
    const auto colon =
        item == std::string::npos ? std::string::npos : json.find(':', item);
    const auto begin_quote = colon == std::string::npos
                                 ? std::string::npos
                                 : json.find('"', colon + 1);
    CHECK(begin_quote != std::string::npos);
    const auto end_quote = begin_quote == std::string::npos
                               ? std::string::npos
                               : json.find('"', begin_quote + 1);
    CHECK(end_quote != std::string::npos);
    return end_quote == std::string::npos
               ? std::string{}
               : json.substr(begin_quote + 1, end_quote - begin_quote - 1);
}

std::vector<std::uint8_t> host_vector(const char* name) {
    return from_hex(vector_hex(HOST_MOTION_VECTORS_PATH, name));
}

std::vector<std::uint8_t> link_vector(const char* name) {
    return from_hex(vector_hex(LINK_MOTION_VECTORS_PATH, name));
}

void write_u16(std::uint8_t* data, std::uint16_t value) {
    data[0] = static_cast<std::uint8_t>(value);
    data[1] = static_cast<std::uint8_t>(value >> 8u);
}

void write_u32(std::uint8_t* data, std::uint32_t value) {
    for (unsigned index = 0; index < 4; ++index) {
        data[index] = static_cast<std::uint8_t>(value >> (index * 8u));
    }
}

std::array<std::uint8_t, kMotionPresetHostPayloadBytes> make_request(
    MotionPresetHostRequestKind kind, std::uint32_t request_id,
    std::uint8_t source = 0, std::uint8_t operation = 0,
    std::uint8_t preset = 0, std::uint8_t repeat_count = 0) {
    std::array<std::uint8_t, kMotionPresetHostPayloadBytes> payload{};
    payload[0] = 'D';
    payload[1] = 'M';
    payload[2] = 'R';
    payload[3] = 'Q';
    payload[4] = 1;
    payload[5] = static_cast<std::uint8_t>(kind);
    payload[6] = source;
    payload[7] = operation;
    write_u32(payload.data() + 8, request_id);
    payload[12] = preset;
    payload[13] = repeat_count;
    write_u16(payload.data() + 16,
              deskmate_link_crc16(payload.data(), 16));
    return payload;
}

LinkStatusSnapshot ready_link(std::uint32_t peer_restarts = 0) {
    LinkStatusSnapshot link{};
    link.state = LinkControllerState::Connected;
    link.implemented_capabilities = kLinkT15RequiredCapabilities;
    link.enabled_capabilities = kLinkT15RequiredCapabilities;
    link.controller_boot_id = 0x11223344;
    link.peer_boot_id = 0x55667788;
    link.peer_restarts = peer_restarts;
    return link;
}

bool same_payload(
    const std::array<std::uint8_t, kMotionPresetHostPayloadBytes>& actual,
    const std::vector<std::uint8_t>& expected) {
    return expected.size() == actual.size() &&
           std::equal(actual.begin(), actual.end(), expected.begin());
}

LinkFrame response_frame(LinkMessageType type, std::uint32_t sequence,
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

LinkFrame parse_wire(const LinkWireFrame& wire) {
    LinkStreamParser parser;
    LinkFrame frame{};
    bool ready = false;
    for (std::size_t index = 0; index < wire.length; ++index) {
        ready = parser.push(wire.bytes[index],
                            static_cast<std::uint32_t>(index), frame) ||
                ready;
    }
    CHECK(ready);
    return frame;
}

void connect_controller(LinkController& controller) {
    controller.start(0x11223344, 0);
    LinkWireFrame wire{};
    CHECK(controller.poll(0, wire));
    const auto hello_request = parse_wire(wire);
    const std::array<std::uint8_t, 8> hello = {
        2, 1, 0x88, 0x77, 0x66, 0x55, 0x80, 0};
    controller.receive(response_frame(LinkMessageType::Hello,
                                      hello_request.sequence, hello.data(),
                                      hello.size()),
                       1);
    CHECK(controller.poll(1, wire));
    const auto capabilities_request = parse_wire(wire);
    const std::array<std::uint8_t, 10> capabilities = {
        0x0f, 0, 0, 0, 0x0f, 0, 0, 0, 0x80, 0};
    controller.receive(response_frame(LinkMessageType::GetCapabilities,
                                      capabilities_request.sequence,
                                      capabilities.data(),
                                      capabilities.size()),
                       2);
    CHECK(controller.poll(2, wire));
    const auto status_request = parse_wire(wire);
    const std::array<std::uint8_t, 11> status = {
        0x88, 0x77, 0x66, 0x55, 4, 3, 2, 1, 0, 7, 0};
    controller.receive(response_frame(LinkMessageType::GetStatus,
                                      status_request.sequence, status.data(),
                                      status.size()),
                       3);
}

void codec_consumes_golden_vectors_and_rejects_invalid_shapes() {
    const auto run = host_vector("run_nod_twice_request");
    const auto status = host_vector("status_request");
    CHECK(run.size() == kMotionPresetHostPayloadBytes);
    CHECK(status.size() == kMotionPresetHostPayloadBytes);

    std::array<std::uint8_t, kMotionPresetHostPayloadBytes + 1> windows{};
    windows[0] = kMotionPresetRequestReportId;
    std::copy(run.begin(), run.end(), windows.begin() + 1);
    MotionPresetFeatureReportView view{};
    CHECK(normalize_motion_preset_feature_report(
        0, windows.data(), windows.size(), view));
    MotionPresetHostRequest decoded{};
    CHECK(decode_motion_preset_host_request(view.payload, view.length,
                                            decoded));
    CHECK(decoded.kind == MotionPresetHostRequestKind::Command);
    CHECK(decoded.request_id == 0x01020304);
    CHECK(decoded.source == 1 && decoded.operation == 1 &&
          decoded.preset == 2 && decoded.repeat_count == 2);

    CHECK(normalize_motion_preset_feature_report(
        kMotionPresetRequestReportId, status.data(), status.size(), view));
    CHECK(decode_motion_preset_host_request(view.payload, view.length,
                                            decoded));
    CHECK(decoded.kind == MotionPresetHostRequestKind::Status);
    CHECK(decoded.request_id == 0x01020305);

    auto invalid = make_request(MotionPresetHostRequestKind::Command, 7, 3,
                                2, 0, 0);
    CHECK(!decode_motion_preset_host_request(invalid.data(), invalid.size(),
                                             decoded));
    invalid = make_request(MotionPresetHostRequestKind::Command, 7, 2, 4, 0,
                           0);
    CHECK(!decode_motion_preset_host_request(invalid.data(), invalid.size(),
                                             decoded));
    invalid = make_request(MotionPresetHostRequestKind::Command, 7, 1, 1, 2,
                           4);
    CHECK(!decode_motion_preset_host_request(invalid.data(), invalid.size(),
                                             decoded));
    invalid = make_request(MotionPresetHostRequestKind::Command, 7, 1, 1, 2,
                           2);
    invalid[14] = 1;
    write_u16(invalid.data() + 16,
              deskmate_link_crc16(invalid.data(), 16));
    CHECK(!decode_motion_preset_host_request(invalid.data(), invalid.size(),
                                             decoded));
    invalid = make_request(MotionPresetHostRequestKind::Command, 7, 1, 1, 2,
                           2);
    invalid[20] = 1;
    CHECK(!decode_motion_preset_host_request(invalid.data(), invalid.size(),
                                             decoded));
    invalid = make_request(MotionPresetHostRequestKind::Command, 7, 1, 1, 2,
                           2);
    invalid[16] ^= 1;
    CHECK(!decode_motion_preset_host_request(invalid.data(), invalid.size(),
                                             decoded));

    MotionPresetHostResponse impossible{};
    impossible.stage = MotionPresetHostStage::EndpointAcknowledgement;
    impossible.kind = MotionPresetHostRequestKind::Status;
    impossible.transport = MotionPresetTransportResult::Completed;
    impossible.request_id = 8;
    impossible.message_type = 0x23;
    impossible.endpoint_payload_length = 20;
    std::array<std::uint8_t, kMotionPresetHostPayloadBytes> encoded{};
    CHECK(!encode_motion_preset_host_response(impossible, encoded));
}

void bridge_emits_byte_exact_acceptance_acknowledgement_and_status() {
    MotionPresetBridge bridge;
    const auto link = ready_link();
    const auto run = host_vector("run_nod_twice_request");
    MotionPresetLinkRequest dispatch{};
    CHECK(bridge.accept(run.data(), run.size(), 1, link, dispatch));
    CHECK(dispatch.host_request_id == 0x01020304);
    CHECK(dispatch.message_type == 0x22);
    CHECK(dispatch.payload_length == 16);
    const auto expected_link_request =
        link_vector("run_nod_twice_request_payload");
    CHECK(expected_link_request.size() == dispatch.payload.size());
    CHECK(std::equal(dispatch.payload.begin(), dispatch.payload.end(),
                     expected_link_request.begin()));
    bridge.note_forward_result(true, link);

    std::array<std::uint8_t, kMotionPresetHostPayloadBytes> response{};
    CHECK(bridge.front_response(response));
    CHECK(same_payload(response, host_vector("run_accepted")));
    CHECK(bridge.mark_response_sent());

    MotionPresetLinkResult acknowledgement{};
    acknowledgement.host_request_id = dispatch.host_request_id;
    acknowledgement.link_sequence = 0x10;
    acknowledgement.controller_boot_id = link.controller_boot_id;
    acknowledgement.peer_boot_id = link.peer_boot_id;
    acknowledgement.message_type = 0x22;
    acknowledgement.terminal_flag = 0x02;
    acknowledgement.terminal = MotionPresetLinkTerminalKind::Response;
    const auto ack_payload = link_vector("run_nod_twice_ack_payload");
    CHECK(ack_payload.size() == acknowledgement.payload.size());
    acknowledgement.payload_length = 20;
    std::copy(ack_payload.begin(), ack_payload.end(),
              acknowledgement.payload.begin());
    bridge.complete(acknowledgement, link);
    CHECK(bridge.front_response(response));
    CHECK(same_payload(response, host_vector("run_terminal_ack")));
    CHECK(bridge.mark_response_sent());

    const auto status = host_vector("status_request");
    CHECK(bridge.accept(status.data(), status.size(), 1, link, dispatch));
    CHECK(dispatch.message_type == 0x23 && dispatch.payload_length == 0);
    bridge.note_forward_result(true, link);
    CHECK(bridge.front_response(response));
    CHECK(bridge.mark_response_sent());

    acknowledgement = {};
    acknowledgement.host_request_id = 0x01020305;
    acknowledgement.link_sequence = 0x11;
    acknowledgement.controller_boot_id = link.controller_boot_id;
    acknowledgement.peer_boot_id = link.peer_boot_id;
    acknowledgement.message_type = 0x23;
    acknowledgement.terminal_flag = 0x02;
    acknowledgement.terminal = MotionPresetLinkTerminalKind::Response;
    const auto completed =
        link_vector("run_nod_twice_completed_status_payload");
    acknowledgement.payload_length = 20;
    std::copy(completed.begin(), completed.end(),
              acknowledgement.payload.begin());
    bridge.complete(acknowledgement, link);
    CHECK(bridge.front_response(response));
    CHECK(same_payload(response, host_vector("status_completed")));
    CHECK(bridge.mark_response_sent());

    dispatch = {};
    CHECK(!bridge.accept(status.data(), status.size(), 1, link, dispatch));
    CHECK(bridge.front_response(response));
    CHECK(same_payload(response, host_vector("status_completed")));
    CHECK(bridge.diagnostics().duplicates == 1);
}

void duplicate_conflict_stale_busy_and_lifecycle_clear_fail_closed() {
    MotionPresetBridge bridge;
    auto link = ready_link();
    const auto request = make_request(MotionPresetHostRequestKind::Command,
                                      10, 1, 1, 2, 2);
    MotionPresetLinkRequest dispatch{};
    CHECK(bridge.accept(request.data(), request.size(), 2, link, dispatch));
    bridge.note_forward_result(true, link);
    std::array<std::uint8_t, kMotionPresetHostPayloadBytes> response{};
    CHECK(bridge.front_response(response));
    CHECK(bridge.mark_response_sent());

    MotionPresetLinkRequest duplicate{};
    CHECK(!bridge.accept(request.data(), request.size(), 2, link, duplicate));
    CHECK(bridge.front_response(response));
    CHECK(response[5] ==
          static_cast<std::uint8_t>(MotionPresetHostStage::Accepted));
    CHECK(bridge.mark_response_sent());

    const auto busy =
        make_request(MotionPresetHostRequestKind::Status, 11);
    CHECK(!bridge.accept(busy.data(), busy.size(), 2, link, duplicate));
    CHECK(bridge.front_response(response));
    CHECK(response[7] ==
          static_cast<std::uint8_t>(MotionPresetTransportResult::Busy));
    CHECK(bridge.mark_response_sent());

    auto conflict = request;
    conflict[12] = 3;
    write_u16(conflict.data() + 16,
              deskmate_link_crc16(conflict.data(), 16));
    CHECK(!bridge.accept(conflict.data(), conflict.size(), 2, link,
                         duplicate));
    CHECK(bridge.front_response(response));
    CHECK(response[7] == static_cast<std::uint8_t>(
                              MotionPresetTransportResult::RequestConflict));
    CHECK(bridge.mark_response_sent());

    link.peer_restarts = 1;
    bridge.poll_lifecycle(2, link);
    CHECK(bridge.front_response(response));
    CHECK(response[7] == static_cast<std::uint8_t>(
                              MotionPresetTransportResult::PeerDisconnected));
    CHECK(bridge.mark_response_sent());

    CHECK(!bridge.accept(request.data(), request.size(), 2, link, duplicate));
    CHECK(bridge.front_response(response));
    CHECK(response[7] == static_cast<std::uint8_t>(
                              MotionPresetTransportResult::StaleRequest));
    CHECK(bridge.mark_response_sent());

    bridge.clear_for_usb_epoch(3);
    CHECK(bridge.accept(request.data(), request.size(), 3, ready_link(),
                        dispatch));
    CHECK(bridge.diagnostics().duplicates == 1);
    CHECK(bridge.diagnostics().conflicts == 1);
    CHECK(bridge.diagnostics().busy == 1);
    CHECK(bridge.diagnostics().stale == 1);
    CHECK(bridge.diagnostics().lifecycle_clears >= 1);
}

void disconnect_clears_completed_duplicate_cache() {
    MotionPresetBridge bridge;
    auto link = ready_link();
    const auto request = make_request(MotionPresetHostRequestKind::Status, 20);
    MotionPresetLinkRequest dispatch{};
    CHECK(bridge.accept(request.data(), request.size(), 4, link, dispatch));
    bridge.note_forward_result(true, link);
    std::array<std::uint8_t, kMotionPresetHostPayloadBytes> response{};
    CHECK(bridge.front_response(response));
    CHECK(bridge.mark_response_sent());

    MotionPresetLinkResult terminal{};
    terminal.host_request_id = 20;
    terminal.link_sequence = 9;
    terminal.controller_boot_id = link.controller_boot_id;
    terminal.peer_boot_id = link.peer_boot_id;
    terminal.message_type = 0x23;
    terminal.terminal_flag = 0x02;
    terminal.terminal = MotionPresetLinkTerminalKind::Response;
    terminal.payload_length = 20;
    const auto status = link_vector("run_nod_twice_completed_status_payload");
    std::copy(status.begin(), status.end(), terminal.payload.begin());
    bridge.complete(terminal, link);
    CHECK(bridge.front_response(response));
    CHECK(bridge.mark_response_sent());

    link.state = LinkControllerState::Waiting;
    link.enabled_capabilities = 0;
    link.peer_boot_id = 0;
    bridge.poll_lifecycle(4, link);
    CHECK(!bridge.accept(request.data(), request.size(), 4, link, dispatch));
    CHECK(bridge.front_response(response));
    CHECK(response[7] == static_cast<std::uint8_t>(
                              MotionPresetTransportResult::StaleRequest));
    CHECK(bridge.diagnostics().lifecycle_clears == 1);
}

void link_controller_acks_immediately_polls_separately_and_retries_three_times() {
    LinkController controller;
    connect_controller(controller);
    MotionPresetLinkRequest request{};
    request.host_request_id = 77;
    request.message_type = 0x22;
    request.payload_length = 16;
    const auto request_payload = link_vector("run_nod_twice_request_payload");
    std::copy(request_payload.begin(), request_payload.end(),
              request.payload.begin());
    CHECK(controller.queue_motion_preset(request));

    LinkWireFrame wire{};
    CHECK(controller.poll(3, wire));
    const auto outgoing = parse_wire(wire);
    CHECK(outgoing.type == 0x22 && outgoing.payload_length == 16);
    CHECK(std::equal(outgoing.payload.begin(), outgoing.payload.begin() + 16,
                     request.payload.begin()));

    const auto ack = link_vector("run_nod_twice_ack_payload");
    controller.receive(response_frame(LinkMessageType::MotionPresetCommand,
                                      outgoing.sequence, ack.data(),
                                      static_cast<std::uint16_t>(ack.size())),
                       4);
    MotionPresetLinkResult result{};
    CHECK(controller.take_motion_preset_result(result));
    CHECK(result.host_request_id == 77);
    CHECK(result.terminal == MotionPresetLinkTerminalKind::Response);
    CHECK(result.payload_length == 20);

    MotionPresetLinkRequest status{};
    status.host_request_id = 78;
    status.message_type = 0x23;
    CHECK(controller.queue_motion_preset(status));
    CHECK(controller.poll(4, wire));
    const auto status_wire = parse_wire(wire);
    CHECK(status_wire.type == 0x23 && status_wire.payload_length == 0);
    const auto first_attempt = wire;
    CHECK(controller.poll(254, wire));
    CHECK(wire.length == first_attempt.length &&
          std::equal(wire.bytes.begin(), wire.bytes.begin() + wire.length,
                     first_attempt.bytes.begin()));
    CHECK(controller.poll(504, wire));
    CHECK(!controller.poll(754, wire));
    CHECK(controller.take_motion_preset_result(result));
    CHECK(result.host_request_id == 78);
    CHECK(result.terminal == MotionPresetLinkTerminalKind::Timeout);
    CHECK(controller.snapshot().retries == 2);
}

void invalid_endpoint_payload_and_manual_overlap_fail_closed() {
    LinkController controller;
    connect_controller(controller);
    MotionPresetLinkRequest motion{};
    motion.host_request_id = 90;
    motion.message_type = 0x22;
    motion.payload_length = 16;
    const auto request_payload = link_vector("run_nod_twice_request_payload");
    std::copy(request_payload.begin(), request_payload.end(),
              motion.payload.begin());
    CHECK(controller.queue_motion_preset(motion));

    ManualCalibrationLinkRequest manual{};
    manual.host_request_id = 91;
    manual.message_type = 0x21;
    CHECK(!controller.queue_manual_calibration(manual));

    LinkWireFrame wire{};
    CHECK(controller.poll(3, wire));
    const auto outgoing = parse_wire(wire);
    auto invalid = link_vector("run_nod_twice_ack_payload");
    invalid[17] = 3;
    controller.receive(response_frame(LinkMessageType::MotionPresetCommand,
                                      outgoing.sequence, invalid.data(),
                                      static_cast<std::uint16_t>(invalid.size())),
                       4);
    MotionPresetLinkResult result{};
    CHECK(controller.take_motion_preset_result(result));
    CHECK(result.terminal == MotionPresetLinkTerminalKind::InvalidResponse);
    CHECK(controller.snapshot().semantic_errors >= 1);
}

}  // namespace

int main() {
    codec_consumes_golden_vectors_and_rejects_invalid_shapes();
    bridge_emits_byte_exact_acceptance_acknowledgement_and_status();
    duplicate_conflict_stale_busy_and_lifecycle_clear_fail_closed();
    disconnect_clears_completed_duplicate_cache();
    link_controller_acks_immediately_polls_separately_and_retries_three_times();
    invalid_endpoint_payload_and_manual_overlap_fail_closed();
    if (failures != 0) {
        std::cerr << "motion_preset_bridge_core_tests: " << failures
                  << " failure(s)\n";
        return 1;
    }
    std::cout << "motion_preset_bridge_core_tests: PASS\n";
    return 0;
}
