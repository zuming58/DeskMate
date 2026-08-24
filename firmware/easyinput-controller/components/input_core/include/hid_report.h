#pragma once

#include <array>
#include <cstdint>

namespace deskmate::easyinput {

enum class HidUsage : uint8_t {
    None = 0,
    A = 0x04,
    B = 0x05,
    C = 0x06,
    Enter = 0x28,
    Space = 0x2c,
};

struct HidAction {
    HidUsage usage;
    uint8_t modifiers;
    bool pressed;
};

using BootKeyboardReport = std::array<uint8_t, 8>;

// Neutral boundary: no GPIO or transport code is involved in this encoding.
BootKeyboardReport encode_boot_keyboard(const HidAction& action);

}  // namespace deskmate::easyinput
