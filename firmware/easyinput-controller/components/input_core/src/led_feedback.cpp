#include "led_feedback.h"

#include <algorithm>
#include <limits>

namespace deskmate::easyinput {
namespace {
constexpr std::array<Rgb, 8> kKeyColors{{
    {28, 0, 0}, {28, 10, 0}, {26, 20, 0}, {0, 28, 0},
    {0, 22, 22}, {0, 0, 28}, {18, 0, 28}, {22, 22, 22},
}};

Rgb scale(Rgb color, uint8_t numerator, uint8_t denominator) {
    return {
        static_cast<uint8_t>((static_cast<unsigned>(color.red) * numerator) / denominator),
        static_cast<uint8_t>((static_cast<unsigned>(color.green) * numerator) / denominator),
        static_cast<uint8_t>((static_cast<unsigned>(color.blue) * numerator) / denominator),
    };
}

void set_scaled(LedFrame& frame, size_t index, Rgb color, uint8_t numerator, uint8_t denominator) {
    if (index < frame.size()) frame[index] = scale(color, numerator, denominator);
}

void saturating_increment(std::atomic<uint32_t>& value) {
    uint32_t current = value.load(std::memory_order_relaxed);
    while (current != UINT32_MAX &&
           !value.compare_exchange_weak(current, current + 1, std::memory_order_relaxed)) {}
}
}  // namespace

LedFeedbackEvent feedback_for_input_event(const InputEvent& event) {
    if (event.type == InputEventType::KeyPressed && event.index < kKeyColors.size()) {
        return {true, LedEffectKind::Ripple, LedDirection::None,
                kKeyColors[event.index], 140, 35};
    }
    if (event.type == InputEventType::EncoderStep && event.value != 0) {
        const bool right = event.value > 0;
        return {true, LedEffectKind::DirectionalFlow,
                right ? LedDirection::Right : LedDirection::Left,
                right ? Rgb{0, 22, 22} : Rgb{0, 0, 28}, 160, 40};
    }
    if (event.type == InputEventType::EncoderPressed) {
        return {true, LedEffectKind::ConfirmPulse, LedDirection::None,
                {22, 18, 10}, 300, 60};
    }
    return {};
}

LedGrbBytes serialize_led_frame_grb(const LedFrame& frame) {
    LedGrbBytes bytes{};
    for (size_t index = 0; index < frame.size(); ++index) {
        bytes[index * 3] = frame[index].green;
        bytes[index * 3 + 1] = frame[index].red;
        bytes[index * 3 + 2] = frame[index].blue;
    }
    return bytes;
}

void LedFeedbackDiagnostics::record_feedback_drop() { saturating_increment(feedback_dropped_); }
void LedFeedbackDiagnostics::record_init_failure() { saturating_increment(init_failures_); }
void LedFeedbackDiagnostics::record_tx_failure() { saturating_increment(tx_failures_); }

LedFeedbackDiagnosticsSnapshot LedFeedbackDiagnostics::snapshot() const {
    return {feedback_dropped_.load(std::memory_order_relaxed),
            init_failures_.load(std::memory_order_relaxed),
            tx_failures_.load(std::memory_order_relaxed)};
}

bool LedFeedbackMailbox::publish(const LedFeedbackEvent& event,
                                 LedFeedbackDiagnostics& diagnostics) {
    if (!event.active) return false;
    if (lock_.test_and_set(std::memory_order_acquire)) {
        diagnostics.record_feedback_drop();
        return false;
    }
    if (pending_.load(std::memory_order_relaxed)) diagnostics.record_feedback_drop();
    event_ = event;
    pending_.store(true, std::memory_order_release);
    lock_.clear(std::memory_order_release);
    return true;
}

bool LedFeedbackMailbox::consume(LedFeedbackEvent& event) {
    if (!pending_.load(std::memory_order_acquire)) return false;
    if (lock_.test_and_set(std::memory_order_acquire)) return false;
    if (!pending_.load(std::memory_order_relaxed)) {
        lock_.clear(std::memory_order_release);
        return false;
    }
    event = event_;
    pending_.store(false, std::memory_order_release);
    lock_.clear(std::memory_order_release);
    return true;
}

void LedFeedbackAnimator::start(const LedFeedbackEvent& event, uint32_t now_ms) {
    event_ = event;
    started_at_ms_ = now_ms;
    rendered_frame_ = UINT32_MAX;
    active_ = event.active && event.frame_interval_ms != 0 && event.duration_ms != 0;
    black_sent_ = false;
}

bool LedFeedbackAnimator::update(uint32_t now_ms, LedFrame& frame) {
    if (!active_) {
        if (black_sent_) return false;
        frame = {};
        black_sent_ = true;
        return true;
    }
    const uint32_t elapsed = now_ms - started_at_ms_;
    if (elapsed >= event_.duration_ms) {
        active_ = false;
        frame = {};
        black_sent_ = true;
        return true;
    }
    const uint32_t frame_index = elapsed / event_.frame_interval_ms;
    if (frame_index == rendered_frame_) return false;
    rendered_frame_ = frame_index;
    frame = render(frame_index);
    return true;
}

LedFrame LedFeedbackAnimator::render(uint32_t frame_index) const {
    LedFrame frame{};
    if (event_.effect == LedEffectKind::Ripple) {
        switch (frame_index % 4u) {
            case 0: set_scaled(frame, 1, event_.color, 1, 5); set_scaled(frame, 2, event_.color, 1, 1); set_scaled(frame, 3, event_.color, 1, 5); break;
            case 1: set_scaled(frame, 0, event_.color, 1, 4); set_scaled(frame, 1, event_.color, 1, 1); set_scaled(frame, 2, event_.color, 1, 2); set_scaled(frame, 3, event_.color, 1, 1); set_scaled(frame, 4, event_.color, 1, 4); break;
            case 2: set_scaled(frame, 0, event_.color, 1, 1); set_scaled(frame, 1, event_.color, 1, 4); set_scaled(frame, 3, event_.color, 1, 4); set_scaled(frame, 4, event_.color, 1, 1); break;
            default: set_scaled(frame, 0, event_.color, 1, 4); set_scaled(frame, 1, event_.color, 1, 6); set_scaled(frame, 2, event_.color, 1, 8); set_scaled(frame, 3, event_.color, 1, 6); set_scaled(frame, 4, event_.color, 1, 4); break;
        }
    } else if (event_.effect == LedEffectKind::DirectionalFlow) {
        constexpr std::array<uint8_t, kLedPixelCount> numerators{{12, 7, 4, 2, 1}};
        const uint8_t count = static_cast<uint8_t>(frame.size());
        const uint8_t offset = static_cast<uint8_t>(frame_index % count);
        const bool right = event_.direction == LedDirection::Right;
        const uint8_t head = right ? offset : static_cast<uint8_t>((count - 1u) - offset);
        for (uint8_t index = 0; index < count; ++index) {
            const uint8_t distance = right
                ? static_cast<uint8_t>((head + count - index) % count)
                : static_cast<uint8_t>((index + count - head) % count);
            frame[index] = scale(event_.color, numerators[distance], 12);
        }
    } else if (event_.effect == LedEffectKind::ConfirmPulse) {
        constexpr std::array<uint8_t, 5> numerators{{5, 12, 7, 3, 1}};
        const uint8_t numerator = numerators[frame_index % numerators.size()];
        for (size_t index = 0; index < frame.size(); ++index) {
            frame[index] = scale(event_.color,
                index == frame.size() / 2 ? numerator
                                          : static_cast<uint8_t>((numerator * 2) / 3),
                12);
        }
    }
    return frame;
}

}  // namespace deskmate::easyinput
