#include "motion_safety_core.h"

#include <algorithm>
#include <limits>

namespace deskmate::xiaozhi {
namespace {

bool AxisCalibrationIsValid(const AxisCalibration& axis) noexcept {
    return axis.center_verified && axis.direction_verified &&
           axis.limits_verified && axis.minimum_units < axis.center_units &&
           axis.center_units < axis.maximum_units &&
           axis.maximum_step_units > 0;
}

bool TargetEquals(const MotionTarget& left, const MotionTarget& right) noexcept {
    return left.horizontal_units == right.horizontal_units &&
           left.vertical_units == right.vertical_units;
}

}  // namespace

MotionResult MotionSafetyCore::Configure(
    const MotionCalibration& calibration) noexcept {
    if (faulted_) {
        ++diagnostics_.rejected;
        return MotionResult::kFaulted;
    }
    if (emergency_stop_latched_) {
        ++diagnostics_.rejected;
        return MotionResult::kEmergencyStopped;
    }
    if (!CalibrationIsValid(calibration)) {
        calibration_ready_ = false;
        recenter_required_ = true;
        ClearPending();
        state_ = MotionRuntimeState::kCalibrationRequired;
        ++diagnostics_.rejected;
        return MotionResult::kInvalidCalibration;
    }

    calibration_ = calibration;
    calibration_ready_ = true;
    recenter_required_ = true;
    current_ = {calibration.horizontal.center_units,
                calibration.vertical.center_units};
    ClearPending();
    state_ = MotionRuntimeState::kRecenterRequired;
    return MotionResult::kAccepted;
}

void MotionSafetyCore::ResetSession(std::uint32_t session_epoch) noexcept {
    session_epoch_ = session_epoch;
    last_sequence_ = 0;
    recenter_required_ = true;
    ClearPending();
    state_ = faulted_ ? MotionRuntimeState::kFaulted
             : emergency_stop_latched_
                 ? MotionRuntimeState::kEmergencyStopped
                 : calibration_ready_ ? MotionRuntimeState::kRecenterRequired
                                      : MotionRuntimeState::kCalibrationRequired;
    ++diagnostics_.session_resets;
}

MotionResult MotionSafetyCore::Submit(const MotionIntent& intent,
                                      std::uint64_t now_ms) noexcept {
    if (faulted_) {
        ++diagnostics_.rejected;
        return MotionResult::kFaulted;
    }
    if (emergency_stop_latched_) {
        ++diagnostics_.rejected;
        return MotionResult::kEmergencyStopped;
    }
    if (!calibration_ready_) {
        ++diagnostics_.rejected;
        return MotionResult::kCalibrationRequired;
    }
    if (session_epoch_ == 0 || intent.session_epoch != session_epoch_) {
        ++diagnostics_.rejected;
        return MotionResult::kWrongSession;
    }
    if (intent.sequence == 0 || intent.sequence < last_sequence_) {
        ++diagnostics_.rejected;
        return MotionResult::kStaleSequence;
    }
    if (intent.expires_at_ms <= now_ms) {
        ++diagnostics_.expired;
        ++diagnostics_.rejected;
        return MotionResult::kExpired;
    }
    if (!SourceIsValid(intent.source)) {
        ++diagnostics_.rejected;
        return MotionResult::kInvalidIntent;
    }

    const bool is_recenter = intent.kind == MotionIntentKind::kRecenter;
    if (is_recenter != (intent.source == MotionSource::kRecovery)) {
        ++diagnostics_.rejected;
        return MotionResult::kInvalidIntent;
    }
    if (!is_recenter && recenter_required_) {
        ++diagnostics_.rejected;
        return MotionResult::kRecenterRequired;
    }

    MotionIntent normalized = intent;
    if (is_recenter) {
        normalized.target = {calibration_.horizontal.center_units,
                             calibration_.vertical.center_units};
        normalized.horizontal_maximum_step_units = 0;
        normalized.vertical_maximum_step_units = 0;
    } else if (!TargetIsWithinLimits(normalized.target)) {
        ++diagnostics_.rejected;
        return MotionResult::kInvalidIntent;
    }
    if (normalized.horizontal_maximum_step_units >
            calibration_.horizontal.maximum_step_units ||
        normalized.vertical_maximum_step_units >
            calibration_.vertical.maximum_step_units) {
        ++diagnostics_.rejected;
        return MotionResult::kInvalidIntent;
    }

    Slot& slot = slots_[SourceIndex(normalized.source)];
    if (slot.occupied && normalized.sequence == slot.intent.sequence) {
        if (slot.intent.kind == normalized.kind &&
            TargetEquals(slot.intent.target, normalized.target) &&
            slot.intent.horizontal_maximum_step_units ==
                normalized.horizontal_maximum_step_units &&
            slot.intent.vertical_maximum_step_units ==
                normalized.vertical_maximum_step_units &&
            slot.intent.expires_at_ms == normalized.expires_at_ms) {
            ++diagnostics_.duplicates;
            return MotionResult::kDuplicate;
        }
        ++diagnostics_.rejected;
        return MotionResult::kStaleSequence;
    }
    if (normalized.sequence == last_sequence_) {
        ++diagnostics_.rejected;
        return MotionResult::kStaleSequence;
    }

    const bool replaced = slot.occupied;
    slot.occupied = true;
    slot.output_started = false;
    slot.intent = normalized;
    last_sequence_ = normalized.sequence;
    if (replaced) {
        ++diagnostics_.replaced;
        return MotionResult::kReplaced;
    }
    ++diagnostics_.accepted;
    return MotionResult::kAccepted;
}

MotionStep MotionSafetyCore::Tick(std::uint64_t now_ms) noexcept {
    MotionStep step{};
    if (!calibration_ready_ || faulted_ || emergency_stop_latched_) {
        return step;
    }

    ExpireSlots(now_ms);
    Slot* selected = SelectHighestPriority();
    if (selected == nullptr) {
        state_ = recenter_required_ ? MotionRuntimeState::kRecenterRequired
                                    : MotionRuntimeState::kReady;
        return step;
    }

    const MotionTarget target = selected->intent.target;
    const auto horizontal_step = selected->intent.horizontal_maximum_step_units
        ? selected->intent.horizontal_maximum_step_units
        : calibration_.horizontal.maximum_step_units;
    const auto vertical_step = selected->intent.vertical_maximum_step_units
        ? selected->intent.vertical_maximum_step_units
        : calibration_.vertical.maximum_step_units;
    const MotionTarget next{
        StepAxis(current_.horizontal_units, target.horizontal_units,
                 horizontal_step),
        StepAxis(current_.vertical_units, target.vertical_units,
                 vertical_step),
    };
    const bool position_changed = !TargetEquals(current_, next);
    current_ = next;
    step.emit = !selected->output_started || position_changed;
    selected->output_started = true;
    step.target = next;
    step.source = selected->intent.source;
    step.sequence = selected->intent.sequence;

    if (TargetEquals(current_, target)) {
        state_ = MotionRuntimeState::kHolding;
        if (selected->intent.kind == MotionIntentKind::kRecenter) {
            recenter_required_ = false;
            selected->occupied = false;
            state_ = MotionRuntimeState::kReady;
        }
    } else {
        state_ = MotionRuntimeState::kMoving;
    }
    return step;
}

void MotionSafetyCore::CancelSource(MotionSource source) noexcept {
    if (!SourceIsValid(source)) return;
    slots_[SourceIndex(source)] = {};
    state_ = faulted_ ? MotionRuntimeState::kFaulted
             : emergency_stop_latched_
                 ? MotionRuntimeState::kEmergencyStopped
                 : !calibration_ready_
                     ? MotionRuntimeState::kCalibrationRequired
                     : recenter_required_
                         ? MotionRuntimeState::kRecenterRequired
                         : MotionRuntimeState::kReady;
}

void MotionSafetyCore::EmergencyStop() noexcept {
    emergency_stop_latched_ = true;
    recenter_required_ = true;
    ClearPending();
    state_ = faulted_ ? MotionRuntimeState::kFaulted
                      : MotionRuntimeState::kEmergencyStopped;
    ++diagnostics_.emergency_stops;
}

MotionResult MotionSafetyCore::ClearEmergencyStop(
    std::uint32_t session_epoch) noexcept {
    if (faulted_) {
        ++diagnostics_.rejected;
        return MotionResult::kFaulted;
    }
    if (!calibration_ready_) {
        ++diagnostics_.rejected;
        return MotionResult::kCalibrationRequired;
    }
    if (session_epoch == 0 || session_epoch != session_epoch_) {
        ++diagnostics_.rejected;
        return MotionResult::kWrongSession;
    }
    emergency_stop_latched_ = false;
    recenter_required_ = true;
    state_ = MotionRuntimeState::kRecenterRequired;
    return MotionResult::kAccepted;
}

void MotionSafetyCore::LatchFault() noexcept {
    faulted_ = true;
    recenter_required_ = true;
    ClearPending();
    state_ = MotionRuntimeState::kFaulted;
    ++diagnostics_.faults;
}

MotionSnapshot MotionSafetyCore::snapshot() const noexcept {
    return {state_,
            calibration_ready_,
            recenter_required_,
            emergency_stop_latched_,
            session_epoch_,
            current_,
            CountPending(),
            diagnostics_};
}

bool MotionSafetyCore::CalibrationIsValid(
    const MotionCalibration& calibration) noexcept {
    return calibration.power_path_verified &&
           calibration.common_ground_verified &&
           AxisCalibrationIsValid(calibration.horizontal) &&
           AxisCalibrationIsValid(calibration.vertical);
}

std::size_t MotionSafetyCore::SourceIndex(MotionSource source) noexcept {
    return static_cast<std::size_t>(source);
}

bool MotionSafetyCore::SourceIsValid(MotionSource source) noexcept {
    return SourceIndex(source) < kSourceCount;
}

int MotionSafetyCore::Priority(MotionSource source) noexcept {
    return static_cast<int>(source);
}

bool MotionSafetyCore::TargetIsWithinLimits(
    const MotionTarget& target) const noexcept {
    return target.horizontal_units >= calibration_.horizontal.minimum_units &&
           target.horizontal_units <= calibration_.horizontal.maximum_units &&
           target.vertical_units >= calibration_.vertical.minimum_units &&
           target.vertical_units <= calibration_.vertical.maximum_units;
}

void MotionSafetyCore::ClearPending() noexcept {
    for (auto& slot : slots_) {
        slot = {};
    }
}

void MotionSafetyCore::ExpireSlots(std::uint64_t now_ms) noexcept {
    for (auto& slot : slots_) {
        if (slot.occupied && slot.intent.expires_at_ms <= now_ms) {
            slot.occupied = false;
            ++diagnostics_.expired;
        }
    }
}

MotionSafetyCore::Slot* MotionSafetyCore::SelectHighestPriority() noexcept {
    Slot* selected = nullptr;
    for (auto& slot : slots_) {
        if (!slot.occupied) continue;
        if (selected == nullptr ||
            Priority(slot.intent.source) > Priority(selected->intent.source)) {
            selected = &slot;
        }
    }
    return selected;
}

std::uint8_t MotionSafetyCore::CountPending() const noexcept {
    std::uint8_t count = 0;
    for (const auto& slot : slots_) {
        if (slot.occupied) ++count;
    }
    return count;
}

std::int16_t MotionSafetyCore::StepAxis(std::int16_t current,
                                        std::int16_t target,
                                        std::uint16_t maximum_step) noexcept {
    const std::int32_t delta = static_cast<std::int32_t>(target) - current;
    const std::int32_t limit = std::min<std::int32_t>(
        maximum_step, std::numeric_limits<std::int16_t>::max());
    if (delta > limit) return static_cast<std::int16_t>(current + limit);
    if (delta < -limit) return static_cast<std::int16_t>(current - limit);
    return target;
}

}  // namespace deskmate::xiaozhi
