#include "manual_calibration_owner.h"

#include <limits>

namespace deskmate::xiaozhi {
namespace {

void IncrementSaturated(std::uint32_t& value) noexcept {
    if (value != std::numeric_limits<std::uint32_t>::max()) {
        ++value;
    }
}

bool DeadlineReached(std::uint32_t now_ms,
                     std::uint32_t deadline_ms) noexcept {
    return static_cast<std::int32_t>(now_ms - deadline_ms) >= 0;
}

ServoAxis ToServoAxis(std::uint8_t axis) noexcept {
    return axis == 0 ? ServoAxis::kYaw : ServoAxis::kPitch;
}

}  // namespace

ManualCalibrationOwner::ManualCalibrationOwner(ServoAdapter& adapter) noexcept
    : adapter_(adapter) {
    adapter_.DisableOutputs();
}

void ManualCalibrationOwner::StartSession(std::uint32_t session_id) noexcept {
    adapter_.DisableOutputs();
    session_id_ = session_id;
    last_action_id_ = 0;
    output_count_ = 0;
    last_command_ = {};
    selected_axis_ = kManualCalibrationNoAxis;
    center_provisional_ = {};
    armed_ = false;
    recenter_required_ = true;
    arm_nonce_ = 0;
    arm_expires_at_ms_ = 0;
    normal_motion_.ResetSession(session_id);
    RefreshState();
}

void ManualCalibrationOwner::OnLinkDisconnected() noexcept {
    adapter_.DisableOutputs();
    session_id_ = 0;
    last_action_id_ = 0;
    output_count_ = 0;
    last_command_ = {};
    selected_axis_ = kManualCalibrationNoAxis;
    center_provisional_ = {};
    armed_ = false;
    recenter_required_ = true;
    arm_nonce_ = 0;
    arm_expires_at_ms_ = 0;
    normal_motion_.ResetSession(0);
    RefreshState();
}

void ManualCalibrationOwner::Tick(std::uint32_t now_ms) noexcept {
    if (armed_ && DeadlineReached(now_ms, arm_expires_at_ms_)) {
        ConsumeArm();
        last_error_ = ManualCalibrationResult::kArmExpired;
        RefreshState();
    }
}

bool ManualCalibrationOwner::IsValidAxis(std::uint8_t axis) noexcept {
    return axis <= static_cast<std::uint8_t>(ServoAxis::kPitch);
}

bool ManualCalibrationOwner::SameCommand(
    const ManualCalibrationCommand& left,
    const ManualCalibrationCommand& right) noexcept {
    return left.session_id == right.session_id &&
           left.action_id == right.action_id &&
           left.arm_nonce == right.arm_nonce &&
           left.operation == right.operation && left.axis == right.axis &&
           left.step_direction == right.step_direction &&
           left.arm_ttl_ms == right.arm_ttl_ms &&
           left.safety_flags == right.safety_flags;
}

ManualCalibrationResult ManualCalibrationOwner::CheckAction(
    const ManualCalibrationCommand& command) const noexcept {
    if (command.session_id == 0 || command.session_id != session_id_) {
        return ManualCalibrationResult::kWrongSession;
    }
    if (command.action_id == 0) {
        return ManualCalibrationResult::kBadPayload;
    }
    if (command.operation == ManualCalibrationOperation::kEmergencyStop) {
        if (emergency_stop_latched_) {
            return ManualCalibrationResult::kDuplicate;
        }
        return ManualCalibrationResult::kAccepted;
    }
    if (command.action_id == last_action_id_) {
        return SameCommand(command, last_command_)
                   ? ManualCalibrationResult::kDuplicate
                   : ManualCalibrationResult::kSequenceConflict;
    }
    if (command.action_id < last_action_id_) {
        return ManualCalibrationResult::kStaleAction;
    }
    return ManualCalibrationResult::kAccepted;
}

void ManualCalibrationOwner::RecordAction(
    const ManualCalibrationCommand& command) noexcept {
    if (command.action_id >= last_action_id_) {
        last_action_id_ = command.action_id;
        last_command_ = command;
    }
}

void ManualCalibrationOwner::ConsumeArm() noexcept {
    armed_ = false;
    arm_nonce_ = 0;
    arm_expires_at_ms_ = 0;
}

void ManualCalibrationOwner::RefreshState() noexcept {
    if (faulted_) {
        state_ = ManualCalibrationState::kFaulted;
    } else if (emergency_stop_latched_) {
        state_ = ManualCalibrationState::kEmergencyStopped;
    } else if (armed_) {
        state_ = ManualCalibrationState::kArmed;
    } else if (selected_axis_ != kManualCalibrationNoAxis &&
               center_provisional_[selected_axis_]) {
        state_ = ManualCalibrationState::kCenterProvisional;
    } else if (selected_axis_ != kManualCalibrationNoAxis) {
        state_ = ManualCalibrationState::kAxisSelected;
    } else {
        state_ = ManualCalibrationState::kLocked;
    }
}

ManualCalibrationResult ManualCalibrationOwner::Reject(
    ManualCalibrationResult result) noexcept {
    last_error_ = result;
    RefreshState();
    return result;
}

ManualCalibrationResult ManualCalibrationOwner::ApplyOutput(
    const ManualCalibrationCommand& command,
    ServoAdapterOperation operation) noexcept {
    if (!IsValidAxis(command.axis)) {
        return Reject(ManualCalibrationResult::kWrongAxis);
    }
    if (!armed_ || command.arm_nonce == 0 || command.arm_nonce != arm_nonce_) {
        return Reject(ManualCalibrationResult::kArmRequired);
    }
    if (command.axis != selected_axis_) {
        return Reject(ManualCalibrationResult::kWrongAxis);
    }
    const ServoAdapterCommand adapter_command{
        operation, ToServoAxis(command.axis),
        static_cast<std::int16_t>(
            command.step_direction *
            kManualCalibrationMaximumStepTenthsDegree)};
    ConsumeArm();
    if (!adapter_.Apply(adapter_command)) {
        adapter_.DisableOutputs();
        faulted_ = true;
        normal_motion_.LatchFault();
        return Reject(ManualCalibrationResult::kAdapterFailure);
    }
    IncrementSaturated(output_count_);
    last_error_ = ManualCalibrationResult::kAccepted;
    RefreshState();
    return ManualCalibrationResult::kAccepted;
}

ManualCalibrationResult ManualCalibrationOwner::Execute(
    const ManualCalibrationCommand& command, std::uint32_t now_ms) noexcept {
    const bool arm_was_expired =
        armed_ && DeadlineReached(now_ms, arm_expires_at_ms_);
    Tick(now_ms);

    const auto action_check = CheckAction(command);
    if (action_check != ManualCalibrationResult::kAccepted) {
        return Reject(action_check);
    }

    if (arm_was_expired &&
        command.operation != ManualCalibrationOperation::kEmergencyStop) {
        RecordAction(command);
        return Reject(ManualCalibrationResult::kArmExpired);
    }

    if (command.operation == ManualCalibrationOperation::kEmergencyStop) {
        adapter_.DisableOutputs();
        ConsumeArm();
        emergency_stop_latched_ = true;
        recenter_required_ = true;
        normal_motion_.EmergencyStop();
        RecordAction(command);
        last_error_ = ManualCalibrationResult::kAccepted;
        RefreshState();
        return ManualCalibrationResult::kAccepted;
    }
    if (faulted_) {
        RecordAction(command);
        return Reject(ManualCalibrationResult::kFaulted);
    }
    if (emergency_stop_latched_ &&
        command.operation != ManualCalibrationOperation::kClearEmergencyStop) {
        RecordAction(command);
        return Reject(ManualCalibrationResult::kEmergencyStopped);
    }
    if (!adapter_.IsAvailable()) {
        RecordAction(command);
        return Reject(ManualCalibrationResult::kAdapterUnavailable);
    }

    ManualCalibrationResult result = ManualCalibrationResult::kBadPayload;
    switch (command.operation) {
        case ManualCalibrationOperation::kSelectAxis:
            if (!IsValidAxis(command.axis)) {
                result = ManualCalibrationResult::kWrongAxis;
                break;
            }
            ConsumeArm();
            selected_axis_ = command.axis;
            recenter_required_ = true;
            result = ManualCalibrationResult::kAccepted;
            break;
        case ManualCalibrationOperation::kArm:
            if (!IsValidAxis(command.axis) || command.axis != selected_axis_) {
                result = ManualCalibrationResult::kWrongAxis;
                break;
            }
            if (command.safety_flags !=
                kManualCalibrationRequiredSafetyFlags) {
                result = ManualCalibrationResult::kSafetyNotConfirmed;
                break;
            }
            if (command.arm_nonce == 0 ||
                command.arm_ttl_ms < kManualCalibrationMinimumArmTtlMs ||
                command.arm_ttl_ms > kManualCalibrationMaximumArmTtlMs) {
                result = ManualCalibrationResult::kBadPayload;
                break;
            }
            arm_nonce_ = command.arm_nonce;
            arm_expires_at_ms_ = now_ms + command.arm_ttl_ms;
            armed_ = true;
            result = ManualCalibrationResult::kAccepted;
            break;
        case ManualCalibrationOperation::kProvisionalCenter:
            if (!IsValidAxis(command.axis)) {
                result = ManualCalibrationResult::kWrongAxis;
                break;
            }
            if (command.step_direction != 0) {
                result = ManualCalibrationResult::kBadPayload;
                break;
            }
            result = ApplyOutput(
                command, ServoAdapterOperation::kProvisionalCenter);
            if (result == ManualCalibrationResult::kAccepted) {
                center_provisional_[command.axis] = true;
                recenter_required_ = true;
            }
            break;
        case ManualCalibrationOperation::kRelativeStep:
            if (!IsValidAxis(command.axis) ||
                !center_provisional_[command.axis]) {
                result = IsValidAxis(command.axis)
                             ? ManualCalibrationResult::kCenterRequired
                             : ManualCalibrationResult::kWrongAxis;
                break;
            }
            if (command.step_direction != -1 &&
                command.step_direction != 1) {
                result = ManualCalibrationResult::kStepOutOfRange;
                break;
            }
            result = ApplyOutput(command, ServoAdapterOperation::kRelativeStep);
            if (result == ManualCalibrationResult::kAccepted) {
                recenter_required_ = true;
            }
            break;
        case ManualCalibrationOperation::kRecenter:
            if (!IsValidAxis(command.axis) ||
                !center_provisional_[command.axis]) {
                result = IsValidAxis(command.axis)
                             ? ManualCalibrationResult::kCenterRequired
                             : ManualCalibrationResult::kWrongAxis;
                break;
            }
            result = ApplyOutput(command, ServoAdapterOperation::kRecenter);
            if (result == ManualCalibrationResult::kAccepted) {
                recenter_required_ = false;
            }
            break;
        case ManualCalibrationOperation::kClearEmergencyStop:
            emergency_stop_latched_ = false;
            ConsumeArm();
            selected_axis_ = kManualCalibrationNoAxis;
            center_provisional_ = {};
            recenter_required_ = true;
            normal_motion_ = MotionSafetyCore{};
            normal_motion_.ResetSession(session_id_);
            result = ManualCalibrationResult::kAccepted;
            break;
        case ManualCalibrationOperation::kEmergencyStop:
            break;
    }

    RecordAction(command);
    if (result != ManualCalibrationResult::kAccepted) {
        return Reject(result);
    }
    last_error_ = ManualCalibrationResult::kAccepted;
    RefreshState();
    return result;
}

MotionResult ManualCalibrationOwner::SubmitNormalMotion(
    const MotionIntent& intent, std::uint64_t now_ms) noexcept {
    return normal_motion_.Submit(intent, now_ms);
}

ManualCalibrationSnapshot ManualCalibrationOwner::snapshot() const noexcept {
    const bool center = selected_axis_ != kManualCalibrationNoAxis &&
                        center_provisional_[selected_axis_];
    return ManualCalibrationSnapshot{
        session_id_, last_action_id_, output_count_, state_, selected_axis_,
        armed_, center, recenter_required_, emergency_stop_latched_, faulted_,
        adapter_.IsAvailable(), last_error_};
}

}  // namespace deskmate::xiaozhi
