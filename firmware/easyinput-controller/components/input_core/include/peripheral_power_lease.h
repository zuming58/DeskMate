#pragma once

#include <cstdint>

namespace deskmate::easyinput {

enum class PeripheralPowerOwner : uint8_t {
    Led = 0,
    KeyboardMic,
    Speaker,
    DeviceAwake,
};

// Pure ownership model for the GPIO8 rail shared by LEDs and future audio.
// Physical GPIO writes remain the sole responsibility of
// PeripheralPowerController.
class PeripheralPowerLeaseSet {
public:
    bool acquire(PeripheralPowerOwner owner);
    bool release(PeripheralPowerOwner owner);
    void clear();

    bool held(PeripheralPowerOwner owner) const;
    bool power_required() const;
    uint8_t held_mask() const;

private:
    uint8_t held_mask_{0};
};

}  // namespace deskmate::easyinput
