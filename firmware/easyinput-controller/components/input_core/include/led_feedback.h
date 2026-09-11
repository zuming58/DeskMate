#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>

#include "board_pins.h"
#include "input_core.h"

namespace deskmate::easyinput {

struct Rgb {
    uint8_t red{0};
    uint8_t green{0};
    uint8_t blue{0};

    constexpr bool operator==(const Rgb& other) const {
        return red == other.red && green == other.green && blue == other.blue;
    }
};

enum class LedEffectKind : uint8_t { None, Ripple, DirectionalFlow, ConfirmPulse };
enum class LedDirection : uint8_t { None, Left, Right };

struct LedFeedbackEvent {
    bool active{false};
    LedEffectKind effect{LedEffectKind::None};
    LedDirection direction{LedDirection::None};
    Rgb color{};
    uint32_t duration_ms{0};
    uint32_t frame_interval_ms{0};
};

using LedFrame = std::array<Rgb, kLedPixelCount>;
using LedGrbBytes = std::array<uint8_t, kLedPixelCount * 3>;

LedFeedbackEvent feedback_for_input_event(const InputEvent& event);
LedGrbBytes serialize_led_frame_grb(const LedFrame& frame);

struct LedFeedbackDiagnosticsSnapshot {
    uint32_t led_feedback_dropped{0};
    uint32_t led_init_failures{0};
    uint32_t led_tx_failures{0};
};

class LedFeedbackDiagnostics {
public:
    void record_feedback_drop();
    void record_init_failure();
    void record_tx_failure();
    LedFeedbackDiagnosticsSnapshot snapshot() const;

private:
    std::atomic<uint32_t> feedback_dropped_{0};
    std::atomic<uint32_t> init_failures_{0};
    std::atomic<uint32_t> tx_failures_{0};
};

// A bounded latest-event mailbox. Publication never waits: contention drops
// the new visual event, while a pending event is replaced by the latest one.
class LedFeedbackMailbox {
public:
    bool publish(const LedFeedbackEvent& event, LedFeedbackDiagnostics& diagnostics);
    bool consume(LedFeedbackEvent& event);
    bool pending() const { return pending_.load(std::memory_order_acquire); }

private:
    std::atomic_flag lock_ = ATOMIC_FLAG_INIT;
    std::atomic<bool> pending_{false};
    LedFeedbackEvent event_{};
};

// A separate latest-wins base frame. Transient key/encoder feedback may
// replace it briefly, then the animator restores this frame.
class LedStatusMailbox {
public:
    bool publish(const LedFrame& frame);
    bool consume(LedFrame& frame);
    bool pending() const { return pending_.load(std::memory_order_acquire); }

private:
    std::atomic_flag lock_ = ATOMIC_FLAG_INIT;
    std::atomic<bool> pending_{false};
    LedFrame frame_{};
};

class LedFeedbackAnimator {
public:
    void start(const LedFeedbackEvent& event, uint32_t now_ms);
    void set_resting_frame(const LedFrame& frame);
    bool update(uint32_t now_ms, LedFrame& frame);
    bool active() const { return active_; }

private:
    LedFeedbackEvent event_{};
    uint32_t started_at_ms_{0};
    uint32_t rendered_frame_{UINT32_MAX};
    bool active_{false};
    LedFrame resting_frame_{};
    bool resting_sent_{true};

    LedFrame render(uint32_t frame_index) const;
};

}  // namespace deskmate::easyinput
