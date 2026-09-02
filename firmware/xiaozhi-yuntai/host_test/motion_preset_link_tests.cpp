#include "fake_display.h"
#include "fake_servo_adapter.h"
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

using namespace deskmate::xiaozhi;

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
    std::ifstream input(T15_GOLDEN_VECTORS_PATH, std::ios::binary);
    std::ostringstream output;
    output << input.rdbuf();
    const auto json = output.str();
    const std::string marker = std::string("\"") + name + "\": \"";
    const auto item = json.find(marker);
    CHECK(item != std::string::npos);
    if (item == std::string::npos) return {};
    const auto begin = item + marker.size();
    const auto end = json.find('"', begin);
    CHECK(end != std::string::npos);
    return end == std::string::npos ? std::string{}
                                    : json.substr(begin, end - begin);
}

LinkFrame Request(std::uint8_t type, std::uint32_t sequence,
                  const std::vector<std::uint8_t>& payload = {}) {
    LinkFrame frame{};
    frame.flag = LinkFrameFlag::kRequest;
    frame.type = type;
    frame.sequence = sequence;
    frame.payload_length = static_cast<std::uint16_t>(payload.size());
    std::copy(payload.begin(), payload.end(), frame.payload.begin());
    return frame;
}

LinkFrame Hello(std::uint32_t sequence, std::uint32_t boot_id) {
    std::vector<std::uint8_t> payload(7);
    payload[0] = 1;
    payload[1] = kLinkVersion;
    payload[2] = kLinkVersion;
    WriteLe32(payload.data() + 3, boot_id);
    return Request(static_cast<std::uint8_t>(LinkMessageType::kHello),
                   sequence, payload);
}

LinkFrame MotionRequest(std::uint32_t sequence, std::uint32_t session,
                        std::uint32_t action,
                        MotionPresetOperation operation,
                        MotionPreset preset = MotionPreset::kNone,
                        std::uint8_t repeats = 0,
                        MotionPresetSource source = MotionPresetSource::kUi) {
    std::vector<std::uint8_t> payload(16);
    WriteLe32(payload.data(), session);
    WriteLe32(payload.data() + 4, action);
    payload[8] = static_cast<std::uint8_t>(operation);
    payload[9] = static_cast<std::uint8_t>(preset);
    payload[10] = repeats;
    payload[11] = static_cast<std::uint8_t>(source);
    return Request(static_cast<std::uint8_t>(
                       LinkMessageType::kRunMotionPreset),
                   sequence, payload);
}

LinkFrame Decode(const LinkWireFrame& wire) {
    LinkStreamParser parser;
    LinkFrame frame{};
    bool accepted = false;
    for (std::uint16_t index = 0; index < wire.length; ++index) {
        accepted = parser.Push(wire.bytes[index], 1, frame) || accepted;
    }
    CHECK(accepted);
    return frame;
}

bool SamePayload(const LinkFrame& frame,
                 const std::vector<std::uint8_t>& bytes) {
    return frame.payload_length == bytes.size() &&
           std::equal(bytes.begin(), bytes.end(), frame.payload.begin());
}

void HelloAndCenter(XiaozhiLinkEndpoint& endpoint,
                    std::uint32_t session = 0x11223344u) {
    LinkWireFrame response{};
    CHECK(endpoint.Handle(Hello(1, session), 1, response));
    CHECK(endpoint.Handle(
        MotionRequest(2, session, 1,
                      MotionPresetOperation::kStopAndCenter),
        2, response));
    endpoint.Tick(2);
    endpoint.Tick(22);
}

void FrozenGoldenVectorsAreByteExact() {
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    CHECK(display.Initialize());
    test::FakeServoAdapter servo;
    servo.runtime_motion_available = true;
    MotionCoordinator motion(servo);
    XiaozhiLinkEndpoint endpoint(display, &motion);
    endpoint.Start(0xaabbccddu, 0);
    HelloAndCenter(endpoint);

    LinkWireFrame response{};
    CHECK(endpoint.Handle(
        MotionRequest(3, 0x11223344u, 0x01020304u,
                      MotionPresetOperation::kRun, MotionPreset::kNod, 2,
                      MotionPresetSource::kUi),
        40, response));
    auto decoded = Decode(response);
    CHECK(SamePayload(decoded,
                      FromHex(GoldenHex("run_nod_twice_ack_payload"))));

    for (std::uint32_t now = 40; now <= 4600; now += 20) {
        endpoint.Tick(now);
        if (motion.motion_preset_snapshot().operation_terminal) break;
    }
    CHECK(endpoint.Handle(
        Request(static_cast<std::uint8_t>(LinkMessageType::kGetMotionStatus),
                4),
        4620, response));
    decoded = Decode(response);
    CHECK(SamePayload(
        decoded, FromHex(GoldenHex("run_nod_twice_completed_status_payload"))));
}

