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
        case AgentScene::kNeutralBlink:
            return "neutral_blink";
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

DisplayOwner::DisplayOwner(DisplayRenderer& renderer,
                           std::uint32_t animation_seed) noexcept
    : renderer_(renderer),
      animation_prng_state_(animation_seed == 0 ? 0x6d2b79f5u
                                                : animation_seed) {}

void DisplayOwner::ClearMailboxLocked() noexcept {
    mailbox_ = {};
    mailbox_pending_ = false;
}

bool DisplayOwner::TimeReached(std::uint32_t now_ms,
                               std::uint32_t deadline_ms) noexcept {
    return static_cast<std::int32_t>(now_ms - deadline_ms) >= 0;
}

std::uint32_t DisplayOwner::NextBlinkDelayLocked() noexcept {
    auto value = animation_prng_state_;
    value ^= value << 13u;
    value ^= value >> 17u;
    value ^= value << 5u;
    animation_prng_state_ = value;
    constexpr auto kRange = kBlinkMaxIntervalMs - kBlinkMinIntervalMs + 1u;
    return kBlinkMinIntervalMs + (value % kRange);
}

void DisplayOwner::ScheduleNextBlinkLocked(std::uint32_t now_ms) noexcept {
    blink_closed_ = false;
    blink_scheduled_ = true;
    next_animation_ms_ = now_ms + NextBlinkDelayLocked();
}

bool DisplayOwner::RenderLocked(AgentScene scene) noexcept {
    if (renderer_.Render(scene)) {
        current_scene_ = scene;
        IncrementSaturated(diagnostics_.rendered);
        return true;
    }
    enabled_ = false;
    ClearMailboxLocked();
    blink_closed_ = false;
    blink_scheduled_ = false;
    IncrementSaturated(diagnostics_.render_failures);
    return false;
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

    if (state == current_state_) {
        if (mailbox_pending_) {
            IncrementSaturated(diagnostics_.latest_replacements);
        }
        ClearMailboxLocked();
        desired_state_ = state;
        last_transition_id_ = transition_id;
        last_transition_valid_ = true;
        IncrementSaturated(diagnostics_.accepted);
        return DisplayAcceptResult::kAccepted;
    }

    if (mailbox_pending_) {
        IncrementSaturated(diagnostics_.latest_replacements);
    }
    mailbox_ = Command{transition_id, session_epoch_, state};
    mailbox_pending_ = true;
    desired_state_ = state;
    last_transition_id_ = transition_id;
    last_transition_valid_ = true;
    IncrementSaturated(diagnostics_.accepted);
    return DisplayAcceptResult::kAccepted;
}

bool DisplayOwner::Service(std::uint32_t now_ms) noexcept {
    std::lock_guard<std::mutex> guard(mutex_);
    if (!enabled_) {
        return false;
    }

    if (mailbox_pending_) {
        const auto command = mailbox_;
        ClearMailboxLocked();
        if (command.session_epoch != session_epoch_) {
            IncrementSaturated(diagnostics_.stale_discards);
            return true;
        }

        const auto selection = SelectAgentScene(
            command.state, renderer_.Supports(AgentScene::kFocused));
        if (!RenderLocked(selection.scene)) {
            return true;
        }
        current_state_ = command.state;
        if (command.state == AgentState::kIdle) {
            ScheduleNextBlinkLocked(now_ms);
        } else {
            blink_closed_ = false;
            blink_scheduled_ = false;
        }
        return true;
    }

    if (current_state_ != AgentState::kIdle) {
        return false;
    }

    if (!blink_scheduled_) {
        ScheduleNextBlinkLocked(now_ms);
        return false;
    }
    if (!TimeReached(now_ms, next_animation_ms_)) {
        return false;
    }

    if (!blink_closed_) {
        if (!RenderLocked(AgentScene::kNeutralBlink)) {
            return true;
        }
        blink_closed_ = true;
        next_animation_ms_ = now_ms + kBlinkClosedMs;
        return true;
    }

    if (!RenderLocked(AgentScene::kNeutral)) {
        return true;
    }
    IncrementSaturated(diagnostics_.completed_blinks);
    ScheduleNextBlinkLocked(now_ms);
    return true;
}

void DisplayOwner::ResetSession() noexcept {
    std::lock_guard<std::mutex> guard(mutex_);
    ++session_epoch_;
    if (session_epoch_ == 0) {
        session_epoch_ = 1;
    }
    ClearMailboxLocked();
    desired_state_ = AgentState::kIdle;
    last_transition_id_ = 0;
    last_transition_valid_ = false;
    IncrementSaturated(diagnostics_.session_resets);
    blink_scheduled_ = false;
    if (enabled_ &&
        (current_state_ != AgentState::kIdle || blink_closed_)) {
        mailbox_ = Command{0, session_epoch_, AgentState::kIdle};
        mailbox_pending_ = true;
    }
}

void DisplayOwner::Disable() noexcept {
    std::lock_guard<std::mutex> guard(mutex_);
    enabled_ = false;
    ClearMailboxLocked();
    blink_closed_ = false;
    blink_scheduled_ = false;
}

DisplayOwnerSnapshot DisplayOwner::snapshot() const noexcept {
    std::lock_guard<std::mutex> guard(mutex_);
    return DisplayOwnerSnapshot{
        initialized_,       implemented_,     enabled_,
        current_state_,     desired_state_,   current_scene_,
        mailbox_pending_ ? kMailboxCapacity : 0u,
        blink_closed_,      blink_scheduled_, next_animation_ms_,
        session_epoch_,     diagnostics_,
    };
}

}  // namespace deskmate::xiaozhi
