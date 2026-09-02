#include "fake_display.h"
#include "fake_servo_adapter.h"
#include "link_endpoint.h"
#include "link_protocol.h"
#include "manual_calibration_owner.h"
#include "manual_calibration_protocol.h"

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
    std::ifstream input(T10C_GOLDEN_VECTORS_PATH, std::ios::binary);
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

deskmate::xiaozhi::LinkFrame Request(
    std::uint8_t type, std::uint32_t sequence,
    const std::vector<std::uint8_t>& payload = {}) {
    deskmate::xiaozhi::LinkFrame frame{};
    frame.flag = deskmate::xiaozhi::LinkFrameFlag::kRequest;
    frame.type = type;
    frame.sequence = sequence;
    frame.payload_length = static_cast<std::uint16_t>(payload.size());
    std::copy(payload.begin(), payload.end(), frame.payload.begin());
    return frame;
}

deskmate::xiaozhi::LinkFrame Hello(std::uint32_t sequence,
                                   std::uint32_t boot_id) {
    std::vector<std::uint8_t> payload(7);
    payload[0] = 1;
    payload[1] = 1;
    payload[2] = 1;
    deskmate::xiaozhi::WriteLe32(payload.data() + 3, boot_id);
    return Request(1, sequence, payload);
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

void GoldenChainIsByteExactAndOneStepIsOneOutput() {
    using namespace deskmate::xiaozhi;
    test::FakeDisplayRenderer display_renderer;
    DisplayOwner display(display_renderer);
    CHECK(display.Initialize());
    test::FakeServoAdapter servo;
    ManualCalibrationOwner motion(servo);
    XiaozhiLinkEndpoint endpoint(display, &motion);
    endpoint.Start(0xaabbccdd, 0);
    LinkWireFrame response{};
    CHECK(servo.commands.empty());
    CHECK(endpoint.Handle(Hello(1, 0x11223344), 1, response));

    constexpr const char* pairs[][2] = {
        {"select_request", "select_response"},
        {"arm_request", "arm_response"},
        {"provisional_center_request", "provisional_center_response"},
        {"rearm_request", "rearm_response"},
        {"single_step_request", "single_step_response"},
        {"status_request", "status_response"},
        {"emergency_stop_request", "emergency_stop_response"},
    };
    for (const auto& pair : pairs) {
        const auto request = Parse(FromHex(GoldenHex(pair[0])));
        CHECK(endpoint.Handle(request, request.sequence, response));
        CHECK(SameWire(response, FromHex(GoldenHex(pair[1]))));
    }
    CHECK(servo.commands.size() == 2);
    CHECK(servo.commands[1].value_tenths_degree == 10);
    CHECK(motion.snapshot().output_count == 2);
    CHECK(motion.snapshot().emergency_stop_latched);

    CHECK(endpoint.Handle(Request(2, 0x30), 50, response));
    const auto capabilities = Decode(response);
    CHECK((ReadLe32(capabilities.payload.data()) & (1u << 3)) == 0);
    CHECK((ReadLe32(capabilities.payload.data() + 4) & (1u << 3)) == 0);
}

void LinkAndActionIdempotencyDoNotRepeatOutput() {
    using namespace deskmate::xiaozhi;
    test::FakeDisplayRenderer display_renderer;
    DisplayOwner display(display_renderer);
    CHECK(display.Initialize());
    test::FakeServoAdapter servo;
    ManualCalibrationOwner motion(servo);
    XiaozhiLinkEndpoint endpoint(display, &motion);
    endpoint.Start(1, 0);
    LinkWireFrame response{};
    CHECK(endpoint.Handle(Hello(1, 0x11223344), 1, response));
    for (const char* name : {"select_request", "arm_request",
                             "provisional_center_request", "rearm_request"}) {
        const auto request = Parse(FromHex(GoldenHex(name)));
        CHECK(endpoint.Handle(request, request.sequence, response));
    }
    const auto step = Parse(FromHex(GoldenHex("single_step_request")));
    CHECK(endpoint.Handle(step, 10, response));
    const auto first = response;
    CHECK(servo.commands.size() == 2);
    CHECK(endpoint.Handle(step, 11, response));
    CHECK(SameWire(response, std::vector<std::uint8_t>(
                                 first.bytes.begin(),
                                 first.bytes.begin() + first.length)));
    CHECK(servo.commands.size() == 2);

    auto conflict = step;
    conflict.payload[14] = 0xff;
    CHECK(endpoint.Handle(conflict, 12, response));
    auto decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kError);
    CHECK(decoded.payload[0] ==
          static_cast<std::uint8_t>(LinkErrorCode::kSequenceConflict));
    CHECK(servo.commands.size() == 2);

    auto action_duplicate = step;
    action_duplicate.sequence = 0x40;
    CHECK(endpoint.Handle(action_duplicate, 13, response));
    decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kResponse);
    CHECK(decoded.payload[12] ==
          static_cast<std::uint8_t>(ManualCalibrationResult::kDuplicate));
    CHECK(servo.commands.size() == 2);
}

