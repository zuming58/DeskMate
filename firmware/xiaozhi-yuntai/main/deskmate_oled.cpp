#include "deskmate_oled.h"

#include "driver/i2c_master.h"
#include "esp_err.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>

namespace deskmate::xiaozhi {
namespace {

constexpr int kDisplayWidth = 128;
constexpr int kDisplayHeight = 64;
constexpr gpio_num_t kDisplaySda = GPIO_NUM_41;
constexpr gpio_num_t kDisplayScl = GPIO_NUM_42;
constexpr std::uint8_t kDisplayAddress = 0x3c;
constexpr std::uint32_t kDisplayClockHz = 400000;
constexpr std::uint32_t kDisplayTaskStackBytes = 4096;
constexpr UBaseType_t kDisplayTaskPriority = 6;

class EspIdfOledRenderer final : public DisplayRenderer {
public:
    bool Initialize() noexcept override {
        i2c_master_bus_config_t bus_config{};
        bus_config.clk_source = I2C_CLK_SRC_DEFAULT;
        bus_config.i2c_port = I2C_NUM_0;
        bus_config.sda_io_num = kDisplaySda;
        bus_config.scl_io_num = kDisplayScl;
        bus_config.glitch_ignore_cnt = 7;
        bus_config.flags.enable_internal_pullup = true;
        if (i2c_new_master_bus(&bus_config, &bus_) != ESP_OK) {
            Cleanup();
            return false;
        }

        esp_lcd_panel_io_i2c_config_t io_config{};
        io_config.dev_addr = kDisplayAddress;
        io_config.scl_speed_hz = kDisplayClockHz;
        io_config.control_phase_bytes = 1;
        io_config.dc_bit_offset = 6;
        io_config.lcd_cmd_bits = 8;
        io_config.lcd_param_bits = 8;
        if (esp_lcd_new_panel_io_i2c_v2(bus_, &io_config, &io_) != ESP_OK) {
            Cleanup();
            return false;
        }

        esp_lcd_panel_ssd1306_config_t ssd1306_config{};
        ssd1306_config.height = kDisplayHeight;
        esp_lcd_panel_dev_config_t panel_config{};
        panel_config.reset_gpio_num = -1;
        panel_config.bits_per_pixel = 1;
        panel_config.vendor_config = &ssd1306_config;
        if (esp_lcd_new_panel_ssd1306(io_, &panel_config, &panel_) != ESP_OK ||
            esp_lcd_panel_reset(panel_) != ESP_OK ||
            esp_lcd_panel_init(panel_) != ESP_OK ||
            esp_lcd_panel_mirror(panel_, true, true) != ESP_OK ||
            esp_lcd_panel_invert_color(panel_, false) != ESP_OK ||
            esp_lcd_panel_disp_on_off(panel_, true) != ESP_OK) {
            Cleanup();
            return false;
        }
        initialized_ = true;
        return true;
    }

    bool Supports(AgentScene) const noexcept override { return true; }

    bool Render(AgentScene scene) noexcept override {
        if (!initialized_ || panel_ == nullptr) {
            return false;
        }
        std::fill(frame_.begin(), frame_.end(), 0);
        DrawScene(scene);
        return esp_lcd_panel_draw_bitmap(panel_, 0, 0, kDisplayWidth,
                                         kDisplayHeight,
                                         frame_.data()) == ESP_OK;
    }

private:
    static constexpr std::size_t kFrameBytes =
        kDisplayWidth * kDisplayHeight / 8;

    void Cleanup() noexcept {
        initialized_ = false;
        if (panel_ != nullptr) {
            esp_lcd_panel_del(panel_);
            panel_ = nullptr;
        }
        if (io_ != nullptr) {
            esp_lcd_panel_io_del(io_);
            io_ = nullptr;
        }
        if (bus_ != nullptr) {
            i2c_del_master_bus(bus_);
            bus_ = nullptr;
        }
    }

    void Pixel(int x, int y, bool on = true) noexcept {
        if (x < 0 || x >= kDisplayWidth || y < 0 || y >= kDisplayHeight) {
            return;
        }
        auto& value = frame_[static_cast<std::size_t>(x) +
                             static_cast<std::size_t>(kDisplayWidth) *
                                 static_cast<std::size_t>(y / 8)];
        const auto mask = static_cast<std::uint8_t>(1u << (y % 8));
        value = on ? static_cast<std::uint8_t>(value | mask)
                   : static_cast<std::uint8_t>(value & ~mask);
    }

    void FillRect(int x, int y, int width, int height,
                  bool on = true) noexcept {
        for (int py = y; py < y + height; ++py) {
            for (int px = x; px < x + width; ++px) {
                Pixel(px, py, on);
            }
        }
    }

    void FillRoundedRect(int x, int y, int width, int height,
                         int radius) noexcept {
        const int right = x + width - 1;
        const int bottom = y + height - 1;
        for (int py = y; py <= bottom; ++py) {
            for (int px = x; px <= right; ++px) {
                const int corner_x = px < x + radius
                                         ? x + radius
                                         : (px > right - radius
                                                ? right - radius
                                                : px);
                const int corner_y = py < y + radius
                                         ? y + radius
                                         : (py > bottom - radius
                                                ? bottom - radius
                                                : py);
                const int dx = px - corner_x;
                const int dy = py - corner_y;
                if (dx * dx + dy * dy <= radius * radius) {
                    Pixel(px, py);
                }
            }
        }
    }

