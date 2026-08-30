#pragma once

#include "link_protocol.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>

namespace deskmate::xiaozhi {

enum class AgentScene : std::uint8_t {
    kNeutral,
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
    std::uint32_t queue_overflows{};
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
    std::uint32_t session_epoch{};
    DisplayOwnerDiagnostics diagnostics{};
};

class DisplayOwner {
public:
    static constexpr std::size_t kQueueCapacity = 4;

    explicit DisplayOwner(DisplayRenderer& renderer) noexcept;

    bool Initialize() noexcept;
    DisplayAcceptResult Accept(std::uint32_t transition_id,
                               AgentState state) noexcept;
    bool ServiceOne() noexcept;
    void ResetSession() noexcept;
    void Disable() noexcept;
    DisplayOwnerSnapshot snapshot() const noexcept;

private:
    struct Command {
        std::uint32_t transition_id{};
        std::uint32_t session_epoch{};
        AgentState state{AgentState::kIdle};
    };

    void ClearQueueLocked() noexcept;
    void PushLocked(const Command& command) noexcept;

    DisplayRenderer& renderer_;
    mutable std::mutex mutex_{};
    std::array<Command, kQueueCapacity> queue_{};
    std::size_t queue_head_{};
    std::size_t queue_tail_{};
    std::size_t queue_size_{};
    bool initialize_attempted_{};
    bool initialized_{};
    bool implemented_{};
    bool enabled_{};
    AgentState current_state_{AgentState::kIdle};
    AgentState desired_state_{AgentState::kIdle};
    AgentScene current_scene_{AgentScene::kNeutral};
    std::uint32_t session_epoch_{1};
    std::uint32_t last_transition_id_{};
    bool last_transition_valid_{};
    DisplayOwnerDiagnostics diagnostics_{};
};

}  // namespace deskmate::xiaozhi