void DisconnectRestartMalformedAndFaultRemainFailSoft() {
    using namespace deskmate::xiaozhi;
    test::FakeDisplayRenderer display_renderer;
    DisplayOwner display(display_renderer);
    CHECK(display.Initialize());
    test::FakeServoAdapter servo;
    ManualCalibrationOwner motion(servo);
    XiaozhiLinkEndpoint endpoint(display, &motion);
    endpoint.Start(1, 0);
    LinkWireFrame response{};
    CHECK(endpoint.Handle(Hello(1, 0x11223344), 1, response));

    auto malformed = Parse(FromHex(GoldenHex("select_request")));
    malformed.sequence = 99;
    malformed.payload[15] = 1;
    CHECK(endpoint.Handle(malformed, 2, response));
    auto decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kError);
    CHECK(decoded.payload[0] ==
          static_cast<std::uint8_t>(LinkErrorCode::kBadPayload));

    for (const char* name : {"select_request", "arm_request"}) {
        const auto request = Parse(FromHex(GoldenHex(name)));
        CHECK(endpoint.Handle(request, request.sequence, response));
    }
    servo.fail_next_apply = true;
    const auto center = Parse(FromHex(GoldenHex("provisional_center_request")));
    CHECK(endpoint.Handle(center, 3, response));
    decoded = Decode(response);
    CHECK(decoded.payload[12] ==
          static_cast<std::uint8_t>(ManualCalibrationResult::kAdapterFailure));
    CHECK(motion.snapshot().faulted);
    CHECK(endpoint.snapshot().link_ready);
    CHECK(endpoint.Handle(Request(3, 100), 4, response));
    CHECK(Decode(response).flag == LinkFrameFlag::kResponse);
    CHECK(endpoint.Handle(Request(0x21, 101), 5, response));
    CHECK(Decode(response).payload[12] ==
          static_cast<std::uint8_t>(ManualCalibrationState::kFaulted));

    const auto outputs = servo.commands.size();
    endpoint.OnLinkDisconnected();
    CHECK(motion.snapshot().session_id == 0);
    CHECK(servo.commands.size() == outputs);
    CHECK(endpoint.Handle(Hello(102, 0x55667788), 6, response));
    CHECK(motion.snapshot().session_id == 0x55667788);
    CHECK(servo.commands.size() == outputs);
}

void ProductionNullOwnerIsNotReady() {
    using namespace deskmate::xiaozhi;
    test::FakeDisplayRenderer display_renderer;
    DisplayOwner display(display_renderer);
    XiaozhiLinkEndpoint endpoint(display);
    endpoint.Start(1, 0);
    LinkWireFrame response{};
    CHECK(endpoint.Handle(Hello(1, 0x11223344), 1, response));
    CHECK(endpoint.Handle(Request(0x21, 2), 2, response));
    const auto decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kError);
    CHECK(decoded.payload[0] ==
          static_cast<std::uint8_t>(LinkErrorCode::kNotReady));
}

void StageZeroOwnerRecognizesStatusButKeepsHardwareLocked() {
    using namespace deskmate::xiaozhi;
    test::FakeDisplayRenderer display_renderer;
    DisplayOwner display(display_renderer);
    DisabledServoAdapter servo;
    ManualCalibrationOwner motion(servo);
    XiaozhiLinkEndpoint endpoint(display, &motion);
    endpoint.Start(1, 0);
    LinkWireFrame response{};
    CHECK(endpoint.Handle(Hello(1, 0x11223344), 1, response));

    CHECK(endpoint.Handle(Request(0x21, 2), 2, response));
    auto decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kResponse);
    CHECK(decoded.payload_length == kManualCalibrationStatusPayloadBytes);
    CHECK(decoded.payload[12] ==
          static_cast<std::uint8_t>(ManualCalibrationState::kLocked));
    CHECK((decoded.payload[14] & 0x20u) == 0);

    const auto select = Parse(FromHex(GoldenHex("select_request")));
    CHECK(endpoint.Handle(select, 3, response));
    decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kResponse);
    CHECK(decoded.payload[12] == static_cast<std::uint8_t>(
                                     ManualCalibrationResult::kAdapterUnavailable));
}

}  // namespace

int main() {
    GoldenChainIsByteExactAndOneStepIsOneOutput();
    LinkAndActionIdempotencyDoNotRepeatOutput();
    DisconnectRestartMalformedAndFaultRemainFailSoft();
    ProductionNullOwnerIsNotReady();
    StageZeroOwnerRecognizesStatusButKeepsHardwareLocked();
    if (failures != 0) {
        std::cerr << "manual_calibration_link_tests: " << failures
                  << " failure(s)\n";
        return 1;
    }
    std::cout << "manual_calibration_link_tests: PASS\n";
    return 0;
}
