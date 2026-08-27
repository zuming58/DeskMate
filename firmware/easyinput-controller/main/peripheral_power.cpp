#include "peripheral_power.h"

#include "board_pins.h"

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <cstdint>

namespace deskmate::easyinput {
namespace {
constexpr uint32_t kPeripheralPowerSettleMs = 50;

TickType_t settle_ticks() {
    const uint64_t rounded_up =
        (static_cast<uint64_t>(kPeripheralPowerSettleMs) * configTICK_RATE_HZ +
         999u) / 1000u;
    // Add a complete tick because vTaskDelay(N) can block almost one tick less.
    return static_cast<TickType_t>(rounded_up + 1u);
}
}  // namespace

esp_err_t PeripheralPowerController::write_enable_latch(bool enabled) {
    // This is the only physical GPIO8 write entry in the firmware.
    return gpio_set_level(static_cast<gpio_num_t>(kPeripheralPowerGpio),
                          enabled ? 1 : 0);
}

esp_err_t PeripheralPowerController::configure_safe_command_pins() {
    uint64_t output_mask = 0;
    for (const int pin : kSharedPowerCommandGpios) {
        const esp_err_t preload =
            gpio_set_level(static_cast<gpio_num_t>(pin), 0);
        if (preload != ESP_OK) return preload;
        output_mask |= 1ULL << static_cast<unsigned>(pin);
    }

    gpio_config_t outputs{};
    outputs.pin_bit_mask = output_mask;
    outputs.mode = GPIO_MODE_OUTPUT;
    outputs.pull_up_en = GPIO_PULLUP_DISABLE;
    outputs.pull_down_en = GPIO_PULLDOWN_DISABLE;
    outputs.intr_type = GPIO_INTR_DISABLE;
    const esp_err_t output_error = gpio_config(&outputs);
    if (output_error != ESP_OK) return output_error;

    gpio_config_t floating_input{};
    floating_input.pin_bit_mask = 1ULL << kSharedPowerInputGpio;
    floating_input.mode = GPIO_MODE_DISABLE;
    floating_input.pull_up_en = GPIO_PULLUP_DISABLE;
    floating_input.pull_down_en = GPIO_PULLDOWN_DISABLE;
    floating_input.intr_type = GPIO_INTR_DISABLE;
    return gpio_config(&floating_input);
}

esp_err_t PeripheralPowerController::begin_awake() {
    if (ready_) return ESP_OK;

    // Preload the inactive latch before GPIO8 becomes an output.
    esp_err_t error = write_enable_latch(false);
    if (error != ESP_OK) return error;
    error = configure_safe_command_pins();
    if (error != ESP_OK) return error;

    gpio_config_t power{};
    power.pin_bit_mask = 1ULL << kPeripheralPowerGpio;
    power.mode = GPIO_MODE_OUTPUT;
    power.pull_up_en = GPIO_PULLUP_DISABLE;
    power.pull_down_en = GPIO_PULLDOWN_DISABLE;
    power.intr_type = GPIO_INTR_DISABLE;
    error = gpio_config(&power);
    if (error != ESP_OK) return error;

    error = gpio_sleep_sel_dis(
        static_cast<gpio_num_t>(kPeripheralPowerGpio));
    if (error != ESP_OK) return error;
    error = write_enable_latch(true);
    if (error != ESP_OK) return error;

    vTaskDelay(settle_ticks());
    ready_ = true;
    return ESP_OK;
}

}  // namespace deskmate::easyinput
