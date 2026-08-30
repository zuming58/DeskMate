#include "link_endpoint.h"
#include "link_protocol.h"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace {

int failures = 0;

void Check(bool passed, const char* expression, int line) {
    if (passed) return;
    std::cerr << "line " << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

#define CHECK(expression) Check((expression), #expression, __LINE__)

std::vector<std::uint8_t> FromHex(const std::string& text) {
    std::vector<std::uint8_t> bytes;
    for (std::size_t index = 0; index + 1 < text.size(); index += 2) {
        const auto digit = [](char value) -> unsigned {
            if (value >= '0' && value <= '9') return value - '0';
            return static_cast<unsigned>(std::toupper(
                       static_cast<unsigned char>(value))) -
                   static_cast<unsigned>('A') + 10u;
        };
        bytes.push_back(static_cast<std::uint8_t>(
            (digit(text[index]) << 4u) | digit(text[index + 1])));
    }
    return bytes;
}

std::string GoldenHex(const char* name) {
    std::ifstream input(GOLDEN_VECTORS_PATH, std::ios::binary);
    std::ostringstream output;
    output << input.rdbuf();
    const auto json = output.str();
    const std::string marker = std::string("\"name\":\"") + name + "\"";
    const auto item = json.find(marker);
    CHECK(item != std::string::npos);
    const auto field = json.find("\"hex\":\"", item);
    CHECK(field != std::string::npos);
    if (field == std::string::npos) return {};
    const auto begin = field + 7;
    const auto end = json.find('"', begin);
    CHECK(end != std::string::npos);
    return end == std::string::npos ? std::string{}
                                    : json.substr(begin, end - begin);
}

deskmate::xiaozhi::LinkFrame Parse(const std::vector<std::uint8_t>& bytes) {
    deskmate::xiaozhi::LinkStreamParser parser;
    deskmate::xiaozhi::LinkFrame frame{};
    bool accepted = false;
    for (const auto byte : bytes) {
        accepted = parser.Push(byte, 1, frame) || accepted;
    }
    CHECK(accepted);
    return frame;
}

deskmate::xiaozhi::LinkFrame Request(std::uint8_t type,
                                     std::uint32_t sequence,
                                     const std::vector<std::uint8_t>& payload = {}) {
    deskmate::xiaozhi::LinkFrame frame{};
    frame.flag = deskmate::xiaozhi::LinkFrameFlag::kRequest;
    frame.type = type;
    frame.sequence = sequence;
    frame.payload_length = static_cast<std::uint16_t>(payload.size());
    std::copy(payload.begin(), payload.end(), frame.payload.begin());
    return frame;
}

deskmate::xiaozhi::LinkFrame Decode(
    const deskmate::xiaozhi::LinkWireFrame& wire) {
    return Parse(std::vector<std::uint8_t>(wire.bytes.begin(),
                                           wire.bytes.begin() + wire.length));
}

bool SameWire(const deskmate::xiaozhi::LinkWireFrame& wire,
              const std::vector<std::uint8_t>& bytes) {
    return wire.length == bytes.size() &&
           std::equal(bytes.begin(), bytes.end(), wire.bytes.begin());
}

deskmate::xiaozhi::LinkFrame Hello(std::uint32_t sequence,
                                   std::uint32_t controller_boot_id) {
    std::vector<std::uint8_t> payload(7);
    payload[0] = 1;
    payload[1] = 1;
    payload[2] = 1;
    deskmate::xiaozhi::WriteLe32(payload.data() + 3, controller_boot_id);
    return Request(1, sequence, payload);
}

void FourMessagesMatchTheFrozenPayloads() {
    using namespace deskmate::xiaozhi;
    XiaozhiLinkEndpoint endpoint;
    endpoint.Start(0xaabbccdd, 0);
    LinkWireFrame response{};

    const auto hello = Parse(FromHex(GoldenHex("hello_request")));
    CHECK(endpoint.Handle(hello, 1, response));
    CHECK(SameWire(response, FromHex(GoldenHex("hello_response"))));

    const auto capabilities = Parse(FromHex(GoldenHex("capabilities_request")));
    CHECK(endpoint.Handle(capabilities, 2, response));
    CHECK(SameWire(response, FromHex(GoldenHex("capabilities_response"))));

    auto set_working = Request(4, 10, {1, 0, 0, 0, 3});
    CHECK(endpoint.Handle(set_working, 3, response));
    CHECK(endpoint.snapshot().agent_state == AgentState::kWorking);

    const auto status = Parse(FromHex(GoldenHex("status_request")));
    CHECK(endpoint.Handle(status, 0x01020304, response));
    CHECK(SameWire(response, FromHex(GoldenHex("status_response"))));

    const auto set_state = Parse(FromHex(GoldenHex("set_agent_state_request")));
    CHECK(endpoint.Handle(set_state, 5, response));
    CHECK(SameWire(response, FromHex(GoldenHex("set_agent_state_response"))));
    CHECK(endpoint.snapshot().agent_state == AgentState::kThinking);
}

void SemanticErrorsHaveOneBytePayloads() {
    using namespace deskmate::xiaozhi;
    XiaozhiLinkEndpoint endpoint;
    endpoint.Start(0x11111111, 0);
    LinkWireFrame response{};

    CHECK(endpoint.Handle(Request(3, 1), 0, response));
    auto error = Decode(response);
    CHECK(error.flag == LinkFrameFlag::kError);
    CHECK(error.payload_length == 1);
    CHECK(error.payload[0] == static_cast<std::uint8_t>(LinkErrorCode::kNotReady));

    CHECK(endpoint.Handle(Hello(2, 0x22222222), 1, response));
    CHECK(endpoint.Handle(Request(2, 3, {0}), 2, response));
    error = Decode(response);
    CHECK(error.payload[0] == static_cast<std::uint8_t>(LinkErrorCode::kBadPayload));

    CHECK(endpoint.Handle(Request(0x7e, 4), 3, response));
    error = Decode(response);
    CHECK(error.payload[0] == static_cast<std::uint8_t>(LinkErrorCode::kUnknownType));

    auto wrong_direction = Request(3, 5);
    wrong_direction.flag = LinkFrameFlag::kResponse;
    CHECK(endpoint.Handle(wrong_direction, 4, response));
    error = Decode(response);
    CHECK(error.payload[0] == static_cast<std::uint8_t>(LinkErrorCode::kBadPayload));

    for (unsigned value = 1; value <= 6; ++value) {
        CHECK(EncodeLinkError(4, value, static_cast<LinkErrorCode>(value), response));
        error = Decode(response);
        CHECK(error.payload_length == 1);
        CHECK(error.payload[0] == value);
    }
}

void DuplicateConflictAndControllerEpochAreDeterministic() {
    using namespace deskmate::xiaozhi;
    XiaozhiLinkEndpoint endpoint;
    endpoint.Start(0x01020304, 0);
    LinkWireFrame response{};
    CHECK(endpoint.Handle(Hello(1, 0x11111111), 1, response));

    const auto working = Request(4, 4, {0x40, 0x30, 0x20, 0x10, 3});
    CHECK(endpoint.Handle(working, 2, response));
    const auto accepted = response;
    CHECK(endpoint.Handle(working, 3, response));
    CHECK(SameWire(response, std::vector<std::uint8_t>(
                                 accepted.bytes.begin(),
                                 accepted.bytes.begin() + accepted.length)));
    CHECK(endpoint.snapshot().diagnostics.duplicate_requests == 1);
    CHECK(endpoint.snapshot().agent_state == AgentState::kWorking);

    const auto conflicting = Request(4, 4, {0x40, 0x30, 0x20, 0x10, 2});
    CHECK(endpoint.Handle(conflicting, 4, response));
    const auto conflict = Decode(response);
    CHECK(conflict.flag == LinkFrameFlag::kError);
    CHECK(conflict.payload[0] ==
          static_cast<std::uint8_t>(LinkErrorCode::kSequenceConflict));
    CHECK(endpoint.snapshot().agent_state == AgentState::kWorking);

    CHECK(endpoint.Handle(Hello(1, 0x22222222), 5, response));
    CHECK(endpoint.snapshot().diagnostics.controller_restarts == 1);
    CHECK(endpoint.Handle(conflicting, 6, response));
    CHECK(Decode(response).flag == LinkFrameFlag::kResponse);
    CHECK(endpoint.snapshot().agent_state == AgentState::kThinking);
}

void LocalBootEpochChangesAcrossRestart() {
    using namespace deskmate::xiaozhi;
    XiaozhiLinkEndpoint endpoint;
    LinkWireFrame response{};
    endpoint.Start(0x11111111, 0);
    CHECK(endpoint.Handle(Hello(1, 1), 0, response));
    const auto first = Decode(response);
    CHECK(ReadLe32(first.payload.data() + 2) == 0x11111111);

    endpoint.Start(0x22222222, 100);
    CHECK(endpoint.Handle(Hello(1, 1), 100, response));
    const auto second = Decode(response);
    CHECK(ReadLe32(second.payload.data() + 2) == 0x22222222);
    CHECK(!std::equal(first.payload.begin(), first.payload.begin() + 8,
                      second.payload.begin()));
}

}  // namespace

int main() {
    FourMessagesMatchTheFrozenPayloads();
    SemanticErrorsHaveOneBytePayloads();
    DuplicateConflictAndControllerEpochAreDeterministic();
    LocalBootEpochChangesAcrossRestart();
    if (failures != 0) {
        std::cerr << "link_endpoint_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "link_endpoint_tests: PASS\n";
    return 0;
}
