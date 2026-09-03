#include "choreography_protocol.h"

#include <algorithm>
#include <cassert>
#include <cctype>
#include <cstdint>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace {

using namespace deskmate::xiaozhi;

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
    std::ifstream input(T15D_V2_GOLDEN_VECTORS_PATH, std::ios::binary);
    std::ostringstream output;
    output << input.rdbuf();
    const auto json = output.str();
    const std::string marker = std::string("\"") + name + "\": \"";
    const auto item = json.find(marker);
    assert(item != std::string::npos);
    const auto begin = item + marker.size();
    const auto end = json.find('"', begin);
    assert(end != std::string::npos);
    return json.substr(begin, end - begin);
}

LinkFrame ValidRun() {
    LinkFrame frame{};
    frame.flag = LinkFrameFlag::kRequest;
    frame.type = static_cast<std::uint8_t>(LinkMessageType::kRunChoreography);
    frame.sequence = 9;
    frame.payload_length = kChoreographyCommandPayloadBytes;
    WriteLe32(frame.payload.data(), 0x11223344);
    WriteLe32(frame.payload.data() + 4, 0x01020304);
    frame.payload[8] = 1;
    frame.payload[9] = 2;
    frame.payload[10] = 2;
    frame.payload[11] = 1;
    frame.payload[12] = 3;
    frame.payload[13] = 3;
    frame.payload[16] = 1;
    frame.payload[17] = 1;
    frame.payload[18] = 1;
    frame.payload[19] = 3;
    frame.payload[20] = 3;
    frame.payload[21] = 3;
    return frame;
}

LinkFrame ValidRunV2() {
    auto frame = ValidRun();
    frame.type = static_cast<std::uint8_t>(
        LinkMessageType::kRunChoreographyV2);
    frame.payload[12] = 36;
    frame.payload[13] = 18;
    frame.payload[14] = 90;
    frame.payload[15] = 70;
    frame.payload[11] = 2;
    frame.payload[16] = 1;
    frame.payload[17] = 0;
    frame.payload[18] = 3;
    frame.payload[19] = 2;
    frame.payload[20] = 1;
    frame.payload[21] = 1;
    return frame;
}

void StrictDecodeAndStatusEncoding() {
    auto frame = ValidRun();
    ChoreographyCommand command{};
    assert(DecodeChoreographyCommand(frame, command));
    assert(command.beat_ms == 600);
    assert(command.beats[1].yaw == ChoreographyYaw::kRight);
    auto invalid = frame;
    invalid.payload[22] = 1;
    assert(!DecodeChoreographyCommand(invalid, command));
    invalid = frame;
    invalid.payload[13] = 4;
    assert(!DecodeChoreographyCommand(invalid, command));

    ChoreographySnapshot snapshot{};
    snapshot.session_id = 0x11223344;
    snapshot.action_id = 0x01020304;
    snapshot.result = MotionPresetResult::kCompleted;
    snapshot.state = MotionPresetState::kReady;
    snapshot.beat_count = 2;
    snapshot.current_beat = 0xff;
    snapshot.repeat_count = 1;
    snapshot.completed_repeats = 1;
    snapshot.source = MotionPresetSource::kUi;
    snapshot.yaw_amplitude_degrees = 40;
    snapshot.pitch_amplitude_degrees = 20;
    snapshot.yaw_speed_degrees_per_second = 100;
    snapshot.pitch_speed_degrees_per_second = 100;
    snapshot.adapter_available = true;
    snapshot.logical_center_accepted = true;
    snapshot.operation_terminal = true;
    const auto encoded = EncodeChoreographyStatus(snapshot);
    assert(encoded[12] == 2);
    assert(encoded[13] == 2);
    assert(encoded[19] == 0x23);
    assert(encoded[20] == 3);
    assert(encoded[21] == 3);

    auto version_two = ValidRunV2();
    const auto golden_run = FromHex(
        GoldenHex("run_two_beat_numeric_request_payload"));
    assert(golden_run.size() == version_two.payload_length);
    assert(std::equal(golden_run.begin(), golden_run.end(),
                      version_two.payload.begin()));
    assert(DecodeChoreographyCommandV2(version_two, command));
    assert(command.yaw_amplitude_degrees == 36);
    assert(command.pitch_amplitude_degrees == 18);
    assert(command.yaw_speed_degrees_per_second == 90);
    assert(command.pitch_speed_degrees_per_second == 70);
    invalid = version_two;
    invalid.payload[13] = 21;
    assert(!DecodeChoreographyCommandV2(invalid, command));
    const auto encoded_v2 = EncodeChoreographyStatusV2(snapshot);
    assert(encoded_v2[20] == 40);
    assert(encoded_v2[21] == 20);
    assert(encoded_v2[22] == 100);
    assert(encoded_v2[23] == 100);

    snapshot.yaw_amplitude_degrees = 36;
    snapshot.pitch_amplitude_degrees = 18;
    snapshot.yaw_speed_degrees_per_second = 90;
    snapshot.pitch_speed_degrees_per_second = 70;
    snapshot.repeat_count = 2;
    snapshot.completed_repeats = 2;
    snapshot.completed_choreography_count = 3;
    const auto golden_status = FromHex(
        GoldenHex("run_completed_status_payload"));
    const auto exact_status = EncodeChoreographyStatusV2(snapshot);
    assert(golden_status.size() == exact_status.size());
    assert(std::equal(golden_status.begin(), golden_status.end(),
                      exact_status.begin()));
}

}  // namespace

int main() {
    StrictDecodeAndStatusEncoding();
    return 0;
}
