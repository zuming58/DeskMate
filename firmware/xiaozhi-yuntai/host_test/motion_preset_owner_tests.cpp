#include "fake_servo_adapter.h"
#include "manual_calibration_owner.h"

#include <algorithm>
#include <cstdint>
#include <iostream>
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

constexpr std::uint32_t kSession = 0x11223344u;

MotionPresetCommand Command(std::uint32_t action,
                            MotionPresetOperation operation,
                            MotionPreset preset = MotionPreset::kNone,
                            std::uint8_t repeats = 0,
                            MotionPresetSource source =
                                MotionPresetSource::kUi) {
    return MotionPresetCommand{kSession, action, operation, preset, repeats,
                               source};
}

void Center(MotionCoordinator& motion, std::uint32_t action = 1,
            std::uint32_t now_ms = 0) {
    CHECK(motion.ExecuteMotionPreset(
              Command(action, MotionPresetOperation::kStopAndCenter), now_ms) ==
          MotionPresetResult::kAccepted);
    motion.Tick(now_ms);
    motion.Tick(now_ms + 20);
    const auto status = motion.motion_preset_snapshot();
    CHECK(status.state == MotionPresetState::kReady);
    CHECK(status.result == MotionPresetResult::kCompleted);
    CHECK(status.logical_center_accepted);
    CHECK(status.operation_terminal);
}

void DriveToTerminal(MotionCoordinator& motion, std::uint32_t begin_ms,
                     std::uint32_t limit_ms) {
    for (std::uint32_t now = begin_ms; now <= limit_ms; now += 20) {
        motion.Tick(now);
        if (motion.motion_preset_snapshot().operation_terminal) return;
    }
}

bool Saw(const std::vector<ServoAdapterCommand>& commands, ServoAxis axis,
         std::int16_t value) {
    return std::any_of(commands.begin(), commands.end(),
                       [axis, value](const ServoAdapterCommand& command) {
                           return command.operation ==
                                      ServoAdapterOperation::
                                          kAbsoluteRuntimeTarget &&
                                  command.axis == axis &&
                                  command.value_tenths_degree == value;
                       });
}

void FixedTrajectoriesRepeatAndCenter() {
    struct Case {
        MotionPreset preset;
        std::uint8_t repeats;
        ServoAxis witness_axis;
        std::int16_t witness_min;
        std::int16_t witness_max;
    };
    const Case cases[] = {
        {MotionPreset::kAttention, 1, ServoAxis::kPitch, -40, 0},
        {MotionPreset::kNod, 2, ServoAxis::kPitch, -20, 60},
        {MotionPreset::kSearch, 1, ServoAxis::kYaw, -100, 100},
        {MotionPreset::kDance, 2, ServoAxis::kYaw, -80, 80},
    };

    for (const auto& item : cases) {
        test::FakeServoAdapter adapter;
        adapter.runtime_motion_available = true;
        MotionCoordinator motion(adapter);
        motion.StartSession(kSession);
        Center(motion);
        adapter.commands.clear();
        CHECK(motion.ExecuteMotionPreset(
                  Command(2, MotionPresetOperation::kRun, item.preset,
                          item.repeats),
                  40) == MotionPresetResult::kAccepted);
        auto accepted = motion.motion_preset_snapshot();
        CHECK(accepted.state == MotionPresetState::kRunning);
        CHECK(accepted.servo_output_enabled);
        CHECK(!accepted.operation_terminal);
        DriveToTerminal(motion, 40, 13000);
        const auto completed = motion.motion_preset_snapshot();
        if (completed.state != MotionPresetState::kReady) {
            std::cerr << "preset " << static_cast<int>(item.preset)
                      << " stopped with state "
                      << static_cast<int>(completed.state) << " result "
                      << static_cast<int>(completed.result) << " repeats "
                      << static_cast<int>(completed.completed_repeats)
                      << " commands " << adapter.commands.size() << '\n';
            for (const auto& command : adapter.commands) {
                std::cerr << static_cast<int>(command.axis) << ':'
                          << command.value_tenths_degree << ' ';
            }
            std::cerr << '\n';
        }
        CHECK(completed.state == MotionPresetState::kReady);
        CHECK(completed.result == MotionPresetResult::kCompleted);
        CHECK(completed.repeat_count == item.repeats);
        CHECK(completed.completed_repeats == item.repeats);
        CHECK(completed.completed_preset_count == 1);
        CHECK(completed.logical_center_accepted);
        CHECK(!completed.servo_output_enabled);
        CHECK(completed.operation_terminal);
        CHECK(Saw(adapter.commands, item.witness_axis, item.witness_min));
        CHECK(Saw(adapter.commands, item.witness_axis, item.witness_max));
        CHECK(Saw(adapter.commands, ServoAxis::kYaw, 0));
        CHECK(Saw(adapter.commands, ServoAxis::kPitch, 0));
        for (const auto& command : adapter.commands) {
            if (command.axis == ServoAxis::kYaw) {
                CHECK(command.value_tenths_degree >=
                      kRuntimeYawMinimumTenthsDegree);
                CHECK(command.value_tenths_degree <=
                      kRuntimeYawMaximumTenthsDegree);
            } else {
                CHECK(command.value_tenths_degree >=
                      kRuntimePitchMinimumTenthsDegree);
                CHECK(command.value_tenths_degree <=
                      kRuntimePitchMaximumTenthsDegree);
            }
        }
    }
}

