#include "display_owner.h"
#include "fake_display.h"

#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>

namespace {

using deskmate::xiaozhi::AgentScene;
using deskmate::xiaozhi::AgentState;
using deskmate::xiaozhi::DisplayAcceptResult;
using deskmate::xiaozhi::DisplayOwner;
using deskmate::xiaozhi::SelectAgentScene;
using deskmate::xiaozhi::test::FakeDisplayRenderer;

void SevenStatesMapToFrozenScenes() {
    constexpr std::array<AgentState, 7> states{
        AgentState::kIdle,      AgentState::kListening,
        AgentState::kThinking,  AgentState::kWorking,
        AgentState::kWaiting,   AgentState::kCompleted,
        AgentState::kError,
    };
    constexpr std::array<AgentScene, 7> scenes{
        AgentScene::kNeutral,   AgentScene::kListening,
        AgentScene::kThinking,  AgentScene::kFocused,
        AgentScene::kAttention, AgentScene::kHappy,
        AgentScene::kSadError,
    };
    for (std::size_t index = 0; index < states.size(); ++index) {
        const auto selected = SelectAgentScene(states[index], true);
        assert(selected.scene == scenes[index]);
        assert(!selected.used_fallback);
        assert(selected.scene != AgentScene::kAngry);
    }
    assert(SelectAgentScene(AgentState::kWaiting, true).scene !=
           SelectAgentScene(AgentState::kIdle, true).scene);
    const auto fallback = SelectAgentScene(AgentState::kWorking, false);
    assert(fallback.scene == AgentScene::kNeutral);
    assert(fallback.used_fallback);
}

void CapabilityGateFollowsInitialization() {
    FakeDisplayRenderer failed_renderer;
    failed_renderer.initialize_result = false;
    DisplayOwner failed(failed_renderer);
    assert(!failed.Initialize());
    const auto failed_snapshot = failed.snapshot();
    assert(!failed_snapshot.initialized);
    assert(!failed_snapshot.implemented);
    assert(!failed_snapshot.enabled);
    assert(failed_snapshot.diagnostics.init_failures == 1);
    assert(failed.Accept(1, AgentState::kListening) ==
           DisplayAcceptResult::kNotReady);

    FakeDisplayRenderer renderer;
    DisplayOwner owner(renderer);
    assert(owner.Initialize());
    const auto ready = owner.snapshot();
    assert(ready.initialized);
    assert(ready.implemented);
    assert(ready.enabled);
    assert(renderer.rendered_scenes.size() == 1);
    assert(renderer.rendered_scenes.front() == AgentScene::kNeutral);
}

void IdleBlinkTimingIsBoundedAndVaries() {
    FakeDisplayRenderer renderer;
    DisplayOwner owner(renderer, 0x12345678u);
    assert(owner.Initialize());

    constexpr std::uint32_t start_ms = 1000;
    assert(!owner.Service(start_ms));
    auto snapshot = owner.snapshot();
    assert(snapshot.blink_scheduled);
    assert(!snapshot.blink_closed);
    const auto first_deadline = snapshot.next_animation_ms;
    const auto first_delay = first_deadline - start_ms;
    assert(first_delay >= DisplayOwner::kBlinkMinIntervalMs);
    assert(first_delay <= DisplayOwner::kBlinkMaxIntervalMs);

    assert(!owner.Service(first_deadline - 1u));
    assert(owner.Service(first_deadline));
    snapshot = owner.snapshot();
    assert(snapshot.blink_closed);
    assert(snapshot.current_scene == AgentScene::kNeutralBlink);
    assert(renderer.rendered_scenes.back() == AgentScene::kNeutralBlink);
    assert(!owner.Service(first_deadline + DisplayOwner::kBlinkClosedMs - 1u));
    assert(owner.Service(first_deadline + DisplayOwner::kBlinkClosedMs));
    snapshot = owner.snapshot();
    assert(!snapshot.blink_closed);
    assert(snapshot.current_scene == AgentScene::kNeutral);
    assert(snapshot.diagnostics.completed_blinks == 1);

    const auto second_delay =
        snapshot.next_animation_ms -
        (first_deadline + DisplayOwner::kBlinkClosedMs);
    assert(second_delay >= DisplayOwner::kBlinkMinIntervalMs);
    assert(second_delay <= DisplayOwner::kBlinkMaxIntervalMs);
    assert(first_delay != second_delay);
}

void LatestStateWinsAndRepeatsDoNotFlash() {
    FakeDisplayRenderer renderer;
    DisplayOwner owner(renderer);
    assert(owner.Initialize());
    assert(!owner.Service(0));

    assert(owner.Accept(10, AgentState::kListening) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Accept(11, AgentState::kThinking) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Accept(12, AgentState::kWorking) ==
           DisplayAcceptResult::kAccepted);
    auto snapshot = owner.snapshot();
    assert(snapshot.queued == DisplayOwner::kMailboxCapacity);
    assert(snapshot.desired_state == AgentState::kWorking);
    assert(snapshot.diagnostics.latest_replacements == 2);

    assert(owner.Service(10));
    snapshot = owner.snapshot();
    assert(snapshot.current_state == AgentState::kWorking);
    assert(snapshot.current_scene == AgentScene::kFocused);
    assert(renderer.rendered_scenes.size() == 2);
    assert(std::find(renderer.rendered_scenes.begin(),
                     renderer.rendered_scenes.end(),
                     AgentScene::kListening) == renderer.rendered_scenes.end());
    assert(std::find(renderer.rendered_scenes.begin(),
                     renderer.rendered_scenes.end(),
                     AgentScene::kThinking) == renderer.rendered_scenes.end());

    const auto render_count = renderer.rendered_scenes.size();
    assert(owner.Accept(13, AgentState::kWorking) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Accept(13, AgentState::kWorking) ==
           DisplayAcceptResult::kDuplicate);
    assert(owner.snapshot().queued == 0);
    assert(!owner.Service(20));
    assert(renderer.rendered_scenes.size() == render_count);

    assert(owner.Accept(14, AgentState::kCompleted) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Accept(15, AgentState::kWorking) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.snapshot().queued == 0);
    assert(!owner.Service(30));
    assert(renderer.rendered_scenes.size() == render_count);
}

void StatePreemptsAnInProgressBlink() {
    FakeDisplayRenderer renderer;
    DisplayOwner owner(renderer, 0x10203040u);
    assert(owner.Initialize());
    assert(!owner.Service(100));
    const auto blink_at = owner.snapshot().next_animation_ms;
    assert(owner.Service(blink_at));
    assert(owner.snapshot().blink_closed);

    assert(owner.Accept(16, AgentState::kWaiting) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Service(blink_at + 1u));
    const auto waiting = owner.snapshot();
    assert(waiting.current_state == AgentState::kWaiting);
    assert(waiting.current_scene == AgentScene::kAttention);
    assert(!waiting.blink_closed);
    assert(!waiting.blink_scheduled);
    assert(!owner.Service(blink_at + DisplayOwner::kBlinkClosedMs));
    assert(renderer.rendered_scenes.back() == AgentScene::kAttention);
}

void TtlIdleRestartsBlinkAndSessionResetNeverReplaysOldState() {
    FakeDisplayRenderer renderer;
    DisplayOwner owner(renderer, 0x87654321u);
    assert(owner.Initialize());

    assert(owner.Accept(21, AgentState::kWorking) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Service(10));
    assert(owner.snapshot().current_state == AgentState::kWorking);

    // TTL is owned by EasyInput. Expiry reaches Xiaozhi as a new live idle
    // transition without changing the frozen SET_AGENT_STATE payload.
    assert(owner.Accept(22, AgentState::kIdle) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Service(20));
    auto idle = owner.snapshot();
    assert(idle.current_state == AgentState::kIdle);
    assert(idle.current_scene == AgentScene::kNeutral);
    assert(idle.blink_scheduled);
    assert(owner.Service(idle.next_animation_ms));
    assert(owner.snapshot().current_scene == AgentScene::kNeutralBlink);

    assert(owner.Accept(23, AgentState::kCompleted) ==
           DisplayAcceptResult::kAccepted);
    owner.ResetSession();
    const auto reset = owner.snapshot();
    assert(reset.desired_state == AgentState::kIdle);
    assert(reset.queued == 1);
    assert(owner.Service(idle.next_animation_ms + 1u));
    assert(owner.snapshot().current_state == AgentState::kIdle);
    assert(renderer.rendered_scenes.back() == AgentScene::kNeutral);
    assert(owner.Accept(24, AgentState::kCompleted) ==
           DisplayAcceptResult::kAccepted);
}

void RenderFailureDisablesOnlyTheDisplayOwner() {
    FakeDisplayRenderer renderer;
    DisplayOwner owner(renderer);
    assert(owner.Initialize());
    assert(!owner.Service(100));
    const auto deadline = owner.snapshot().next_animation_ms;

    renderer.fail_next_render = true;
    assert(owner.Service(deadline));
    const auto failed = owner.snapshot();
    assert(failed.implemented);
    assert(!failed.enabled);
    assert(failed.queued == 0);
    assert(failed.diagnostics.render_failures == 1);
    assert(owner.Accept(30, AgentState::kCompleted) ==
           DisplayAcceptResult::kNotReady);
}

}  // namespace

int main() {
    SevenStatesMapToFrozenScenes();
    CapabilityGateFollowsInitialization();
    IdleBlinkTimingIsBoundedAndVaries();
    LatestStateWinsAndRepeatsDoNotFlash();
    StatePreemptsAnInProgressBlink();
    TtlIdleRestartsBlinkAndSessionResetNeverReplaysOldState();
    RenderFailureDisablesOnlyTheDisplayOwner();
    return 0;
}
