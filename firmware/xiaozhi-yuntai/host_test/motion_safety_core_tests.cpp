#include "motion_safety_core.h"

#include <cassert>

namespace {

using namespace deskmate::xiaozhi;

MotionCalibration ValidCalibration() {
    return {
        true,
        true,
        {-40, 0, 40, 5, true, true, true},
        {-20, 0, 20, 2, true, true, true},
    };
}

MotionIntent Intent(MotionIntentKind kind, MotionSource source,
                    std::uint32_t epoch, std::uint32_t sequence,
                    MotionTarget target, std::uint64_t expiry,
                    std::uint16_t horizontal_step = 0,
                    std::uint16_t vertical_step = 0) {
    return {kind, source, epoch, sequence, target,
            horizontal_step, vertical_step, expiry};
}

void CalibrationAndRecenterFailClosed() {
    MotionSafetyCore core;
    core.ResetSession(7);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 7, 1,
                              {10, 5}, 1000),
                       10) == MotionResult::kCalibrationRequired);

    auto invalid = ValidCalibration();
    invalid.power_path_verified = false;
    assert(core.Configure(invalid) == MotionResult::kInvalidCalibration);
    assert(!core.snapshot().calibration_ready);

    assert(core.Configure(ValidCalibration()) == MotionResult::kAccepted);
    assert(core.snapshot().recenter_required);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 7, 2,
                              {10, 5}, 1000),
                       10) == MotionResult::kRecenterRequired);
    assert(core.Submit(Intent(MotionIntentKind::kRecenter,
                              MotionSource::kRecovery, 7, 3,
                              {999, 999}, 1000),
                       10) == MotionResult::kAccepted);
    const auto recenter = core.Tick(11);
    assert(recenter.emit);
    assert(recenter.target.horizontal_units == 0);
    assert(recenter.target.vertical_units == 0);
    assert(!core.snapshot().recenter_required);
    assert(core.snapshot().state == MotionRuntimeState::kReady);
}

void RateLimitBoundsAndPriorityAreDeterministic() {
    MotionSafetyCore core;
    core.Configure(ValidCalibration());
    core.ResetSession(9);
    assert(core.Submit(Intent(MotionIntentKind::kRecenter,
                              MotionSource::kRecovery, 9, 1, {}, 1000),
                       0) == MotionResult::kAccepted);
    core.Tick(1);

    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kIdleAnimation, 9, 2,
                              {-20, -10}, 1000),
                       2) == MotionResult::kAccepted);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kFaceTracking, 9, 3,
                              {20, 10}, 1000),
                       2) == MotionResult::kAccepted);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 9, 4,
                              {30, 12}, 1000),
                       2) == MotionResult::kAccepted);

    const auto step = core.Tick(3);
    assert(step.source == MotionSource::kDialogueAction);
    assert(step.target.horizontal_units == 5);
    assert(step.target.vertical_units == 2);
    assert(core.snapshot().state == MotionRuntimeState::kMoving);

    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 9, 5,
                              {10, 4}, 1000),
                       3) == MotionResult::kReplaced);
    const auto latest = core.Tick(4);
    assert(latest.sequence == 5);
    assert(latest.target.horizontal_units == 10);
    assert(latest.target.vertical_units == 4);
    const auto held = core.Tick(5);
    assert(!held.emit);
    assert(core.snapshot().state == MotionRuntimeState::kHolding);

    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 9, 6,
                              {41, 0}, 1000),
                       5) == MotionResult::kInvalidIntent);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 9, 7,
                              {-20, -10}, 1000, 3, 1),
                       6) == MotionResult::kReplaced);
    const auto per_axis = core.Tick(7);
    assert(per_axis.target.horizontal_units == 7);
    assert(per_axis.target.vertical_units == 3);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 9, 8,
                              {20, 10}, 1000, 6, 1),
                       7) == MotionResult::kInvalidIntent);
}

