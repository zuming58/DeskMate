#include "input_core.h"

namespace deskmate::easyinput {

namespace {
constexpr int8_t kEncoderTransitions[16] = {
    0, 1, -1, 0,
    -1, 0, 0, 1,
    1, 0, 0, -1,
    0, -1, 1, 0,
};
}

InputCore::InputCore() { reset(); }

void InputCore::reset() {
    for (auto& state : debounce_) state = {false, false, false, 0};
    encoder_initialized_ = false;
    encoder_phase_ = 0;
    encoder_accumulator_ = 0;
    event_head_ = 0;
    event_tail_ = 0;
    event_count_ = 0;
    event_drops_ = 0;
}

void InputCore::emit(InputEventType type, uint8_t index, int8_t value) {
    if (event_count_ == events_.size()) {
        if (event_drops_ != UINT32_MAX) ++event_drops_;
        return;
    }
    events_[event_head_] = {type, index, value};
    event_head_ = static_cast<uint8_t>((event_head_ + 1u) % events_.size());
    ++event_count_;
}

void InputCore::scan_debounced(uint8_t index, bool active, uint32_t now_ms) {
    auto& state = debounce_[index];
    if (!state.initialized) {
        state = {true, active, active, now_ms};
        return;
    }
    if (active != state.candidate) {
        state.candidate = active;
        state.changed_at = now_ms;
    } else if (active != state.stable && now_ms - state.changed_at >= kDebounceMs) {
        state.stable = active;
        emit(active ? InputEventType::KeyPressed : InputEventType::KeyReleased, index);
    }
}

void InputCore::scan_keys(uint8_t raw_key_mask, uint32_t now_ms) {
    for (uint8_t i = 0; i < 8; ++i) {
        const bool active = (raw_key_mask & (1u << i)) != 0;
        scan_debounced(i, active, now_ms);
    }
}

void InputCore::scan_encoder_phase(uint8_t raw_phase, uint32_t now_ms) {
    (void)now_ms;
    raw_phase &= 0x03u;
    if (!encoder_initialized_) {
        encoder_initialized_ = true;
        encoder_phase_ = raw_phase;
    }
    const bool illegal_jump = raw_phase != encoder_phase_ &&
                              ((encoder_phase_ ^ raw_phase) == 0x03u);
    const int8_t delta = kEncoderTransitions[(encoder_phase_ << 2u) | raw_phase];
    if (illegal_jump) {
        encoder_accumulator_ = 0;
    } else if (raw_phase != encoder_phase_) {
        encoder_accumulator_ = static_cast<int8_t>(encoder_accumulator_ + delta);
        if (encoder_accumulator_ >= 4) {
            emit(InputEventType::EncoderStep, 0, 1);
            encoder_accumulator_ = 0;
        } else if (encoder_accumulator_ <= -4) {
            emit(InputEventType::EncoderStep, 0, -1);
            encoder_accumulator_ = 0;
        }
    }
    encoder_phase_ = raw_phase;
}

void InputCore::scan_encoder_press(bool raw_press_active, uint32_t now_ms) {
    auto& press = debounce_[8];
    if (!press.initialized) {
        press = {true, raw_press_active, raw_press_active, now_ms};
    } else if (raw_press_active != press.candidate) {
        press.candidate = raw_press_active;
        press.changed_at = now_ms;
    } else if (raw_press_active != press.stable && now_ms - press.changed_at >= kDebounceMs) {
        press.stable = raw_press_active;
        emit(raw_press_active ? InputEventType::EncoderPressed : InputEventType::EncoderReleased, 0);
    }
}

void InputCore::resync_encoder(uint8_t raw_phase) {
    encoder_initialized_ = true;
    encoder_phase_ = static_cast<uint8_t>(raw_phase & 0x03u);
    encoder_accumulator_ = 0;
}

bool InputCore::pop_event(InputEvent& event) {
    if (event_count_ == 0) return false;
    event = events_[event_tail_];
    event_tail_ = static_cast<uint8_t>((event_tail_ + 1u) % events_.size());
    --event_count_;
    return true;
}

uint32_t InputCore::take_event_drops() {
    const uint32_t drops = event_drops_;
    event_drops_ = 0;
    return drops;
}

}  // namespace deskmate::easyinput
