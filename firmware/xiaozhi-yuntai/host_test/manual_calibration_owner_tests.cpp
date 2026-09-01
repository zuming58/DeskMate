#include "fake_servo_adapter.h"
#include "manual_calibration_owner.h"

#include <cassert>
#include <cstdint>
#include <iostream>

namespace {

using deskmate::xiaozhi::ManualCalibrationCommand;
using deskmate::xiaozhi::ManualCalibrationOperation;
using deskmate::xiaozhi::ManualCalibrationOwner;
using deskmate::xiaozhi::ManualCalibrationResult;
using deskmate::xiaozhi::ManualCalibrationState;
using deskmate::xiaozhi::MotionIntent;
using deskmate::xiaozhi::MotionResult;
using deskmate::xiaozhi::ServoAdapterOperation;
using deskmate::xiaozhi::test::FakeServoAdapter;

constexpr std::uint32_t kSession = 0x11223344u;
constexpr std::uint32_t kNonce = 0x55667788u;

ManualCalibrationCommand Select(std::uint32_t action, std::uint8_t axis) {
    ManualCalibrationCommand command{};
    command.session_id = kSession;
    command.action_id = action;
    command.operation = ManualCalibrationOperation::kSelectAxis;
    command.axis = axis;
    return command;
}

ManualCalibrationCommand Arm(std::uint32_t action, std::uint8_t axis,
                             std::uint32_t nonce = kNonce) {
    ManualCalibrationCommand command{};
    command.session_id = kSession;
    command.action_id = action;
    command.arm_nonce = nonce;
    command.operation = ManualCalibrationOperation::kArm;
    command.axis = axis;
    command.arm_ttl_ms = 3000;
    command.safety_flags = 0x0f;
    return command;
}

ManualCalibrationCommand Output(std::uint32_t action,
                                ManualCalibrationOperation operation,
                                std::uint8_t axis, std::int8_t direction = 0,
                                std::uint32_t nonce = kNonce) {
    ManualCalibrationCommand command{};
    command.session_id = kSession;
    command.action_id = action;
    command.arm_nonce = nonce;
    command.operation = operation;
    command.axis = axis;
    command.step_direction = direction;
    return command;
}

ManualCalibrationCommand Stop(std::uint32_t action,
                              ManualCalibrationOperation operation) {
    ManualCalibrationCommand command{};
    command.session_id = kSession;
    command.action_id = action;
    command.operation = operation;
    command.axis = 0xff;
    return command;
}

void TestZeroStartupOutputAndUncalibratedNormalMotionRejects() {
    FakeServoAdapter adapter;
    ManualCalibrationOwner owner(adapter);
    owner.StartSession(kSession);
    assert(adapter.commands.empty());
    assert(owner.snapshot().state == ManualCalibrationState::kLocked);

    MotionIntent intent{};
    intent.session_epoch = kSession;
    intent.sequence = 1;
    intent.expires_at_ms = 1000;
    assert(owner.SubmitNormalMotion(intent, 1) ==
           MotionResult::kCalibrationRequired);
    assert(adapter.commands.empty());
}

void TestOneArmAllowsExactlyOneOutput() {
    FakeServoAdapter adapter;
    ManualCalibrationOwner owner(adapter);
    owner.StartSession(kSession);
    assert(owner.Execute(Select(1, 0), 10) ==
           ManualCalibrationResult::kAccepted);
    assert(owner.Execute(Arm(2, 0), 20) ==
           ManualCalibrationResult::kAccepted);
    const auto center = Output(3, ManualCalibrationOperation::kProvisionalCenter,
                               0);
    assert(owner.Execute(center, 30) == ManualCalibrationResult::kAccepted);
    assert(adapter.commands.size() == 1);
    assert(adapter.commands[0].operation ==
           ServoAdapterOperation::kProvisionalCenter);
    assert(!owner.snapshot().armed);

    auto repeated_new_action = center;
    repeated_new_action.action_id = 4;
    assert(owner.Execute(repeated_new_action, 40) ==
           ManualCalibrationResult::kArmRequired);
    assert(adapter.commands.size() == 1);
}

void TestDuplicateConflictStaleWrongAxisAndRange() {
    FakeServoAdapter adapter;
    ManualCalibrationOwner owner(adapter);
    owner.StartSession(kSession);
    const auto select = Select(5, 1);
    assert(owner.Execute(select, 1) == ManualCalibrationResult::kAccepted);
    assert(owner.Execute(select, 2) == ManualCalibrationResult::kDuplicate);
    auto conflict = select;
    conflict.axis = 0;
    assert(owner.Execute(conflict, 3) ==
           ManualCalibrationResult::kSequenceConflict);
    assert(owner.Execute(Select(4, 1), 4) ==
           ManualCalibrationResult::kStaleAction);

    assert(owner.Execute(Arm(6, 0), 5) ==
           ManualCalibrationResult::kWrongAxis);
    assert(owner.Execute(Arm(7, 1), 6) ==
           ManualCalibrationResult::kAccepted);
    assert(owner.Execute(Output(8, ManualCalibrationOperation::kRelativeStep,
                                1, 1),
                         7) == ManualCalibrationResult::kCenterRequired);
    assert(adapter.commands.empty());
}

void TestStepRecenterArmExpiryAndDisconnectNoReplay() {
    FakeServoAdapter adapter;
    ManualCalibrationOwner owner(adapter);
    owner.StartSession(kSession);
    assert(owner.Execute(Select(1, 1), 1) ==
           ManualCalibrationResult::kAccepted);
    assert(owner.Execute(Arm(2, 1), 2) ==
           ManualCalibrationResult::kAccepted);
    assert(owner.Execute(Output(3, ManualCalibrationOperation::kProvisionalCenter,
                                1),
                         3) == ManualCalibrationResult::kAccepted);
    assert(owner.Execute(Arm(4, 1), 4) ==
           ManualCalibrationResult::kAccepted);
    assert(owner.Execute(Output(5, ManualCalibrationOperation::kRelativeStep,
                                1, 2),
                         5) == ManualCalibrationResult::kStepOutOfRange);
    assert(owner.Execute(Output(6, ManualCalibrationOperation::kRelativeStep,
                                1, -1),
                         6) == ManualCalibrationResult::kAccepted);
    assert(adapter.commands.back().value_tenths_degree == -10);
    assert(owner.Execute(Arm(7, 1), 7) ==
           ManualCalibrationResult::kAccepted);
    assert(owner.Execute(Output(8, ManualCalibrationOperation::kRecenter, 1),
                         8) == ManualCalibrationResult::kAccepted);
    assert(!owner.snapshot().recenter_required);
    assert(adapter.commands.size() == 3);

    assert(owner.Execute(Arm(9, 1), 10) ==
           ManualCalibrationResult::kAccepted);
    owner.Tick(3010);
    assert(!owner.snapshot().armed);
    assert(owner.snapshot().last_error == ManualCalibrationResult::kArmExpired);
    assert(owner.Execute(Output(10, ManualCalibrationOperation::kRelativeStep,
                                1, 1),
                         3010) == ManualCalibrationResult::kArmRequired);
    assert(adapter.commands.size() == 3);

    owner.OnLinkDisconnected();
    assert(owner.snapshot().session_id == 0);
    assert(owner.snapshot().state == ManualCalibrationState::kLocked);
    assert(adapter.commands.size() == 3);
    owner.StartSession(kSession + 1);
    assert(adapter.commands.size() == 3);
}

void TestDuplicateArmCannotExtendExpiredLease() {
    FakeServoAdapter adapter;
    ManualCalibrationOwner owner(adapter);
    owner.StartSession(kSession);
    assert(owner.Execute(Select(1, 0), 1) ==
           ManualCalibrationResult::kAccepted);
    const auto arm = Arm(2, 0);
    assert(owner.Execute(arm, 2) == ManualCalibrationResult::kAccepted);
    assert(owner.Execute(arm, 3002) == ManualCalibrationResult::kDuplicate);
    assert(!owner.snapshot().armed);
    assert(adapter.commands.empty());
}

void TestEmergencyStopPriorityLatchAndClearRequiresFreshRecenter() {
    FakeServoAdapter adapter;
    ManualCalibrationOwner owner(adapter);
    owner.StartSession(kSession);
    assert(owner.Execute(Select(100, 0), 1) ==
           ManualCalibrationResult::kAccepted);
    assert(owner.Execute(Stop(1, ManualCalibrationOperation::kEmergencyStop),
                         2) == ManualCalibrationResult::kAccepted);
    assert(owner.snapshot().emergency_stop_latched);
    assert(owner.Execute(Stop(1, ManualCalibrationOperation::kEmergencyStop),
                         3) == ManualCalibrationResult::kDuplicate);
    assert(owner.Execute(Select(101, 0), 4) ==
           ManualCalibrationResult::kEmergencyStopped);
    assert(owner.Execute(
               Stop(102, ManualCalibrationOperation::kClearEmergencyStop), 5) ==
           ManualCalibrationResult::kAccepted);
    assert(owner.snapshot().state == ManualCalibrationState::kLocked);
    assert(!owner.snapshot().center_provisional);
    assert(owner.Execute(Output(103, ManualCalibrationOperation::kRecenter, 0),
                         6) == ManualCalibrationResult::kCenterRequired);
}

void TestSafetyFlagsUnavailableAndAdapterFailureFailSoft() {
    FakeServoAdapter adapter;
    ManualCalibrationOwner owner(adapter);
    owner.StartSession(kSession);
    assert(owner.Execute(Select(1, 0), 1) ==
           ManualCalibrationResult::kAccepted);
    auto unsafe_arm = Arm(2, 0);
    unsafe_arm.safety_flags = 0x07;
    assert(owner.Execute(unsafe_arm, 2) ==
           ManualCalibrationResult::kSafetyNotConfirmed);
    assert(adapter.commands.empty());

    adapter.available = false;
    assert(owner.Execute(Arm(3, 0), 3) ==
           ManualCalibrationResult::kAdapterUnavailable);
    adapter.available = true;
    assert(owner.Execute(Arm(4, 0), 4) ==
           ManualCalibrationResult::kAccepted);
    adapter.fail_next_apply = true;
    assert(owner.Execute(Output(5, ManualCalibrationOperation::kProvisionalCenter,
                                0),
                         5) == ManualCalibrationResult::kAdapterFailure);
    assert(owner.snapshot().faulted);
    assert(adapter.commands.empty());
    assert(owner.Execute(Select(6, 0), 6) ==
           ManualCalibrationResult::kFaulted);
}

}  // namespace

int main() {
    TestZeroStartupOutputAndUncalibratedNormalMotionRejects();
    TestOneArmAllowsExactlyOneOutput();
    TestDuplicateConflictStaleWrongAxisAndRange();
    TestStepRecenterArmExpiryAndDisconnectNoReplay();
    TestDuplicateArmCannotExtendExpiredLease();
    TestEmergencyStopPriorityLatchAndClearRequiresFreshRecenter();
    TestSafetyFlagsUnavailableAndAdapterFailureFailSoft();
    std::cout << "manual_calibration_owner_tests: PASS\n";
    return 0;
}
