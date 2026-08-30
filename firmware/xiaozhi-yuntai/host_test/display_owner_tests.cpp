#include "display_owner.h"
#include "fake_display.h"

#include <array>
#include <cassert>

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

void DuplicateQueueAndRenderFailureFailClosed() {
    FakeDisplayRenderer renderer;
    DisplayOwner owner(renderer);
    assert(owner.Initialize());

    assert(owner.Accept(10, AgentState::kListening) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Accept(10, AgentState::kListening) ==
           DisplayAcceptResult::kDuplicate);
    assert(owner.Accept(11, AgentState::kListening) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.snapshot().queued == 1);

    assert(owner.Accept(12, AgentState::kThinking) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Accept(13, AgentState::kWorking) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Accept(14, AgentState::kWaiting) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.Accept(15, AgentState::kCompleted) ==
           DisplayAcceptResult::kBusy);
    assert(owner.snapshot().diagnostics.queue_overflows == 1);

    renderer.fail_next_render = true;
    assert(owner.ServiceOne());
    const auto failed = owner.snapshot();
    assert(failed.implemented);
    assert(!failed.enabled);
    assert(failed.queued == 0);
    assert(failed.diagnostics.render_failures == 1);
    assert(owner.Accept(16, AgentState::kCompleted) ==
           DisplayAcceptResult::kNotReady);
}

void TtlIdleAndSessionResetNeverReplayOldState() {
    FakeDisplayRenderer renderer;
    DisplayOwner owner(renderer);
    assert(owner.Initialize());

    assert(owner.Accept(21, AgentState::kWorking) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.ServiceOne());
    assert(owner.snapshot().current_state == AgentState::kWorking);

    // TTL is owned by EasyInput. Xiaozhi receives its expiry as a new live
    // SET_AGENT_STATE(idle) transition over the existing Link connection.
    assert(owner.Accept(22, AgentState::kIdle) ==
           DisplayAcceptResult::kAccepted);
    assert(owner.ServiceOne());
    assert(owner.snapshot().current_state == AgentState::kIdle);
    assert(renderer.rendered_scenes.back() == AgentScene::kNeutral);

    assert(owner.Accept(23, AgentState::kCompleted) ==
           DisplayAcceptResult::kAccepted);
    owner.ResetSession();
    const auto reset = owner.snapshot();
    assert(reset.desired_state == AgentState::kIdle);
    assert(reset.queued == 1);
    assert(owner.ServiceOne());
    assert(owner.snapshot().current_state == AgentState::kIdle);
    assert(renderer.rendered_scenes.back() == AgentScene::kNeutral);
    assert(owner.Accept(24, AgentState::kCompleted) ==
           DisplayAcceptResult::kAccepted);
}

}  // namespace

int main() {
    SevenStatesMapToFrozenScenes();
    CapabilityGateFollowsInitialization();
    DuplicateQueueAndRenderFailureFailClosed();
    TtlIdleAndSessionResetNeverReplayOldState();
    return 0;
}
