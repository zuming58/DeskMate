#pragma once

#include "agent_state_core.h"
#include "led_feedback.h"

#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::uint32_t kCodexLedSourceHash = 0x4c584443U;

enum class CodexLedRouteResult : std::uint8_t {
    NotForCodexLed,
    Applied,
    ConsumedWithoutChange,
};

struct CodexLedStatusDiagnostics {
    std::uint32_t accepted{};
    std::uint32_t malformed{};
    std::uint32_t duplicates{};
    std::uint32_t expired{};
    std::uint32_t epoch_clears{};
};

LedFrame codex_led_frame_for_state(LinkAgentState state);

class CodexLedStatusController {
 public:
    CodexLedRouteResult accept(const std::uint8_t* payload,
                               std::size_t length,
                               std::uint32_t usb_epoch,
                               std::uint32_t now_ms,
                               LedFrame& frame);
    bool poll(std::uint32_t now_ms, std::uint32_t usb_epoch, LedFrame& frame);
    bool clear_for_usb_epoch(std::uint32_t usb_epoch, LedFrame& frame);
    const CodexLedStatusDiagnostics& diagnostics() const { return diagnostics_; }

 private:
    static bool due(std::uint32_t now_ms, std::uint32_t deadline_ms);
    void clear_active();

    AgentStateCommand last_command_{};
    bool last_command_valid_{};
    std::uint32_t usb_epoch_{};
    bool expiry_active_{};
    std::uint32_t expiry_at_ms_{};
    LedFrame current_frame_{};
    CodexLedStatusDiagnostics diagnostics_{};
};

}  // namespace deskmate::easyinput
