#include "hid_report.h"

namespace deskmate::easyinput {

BootKeyboardReport encode_boot_keyboard(const HidAction& action) {
    BootKeyboardReport report{};
    report[0] = action.modifiers;
    if (action.pressed && action.usage != HidUsage::None) report[2] = static_cast<uint8_t>(action.usage);
    return report;
}

}  // namespace deskmate::easyinput