    void Line(int x0, int y0, int x1, int y1, int thickness = 1) noexcept {
        const int dx = std::abs(x1 - x0);
        const int sx = x0 < x1 ? 1 : -1;
        const int dy = -std::abs(y1 - y0);
        const int sy = y0 < y1 ? 1 : -1;
        int error = dx + dy;
        for (;;) {
            const int half = thickness / 2;
            FillRect(x0 - half, y0 - half, thickness, thickness);
            if (x0 == x1 && y0 == y1) {
                break;
            }
            const int doubled = 2 * error;
            if (doubled >= dy) {
                error += dy;
                x0 += sx;
            }
            if (doubled <= dx) {
                error += dx;
                y0 += sy;
            }
        }
    }

    void HappyEye(int center_x) noexcept {
        for (int dx = -17; dx <= 17; ++dx) {
            const int y = 20 + (dx * dx * 13) / (17 * 17);
            FillRect(center_x + dx - 1, y, 3, 4);
        }
    }

    void FocusedEye(int x, bool left) noexcept {
        for (int px = 0; px < 38; ++px) {
            const int top = left ? 18 + (px * 7) / 37
                                 : 25 - (px * 7) / 37;
            for (int py = top; py < 49; ++py) {
                Pixel(x + px, py);
            }
        }
    }

    void WaitingIndicator() noexcept {
        FillRoundedRect(51, 56, 6, 5, 2);
        FillRoundedRect(61, 56, 6, 5, 2);
        FillRoundedRect(71, 56, 6, 5, 2);
    }

    void DrawScene(AgentScene scene) noexcept {
        switch (scene) {
            case AgentScene::kNeutral:
                FillRoundedRect(18, 13, 40, 40, 9);
                FillRoundedRect(70, 13, 40, 40, 9);
                break;
            case AgentScene::kNeutralBlink:
                FillRoundedRect(18, 29, 40, 6, 3);
                FillRoundedRect(70, 29, 40, 6, 3);
                break;
            case AgentScene::kListening:
                FillRoundedRect(23, 9, 28, 46, 8);
                FillRoundedRect(77, 9, 28, 46, 8);
                break;
            case AgentScene::kThinking:
                FillRoundedRect(18, 15, 38, 38, 9);
                FillRoundedRect(79, 12, 24, 24, 7);
                break;
            case AgentScene::kFocused:
                FocusedEye(18, true);
                FocusedEye(72, false);
                break;
            case AgentScene::kAttention:
                FillRoundedRect(22, 7, 32, 43, 9);
                FillRoundedRect(74, 7, 32, 43, 9);
                WaitingIndicator();
                break;
            case AgentScene::kHappy:
                HappyEye(38);
                HappyEye(90);
                break;
            case AgentScene::kSadError:
                Line(19, 22, 55, 32, 5);
                Line(73, 32, 109, 22, 5);
                FillRoundedRect(27, 31, 25, 15, 6);
                FillRoundedRect(76, 31, 25, 15, 6);
                break;
            case AgentScene::kAngry:
                Line(19, 31, 55, 19, 6);
                Line(73, 19, 109, 31, 6);
                FillRoundedRect(26, 29, 27, 17, 5);
                FillRoundedRect(75, 29, 27, 17, 5);
                break;
        }
    }

    i2c_master_bus_handle_t bus_{};
    esp_lcd_panel_io_handle_t io_{};
    esp_lcd_panel_handle_t panel_{};
    std::array<std::uint8_t, kFrameBytes> frame_{};
    bool initialized_{};
};

EspIdfOledRenderer g_renderer;
DisplayOwner g_display_owner(g_renderer);
TaskHandle_t g_display_task_handle{};

void DisplayTask(void*) {
    for (;;) {
        const auto now_ms =
            static_cast<std::uint32_t>(esp_timer_get_time() / 1000);
        if (!g_display_owner.Service(now_ms)) {
            vTaskDelay(pdMS_TO_TICKS(5));
        } else {
            vTaskDelay(1);
        }
    }
}

}  // namespace

DisplayOwner& GetDeskMateDisplayOwner() noexcept { return g_display_owner; }

DisplayStartResult InitializeDeskMateDisplayOwner() noexcept {
    if (!g_display_owner.Initialize()) {
        return DisplayStartResult::kInitializationFailed;
    }
    return DisplayStartResult::kStarted;
}

DisplayStartResult StartDeskMateDisplayOwnerTask() noexcept {
    if (!g_display_owner.snapshot().enabled) {
        return DisplayStartResult::kInitializationFailed;
    }
    if (g_display_task_handle != nullptr) {
        return DisplayStartResult::kStarted;
    }
    if (xTaskCreate(DisplayTask, "display_owner", kDisplayTaskStackBytes,
                    nullptr, kDisplayTaskPriority,
                    &g_display_task_handle) != pdPASS) {
        g_display_owner.Disable();
        return DisplayStartResult::kTaskFailed;
    }
    return DisplayStartResult::kStarted;
}

}  // namespace deskmate::xiaozhi
