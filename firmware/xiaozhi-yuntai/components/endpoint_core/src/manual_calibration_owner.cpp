#include "manual_calibration_owner.h"

#include <array>
#include <cstddef>
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

struct RuntimeWaypoint {
    MotionTarget target{};
    std::uint32_t hold_ms{};
    bool recenter{};
};

struct RuntimePlan {
    const RuntimeWaypoint* waypoints{};
    std::size_t count{};
    std::uint32_t watchdog_per_repeat_ms{};
};

constexpr std::array<RuntimeWaypoint, 2> kAttentionWaypoints{{
    {{0, -40}, 800, false},
    {{0, 0}, 320, true},
}};

constexpr std::array<RuntimeWaypoint, 3> kNodWaypoints{{
    {{0, 60}, 500, false},
    {{0, -20}, 400, false},
    {{0, 0}, 400, true},
}};

constexpr std::array<RuntimeWaypoint, 3> kSearchWaypoints{{
    {{-100, 0}, 400, false},
    {{100, 0}, 500, false},
    {{0, 0}, 500, true},
}};

constexpr std::array<RuntimeWaypoint, 5> kDanceWaypoints{{
    {{-80, -30}, 400, false},
    {{80, 30}, 400, false},
    {{-80, 30}, 400, false},
    {{80, -30}, 400, false},
    {{0, 0}, 400, true},
}};

RuntimePlan PlanFor(MotionPreset preset) noexcept {
    switch (preset) {
        case MotionPreset::kAttention:
            return {kAttentionWaypoints.data(), kAttentionWaypoints.size(),
                    1500};
        case MotionPreset::kNod:
            return {kNodWaypoints.data(), kNodWaypoints.size(), 1800};
        case MotionPreset::kSearch:
            return {kSearchWaypoints.data(), kSearchWaypoints.size(), 2500};
        case MotionPreset::kDance:
            return {kDanceWaypoints.data(), kDanceWaypoints.size(), 4000};
        case MotionPreset::kNone:
            return {};
    }
    return {};
}

bool TargetsEqual(const MotionTarget& left,
                  const MotionTarget& right) noexcept {
    return left.horizontal_units == right.horizontal_units &&
           left.vertical_units == right.vertical_units;
}

void IncrementSaturatedPreset(std::uint32_t& value) noexcept {
    IncrementSaturated(value);
}

constexpr std::uint32_t kRuntimeTickPeriodMs = 20;
constexpr std::uint32_t kRuntimeIntentTtlMs = 14000;

}  // namespace

MotionCoordinator::MotionCoordinator(ServoAdapter& adapter) noexcept
    : adapter_(adapter) {
    adapter_.DisableOutputs();
    ResetNormalMotion();
    ResetPresetSession();
}

void MotionCoordinator::StartSession(std::uint32_t session_id) noexcept {
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
    ResetNormalMotion();
    ResetPresetSession();
    RefreshState();
}

void MotionCoordinator::OnLinkDisconnected() noexcept {
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
    ResetNormalMotion();
    ResetPresetSession();
    RefreshState();
}

