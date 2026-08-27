#include "peripheral_power_lease.h"

namespace deskmate::easyinput {
namespace {

constexpr uint8_t owner_bit(PeripheralPowerOwner owner) {
    switch (owner) {
        case PeripheralPowerOwner::Led:
            return 1u << 0;
        case PeripheralPowerOwner::KeyboardMic:
            return 1u << 1;
        case PeripheralPowerOwner::Speaker:
            return 1u << 2;
        case PeripheralPowerOwner::DeviceAwake:
            return 1u << 3;
    }
    return 0;
}

}  // namespace

bool PeripheralPowerLeaseSet::acquire(PeripheralPowerOwner owner) {
    const uint8_t bit = owner_bit(owner);
    if (bit == 0 || (held_mask_ & bit) != 0) return false;
    held_mask_ |= bit;
    return true;
}

bool PeripheralPowerLeaseSet::release(PeripheralPowerOwner owner) {
    const uint8_t bit = owner_bit(owner);
    if (bit == 0 || (held_mask_ & bit) == 0) return false;
    held_mask_ &= static_cast<uint8_t>(~bit);
    return true;
}

void PeripheralPowerLeaseSet::clear() {
    held_mask_ = 0;
}

bool PeripheralPowerLeaseSet::held(PeripheralPowerOwner owner) const {
    const uint8_t bit = owner_bit(owner);
    return bit != 0 && (held_mask_ & bit) != 0;
}

bool PeripheralPowerLeaseSet::power_required() const {
    return held_mask_ != 0;
}

uint8_t PeripheralPowerLeaseSet::held_mask() const {
    return held_mask_;
}

}  // namespace deskmate::easyinput
