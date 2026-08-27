#pragma once

#include "led_feedback.h"

#include "driver/rmt_tx.h"
#include "esp_err.h"

namespace deskmate::easyinput {

class LedStrip {
public:
    esp_err_t begin();
    esp_err_t transmit(const LedFrame& frame);
    bool ready() const { return channel_ != nullptr && encoder_ != nullptr; }

private:
    rmt_channel_handle_t channel_{nullptr};
    rmt_encoder_handle_t encoder_{nullptr};
};

}  // namespace deskmate::easyinput
