#include "choreography_protocol.h"

namespace deskmate::xiaozhi {
namespace {

bool ValidSource(MotionPresetSource source) noexcept {
    return source >= MotionPresetSource::kUi &&
           source <= MotionPresetSource::kIdle;
}

bool ValidBeat(const ChoreographyBeat& beat) noexcept {
    return beat.yaw <= ChoreographyYaw::kRight &&
           beat.pitch <= ChoreographyPitch::kDown &&
           beat.expression <= ChoreographyExpression::kWorking;
}

bool EmptyBeat(const ChoreographyBeat& beat) noexcept {
    return beat.yaw == ChoreographyYaw::kHold &&
           beat.pitch == ChoreographyPitch::kHold &&
           beat.expression == ChoreographyExpression::kHold;
}

std::uint8_t LegacyAmplitudeDegrees(std::uint8_t profile,
                                    bool pitch) noexcept {
    if (pitch) {
        return profile == 1 ? 8 : profile == 2 ? 15 : 20;
    }
    return profile == 1 ? 12 : profile == 2 ? 20 : 40;
}

std::uint8_t LegacySpeedDegreesPerSecond(std::uint8_t profile) noexcept {
    return profile == 1 ? 40 : profile == 2 ? 80 : 100;
}

std::uint8_t LegacyAmplitudeProfile(std::uint8_t degrees,
                                    bool pitch) noexcept {
    const auto standard = static_cast<std::uint8_t>(pitch ? 15 : 20);
    const auto vivid = static_cast<std::uint8_t>(pitch ? 20 : 40);
    return degrees >= vivid ? 3 : degrees >= standard ? 2 : 1;
}

std::uint8_t LegacySpeedProfile(std::uint8_t degrees_per_second) noexcept {
    return degrees_per_second >= 100 ? 3
         : degrees_per_second >= 80 ? 2 : 1;
}

std::uint8_t SnapshotFlags(const ChoreographySnapshot& snapshot,
                           bool duplicate) noexcept {
    return static_cast<std::uint8_t>(
        (snapshot.adapter_available ? 0x01u : 0u) |
        (snapshot.logical_center_accepted ? 0x02u : 0u) |
        (snapshot.emergency_stop_latched ? 0x04u : 0u) |
        (snapshot.faulted ? 0x08u : 0u) |
        (snapshot.servo_output_enabled ? 0x10u : 0u) |
        (snapshot.operation_terminal ? 0x20u : 0u) |
        (snapshot.display_lease_active ? 0x40u : 0u) |
        (duplicate ? 0x80u : 0u));
}

std::array<std::uint8_t, kChoreographyStatusPayloadBytes> Encode(
    const ChoreographySnapshot& snapshot, bool duplicate,
    bool version_two) noexcept {
    std::array<std::uint8_t, kChoreographyStatusPayloadBytes> payload{};
    WriteLe32(payload.data(), snapshot.session_id);
    WriteLe32(payload.data() + 4, snapshot.action_id);
    WriteLe32(payload.data() + 8, snapshot.completed_choreography_count);
    payload[12] = static_cast<std::uint8_t>(snapshot.result);
    payload[13] = static_cast<std::uint8_t>(snapshot.state);
    payload[14] = snapshot.beat_count;
    payload[15] = snapshot.current_beat;
    payload[16] = snapshot.repeat_count;
    payload[17] = snapshot.completed_repeats;
    payload[18] = static_cast<std::uint8_t>(snapshot.source);
    payload[19] = SnapshotFlags(snapshot, duplicate);
    payload[20] = version_two
        ? snapshot.yaw_amplitude_degrees
        : LegacyAmplitudeProfile(snapshot.yaw_amplitude_degrees, false);
    payload[21] = version_two
        ? snapshot.pitch_amplitude_degrees
        : LegacySpeedProfile(snapshot.yaw_speed_degrees_per_second);
    if (version_two) {
        payload[22] = snapshot.yaw_speed_degrees_per_second;
        payload[23] = snapshot.pitch_speed_degrees_per_second;
    }
    return payload;
}

bool DecodeCommon(const LinkFrame& frame, ChoreographyCommand& command,
                  bool version_two) noexcept {
    if (frame.payload_length != kChoreographyCommandPayloadBytes ||
        (!version_two && (frame.payload[14] != 0 || frame.payload[15] != 0))) {
        return false;
    }
    command = {};
    command.session_id = ReadLe32(frame.payload.data());
    command.action_id = ReadLe32(frame.payload.data() + 4);
    command.source = static_cast<MotionPresetSource>(frame.payload[8]);
    command.beat_count = frame.payload[9];
    switch (frame.payload[10]) {
        case 1: command.beat_ms = 400; break;
        case 2: command.beat_ms = 600; break;
        case 3: command.beat_ms = 800; break;
        case 4: command.beat_ms = 1000; break;
        default: return false;
    }
    command.repeat_count = frame.payload[11];
    if (version_two) {
        command.yaw_amplitude_degrees = frame.payload[12];
        command.pitch_amplitude_degrees = frame.payload[13];
        command.yaw_speed_degrees_per_second = frame.payload[14];
        command.pitch_speed_degrees_per_second = frame.payload[15];
    } else {
        const auto amplitude_profile = frame.payload[12];
        const auto speed_profile = frame.payload[13];
        if (amplitude_profile < 1 || amplitude_profile > 3 ||
            speed_profile < 1 || speed_profile > 3) return false;
        command.yaw_amplitude_degrees =
            LegacyAmplitudeDegrees(amplitude_profile, false);
        command.pitch_amplitude_degrees =
            LegacyAmplitudeDegrees(amplitude_profile, true);
        command.yaw_speed_degrees_per_second =
            LegacySpeedDegreesPerSecond(speed_profile);
        command.pitch_speed_degrees_per_second =
            command.yaw_speed_degrees_per_second;
    }
    if (command.session_id == 0 || command.action_id == 0 ||
        !ValidSource(command.source) || command.beat_count < 2 ||
        command.beat_count > kChoreographyMaximumBeats ||
        command.repeat_count < 1 || command.repeat_count > 3 ||
        command.yaw_amplitude_degrees <
            kChoreographyMinimumYawAmplitudeDegrees ||
        command.yaw_amplitude_degrees >
            kChoreographyMaximumYawAmplitudeDegrees ||
        command.pitch_amplitude_degrees <
            kChoreographyMinimumPitchAmplitudeDegrees ||
        command.pitch_amplitude_degrees >
            kChoreographyMaximumPitchAmplitudeDegrees ||
        command.yaw_speed_degrees_per_second <
            kChoreographyMinimumSpeedDegreesPerSecond ||
        command.yaw_speed_degrees_per_second >
            kChoreographyMaximumSpeedDegreesPerSecond ||
        command.pitch_speed_degrees_per_second <
            kChoreographyMinimumSpeedDegreesPerSecond ||
        command.pitch_speed_degrees_per_second >
            kChoreographyMaximumSpeedDegreesPerSecond) {
        return false;
    }
    bool any_change = false;
    for (std::size_t index = 0; index < kChoreographyMaximumBeats; ++index) {
        const auto offset = 16u + index * 3u;
        ChoreographyBeat beat{
            static_cast<ChoreographyYaw>(frame.payload[offset]),
            static_cast<ChoreographyPitch>(frame.payload[offset + 1]),
            static_cast<ChoreographyExpression>(frame.payload[offset + 2])};
        if (!ValidBeat(beat)) return false;
        if (index >= command.beat_count) {
            if (!EmptyBeat(beat)) return false;
            continue;
        }
        command.beats[index] = beat;
        any_change = any_change || !EmptyBeat(beat);
    }
    return any_change;
}

}  // namespace

bool DecodeChoreographyCommand(const LinkFrame& frame,
                               ChoreographyCommand& command) noexcept {
    return DecodeCommon(frame, command, false);
}

bool DecodeChoreographyCommandV2(const LinkFrame& frame,
                                 ChoreographyCommand& command) noexcept {
    return DecodeCommon(frame, command, true);
}

std::array<std::uint8_t, kChoreographyStatusPayloadBytes>
EncodeChoreographyResponse(const ChoreographyCommand& command,
                           MotionPresetResult result,
                           const ChoreographySnapshot& live_snapshot) noexcept {
    auto response = live_snapshot;
    response.action_id = command.action_id;
    response.result = result;
    response.beat_count = command.beat_count;
    response.repeat_count = command.repeat_count;
    response.source = command.source;
    response.yaw_amplitude_degrees = command.yaw_amplitude_degrees;
    response.pitch_amplitude_degrees = command.pitch_amplitude_degrees;
    response.yaw_speed_degrees_per_second =
        command.yaw_speed_degrees_per_second;
    response.pitch_speed_degrees_per_second =
        command.pitch_speed_degrees_per_second;
    if (result != MotionPresetResult::kAccepted &&
        result != MotionPresetResult::kDuplicate) {
        response.operation_terminal = true;
    }
    return Encode(response, result == MotionPresetResult::kDuplicate, false);
}

std::array<std::uint8_t, kChoreographyStatusPayloadBytes>
EncodeChoreographyResponseV2(const ChoreographyCommand& command,
                             MotionPresetResult result,
                             const ChoreographySnapshot& live_snapshot) noexcept {
    auto response = live_snapshot;
    response.action_id = command.action_id;
    response.result = result;
    response.beat_count = command.beat_count;
    response.repeat_count = command.repeat_count;
    response.source = command.source;
    response.yaw_amplitude_degrees = command.yaw_amplitude_degrees;
    response.pitch_amplitude_degrees = command.pitch_amplitude_degrees;
    response.yaw_speed_degrees_per_second =
        command.yaw_speed_degrees_per_second;
    response.pitch_speed_degrees_per_second =
        command.pitch_speed_degrees_per_second;
    if (result != MotionPresetResult::kAccepted &&
        result != MotionPresetResult::kDuplicate) {
        response.operation_terminal = true;
    }
    return Encode(response, result == MotionPresetResult::kDuplicate, true);
}

std::array<std::uint8_t, kChoreographyStatusPayloadBytes>
EncodeChoreographyStatus(const ChoreographySnapshot& snapshot) noexcept {
    return Encode(snapshot, false, false);
}

std::array<std::uint8_t, kChoreographyStatusPayloadBytes>
EncodeChoreographyStatusV2(const ChoreographySnapshot& snapshot) noexcept {
    return Encode(snapshot, false, true);
}

}  // namespace deskmate::xiaozhi
