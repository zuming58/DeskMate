#include "board_pins.h"
#include "input_core.h"

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

using namespace deskmate::easyinput;

extern "C" void app_main(void) {
    gpio_config_t config{};
    config.pin_bit_mask = 0;
    for (int pin : kKeyGpios) config.pin_bit_mask |= (1ULL << pin);
    config.pin_bit_mask |= (1ULL << kEncoderAGpio) | (1ULL << kEncoderBGpio) |
                           (1ULL << kEncoderPressGpio);
    config.mode = GPIO_MODE_INPUT;
    config.pull_up_en = GPIO_PULLUP_ENABLE;
    config.pull_down_en = GPIO_PULLDOWN_DISABLE;
    config.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&config);

    InputCore input;
    uint32_t tick = 0;
    for (;;) {
        uint8_t keys = 0;
        for (uint8_t i = 0; i < kKeyGpios.size(); ++i)
            if (gpio_get_level(static_cast<gpio_num_t>(kKeyGpios[i])) == 0) keys |= (1u << i);
        const uint8_t phase = static_cast<uint8_t>(
            (gpio_get_level(static_cast<gpio_num_t>(kEncoderAGpio)) << 1) |
            gpio_get_level(static_cast<gpio_num_t>(kEncoderBGpio)));
        input.scan_keys(keys, tick);
        input.scan_encoder(phase, gpio_get_level(static_cast<gpio_num_t>(kEncoderPressGpio)) == 0, tick);
        InputEvent ignored{};
        while (input.pop_event(ignored)) {}
        vTaskDelay(pdMS_TO_TICKS(1));
        ++tick;
    }
}