void MotionCoordinator::Tick(std::uint32_t now_ms) noexcept {
    if (armed_ && DeadlineReached(now_ms, arm_expires_at_ms_)) {
        ConsumeArm();
        last_error_ = ManualCalibrationResult::kArmExpired;
        RefreshState();
    }

    if (runtime_action_ == RuntimeAction::kNone ||
        !DeadlineReached(now_ms, next_runtime_tick_ms_)) {
        return;
    }
    next_runtime_tick_ms_ = now_ms + kRuntimeTickPeriodMs;
    if (DeadlineReached(now_ms, preset_watchdog_deadline_ms_)) {
        LatchRuntimeFault(MotionPresetResult::kFaulted);
        return;
    }

    RuntimeWaypoint waypoint{};
    if (runtime_action_ == RuntimeAction::kRecenter) {
        waypoint = RuntimeWaypoint{{0, 0}, 0, true};
    } else {
        const auto plan = PlanFor(active_or_last_preset_);
        if (plan.waypoints == nullptr || waypoint_index_ >= plan.count) {
            LatchRuntimeFault(MotionPresetResult::kFaulted);
            return;
        }
        waypoint = plan.waypoints[waypoint_index_];
    }

    if (!runtime_target_submitted_) {
        if (waypoint.recenter) {
            normal_motion_.CancelSource(MotionSource::kDialogueAction);
        }
        MotionIntent intent{};
        intent.kind = waypoint.recenter ? MotionIntentKind::kRecenter
                                        : MotionIntentKind::kTarget;
        intent.source = waypoint.recenter ? MotionSource::kRecovery
                                          : MotionSource::kDialogueAction;
        intent.session_epoch = session_id_;
        intent.sequence = ++normal_motion_sequence_;
        intent.target = waypoint.target;
        intent.expires_at_ms =
            static_cast<std::uint64_t>(now_ms) + kRuntimeIntentTtlMs;
        const auto submit = normal_motion_.Submit(intent, now_ms);
        if (submit != MotionResult::kAccepted &&
            submit != MotionResult::kReplaced) {
            LatchRuntimeFault(MotionPresetResult::kFaulted);
            return;
        }
        runtime_target_ = waypoint.target;
        runtime_target_submitted_ = true;
        waypoint_arrived_ = false;
        if (!waypoint.recenter) runtime_centered_ = false;
    }

    const auto step = normal_motion_.Tick(now_ms);
    if (step.emit) {
        const auto applied = ApplyRuntimeTarget(step.target);
        if (applied == ServoAdapterResult::kUnavailable) {
            adapter_.DisableOutputs();
            runtime_axis_initialized_ = {};
            runtime_action_ = RuntimeAction::kNone;
            runtime_centered_ = false;
            runtime_servo_output_enabled_ = false;
            preset_result_ = MotionPresetResult::kAdapterUnavailable;
            preset_state_ = MotionPresetState::kNotReady;
            preset_operation_terminal_ = true;
            ResetNormalMotion();
            return;
        }
        if (applied != ServoAdapterResult::kApplied) {
            LatchRuntimeFault(MotionPresetResult::kAdapterFailure);
            return;
        }
    }

    const auto motion = normal_motion_.snapshot();
    const bool reached = TargetsEqual(motion.current, runtime_target_) &&
                         (waypoint.recenter
                              ? motion.state == MotionRuntimeState::kReady
                              : motion.state == MotionRuntimeState::kHolding);
    if (!reached) return;

    if (!waypoint_arrived_) {
        waypoint_arrived_ = true;
        waypoint_hold_deadline_ms_ = now_ms + waypoint.hold_ms;
        return;
    }
    if (DeadlineReached(now_ms, waypoint_hold_deadline_ms_)) {
        AdvanceRuntimeAction(now_ms);
    }
}

bool MotionCoordinator::IsValidAxis(std::uint8_t axis) noexcept {
    return axis <= static_cast<std::uint8_t>(ServoAxis::kPitch);
}

