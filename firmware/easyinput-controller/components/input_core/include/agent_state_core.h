#pragma once

#include "deskmate_link_core.h"

#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::uint8_t kAgentStateReportId = 0x12;
inline constexpr std::size_t kAgentStatePayloadBytes = 16;
inline constexpr std::uint8_t kAgentStateMakerVersion = 1;
inline constexpr std::uint8_t kAgentStateDeskMateVersion = 2;
inline constexpr std::uint32_t kAgentStateMakerMaxTtlMs =
    12U * 60U * 60U * 1000U;
inline constexpr std::uint32_t kAgentStateDeskMateMaxTtlMs = 600000U;

struct AgentStateFeatureReportView {
    const std::uint8_t* payload{};
    std::size_t length{};
};

bool normalize_agent_state_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    AgentStateFeatureReportView& out);

struct AgentStateCommand {
    std::uint8_t version{};
    LinkAgentState state{LinkAgentState::Idle};
    std::uint8_t flags{};
    std::uint32_t transition_id{};
    std::uint32_t ttl_ms{};
    std::uint32_t source_hash{};
};

bool decode_agent_state_command(const std::uint8_t* payload,
                                std::size_t length,
                                AgentStateCommand& out);
bool agent_state_commands_equal(const AgentStateCommand& left,
                                const AgentStateCommand& right);

struct AgentStateDispatch {
    LinkAgentState state{LinkAgentState::Idle};
    std::uint32_t transition_id{};
    bool ttl_expiry{};
};

struct AgentStateDiagnostics {
    std::uint32_t accepted{};
    std::uint32_t malformed{};
    std::uint32_t duplicates{};
    std::uint32_t expired{};
    std::uint32_t dropped_disconnected{};
    std::uint32_t forwarded{};
    std::uint32_t queue_drops{};
};

class AgentStateBridge {
 public:
    bool accept(const std::uint8_t* payload, std::size_t length,
                std::uint32_t usb_epoch, std::uint32_t now_ms,
                const LinkStatusSnapshot& link, AgentStateDispatch& dispatch);
    bool poll(std::uint32_t now_ms, std::uint32_t usb_epoch,
              const LinkStatusSnapshot& link, AgentStateDispatch& dispatch);
    void note_forward_result(bool accepted);
    void clear_for_usb_epoch(std::uint32_t usb_epoch);
    const AgentStateDiagnostics& diagnostics() const { return diagnostics_; }

 private:
    static bool link_ready(const LinkStatusSnapshot& link);
    static bool due(std::uint32_t now_ms, std::uint32_t deadline_ms);
    void clear_active();

    AgentStateCommand last_command_{};
    bool last_command_valid_{};
    std::uint32_t usb_epoch_{};
    bool expiry_active_{};
    std::uint32_t expiry_at_ms_{};
    std::uint32_t expiry_transition_id_{};
    std::uint32_t command_peer_restarts_{};
    AgentStateDiagnostics diagnostics_{};
};

}  // namespace deskmate::easyinput
