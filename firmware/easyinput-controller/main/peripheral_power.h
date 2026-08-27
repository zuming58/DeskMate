#pragma once

#include "esp_err.h"

namespace deskmate::easyinput {

// Sole physical owner of the GPIO8 rail shared by LEDs and future audio.
// T04 keeps the rail enabled for the complete Awake lifetime.
class PeripheralPowerController {
public:
    esp_err_t begin_awake();
    bool ready() const { return ready_; }

private:
    esp_err_t configure_safe_command_pins();
    esp_err_t write_enable_latch(bool enabled);

    bool ready_{false};
};

}  // namespace deskmate::easyinput
