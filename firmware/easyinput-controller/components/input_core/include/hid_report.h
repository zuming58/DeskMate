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
    Space = 0x2c,
};

struct HidAction {
    HidUsage usage;
    uint8_t modifiers;
    bool pressed;
};

using BootKeyboardReport = std::array<uint8_t, 8>;

class HeldKeyboardState {
public:
    // Returns false without changing state when a seventh usage would overflow.
    bool apply(const HidAction& action);
    void release_all();
    BootKeyboardReport report() const;

private:
    struct HeldUsage {
        HidUsage usage{HidUsage::None};
        uint8_t modifiers{0};
    };

    std::array<HeldUsage, 6> usages_{};
    uint8_t explicit_modifiers_{0};
};

}  // namespace deskmate::easyinput
