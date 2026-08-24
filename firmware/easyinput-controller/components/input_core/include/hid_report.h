#pragma once

#include <array>
#include <cstdint>

namespace deskmate::easyinput {

enum class HidUsage : uint8_t {
    None = 0,
    A = 0x04,
    B = 0x05,
    C = 0x06,
    D = 0x07,
    E = 0x08,
    F = 0x09,
    G = 0x0a,
    Enter = 0x28,
    Backspace = 0x2a,
    Space = 0x2c,
    V = 0x19,
    Z = 0x1d,
};

struct HidAction {
    HidUsage usage;
    uint8_t modifiers;
    bool pressed;
};

struct KeyboardSnapshot {
    uint8_t modifier{0};
    uint8_t apple_fn{0};
    std::array<uint8_t, 6> usages{};

    bool operator==(const KeyboardSnapshot& other) const {
        return modifier == other.modifier && apple_fn == other.apple_fn && usages == other.usages;
    }
    uint8_t& operator[](std::size_t index) { return index == 0 ? modifier : index == 1 ? apple_fn : usages[index - 2]; }
    const uint8_t& operator[](std::size_t index) const { return index == 0 ? modifier : index == 1 ? apple_fn : usages[index - 2]; }
};

using BootKeyboardReport = KeyboardSnapshot;

class HeldKeyboardState {
public:
    // Returns false without changing state when a seventh usage would overflow.
    bool apply(const HidAction& action);
    void release_all();
    KeyboardSnapshot report() const;

private:
    struct HeldUsage {
        HidUsage usage{HidUsage::None};
        uint8_t modifiers{0};
    };

    std::array<HeldUsage, 6> usages_{};
    uint8_t explicit_modifiers_{0};
};

}  // namespace deskmate::easyinput
