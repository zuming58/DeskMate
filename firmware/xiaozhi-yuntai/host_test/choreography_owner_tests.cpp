#include "choreography.h"
#include "display_owner.h"
#include "fake_display.h"
#include "fake_servo_adapter.h"
#include "manual_calibration_owner.h"

#include <algorithm>
#include <cassert>
#include <cstdint>

namespace {

using namespace deskmate::xiaozhi;
using deskmate::xiaozhi::test::FakeDisplayRenderer;
using deskmate::xiaozhi::test::FakeServoAdapter;

void TickUntilIdle(MotionCoordinator& owner, DisplayOwner& display,
                   std::uint32_t start, std::uint32_t end) {
    for (std::uint32_t now = start; now <= end; now += 20) {
        owner.Tick(now);
        display.Service(now);
    }
}

void Center(MotionCoordinator& owner, DisplayOwner& display) {
    const MotionPresetCommand center{1, 1,
        MotionPresetOperation::kStopAndCenter, MotionPreset::kNone, 0,
        MotionPresetSource::kUi};
    assert(owner.ExecuteMotionPreset(center, 0) ==
           MotionPresetResult::kAccepted);
    TickUntilIdle(owner, display, 0, 1000);
    assert(owner.motion_preset_snapshot().state == MotionPresetState::kReady);
}

void SemanticProgramRunsLocallyAndRestoresDisplay() {
    FakeServoAdapter adapter;
    adapter.runtime_motion_available = true;
    FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    assert(display.Initialize());

    MotionCoordinator owner(adapter, &display);
    owner.StartSession(1);
    Center(owner, display);
    assert(display.Accept(7, AgentState::kListening) ==
           DisplayAcceptResult::kAccepted);
    display.Service(1100);

    ChoreographyCommand command{};
    command.session_id = 1;
    command.action_id = 2;
    command.source = MotionPresetSource::kUi;
    command.beat_count = 2;
    command.beat_ms = 400;
    command.repeat_count = 1;
    command.intensity = ChoreographyIntensity::kVivid;
    command.tempo = ChoreographyTempo::kQuick;
    command.beats[0] = {ChoreographyYaw::kLeft,
                        ChoreographyPitch::kUp,
                        ChoreographyExpression::kCompleted};
    command.beats[1] = {ChoreographyYaw::kRight,
                        ChoreographyPitch::kDown,
                        ChoreographyExpression::kWorking};
    assert(owner.ExecuteChoreography(command, 1200) ==
           MotionPresetResult::kAccepted);
    assert(owner.ExecuteChoreography(command, 1201) ==
           MotionPresetResult::kDuplicate);
    TickUntilIdle(owner, display, 1200, 5000);

    const auto status = owner.choreography_snapshot();
    assert(status.result == MotionPresetResult::kCompleted);
    assert(status.state == MotionPresetState::kReady);
    assert(status.completed_choreography_count == 1);
    assert(status.completed_repeats == 1);
    assert(status.logical_center_accepted);
    assert(status.operation_terminal);
    assert(!status.display_lease_active);
    assert(std::any_of(adapter.commands.begin(), adapter.commands.end(),
                       [](const auto& value) {
                           return value.axis == ServoAxis::kYaw &&
                                  value.value_tenths_degree == -100;
                       }));
    assert(std::any_of(adapter.commands.begin(), adapter.commands.end(),
                       [](const auto& value) {
                           return value.axis == ServoAxis::kPitch &&
                                  value.value_tenths_degree == 60;
                       }));
    assert(display.snapshot().desired_state == AgentState::kListening);
}

void EmergencyStopPreemptsProgramAndReleasesLease() {
    FakeServoAdapter adapter;
    adapter.runtime_motion_available = true;
    FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    assert(display.Initialize());
    MotionCoordinator owner(adapter, &display);
    owner.StartSession(1);
    Center(owner, display);

    ChoreographyCommand command{};
    command.session_id = 1;
    command.action_id = 4;
    command.source = MotionPresetSource::kUi;
    command.beat_count = 2;
    command.beat_ms = 1000;
    command.repeat_count = 3;
    command.intensity = ChoreographyIntensity::kStandard;
    command.tempo = ChoreographyTempo::kStandard;
    command.beats[0].yaw = ChoreographyYaw::kLeft;
    command.beats[1].yaw = ChoreographyYaw::kRight;
    assert(owner.ExecuteChoreography(command, 1200) ==
           MotionPresetResult::kAccepted);

    const MotionPresetCommand stop{1, 5,
        MotionPresetOperation::kEmergencyStop, MotionPreset::kNone, 0,
        MotionPresetSource::kUi};
    assert(owner.ExecuteMotionPreset(stop, 1240) ==
           MotionPresetResult::kEmergencyStopped);
    const auto status = owner.choreography_snapshot();
    assert(status.result == MotionPresetResult::kEmergencyStopped);
    assert(status.state == MotionPresetState::kEmergencyStopped);
    assert(status.operation_terminal);
    assert(!status.display_lease_active);
}

}  // namespace

int main() {
    SemanticProgramRunsLocallyAndRestoresDisplay();
    EmergencyStopPreemptsProgramAndReleasesLease();
    return 0;
}
