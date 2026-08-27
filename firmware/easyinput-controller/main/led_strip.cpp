#include "led_strip.h"

#include "board_pins.h"

#include "freertos/FreeRTOS.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {
namespace {
constexpr uint32_t kRmtResolutionHz = 20'000'000;
constexpr uint16_t kT0HighTicks = 6;
constexpr uint16_t kT0LowTicks = 18;
constexpr uint16_t kT1HighTicks = 16;
constexpr uint16_t kT1LowTicks = 12;
constexpr uint16_t kResetTicks = 6000;
constexpr size_t kWs2812SymbolCount = kLedPixelCount * 24u + 1u;
constexpr int kRmtCompletionWaitMs = 2 * portTICK_PERIOD_MS;

void encode_byte(uint8_t value, rmt_symbol_word_t* symbols) {
    for (uint8_t bit = 0; bit < 8; ++bit) {
        const bool one = (value & (1u << (7u - bit))) != 0;
        symbols[bit].level0 = 1;
        symbols[bit].duration0 = one ? kT1HighTicks : kT0HighTicks;
        symbols[bit].level1 = 0;
        symbols[bit].duration1 = one ? kT1LowTicks : kT0LowTicks;
    }
}
}  // namespace

esp_err_t LedStrip::begin() {
    rmt_tx_channel_config_t channel_config{};
    channel_config.gpio_num = static_cast<gpio_num_t>(kLedDataGpio);
    channel_config.clk_src = RMT_CLK_SRC_DEFAULT;
    channel_config.resolution_hz = kRmtResolutionHz;
    channel_config.mem_block_symbols = 64;
    channel_config.trans_queue_depth = 1;
    channel_config.flags.invert_out = false;
    channel_config.flags.with_dma = false;
    esp_err_t error = rmt_new_tx_channel(&channel_config, &channel_);
    if (error != ESP_OK) return error;

    rmt_copy_encoder_config_t encoder_config{};
    error = rmt_new_copy_encoder(&encoder_config, &encoder_);
    return error;
}

esp_err_t LedStrip::transmit(const LedFrame& frame) {
    if (!ready()) return ESP_ERR_INVALID_STATE;

    const LedGrbBytes bytes = serialize_led_frame_grb(frame);
    std::array<rmt_symbol_word_t, kWs2812SymbolCount> symbols{};
    for (size_t index = 0; index < bytes.size(); ++index) {
        encode_byte(bytes[index], &symbols[index * 8u]);
    }
    auto& reset = symbols.back();
    reset.level0 = 0;
    reset.duration0 = kResetTicks;
    reset.level1 = 0;
    reset.duration1 = kResetTicks;

    esp_err_t error = rmt_enable(channel_);
    if (error != ESP_OK) return error;

    rmt_transmit_config_t transmit_config{};
    transmit_config.loop_count = 0;
    error = rmt_transmit(channel_, encoder_, symbols.data(),
                         symbols.size() * sizeof(symbols[0]),
                         &transmit_config);
    if (error == ESP_OK) {
        error = rmt_tx_wait_all_done(channel_, kRmtCompletionWaitMs);
    }
    const esp_err_t disable_error = rmt_disable(channel_);
    return error != ESP_OK ? error : disable_error;
}

}  // namespace deskmate::easyinput
