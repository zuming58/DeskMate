#include "display_owner.h"

#include <limits>

namespace deskmate::xiaozhi {
namespace {

void IncrementSaturated(std::uint32_t& value) noexcept {
    if (value != std::numeric_limits<std::uint32_t>::max()) {
        ++value;
    }
}

}  // namespace

SceneSelection SelectAgentScene(AgentState state,
                                bool focused_available) noexcept {
    switch (state) {
        case AgentState::kIdle:
            return {AgentScene::kNeutral, false};
        case AgentState::kListening:
            return {AgentScene::kListening, false};
        case AgentState::kThinking:
            return {AgentScene::kThinking, false};
        case AgentState::kWorking:
            return focused_available
                       ? SceneSelection{AgentScene::kFocused, false}
                       : SceneSelection{AgentScene::kNeutral, true};
        case AgentState::kWaiting:
            return {AgentScene::kAttention, false};
        case AgentState::kCompleted:
            return {AgentScene::kHappy, false};
        case AgentState::kError:
            return {AgentScene::kSadError, false};
    }
    return {AgentScene::kNeutral, true};
}

const char* ToString(AgentScene scene) noexcept {
    switch (scene) {
        case AgentScene::kNeutral:
            return "neutral";
        case AgentScene::kListening:
            return "listening";
        case AgentScene::kThinking:
            return "thinking";
        case AgentScene::kFocused:
            return "focused";
        case AgentScene::kAttention:
            return "attention";
        case AgentScene::kHappy:
            return "happy";
        case AgentScene::kSadError:
            return "sad_error";
        case AgentScene::kAngry:
            return "angry";
    }
    return "unknown";
}

DisplayOwner::DisplayOwner(DisplayRenderer& renderer) noexcept
    : renderer_(renderer) {}

void DisplayOwner::ClearQueueLocked() noexcept {
    queue_head_ = 0;
    queue_tail_ = 0;
    queue_size_ = 0;
}

void DisplayOwner::PushLocked(const Command& command) noexcept {
    queue_[queue_tail_] = command;
    queue_tail_ = (queue_tail_ + 1u) % queue_.size();
    ++queue_size_;
}

bool DisplayOwner::Initialize() noexcept {
    {
        std::lock_guard<std::mutex> guard(mutex_);
        if (initialize_attempted_) {
            return enabled_;
        }
        initialize_attempted_ = true;
    }

    if (!renderer_.Initialize()) {
        std::lock_guard<std::mutex> guard(mutex_);
        IncrementSaturated(diagnostics_.init_failures);
        return false;
    }

    const bool first_frame = renderer_.Render(AgentScene::kNeutral);
    std::lock_guard<std::mutex> guard(mutex_);
    initialized_ = true;
    implemented_ = true;
    current_state_ = AgentState::kIdle;
    desired_state_ = AgentState::kIdle;
    current_scene_ = AgentScene::kNeutral;
    if (!first_frame) {
        IncrementSaturated(diagnostics_.render_failures);
        enabled_ = false;
        return false;
    }
    enabled_ = true;
    IncrementSaturated(diagnostics_.rendered);
    return true;
}

DisplayAcceptResult DisplayOwner::Accept(std::uint32_t transition_id,
                                         AgentState state) noexcept {
    std::lock_guard<std::mutex> guard(mutex_);
    if (!enabled_) {
        return DisplayAcceptResult::kNotReady;
    }
    if (last_transition_valid_ && last_transition_id_ == transition_id &&
        desired_state_ == state) {
        IncrementSaturated(diagnostics_.duplicates);
        return DisplayAcceptResult::kDuplicate;
    }
    if (desired_state_ == state) {
        last_transition_id_ = transition_id;
        last_transition_valid_ = true;
        IncrementSaturated(diagnostics_.accepted);
        return DisplayAcceptResult::kAccepted;
    }
    if (queue_size_ == queue_.size()) {
        IncrementSaturated(diagnostics_.queue_overflows);
        return DisplayAcceptResult::kBusy;
    }

    PushLocked(Command{transition_id, session_epoch_, state});
    desired_state_ = state;
    last_transition_id_ = transition_id;
    last_transition_valid_ = true;
    IncrementSaturated(diagnostics_.accepted);
    return DisplayAcceptResult::kAccepted;
}

bool DisplayOwner::ServiceOne() noexcept {
    Command command{};
    {
        std::lock_guard<std::mutex> guard(mutex_);
        if (!enabled_ || queue_size_ == 0) {
            return false;
        }
        command = queue_[queue_head_];
        queue_head_ = (queue_head_ + 1u) % queue_.size();
        --queue_size_;
    }

    const auto selection = SelectAgentScene(
        command.state, renderer_.Supports(AgentScene::kFocused));
    const bool rendered = renderer_.Render(selection.scene);

    std::lock_guard<std::mutex> guard(mutex_);
    if (!rendered) {
        enabled_ = false;
        ClearQueueLocked();
        IncrementSaturated(diagnostics_.render_failures);
        return true;
    }
    if (command.session_epoch != session_epoch_) {
        IncrementSaturated(diagnostics_.stale_discards);
        return true;
    }
    current_state_ = command.state;
    current_scene_ = selection.scene;
    IncrementSaturated(diagnostics_.rendered);
    return true;
}

void DisplayOwner::ResetSession() noexcept {
    std::lock_guard<std::mutex> guard(mutex_);
    ++session_epoch_;
    if (session_epoch_ == 0) {
        session_epoch_ = 1;
    }
    ClearQueueLocked();
    desired_state_ = AgentState::kIdle;
    last_transition_id_ = 0;
    last_transition_valid_ = false;
    IncrementSaturated(diagnostics_.session_resets);
    if (enabled_) {
        PushLocked(Command{0, session_epoch_, AgentState::kIdle});
    }
}

void DisplayOwner::Disable() noexcept {
    std::lock_guard<std::mutex> guard(mutex_);
    enabled_ = false;
    ClearQueueLocked();
}

DisplayOwnerSnapshot DisplayOwner::snapshot() const noexcept {
    std::lock_guard<std::mutex> guard(mutex_);
    return DisplayOwnerSnapshot{
        initialized_,       implemented_,     enabled_,
        current_state_,     desired_state_,   current_scene_,
        queue_size_,        session_epoch_,   diagnostics_,
    };
}

}  // namespace deskmate::xiaozhi
