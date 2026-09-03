#include "choreography_protocol.h"

#include <cassert>
#include <cstdint>

namespace {

using namespace deskmate::xiaozhi;

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
    snapshot.intensity = ChoreographyIntensity::kVivid;
    snapshot.tempo = ChoreographyTempo::kQuick;
    snapshot.adapter_available = true;
    snapshot.logical_center_accepted = true;
    snapshot.operation_terminal = true;
    const auto encoded = EncodeChoreographyStatus(snapshot);
    assert(encoded[12] == 2);
    assert(encoded[13] == 2);
    assert(encoded[19] == 0x23);
    assert(encoded[20] == 3);
    assert(encoded[21] == 3);
}

}  // namespace

int main() {
    StrictDecodeAndStatusEncoding();
    return 0;
}