void IdempotencyBusyAndManualPriority() {
    test::FakeServoAdapter adapter;
    adapter.runtime_motion_available = true;
    MotionCoordinator motion(adapter);
    motion.StartSession(kSession);
    Center(motion, 100);
    const auto run = Command(101, MotionPresetOperation::kRun,
                             MotionPreset::kSearch, 1,
                             MotionPresetSource::kContext);
    CHECK(motion.ExecuteMotionPreset(run, 40) == MotionPresetResult::kAccepted);
    CHECK(motion.ExecuteMotionPreset(run, 41) == MotionPresetResult::kDuplicate);
    auto conflict = run;
    conflict.source = MotionPresetSource::kIdle;
    CHECK(motion.ExecuteMotionPreset(conflict, 42) ==
          MotionPresetResult::kSequenceConflict);
    CHECK(motion.ExecuteMotionPreset(
              Command(99, MotionPresetOperation::kRun,
                      MotionPreset::kAttention, 1),
              43) == MotionPresetResult::kStaleAction);
    CHECK(motion.ExecuteMotionPreset(
              Command(102, MotionPresetOperation::kRun,
                      MotionPreset::kAttention, 1),
              44) == MotionPresetResult::kBusy);
    CHECK(motion.motion_preset_snapshot().action_id == 101);

    ManualCalibrationCommand select{};
    select.session_id = kSession;
    select.action_id = 1;
    select.operation = ManualCalibrationOperation::kSelectAxis;
    select.axis = 0;
    CHECK(motion.Execute(select, 45) == ManualCalibrationResult::kAccepted);
    const auto cancelled = motion.motion_preset_snapshot();
    CHECK(cancelled.result == MotionPresetResult::kCancelled);
    CHECK(cancelled.operation_terminal);
    CHECK(cancelled.state == MotionPresetState::kNotReady);
    CHECK(!cancelled.servo_output_enabled);

    CHECK(motion.ExecuteMotionPreset(
              Command(103, MotionPresetOperation::kStopAndCenter),
              60) == MotionPresetResult::kAccepted);
    motion.Tick(60);
    motion.Tick(80);
    CHECK(motion.RuntimeMotionReady());
}

void EmergencyStopClearAndWatchdogShareSafetyState() {
    test::FakeServoAdapter adapter;
    adapter.runtime_motion_available = true;
    MotionCoordinator motion(adapter);
    motion.StartSession(kSession);
    Center(motion, 100);
    CHECK(motion.ExecuteMotionPreset(
              Command(200, MotionPresetOperation::kRun,
                      MotionPreset::kDance, 3),
              40) == MotionPresetResult::kAccepted);
    const auto estop = Command(1, MotionPresetOperation::kEmergencyStop);
    CHECK(motion.ExecuteMotionPreset(estop, 60) ==
          MotionPresetResult::kEmergencyStopped);
    auto status = motion.motion_preset_snapshot();
    CHECK(status.emergency_stop_latched);
    CHECK(status.state == MotionPresetState::kEmergencyStopped);
    CHECK(status.operation_terminal);
    CHECK(!status.servo_output_enabled);
    CHECK(motion.ExecuteMotionPreset(estop, 61) ==
          MotionPresetResult::kDuplicate);

    CHECK(motion.ExecuteMotionPreset(
              Command(201,
                      MotionPresetOperation::kClearEmergencyStopAndCenter),
              80) == MotionPresetResult::kAccepted);
    motion.Tick(80);
    motion.Tick(100);
    status = motion.motion_preset_snapshot();
    CHECK(!status.emergency_stop_latched);
    CHECK(status.state == MotionPresetState::kReady);
    CHECK(status.logical_center_accepted);

    CHECK(motion.ExecuteMotionPreset(
              Command(202, MotionPresetOperation::kRun,
                      MotionPreset::kDance, 3),
              120) == MotionPresetResult::kAccepted);
    motion.Tick(120);
    motion.Tick(13120);
    status = motion.motion_preset_snapshot();
    CHECK(status.state == MotionPresetState::kFaulted);
    CHECK(status.result == MotionPresetResult::kFaulted);
    CHECK(status.faulted);
    CHECK(status.operation_terminal);
    CHECK(!status.servo_output_enabled);
}

void AdapterFailureAndDisconnectDoNotReplay() {
    test::FakeServoAdapter adapter;
    adapter.runtime_motion_available = true;
    MotionCoordinator motion(adapter);
    motion.StartSession(kSession);
    Center(motion);
    CHECK(motion.ExecuteMotionPreset(
              Command(2, MotionPresetOperation::kRun,
                      MotionPreset::kAttention, 1),
              40) == MotionPresetResult::kAccepted);
    adapter.fail_next_apply = true;
    motion.Tick(40);
    CHECK(motion.motion_preset_snapshot().result ==
          MotionPresetResult::kAdapterFailure);
    CHECK(motion.motion_preset_snapshot().faulted);

    const auto writes = adapter.commands.size();
    motion.OnLinkDisconnected();
    motion.Tick(5000);
    CHECK(adapter.commands.size() == writes);
    CHECK(motion.motion_preset_snapshot().session_id == 0);
    CHECK(motion.motion_preset_snapshot().faulted);
}

}  // namespace

int main() {
    FixedTrajectoriesRepeatAndCenter();
    IdempotencyBusyAndManualPriority();
    EmergencyStopClearAndWatchdogShareSafetyState();
    AdapterFailureAndDisconnectDoNotReplay();
    if (failures != 0) {
        std::cerr << "motion_preset_owner_tests: " << failures
                  << " failure(s)\n";
        return 1;
    }
    std::cout << "motion_preset_owner_tests: PASS\n";
    return 0;
}
