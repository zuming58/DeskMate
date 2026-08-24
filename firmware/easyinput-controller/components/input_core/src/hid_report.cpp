#include "hid_report.h"

namespace deskmate::easyinput {

bool HeldKeyboardState::apply(const HidAction& action) {
    if (action.usage == HidUsage::None) {
        if (action.pressed) {
            explicit_modifiers_ = static_cast<uint8_t>(explicit_modifiers_ | action.modifiers);
        } else {
            explicit_modifiers_ = static_cast<uint8_t>(explicit_modifiers_ & ~action.modifiers);
        }
        return true;
    }

    HeldUsage* empty = nullptr;
    for (auto& held : usages_) {
        if (held.usage == action.usage) {
            if (!action.pressed) held = {};
            return true;
        }
        if (held.usage == HidUsage::None && empty == nullptr) empty = &held;
    }

    if (!action.pressed) return true;
    if (empty == nullptr) return false;
    *empty = {action.usage, action.modifiers};
    return true;
}

void HeldKeyboardState::release_all() {
    usages_ = {};
    explicit_modifiers_ = 0;
}

KeyboardSnapshot HeldKeyboardState::report() const {
    KeyboardSnapshot report{};
    uint8_t usage_index = 0;
    report.modifier = explicit_modifiers_;
    for (const auto& held : usages_) {
        if (held.usage == HidUsage::None) continue;
        report.modifier = static_cast<uint8_t>(report.modifier | held.modifiers);
        report.usages[usage_index++] = static_cast<uint8_t>(held.usage);
    }
    return report;
}

}  // namespace deskmate::easyinput
