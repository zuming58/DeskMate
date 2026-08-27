#pragma once

#include "peripheral_power_lease.h"

#include "esp_err.h"

namespace deskmate::easyinput {

// Sole physical owner of the GPIO8 rail shared by LEDs and future audio.
// T04 keeps the rail enabled for the complete Awake lifetime.
class PeripheralPowerController {
public:
    esp_err_t begin_awake();
    bool acquire_consumer(PeripheralPowerOwner owner);
    bool release_consumer(PeripheralPowerOwner owner);
    bool ready() const { return ready_; }
    bool held(PeripheralPowerOwner owner) const { return leases_.held(owner); }
    uint8_t held_mask() const { return leases_.held_mask(); }

private:
    esp_err_t configure_safe_command_pins();
    esp_err_t write_enable_latch(bool enabled);

    PeripheralPowerLeaseSet leases_{};
    bool ready_{false};
};

}  // namespace deskmate::easyinput