bool MotionCoordinator::SameCommand(
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

bool MotionCoordinator::SamePresetCommand(
    const MotionPresetCommand& left,
    const MotionPresetCommand& right) noexcept {
    return left.session_id == right.session_id &&
           left.action_id == right.action_id &&
           left.operation == right.operation && left.preset == right.preset &&
           left.repeat_count == right.repeat_count &&
           left.source == right.source;
}

MotionPresetResult MotionCoordinator::CheckPresetAction(
    const MotionPresetCommand& command) const noexcept {
    if (command.session_id == 0 || command.session_id != session_id_) {
        return MotionPresetResult::kWrongSession;
    }
    if (command.action_id == 0) return MotionPresetResult::kBadPayload;

    for (const auto& record : preset_action_history_) {
        if (!record.valid ||
            record.command.action_id != command.action_id) {
            continue;
        }
        return SamePresetCommand(record.command, command)
                   ? MotionPresetResult::kDuplicate
                   : MotionPresetResult::kSequenceConflict;
    }
    if (command.operation != MotionPresetOperation::kEmergencyStop &&
        command.action_id <= last_normal_preset_action_id_) {
        return MotionPresetResult::kStaleAction;
    }
    return MotionPresetResult::kAccepted;
}

void MotionCoordinator::RecordPresetAction(
    const MotionPresetCommand& command) noexcept {
    preset_action_history_[preset_action_history_cursor_] = {command, true};
    preset_action_history_cursor_ =
        (preset_action_history_cursor_ + 1u) % preset_action_history_.size();
    if (command.operation != MotionPresetOperation::kEmergencyStop &&
        command.action_id > last_normal_preset_action_id_) {
        last_normal_preset_action_id_ = command.action_id;
    }
}

bool MotionCoordinator::ConfigureNormalMotion() noexcept {
    ServoRuntimeEnvelope envelope{};
    if (!adapter_.GetRuntimeEnvelope(envelope)) return false;
    MotionCalibration calibration{};
    calibration.power_path_verified = true;
    calibration.common_ground_verified = true;
    calibration.horizontal = AxisCalibration{
        envelope.yaw_minimum_tenths_degree, 0,
        envelope.yaw_maximum_tenths_degree,
        envelope.maximum_step_tenths_degree, true, true, true};
    calibration.vertical = AxisCalibration{
        envelope.pitch_minimum_tenths_degree, 0,
        envelope.pitch_maximum_tenths_degree,
        envelope.maximum_step_tenths_degree, true, true, true};
    return normal_motion_.Configure(calibration) == MotionResult::kAccepted;
}

void MotionCoordinator::ResetNormalMotion() noexcept {
    normal_motion_ = MotionSafetyCore{};
    normal_motion_configured_ = ConfigureNormalMotion();
    normal_motion_.ResetSession(session_id_);
    if (emergency_stop_latched_) normal_motion_.EmergencyStop();
    if (faulted_) normal_motion_.LatchFault();
    normal_motion_sequence_ = 0;
}

void MotionCoordinator::ResetPresetSession() noexcept {
    preset_action_history_ = {};
    preset_action_history_cursor_ = 0;
    preset_action_id_ = 0;
    last_normal_preset_action_id_ = 0;
    completed_preset_count_ = 0;
    requested_repeats_ = 0;
    completed_repeats_ = 0;
    waypoint_index_ = 0;
    runtime_action_ = RuntimeAction::kNone;
    runtime_target_ = {};
    runtime_last_applied_target_ = {};
    runtime_axis_initialized_ = {};
    runtime_target_submitted_ = false;
    waypoint_arrived_ = false;
    runtime_centered_ = false;
    runtime_servo_output_enabled_ = false;
    preset_operation_terminal_ = false;
    preset_operation_ = MotionPresetOperation::kNone;
    active_or_last_preset_ = MotionPreset::kNone;
    preset_source_ = MotionPresetSource::kNone;
    preset_result_ = faulted_ ? MotionPresetResult::kFaulted
                     : emergency_stop_latched_
                         ? MotionPresetResult::kEmergencyStopped
                         : RuntimeMotionAvailable()
                             ? MotionPresetResult::kRecenterRequired
                             : MotionPresetResult::kNotReady;
    RefreshPresetState();
}

void MotionCoordinator::RefreshPresetState() noexcept {
    if (faulted_) {
        preset_state_ = MotionPresetState::kFaulted;
    } else if (emergency_stop_latched_) {
        preset_state_ = MotionPresetState::kEmergencyStopped;
    } else if (runtime_action_ == RuntimeAction::kRun) {
        preset_state_ = MotionPresetState::kRunning;
    } else if (runtime_action_ == RuntimeAction::kRecenter) {
        preset_state_ = MotionPresetState::kRecentering;
    } else if (RuntimeMotionAvailable() && runtime_centered_) {
        preset_state_ = MotionPresetState::kReady;
    } else {
        preset_state_ = MotionPresetState::kNotReady;
    }
}

bool MotionCoordinator::RuntimeMotionAvailable() const noexcept {
    ServoRuntimeEnvelope envelope{};
    return normal_motion_configured_ && adapter_.IsAvailable() &&
           adapter_.GetRuntimeEnvelope(envelope);
}

bool MotionCoordinator::RuntimeMotionReady() const noexcept {
    return RuntimeMotionAvailable() && !faulted_ &&
           !emergency_stop_latched_ && runtime_centered_ &&
           runtime_action_ == RuntimeAction::kNone && !armed_ &&
           selected_axis_ == kManualCalibrationNoAxis;
}

void MotionCoordinator::CancelRuntimeForManual() noexcept {
    if (runtime_action_ == RuntimeAction::kNone && !runtime_centered_) return;
    adapter_.DisableOutputs();
    runtime_axis_initialized_ = {};
    runtime_action_ = RuntimeAction::kNone;
    runtime_target_submitted_ = false;
    waypoint_arrived_ = false;
    runtime_centered_ = false;
    runtime_servo_output_enabled_ = false;
    preset_result_ = MotionPresetResult::kCancelled;
    preset_operation_terminal_ = true;
    ResetNormalMotion();
    RefreshPresetState();
}

void MotionCoordinator::BeginRuntimeRecenter(
    const MotionPresetCommand& command, std::uint32_t now_ms) noexcept {
    adapter_.DisableOutputs();
    runtime_axis_initialized_ = {};
    ConsumeArm();
    selected_axis_ = kManualCalibrationNoAxis;
    center_provisional_ = {};
    recenter_required_ = true;
    ResetNormalMotion();
    preset_action_id_ = command.action_id;
    preset_operation_ = command.operation;
    active_or_last_preset_ = MotionPreset::kNone;
    preset_source_ = command.source;
    requested_repeats_ = 0;
    completed_repeats_ = 0;
    runtime_action_ = RuntimeAction::kRecenter;
    runtime_target_ = {};
    runtime_target_submitted_ = false;
    waypoint_arrived_ = false;
    runtime_centered_ = false;
    runtime_servo_output_enabled_ = true;
    preset_operation_terminal_ = false;
    preset_result_ = MotionPresetResult::kAccepted;
    preset_watchdog_deadline_ms_ = now_ms + 3000;
    next_runtime_tick_ms_ = now_ms;
    RefreshState();
    RefreshPresetState();
}

void MotionCoordinator::BeginRuntimePreset(
    const MotionPresetCommand& command, std::uint32_t now_ms) noexcept {
    const auto plan = PlanFor(command.preset);
    preset_action_id_ = command.action_id;
    preset_operation_ = command.operation;
    active_or_last_preset_ = command.preset;
    preset_source_ = command.source;
    requested_repeats_ = command.repeat_count;
    completed_repeats_ = 0;
    waypoint_index_ = 0;
    runtime_action_ = RuntimeAction::kRun;
    runtime_target_submitted_ = false;
    waypoint_arrived_ = false;
    runtime_centered_ = false;
    runtime_servo_output_enabled_ = true;
    preset_operation_terminal_ = false;
    preset_result_ = MotionPresetResult::kAccepted;
    preset_watchdog_deadline_ms_ =
        now_ms + plan.watchdog_per_repeat_ms * command.repeat_count + 1000;
    next_runtime_tick_ms_ = now_ms;
    RefreshPresetState();
}

void MotionCoordinator::AdvanceRuntimeAction(std::uint32_t now_ms) noexcept {
    if (runtime_action_ == RuntimeAction::kRecenter) {
        runtime_centered_ = true;
        recenter_required_ = false;
        CompleteRuntimeAction();
        return;
    }

    const auto plan = PlanFor(active_or_last_preset_);
    if (plan.waypoints == nullptr || waypoint_index_ >= plan.count) {
        LatchRuntimeFault(MotionPresetResult::kFaulted);
        return;
    }
    const bool repeat_finished =
        waypoint_index_ + 1u == plan.count &&
        plan.waypoints[waypoint_index_].recenter;
    if (repeat_finished) {
        runtime_centered_ = true;
        ++completed_repeats_;
        if (completed_repeats_ >= requested_repeats_) {
            CompleteRuntimeAction();
            return;
        }
        waypoint_index_ = 0;
    } else {
        ++waypoint_index_;
    }
    runtime_target_submitted_ = false;
    waypoint_arrived_ = false;
    next_runtime_tick_ms_ = now_ms + kRuntimeTickPeriodMs;
}

void MotionCoordinator::CompleteRuntimeAction() noexcept {
    if (runtime_action_ == RuntimeAction::kRun) {
        IncrementSaturatedPreset(completed_preset_count_);
    }
    runtime_action_ = RuntimeAction::kNone;
    runtime_target_submitted_ = false;
    waypoint_arrived_ = false;
    runtime_centered_ = true;
    adapter_.DisableOutputs();
    runtime_axis_initialized_ = {};
    runtime_servo_output_enabled_ = false;
    preset_operation_terminal_ = true;
    preset_result_ = MotionPresetResult::kCompleted;
    RefreshPresetState();
}

void MotionCoordinator::LatchRuntimeFault(MotionPresetResult result) noexcept {
    adapter_.DisableOutputs();
    runtime_axis_initialized_ = {};
    runtime_action_ = RuntimeAction::kNone;
    runtime_target_submitted_ = false;
    waypoint_arrived_ = false;
    runtime_centered_ = false;
    runtime_servo_output_enabled_ = false;
    faulted_ = true;
    normal_motion_.LatchFault();
    preset_result_ = result;
    preset_operation_terminal_ = true;
    RefreshState();
    RefreshPresetState();
}

ServoAdapterResult MotionCoordinator::ApplyRuntimeTarget(
    const MotionTarget& target) noexcept {
    const std::array<std::int16_t, 2> values{
        target.horizontal_units, target.vertical_units};
    for (std::size_t index = 0; index < values.size(); ++index) {
        if (runtime_axis_initialized_[index] &&
            values[index] == (index == 0
                                  ? runtime_last_applied_target_.horizontal_units
                                  : runtime_last_applied_target_.vertical_units)) {
            continue;
        }
        const auto result = adapter_.Apply(ServoAdapterCommand{
            ServoAdapterOperation::kAbsoluteRuntimeTarget,
            index == 0 ? ServoAxis::kYaw : ServoAxis::kPitch,
            values[index]});
        if (result != ServoAdapterResult::kApplied) {
            adapter_.DisableOutputs();
            runtime_axis_initialized_ = {};
            return result;
        }
        runtime_axis_initialized_[index] = true;
    }
    runtime_last_applied_target_ = target;
    return ServoAdapterResult::kApplied;
}

MotionPresetResult MotionCoordinator::RejectPreset(
    MotionPresetResult result) noexcept {
    return result;
}

ManualCalibrationResult MotionCoordinator::CheckAction(
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

void MotionCoordinator::RecordAction(
    const ManualCalibrationCommand& command) noexcept {
    if (command.action_id >= last_action_id_) {
        last_action_id_ = command.action_id;
        last_command_ = command;
    }
}

void MotionCoordinator::ConsumeArm() noexcept {
    armed_ = false;
    arm_nonce_ = 0;
    arm_expires_at_ms_ = 0;
}

void MotionCoordinator::RefreshState() noexcept {
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

ManualCalibrationResult MotionCoordinator::Reject(
    ManualCalibrationResult result) noexcept {
    last_error_ = result;
    RefreshState();
    return result;
}

ManualCalibrationResult MotionCoordinator::ApplyOutput(
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
    const auto adapter_result = adapter_.Apply(adapter_command);
    if (adapter_result == ServoAdapterResult::kOutOfRange) {
        return Reject(ManualCalibrationResult::kStepOutOfRange);
    }
    if (adapter_result == ServoAdapterResult::kUnavailable) {
        return Reject(ManualCalibrationResult::kAdapterUnavailable);
    }
    if (adapter_result != ServoAdapterResult::kApplied) {
        LatchRuntimeFault(MotionPresetResult::kAdapterFailure);
        return Reject(ManualCalibrationResult::kAdapterFailure);
    }
    runtime_centered_ = false;
    runtime_servo_output_enabled_ = true;
    preset_result_ = MotionPresetResult::kRecenterRequired;
    preset_operation_terminal_ = true;
    RefreshPresetState();
    IncrementSaturated(output_count_);
    last_error_ = ManualCalibrationResult::kAccepted;
    RefreshState();
    return ManualCalibrationResult::kAccepted;
}

ManualCalibrationResult MotionCoordinator::Execute(
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
        runtime_action_ = RuntimeAction::kNone;
        runtime_target_submitted_ = false;
        waypoint_arrived_ = false;
        runtime_axis_initialized_ = {};
        runtime_centered_ = false;
        runtime_servo_output_enabled_ = false;
        emergency_stop_latched_ = true;
        recenter_required_ = true;
        normal_motion_.EmergencyStop();
        preset_result_ = MotionPresetResult::kEmergencyStopped;
        preset_operation_terminal_ = true;
        RecordAction(command);
        last_error_ = ManualCalibrationResult::kAccepted;
        RefreshState();
        RefreshPresetState();
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
            CancelRuntimeForManual();
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
            CancelRuntimeForManual();
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
            adapter_.DisableOutputs();
            ConsumeArm();
            selected_axis_ = kManualCalibrationNoAxis;
            center_provisional_ = {};
            recenter_required_ = true;
            runtime_action_ = RuntimeAction::kNone;
            runtime_target_submitted_ = false;
            waypoint_arrived_ = false;
            runtime_axis_initialized_ = {};
            runtime_centered_ = false;
            runtime_servo_output_enabled_ = false;
            preset_result_ = MotionPresetResult::kRecenterRequired;
            preset_operation_terminal_ = true;
            ResetNormalMotion();
            RefreshPresetState();
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

MotionPresetResult MotionCoordinator::ExecuteMotionPreset(
    const MotionPresetCommand& command, std::uint32_t now_ms) noexcept {
    Tick(now_ms);
    const auto action_check = CheckPresetAction(command);
    if (action_check != MotionPresetResult::kAccepted) {
        return RejectPreset(action_check);
    }

    if (command.operation == MotionPresetOperation::kEmergencyStop) {
        adapter_.DisableOutputs();
        ConsumeArm();
        selected_axis_ = kManualCalibrationNoAxis;
        center_provisional_ = {};
        recenter_required_ = true;
        runtime_action_ = RuntimeAction::kNone;
        runtime_target_submitted_ = false;
        waypoint_arrived_ = false;
        runtime_axis_initialized_ = {};
        runtime_centered_ = false;
        runtime_servo_output_enabled_ = false;
        emergency_stop_latched_ = true;
        normal_motion_.EmergencyStop();
        preset_action_id_ = command.action_id;
        preset_operation_ = command.operation;
        active_or_last_preset_ = MotionPreset::kNone;
        preset_source_ = command.source;
        requested_repeats_ = 0;
        completed_repeats_ = 0;
        preset_result_ = MotionPresetResult::kEmergencyStopped;
        preset_operation_terminal_ = true;
        RecordPresetAction(command);
        RefreshState();
        RefreshPresetState();
        return MotionPresetResult::kEmergencyStopped;
    }

    MotionPresetResult result = MotionPresetResult::kBadPayload;
    if (!RuntimeMotionAvailable()) {
        result = MotionPresetResult::kAdapterUnavailable;
    } else if (faulted_) {
        result = MotionPresetResult::kFaulted;
    } else if (emergency_stop_latched_ &&
               command.operation !=
                   MotionPresetOperation::kClearEmergencyStopAndCenter) {
        result = MotionPresetResult::kEmergencyStopped;
    } else {
        switch (command.operation) {
            case MotionPresetOperation::kRun:
                if (armed_ || selected_axis_ != kManualCalibrationNoAxis ||
                    runtime_action_ != RuntimeAction::kNone) {
                    result = MotionPresetResult::kBusy;
                } else if (!runtime_centered_) {
                    result = MotionPresetResult::kRecenterRequired;
                } else {
                    BeginRuntimePreset(command, now_ms);
                    result = MotionPresetResult::kAccepted;
                }
                break;
            case MotionPresetOperation::kStopAndCenter:
                BeginRuntimeRecenter(command, now_ms);
                result = MotionPresetResult::kAccepted;
                break;
            case MotionPresetOperation::kClearEmergencyStopAndCenter:
                if (faulted_) {
                    result = MotionPresetResult::kFaulted;
                    break;
                }
                emergency_stop_latched_ = false;
                BeginRuntimeRecenter(command, now_ms);
                result = MotionPresetResult::kAccepted;
                break;
            case MotionPresetOperation::kEmergencyStop:
            case MotionPresetOperation::kNone:
                result = MotionPresetResult::kBadPayload;
                break;
        }
    }

    RecordPresetAction(command);
    return RejectPreset(result);
}

MotionResult MotionCoordinator::SubmitNormalMotion(
    const MotionIntent& intent, std::uint64_t now_ms) noexcept {
    return normal_motion_.Submit(intent, now_ms);
}

ManualCalibrationSnapshot MotionCoordinator::snapshot() const noexcept {
    const bool center = selected_axis_ != kManualCalibrationNoAxis &&
                        center_provisional_[selected_axis_];
    return ManualCalibrationSnapshot{
        session_id_, last_action_id_, output_count_, state_, selected_axis_,
        armed_, center, recenter_required_, emergency_stop_latched_, faulted_,
        adapter_.IsAvailable(), last_error_};
}

MotionPresetSnapshot MotionCoordinator::motion_preset_snapshot() const
    noexcept {
    return MotionPresetSnapshot{
        session_id_,
        preset_action_id_,
        completed_preset_count_,
        preset_result_,
        preset_state_,
        preset_operation_,
        active_or_last_preset_,
        requested_repeats_,
        completed_repeats_,
        preset_source_,
        RuntimeMotionAvailable(),
        runtime_centered_,
        emergency_stop_latched_,
        faulted_,
        runtime_servo_output_enabled_,
        preset_operation_terminal_,
    };
}

}  // namespace deskmate::xiaozhi
