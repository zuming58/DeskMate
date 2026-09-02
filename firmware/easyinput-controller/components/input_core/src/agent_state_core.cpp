#include "agent_state_core.h"

#include <algorithm>
#include <limits>

namespace deskmate::easyinput {
namespace {

std::uint32_t read_u32(const std::uint8_t* data) {
    return static_cast<std::uint32_t>(data[0]) |
           (static_cast<std::uint32_t>(data[1]) << 8U) |
           (static_cast<std::uint32_t>(data[2]) << 16U) |
           (static_cast<std::uint32_t>(data[3]) << 24U);
}

void increment_saturated(std::uint32_t& value) {
    if (value != std::numeric_limits<std::uint32_t>::max()) ++value;
}

bool padding_is_zero(const std::uint8_t* begin, const std::uint8_t* end) {
    return std::all_of(begin, end,
                       [](std::uint8_t value) { return value == 0; });
}

bool map_maker_state(std::uint8_t state, LinkAgentState& mapped) {
    switch (state) {
        case 0: mapped = LinkAgentState::Idle; return true;
        case 1: mapped = LinkAgentState::Working; return true;
        case 2: mapped = LinkAgentState::Waiting; return true;
        case 3: mapped = LinkAgentState::Completed; return true;
        case 4: mapped = LinkAgentState::Error; return true;
        default: return false;
    }
}

}  // namespace

bool normalize_agent_state_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    AgentStateFeatureReportView& out) {
    out = {};
    if (buffer == nullptr || length == 0) return false;
    const bool inline_report_id =
        buffer[0] == kAgentStateReportId &&
        (length == kAgentStatePayloadBytes + 1 ||
         (length == 64 &&
          padding_is_zero(buffer + kAgentStatePayloadBytes + 1,
                          buffer + length)));
    if (inline_report_id) {
        if (report_id != 0 && report_id != kAgentStateReportId) return false;
        out = {buffer + 1, kAgentStatePayloadBytes};
        return true;
    }
    const bool separate_report_id =
        report_id == kAgentStateReportId &&
        (length == kAgentStatePayloadBytes ||
         (length == 63 &&
          padding_is_zero(buffer + kAgentStatePayloadBytes,
                          buffer + length)));
    if (!separate_report_id) {
        return false;
    }
    out = {buffer, kAgentStatePayloadBytes};
    return true;
}

bool decode_agent_state_command(const std::uint8_t* payload,
                                std::size_t length,
                                AgentStateCommand& out) {
    out = {};
    if (payload == nullptr || length != kAgentStatePayloadBytes ||
        payload[2] != 0 || payload[3] != 0) {
        return false;
    }

    AgentStateCommand command{};
    command.version = payload[0];
    command.flags = payload[2];
    command.transition_id = read_u32(payload + 4);
    command.ttl_ms = read_u32(payload + 8);
    command.source_hash = read_u32(payload + 12);
    if (command.transition_id == 0) return false;

    if (command.version == kAgentStateMakerVersion) {
        if (!map_maker_state(payload[1], command.state)) return false;
        command.ttl_ms = std::min(command.ttl_ms, kAgentStateMakerMaxTtlMs);
        if (command.state == LinkAgentState::Idle) command.ttl_ms = 0;
    } else if (command.version == kAgentStateDeskMateVersion) {
        if (payload[1] > static_cast<std::uint8_t>(LinkAgentState::Error)) {
            return false;
        }
        command.state = static_cast<LinkAgentState>(payload[1]);
        if (command.state == LinkAgentState::Idle) {
            if (command.ttl_ms != 0) return false;
        } else if (command.ttl_ms == 0 ||
                   command.ttl_ms > kAgentStateDeskMateMaxTtlMs) {
            return false;
        }
    } else {
        return false;
    }

    out = command;
    return true;
}