void CapabilityReadinessAndStructuralRules() {
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    CHECK(display.Initialize());
    test::FakeServoAdapter servo;
    servo.runtime_motion_available = true;
    MotionCoordinator motion(servo);
    XiaozhiLinkEndpoint endpoint(display, &motion);
    endpoint.Start(1, 0);
    HelloAndCenter(endpoint);
    LinkWireFrame response{};

    CHECK(endpoint.Handle(
        Request(static_cast<std::uint8_t>(LinkMessageType::kGetCapabilities),
                3),
        30, response));
    auto decoded = Decode(response);
    CHECK((ReadLe32(decoded.payload.data()) & kCapabilityMotion) != 0);
    CHECK((ReadLe32(decoded.payload.data() + 4) & kCapabilityMotion) != 0);
    CHECK((ReadLe32(decoded.payload.data() + 4) & (1u << 4)) == 0);

    CHECK(endpoint.Handle(
        Request(static_cast<std::uint8_t>(LinkMessageType::kGetStatus), 4),
        31, response));
    decoded = Decode(response);
    CHECK((decoded.payload[9] & 0x04u) != 0);

    auto malformed = MotionRequest(
        5, 0x11223344u, 2, MotionPresetOperation::kRun,
        MotionPreset::kAttention, 1, MotionPresetSource::kUi);
    malformed.payload[12] = 1;
    CHECK(endpoint.Handle(malformed, 32, response));
    decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kError);
    CHECK(decoded.payload[0] ==
          static_cast<std::uint8_t>(LinkErrorCode::kBadPayload));

    auto bad_source = MotionRequest(
        6, 0x11223344u, 3, MotionPresetOperation::kStopAndCenter,
        MotionPreset::kNone, 0, MotionPresetSource::kContext);
    CHECK(endpoint.Handle(bad_source, 33, response));
    decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kError);
    CHECK(decoded.payload[0] ==
          static_cast<std::uint8_t>(LinkErrorCode::kBadPayload));
}

void SemanticRejectionDoesNotOverwriteLiveStatus() {
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    CHECK(display.Initialize());
    test::FakeServoAdapter servo;
    servo.runtime_motion_available = true;
    MotionCoordinator motion(servo);
    XiaozhiLinkEndpoint endpoint(display, &motion);
    endpoint.Start(1, 0);
    HelloAndCenter(endpoint);
    LinkWireFrame response{};

    const auto active = MotionRequest(
        3, 0x11223344u, 20, MotionPresetOperation::kRun,
        MotionPreset::kSearch, 1, MotionPresetSource::kContext);
    CHECK(endpoint.Handle(active, 40, response));
    const auto duplicate_action = MotionRequest(
        4, 0x11223344u, 20, MotionPresetOperation::kRun,
        MotionPreset::kSearch, 1, MotionPresetSource::kContext);
    CHECK(endpoint.Handle(duplicate_action, 41, response));
    auto decoded = Decode(response);
    CHECK(decoded.payload[12] ==
          static_cast<std::uint8_t>(MotionPresetResult::kDuplicate));
    CHECK((decoded.payload[19] & 0x40u) != 0);

    CHECK(endpoint.Handle(
        MotionRequest(5, 0x11223344u, 21, MotionPresetOperation::kRun,
                      MotionPreset::kAttention, 1,
                      MotionPresetSource::kIdle),
        42, response));
    decoded = Decode(response);
    CHECK(ReadLe32(decoded.payload.data() + 4) == 21);
    CHECK(decoded.payload[12] ==
          static_cast<std::uint8_t>(MotionPresetResult::kBusy));

    CHECK(endpoint.Handle(
        Request(static_cast<std::uint8_t>(LinkMessageType::kGetMotionStatus),
                6),
        43, response));
    decoded = Decode(response);
    CHECK(ReadLe32(decoded.payload.data() + 4) == 20);
    CHECK(decoded.payload[12] ==
          static_cast<std::uint8_t>(MotionPresetResult::kAccepted));
    CHECK(decoded.payload[13] ==
          static_cast<std::uint8_t>(MotionPresetState::kRunning));
}

void DisabledAdapterAndFaultKeepBaseLinkAlive() {
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    CHECK(display.Initialize());
    test::FakeServoAdapter disabled;
    MotionCoordinator disabled_motion(disabled);
    XiaozhiLinkEndpoint disabled_endpoint(display, &disabled_motion);
    disabled_endpoint.Start(1, 0);
    LinkWireFrame response{};
    CHECK(disabled_endpoint.Handle(Hello(1, 0x11223344u), 1, response));
    CHECK(disabled_endpoint.Handle(
        MotionRequest(2, 0x11223344u, 1,
                      MotionPresetOperation::kStopAndCenter),
        2, response));
    auto decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kError);
    CHECK(decoded.payload[0] ==
          static_cast<std::uint8_t>(LinkErrorCode::kNotReady));

    test::FakeServoAdapter servo;
    servo.runtime_motion_available = true;
    MotionCoordinator motion(servo);
    XiaozhiLinkEndpoint endpoint(display, &motion);
    endpoint.Start(2, 0);
    HelloAndCenter(endpoint);
    CHECK(endpoint.Handle(
        MotionRequest(3, 0x11223344u, 2, MotionPresetOperation::kRun,
                      MotionPreset::kAttention, 1),
        40, response));
    servo.fail_next_apply = true;
    endpoint.Tick(40);
    CHECK(motion.motion_preset_snapshot().faulted);

    CHECK(endpoint.Handle(
        Request(static_cast<std::uint8_t>(LinkMessageType::kGetStatus), 4),
        41, response));
    decoded = Decode(response);
    CHECK(decoded.flag == LinkFrameFlag::kResponse);
    CHECK((decoded.payload[9] & 0x04u) == 0);
    CHECK(endpoint.snapshot().link_ready);

    CHECK(endpoint.Handle(Hello(5, 0x55667788u), 42, response));
    CHECK(motion.motion_preset_snapshot().session_id == 0x55667788u);
    CHECK(motion.motion_preset_snapshot().operation ==
          MotionPresetOperation::kNone);
    CHECK(motion.motion_preset_snapshot().faulted);
}

}  // namespace

int main() {
    FrozenGoldenVectorsAreByteExact();
    CapabilityReadinessAndStructuralRules();
    SemanticRejectionDoesNotOverwriteLiveStatus();
    DisabledAdapterAndFaultKeepBaseLinkAlive();
    if (failures != 0) {
        std::cerr << "motion_preset_link_tests: " << failures
                  << " failure(s)\n";
        return 1;
    }
    std::cout << "motion_preset_link_tests: PASS\n";
    return 0;
}
