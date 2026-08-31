#pragma once

#include "link_protocol.h"

#include <cstddef>
#include <cstdint>
#include <mutex>

namespace deskmate::xiaozhi {

enum class AgentScene : std::uint8_t {
    kNeutral,
    kNeutralBlink,
    kListening,
    kThinking,
    kFocused,
    kAttention,
    kHappy,
    kSadError,
    kAngry,
};

struct SceneSelection {
    AgentScene scene{AgentScene::kNeutral};
    bool used_fallback{};
};

SceneSelection SelectAgentScene(AgentState state,
                                bool focused_available) noexcept;
const char* ToString(AgentScene scene) noexcept;

class DisplayRenderer {
public:
    virtual ~DisplayRenderer() = default;
    virtual bool Initialize() noexcept = 0;
    virtual bool Supports(AgentScene scene) const noexcept = 0;
    virtual bool Render(AgentScene scene) noexcept = 0;
};

enum class DisplayAcceptResult : std::uint8_t {
    kAccepted,
    kDuplicate,
    kNotReady,
    kBusy,
};

struct DisplayOwnerDiagnostics {
    std::uint32_t accepted{};
    std::uint32_t duplicates{};
    std::uint32_t rendered{};
    std::uint32_t init_failures{};
    std::uint32_t render_failures{};
    std::uint32_t latest_replacements{};
    std::uint32_t completed_blinks{};
    std::uint32_t session_resets{};
    std::uint32_t stale_discards{};
};

struct DisplayOwnerSnapshot {
    bool initialized{};
    bool implemented{};
    bool enabled{};
    AgentState current_state{AgentState::kIdle};
    AgentState desired_state{AgentState::kIdle};
    AgentScene current_scene{AgentScene::kNeutral};
    std::size_t queued{};
    bool blink_closed{};
    bool blink_scheduled{};
    std::uint32_t next_animation_ms{};
    std::uint32_t session_epoch{};
    DisplayOwnerDiagnostics diagnostics{};
};

class DisplayOwner {
public:
    static constexpr std::size_t kMailboxCapacity = 1;
    static constexpr std::uint32_t kBlinkMinIntervalMs = 3600;
    static constexpr std::uint32_t kBlinkMaxIntervalMs = 6400;
    static constexpr std::uint32_t kBlinkClosedMs = 120;

    explicit DisplayOwner(DisplayRenderer& renderer,
                          std::uint32_t animation_seed = 0x6d2b79f5u) noexcept;

    bool Initialize() noexcept;
    DisplayAcceptResult Accept(std::uint32_t transition_id,
                               AgentState state) noexcept;
    bool Service(std::uint32_t now_ms) noexcept;
    void ResetSession() noexcept;
    void Disable() noexcept;
    DisplayOwnerSnapshot snapshot() const noexcept;

private:
    struct Command {
        std::uint32_t transition_id{};
        std::uint32_t session_epoch{};
        AgentState state{AgentState::kIdle};
    };

    void ClearMailboxLocked() noexcept;
    void ScheduleNextBlinkLocked(std::uint32_t now_ms) noexcept;
    std::uint32_t NextBlinkDelayLocked() noexcept;
    bool RenderLocked(AgentScene scene) noexcept;
    static bool TimeReached(std::uint32_t now_ms,
                            std::uint32_t deadline_ms) noexcept;

    DisplayRenderer& renderer_;
    mutable std::mutex mutex_{};
    Command mailbox_{};
    bool mailbox_pending_{};
    bool initialize_attempted_{};
    bool initialized_{};
    bool implemented_{};
    bool enabled_{};
    AgentState current_state_{AgentState::kIdle};
    AgentState desired_state_{AgentState::kIdle};
    AgentScene current_scene_{AgentScene::kNeutral};
    bool blink_closed_{};
    bool blink_scheduled_{};
    std::uint32_t next_animation_ms_{};
    std::uint32_t animation_prng_state_{};
    std::uint32_t session_epoch_{1};
    std::uint32_t last_transition_id_{};
    bool last_transition_valid_{};
    DisplayOwnerDiagnostics diagnostics_{};
};

}  // namespace deskmate::xiaozhi