bool agent_state_commands_equal(const AgentStateCommand& left,
                                const AgentStateCommand& right) {
    return left.version == right.version && left.state == right.state &&
           left.flags == right.flags &&
           left.transition_id == right.transition_id &&
           left.ttl_ms == right.ttl_ms &&
           left.source_hash == right.source_hash;
}

bool AgentStateBridge::link_ready(const LinkStatusSnapshot& link) {
    return link.state == LinkControllerState::Connected &&
           (link.enabled_capabilities & kLinkT09RequiredCapabilities) ==
               kLinkT09RequiredCapabilities &&
           (link.enabled_capabilities & kLinkT15ForbiddenCapabilities) == 0;
}

bool AgentStateBridge::due(std::uint32_t now_ms,
                           std::uint32_t deadline_ms) {
    return static_cast<std::int32_t>(now_ms - deadline_ms) >= 0;
}

void AgentStateBridge::clear_active() {
    expiry_active_ = false;
    expiry_at_ms_ = 0;
    expiry_transition_id_ = 0;
}

void AgentStateBridge::clear_for_usb_epoch(std::uint32_t usb_epoch) {
    if (usb_epoch_ == usb_epoch) return;
    usb_epoch_ = usb_epoch;
    last_command_ = {};
    last_command_valid_ = false;
    clear_active();
}

bool AgentStateBridge::accept(const std::uint8_t* payload, std::size_t length,
                              std::uint32_t usb_epoch, std::uint32_t now_ms,
                              const LinkStatusSnapshot& link,
                              AgentStateDispatch& dispatch) {
    dispatch = {};
    clear_for_usb_epoch(usb_epoch);
    AgentStateCommand command{};
    if (usb_epoch == 0 ||
        !decode_agent_state_command(payload, length, command)) {
        increment_saturated(diagnostics_.malformed);
        return false;
    }
    increment_saturated(diagnostics_.accepted);

    if (!link_ready(link)) {
        clear_active();
        last_command_ = {};
        last_command_valid_ = false;
        increment_saturated(diagnostics_.dropped_disconnected);
        return false;
    }
    if (last_command_valid_ &&
        agent_state_commands_equal(last_command_, command)) {
        increment_saturated(diagnostics_.duplicates);
        return false;
    }
    last_command_ = command;
    last_command_valid_ = true;
    command_peer_restarts_ = link.peer_restarts;
    clear_active();

    dispatch.state = command.state;
    dispatch.transition_id = command.transition_id;
    if (command.state != LinkAgentState::Idle && command.ttl_ms != 0) {
        expiry_active_ = true;
        expiry_at_ms_ = now_ms + command.ttl_ms;
        expiry_transition_id_ = command.transition_id == UINT32_MAX
            ? 1
            : command.transition_id + 1;
    }
    return true;
}

bool AgentStateBridge::poll(std::uint32_t now_ms, std::uint32_t usb_epoch,
                            const LinkStatusSnapshot& link,
                            AgentStateDispatch& dispatch) {
    dispatch = {};
    if (usb_epoch_ != usb_epoch) {
        clear_for_usb_epoch(usb_epoch);
        return false;
    }
    if (!link_ready(link) ||
        (last_command_valid_ &&
         link.peer_restarts != command_peer_restarts_)) {
        const bool discarded = last_command_valid_ || expiry_active_;
        last_command_ = {};
        last_command_valid_ = false;
        clear_active();
        if (discarded) {
            increment_saturated(diagnostics_.dropped_disconnected);
        }
        return false;
    }
    if (!expiry_active_) return false;
    if (!due(now_ms, expiry_at_ms_)) return false;
    dispatch.state = LinkAgentState::Idle;
    dispatch.transition_id = expiry_transition_id_;
    dispatch.ttl_expiry = true;
    clear_active();
    increment_saturated(diagnostics_.expired);
    return true;
}

void AgentStateBridge::note_forward_result(bool accepted) {
    increment_saturated(accepted ? diagnostics_.forwarded
                                 : diagnostics_.queue_drops);
}

}  // namespace deskmate::easyinput
