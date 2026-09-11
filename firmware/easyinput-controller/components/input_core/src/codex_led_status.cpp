#include "codex_led_status.h"

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

LedFrame solid(Rgb color) {
    LedFrame frame{};
    frame.fill(color);
    return frame;
}

}  // namespace

LedFrame codex_led_frame_for_state(LinkAgentState state) {
    switch (state) {
        case LinkAgentState::Listening:
            return solid({0, 8, 28});
        case LinkAgentState::Thinking:
            return solid({14, 0, 28});
        case LinkAgentState::Working:
            return solid({0, 22, 22});
        case LinkAgentState::Waiting:
            return solid({26, 12, 0});
        case LinkAgentState::Completed:
            return solid({0, 26, 8});
        case LinkAgentState::Error:
            return solid({28, 0, 0});
        case LinkAgentState::Idle:
        default:
            return {};
    }
}

bool CodexLedStatusController::due(std::uint32_t now_ms,
                                   std::uint32_t deadline_ms) {
    return static_cast<std::int32_t>(now_ms - deadline_ms) >= 0;
}

void CodexLedStatusController::clear_active() {
    last_command_ = {};
    last_command_valid_ = false;
    expiry_active_ = false;
    expiry_at_ms_ = 0;
    current_frame_ = {};
}

bool CodexLedStatusController::clear_for_usb_epoch(std::uint32_t usb_epoch,
                                                   LedFrame& frame) {
    if (usb_epoch_ == usb_epoch) return false;
    const bool changed = std::any_of(current_frame_.begin(), current_frame_.end(),
                                     [](const Rgb& pixel) { return !(pixel == Rgb{}); });
    usb_epoch_ = usb_epoch;
    clear_active();
    if (changed) {
        frame = {};
        increment_saturated(diagnostics_.epoch_clears);
    }
    return changed;
}

CodexLedRouteResult CodexLedStatusController::accept(
    const std::uint8_t* payload, std::size_t length, std::uint32_t usb_epoch,
    std::uint32_t now_ms, LedFrame& frame) {
    if (payload == nullptr || length != kAgentStatePayloadBytes ||
        read_u32(payload + 12) != kCodexLedSourceHash) {
        return CodexLedRouteResult::NotForCodexLed;
    }
    (void)clear_for_usb_epoch(usb_epoch, frame);
    AgentStateCommand command{};
    if (usb_epoch == 0 || !decode_agent_state_command(payload, length, command) ||
        command.version != kAgentStateDeskMateVersion) {
        increment_saturated(diagnostics_.malformed);
        return CodexLedRouteResult::ConsumedWithoutChange;
    }
    increment_saturated(diagnostics_.accepted);
    if (last_command_valid_ && agent_state_commands_equal(last_command_, command)) {
        increment_saturated(diagnostics_.duplicates);
        return CodexLedRouteResult::ConsumedWithoutChange;
    }
    last_command_ = command;
    last_command_valid_ = true;
    expiry_active_ = command.state != LinkAgentState::Idle;
    expiry_at_ms_ = expiry_active_ ? now_ms + command.ttl_ms : 0;
    current_frame_ = codex_led_frame_for_state(command.state);
    frame = current_frame_;
    return CodexLedRouteResult::Applied;
}

bool CodexLedStatusController::poll(std::uint32_t now_ms,
                                    std::uint32_t usb_epoch,
                                    LedFrame& frame) {
    if (clear_for_usb_epoch(usb_epoch, frame)) return true;
    if (!expiry_active_ || !due(now_ms, expiry_at_ms_)) return false;
    clear_active();
    frame = {};
    increment_saturated(diagnostics_.expired);
    return true;
}

}  // namespace deskmate::easyinput