void DuplicateExpiryAndSessionResetNeverReplay() {
    MotionSafetyCore core;
    core.Configure(ValidCalibration());
    core.ResetSession(12);
    auto recenter = Intent(MotionIntentKind::kRecenter,
                           MotionSource::kRecovery, 12, 1, {}, 100);
    assert(core.Submit(recenter, 0) == MotionResult::kAccepted);
    assert(core.Submit(recenter, 0) == MotionResult::kDuplicate);
    core.Tick(1);

    auto short_lived = Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 12, 2,
                              {20, 10}, 5);
    assert(core.Submit(short_lived, 2) == MotionResult::kAccepted);
    assert(!core.Tick(5).emit);
    assert(core.snapshot().diagnostics.expired == 1);

    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 12, 3,
                              {20, 10}, 100),
                       6) == MotionResult::kAccepted);
    core.ResetSession(13);
    assert(core.snapshot().pending_sources == 0);
    assert(core.snapshot().recenter_required);
    assert(!core.Tick(7).emit);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 12, 4,
                              {20, 10}, 100),
                       7) == MotionResult::kWrongSession);
}

void EmergencyStopAndFaultLatchWithoutOutput() {
    MotionSafetyCore core;
    core.Configure(ValidCalibration());
    core.ResetSession(21);
    assert(core.Submit(Intent(MotionIntentKind::kRecenter,
                              MotionSource::kRecovery, 21, 1, {}, 100),
                       0) == MotionResult::kAccepted);
    core.Tick(1);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kFaceTracking, 21, 2,
                              {20, 10}, 100),
                       2) == MotionResult::kAccepted);

    core.EmergencyStop();
    assert(core.snapshot().emergency_stop_latched);
    assert(core.snapshot().pending_sources == 0);
    assert(!core.Tick(3).emit);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 21, 3,
                              {5, 2}, 100),
                       3) == MotionResult::kEmergencyStopped);
    core.ResetSession(22);
    assert(core.snapshot().emergency_stop_latched);
    assert(core.snapshot().state == MotionRuntimeState::kEmergencyStopped);
    assert(core.ClearEmergencyStop(20) == MotionResult::kWrongSession);
    assert(core.ClearEmergencyStop(22) == MotionResult::kAccepted);
    assert(core.snapshot().recenter_required);

    core.LatchFault();
    assert(core.snapshot().state == MotionRuntimeState::kFaulted);
    assert(!core.Tick(4).emit);
    core.ResetSession(23);
    assert(core.snapshot().state == MotionRuntimeState::kFaulted);
    assert(core.ClearEmergencyStop(23) == MotionResult::kFaulted);
    assert(core.Configure(ValidCalibration()) == MotionResult::kFaulted);
    assert(core.snapshot().state == MotionRuntimeState::kFaulted);
}

void InvalidSourceAndRecoveryPriorityFailClosed() {
    MotionSafetyCore core;
    core.Configure(ValidCalibration());
    core.ResetSession(31);
    assert(core.Submit(Intent(MotionIntentKind::kRecenter,
                              MotionSource::kRecovery, 31, 1, {}, 100),
                       0) == MotionResult::kAccepted);
    core.Tick(1);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              static_cast<MotionSource>(99), 31, 2,
                              {1, 1}, 100),
                       2) == MotionResult::kInvalidIntent);
    assert(core.Submit(Intent(MotionIntentKind::kTarget,
                              MotionSource::kDialogueAction, 31, 3,
                              {20, 10}, 100),
                       3) == MotionResult::kAccepted);
    assert(core.Submit(Intent(MotionIntentKind::kRecenter,
                              MotionSource::kRecovery, 31, 4, {}, 100),
                       3) == MotionResult::kAccepted);
    const auto recovery = core.Tick(4);
    assert(recovery.source == MotionSource::kRecovery);
}

}  // namespace

int main() {
    CalibrationAndRecenterFailClosed();
    RateLimitBoundsAndPriorityAreDeterministic();
    DuplicateExpiryAndSessionResetNeverReplay();
    EmergencyStopAndFaultLatchWithoutOutput();
    InvalidSourceAndRecoveryPriorityFailClosed();
    return 0;
}
