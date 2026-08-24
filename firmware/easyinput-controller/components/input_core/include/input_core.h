#pragma once

#include <array>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr uint32_t kDebounceMs = 20;

constexpr uint32_t monotonic_milliseconds(uint64_t microseconds) {
    return static_cast<uint32_t>(microseconds / 1000u);
}

enum class InputEventType : uint8_t {
    KeyPressed,
    KeyReleased,
    EncoderStep,
    EncoderPressed,
    EncoderReleased,
};

struct InputEvent {
    InputEventType type;
    uint8_t index;
    int8_t value;
};

class InputCore {
public:
    InputCore();

    // raw_key_mask uses one bit per key, where 1 means the low-active switch is closed.
    void scan_keys(uint8_t raw_key_mask, uint32_t now_ms);
    // raw_phase is (A << 1) | B. Invalid two-bit jumps are discarded.
    void scan_encoder(uint8_t raw_phase, bool raw_press_active, uint32_t now_ms);

    bool pop_event(InputEvent& event);
    void reset();

private:
    struct DebounceState {
        bool initialized;
        bool candidate;
        bool stable;
        uint32_t changed_at;
    };

    std::array<DebounceState, 9> debounce_{};
    bool encoder_initialized_;
    uint8_t encoder_phase_;
    int8_t encoder_accumulator_;
    std::array<InputEvent, 32> events_{};
    uint8_t event_head_;
    uint8_t event_tail_;

    void emit(InputEventType type, uint8_t index, int8_t value = 0);
    void scan_debounced(uint8_t index, bool active, uint32_t now_ms);
};

}  // namespace deskmate::easyinput
