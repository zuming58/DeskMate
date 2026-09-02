#include "motion_preset_protocol.h"

namespace deskmate::xiaozhi {
namespace {

bool SourceAllowed(MotionPresetOperation operation,
                   MotionPresetSource source) noexcept {
    switch (operation) {
        case MotionPresetOperation::kRun:
            return source >= MotionPresetSource::kUi &&
                   source <= MotionPresetSource::kIdle;
        case MotionPresetOperation::kStopAndCenter:
        case MotionPresetOperation::kEmergencyStop:
            return source == MotionPresetSource::kUi ||
                   source == MotionPresetSource::kExplicitVoice;
        case MotionPresetOperation::kClearEmergencyStopAndCenter:
            return source == MotionPresetSource::kUi;
        case MotionPresetOperation::kNone:
            return false;
    }
    return false;
}

std::uint8_t SnapshotFlags(const MotionPresetSnapshot& snapshot,
                           bool duplicate_response) noexcept {
    return static_cast<std::uint8_t>(
        (snapshot.adapter_available ? 0x01u : 0u) |
        (snapshot.logical_center_accepted ? 0x02u : 0u) |
        (snapshot.emergency_stop_latched ? 0x04u : 0u) |
        (snapshot.faulted ? 0x08u : 0u) |
        (snapshot.servo_output_enabled ? 0x10u : 0u) |
        (snapshot.operation_terminal ? 0x20u : 0u) |
        (duplicate_response ? 0x40u : 0u));
}

std::array<std::uint8_t, kMotionPresetStatusPayloadBytes> Encode(
    const MotionPresetSnapshot& snapshot, bool duplicate_response) noexcept {
    std::array<std::uint8_t, kMotionPresetStatusPayloadBytes> payload{};
    WriteLe32(payload.data(), snapshot.session_id);
    WriteLe32(payload.data() + 4, snapshot.action_id);
    WriteLe32(payload.data() + 8, snapshot.completed_preset_count);
    payload[12] = static_cast<std::uint8_t>(snapshot.result);
    payload[13] = static_cast<std::uint8_t>(snapshot.state);
    payload[14] = static_cast<std::uint8_t>(snapshot.operation);
    payload[15] = static_cast<std::uint8_t>(snapshot.preset);
    payload[16] = snapshot.repeat_count;
    payload[17] = snapshot.completed_repeats;
    payload[18] = static_cast<std::uint8_t>(snapshot.source);
    payload[19] = SnapshotFlags(snapshot, duplicate_response);
    return payload;
}

bool ReservedIsZero(const LinkFrame& frame) noexcept {
    return frame.payload[12] == 0 && frame.payload[13] == 0 &&
           frame.payload[14] == 0 && frame.payload[15] == 0;
}

}  // namespace

bool DecodeMotionPresetCommand(const LinkFrame& frame,
                               MotionPresetCommand& command) noexcept {
    if (frame.payload_length != kMotionPresetCommandPayloadBytes ||
        !ReservedIsZero(frame)) {
        return false;
    }

    command = {};
    command.session_id = ReadLe32(frame.payload.data());
    command.action_id = ReadLe32(frame.payload.data() + 4);
    command.operation = static_cast<MotionPresetOperation>(frame.payload[8]);
    command.preset = static_cast<MotionPreset>(frame.payload[9]);
    command.repeat_count = frame.payload[10];
    command.source = static_cast<MotionPresetSource>(frame.payload[11]);

    if (command.session_id == 0 || command.action_id == 0 ||
        command.operation < MotionPresetOperation::kRun ||
        command.operation >
            MotionPresetOperation::kClearEmergencyStopAndCenter ||
        !SourceAllowed(command.operation, command.source)) {
        return false;
    }

    if (command.operation == MotionPresetOperation::kRun) {
        return command.preset >= MotionPreset::kAttention &&
               command.preset <= MotionPreset::kDance &&
               command.repeat_count >= 1 && command.repeat_count <= 3;
    }
    return command.preset == MotionPreset::kNone &&
           command.repeat_count == 0;
}

std::array<std::uint8_t, kMotionPresetStatusPayloadBytes>
EncodeMotionPresetResponse(const MotionPresetCommand& command,
                           MotionPresetResult result,
                           const MotionPresetSnapshot& live_snapshot) noexcept {
    auto response = live_snapshot;
    response.session_id = live_snapshot.session_id;
    response.action_id = command.action_id;
    response.result = result;
    response.operation = command.operation;
    response.preset = command.preset;
    response.repeat_count = command.repeat_count;
    response.source = command.source;

    const bool accepted_async = result == MotionPresetResult::kAccepted &&
                                command.operation !=
                                    MotionPresetOperation::kEmergencyStop;
    if (!accepted_async && result != MotionPresetResult::kDuplicate) {
        response.operation_terminal = true;
    }
    return Encode(response, result == MotionPresetResult::kDuplicate);
}

std::array<std::uint8_t, kMotionPresetStatusPayloadBytes>
EncodeMotionPresetStatus(const MotionPresetSnapshot& snapshot) noexcept {
    return Encode(snapshot, false);
}

}  // namespace deskmate::xiaozhi
