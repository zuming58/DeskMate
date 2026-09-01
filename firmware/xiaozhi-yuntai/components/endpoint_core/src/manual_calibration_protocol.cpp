#include "manual_calibration_protocol.h"

namespace deskmate::xiaozhi {
namespace {

std::uint8_t SnapshotFlags(
    const ManualCalibrationSnapshot& snapshot) noexcept {
    return static_cast<std::uint8_t>(
        (snapshot.armed ? 0x01u : 0u) |
        (snapshot.center_provisional ? 0x02u : 0u) |
        (snapshot.recenter_required ? 0x04u : 0u) |
        (snapshot.emergency_stop_latched ? 0x08u : 0u) |
        (snapshot.faulted ? 0x10u : 0u) |
        (snapshot.adapter_available ? 0x20u : 0u));
}

bool FieldsAreZero(const ManualCalibrationCommand& command,
                   bool nonce, bool direction, bool ttl, bool flags) noexcept {
    return (!nonce || command.arm_nonce == 0) &&
           (!direction || command.step_direction == 0) &&
           (!ttl || command.arm_ttl_ms == 0) &&
           (!flags || command.safety_flags == 0);
}

bool StructurallyValid(const ManualCalibrationCommand& command,
                       std::uint8_t reserved) noexcept {
    if (command.session_id == 0 || command.action_id == 0 ||
        (command.safety_flags &
         static_cast<std::uint8_t>(~kManualCalibrationRequiredSafetyFlags)) !=
            0) {
        return false;
    }
    if (reserved != 0) return false;
    const bool axis_valid = command.axis <= 1;
    switch (command.operation) {
        case ManualCalibrationOperation::kArm:
            return axis_valid && command.arm_nonce != 0 &&
                   command.arm_ttl_ms != 0 &&
                   command.step_direction == 0;
        case ManualCalibrationOperation::kSelectAxis:
            return axis_valid && FieldsAreZero(command, true, true, true, true);
        case ManualCalibrationOperation::kProvisionalCenter:
        case ManualCalibrationOperation::kRelativeStep:
            return axis_valid && command.arm_nonce != 0 &&
                   command.arm_ttl_ms == 0 && command.safety_flags == 0;
        case ManualCalibrationOperation::kRecenter:
            return axis_valid && command.arm_nonce != 0 &&
                   FieldsAreZero(command, false, true, true, true);
        case ManualCalibrationOperation::kEmergencyStop:
        case ManualCalibrationOperation::kClearEmergencyStop:
            return command.axis == kManualCalibrationNoAxis &&
                   FieldsAreZero(command, true, true, true, true);
    }
    return false;
}

}  // namespace

bool DecodeManualCalibrationCommand(
    const LinkFrame& frame, ManualCalibrationCommand& command) noexcept {
    if (frame.payload_length != kManualCalibrationCommandPayloadBytes ||
        frame.payload[12] >
            static_cast<std::uint8_t>(
                ManualCalibrationOperation::kClearEmergencyStop)) {
        return false;
    }
    command = {};
    command.session_id = ReadLe32(frame.payload.data());
    command.action_id = ReadLe32(frame.payload.data() + 4);
    command.arm_nonce = ReadLe32(frame.payload.data() + 8);
    command.operation =
        static_cast<ManualCalibrationOperation>(frame.payload[12]);
    command.axis = frame.payload[13];
    command.step_direction = static_cast<std::int8_t>(frame.payload[14]);
    command.arm_ttl_ms = ReadLe16(frame.payload.data() + 16);
    command.safety_flags = frame.payload[18];
    return StructurallyValid(command, frame.payload[15]);
}

std::array<std::uint8_t, kManualCalibrationResponsePayloadBytes>
EncodeManualCalibrationResponse(const ManualCalibrationCommand& command,
                                ManualCalibrationResult result,
                                const ManualCalibrationSnapshot& snapshot)
    noexcept {
    std::array<std::uint8_t, kManualCalibrationResponsePayloadBytes> payload{};
    WriteLe32(payload.data(), command.session_id);
    WriteLe32(payload.data() + 4, command.action_id);
    WriteLe32(payload.data() + 8, snapshot.output_count);
    payload[12] = static_cast<std::uint8_t>(result);
    payload[13] = static_cast<std::uint8_t>(snapshot.state);
    payload[14] = snapshot.selected_axis;
    payload[15] = SnapshotFlags(snapshot);
    payload[16] = static_cast<std::uint8_t>(snapshot.last_error);
    payload[17] = static_cast<std::uint8_t>(
        kManualCalibrationMaximumStepTenthsDegree);
    payload[18] = 0;
    return payload;
}

std::array<std::uint8_t, kManualCalibrationStatusPayloadBytes>
EncodeManualCalibrationStatus(
    const ManualCalibrationSnapshot& snapshot) noexcept {
    std::array<std::uint8_t, kManualCalibrationStatusPayloadBytes> payload{};
    WriteLe32(payload.data(), snapshot.session_id);
    WriteLe32(payload.data() + 4, snapshot.last_action_id);
    WriteLe32(payload.data() + 8, snapshot.output_count);
    payload[12] = static_cast<std::uint8_t>(snapshot.state);
    payload[13] = snapshot.selected_axis;
    payload[14] = SnapshotFlags(snapshot);
    payload[15] = static_cast<std::uint8_t>(snapshot.last_error);
    payload[16] = static_cast<std::uint8_t>(
        kManualCalibrationMaximumStepTenthsDegree);
    payload[17] = 0;
    return payload;
}

}  // namespace deskmate::xiaozhi
