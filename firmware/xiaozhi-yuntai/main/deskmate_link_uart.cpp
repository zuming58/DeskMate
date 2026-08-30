#include "deskmate_link_uart.h"

#include "board_link_pinout.h"
#include "link_uart_owner.h"
#include "transport.h"

#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "esp_err.h"
#include "esp_timer.h"

#include <cstddef>
#include <cstdint>

namespace deskmate::xiaozhi {
namespace {

constexpr uart_port_t kDeskMateLinkUart = UART_NUM_0;
constexpr int kDeskMateLinkBaud = 115200;
constexpr int kDeskMateLinkRxBufferBytes = 512;
constexpr int kDeskMateLinkEventQueueLength = 8;
constexpr std::uint32_t kDeskMateLinkTaskStackBytes = 4096;
constexpr UBaseType_t kDeskMateLinkTaskPriority = 7;

class EspIdfUartTransport final : public Transport {
public:
    bool Open(const BoardLinkPinout& pinout) noexcept {
        if (!pinout.verified || pinout.tx_gpio < 0 || pinout.rx_gpio < 0) {
            return false;
        }

        const uart_config_t config{
            .baud_rate = kDeskMateLinkBaud,
            .data_bits = UART_DATA_8_BITS,
            .parity = UART_PARITY_DISABLE,
            .stop_bits = UART_STOP_BITS_1,
            .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
            .rx_flow_ctrl_thresh = 0,
            .source_clk = UART_SCLK_DEFAULT,
            .flags = {},
        };
        if (uart_param_config(kDeskMateLinkUart, &config) != ESP_OK ||
            uart_set_pin(kDeskMateLinkUart, pinout.tx_gpio, pinout.rx_gpio,
                         UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE) != ESP_OK ||
            uart_driver_install(kDeskMateLinkUart, kDeskMateLinkRxBufferBytes,
                                0, kDeskMateLinkEventQueueLength,
                                &event_queue_, 0) != ESP_OK) {
            event_queue_ = nullptr;
            return false;
        }
        open_ = true;
        return true;
    }

    void Close() noexcept {
        if (open_) {
            uart_driver_delete(kDeskMateLinkUart);
        }
        event_queue_ = nullptr;
        open_ = false;
    }

    bool IsOpen() const noexcept override { return open_; }

    TransportReadResult Receive(std::uint8_t* destination,
                                std::size_t capacity) override {
        if (!open_ || destination == nullptr || capacity == 0) {
            return {TransportReadStatus::kIdle, 0};
        }

        uart_event_t event{};
        if (event_queue_ != nullptr &&
            xQueueReceive(event_queue_, &event, 0) == pdTRUE) {
            if (event.type == UART_FIFO_OVF || event.type == UART_BUFFER_FULL) {
                uart_flush_input(kDeskMateLinkUart);
                xQueueReset(event_queue_);
                return {TransportReadStatus::kOverflow, 0};
            }
            if (event.type == UART_BREAK || event.type == UART_PARITY_ERR ||
                event.type == UART_FRAME_ERR) {
                return {TransportReadStatus::kError, 0};
            }
        }

        const auto read = uart_read_bytes(
            kDeskMateLinkUart, destination, static_cast<std::uint32_t>(capacity),
            0);
        if (read < 0) {
            return {TransportReadStatus::kError, 0};
        }
        if (read == 0) {
            return {TransportReadStatus::kIdle, 0};
        }
        return {TransportReadStatus::kData, static_cast<std::size_t>(read)};
    }

    std::size_t Send(const std::uint8_t* source, std::size_t size) override {
        if (!open_ || source == nullptr || size == 0) {
            return 0;
        }
        const auto written = uart_write_bytes(kDeskMateLinkUart, source, size);
        return written > 0 ? static_cast<std::size_t>(written) : 0;
    }

private:
    QueueHandle_t event_queue_{};
    bool open_{};
};

EspIdfUartTransport g_transport;
XiaozhiLinkEndpoint* g_endpoint{};

std::uint32_t MonotonicMilliseconds() noexcept {
    return static_cast<std::uint32_t>(esp_timer_get_time() / 1000);
}

void DeskMateLinkTask(void*) {
    LinkUartOwner owner(g_transport, *g_endpoint);
    for (;;) {
        owner.Service(MonotonicMilliseconds());
        vTaskDelay(1);
    }
}

}  // namespace

LinkUartStartResult StartDeskMateLinkUart(
    XiaozhiLinkEndpoint& endpoint) noexcept {
    if (!kBoardLinkPinout.verified) {
        return LinkUartStartResult::kHardwarePinoutBlocked;
    }
    if (!g_transport.Open(kBoardLinkPinout)) {
        return LinkUartStartResult::kDriverError;
    }
    g_endpoint = &endpoint;
    if (xTaskCreate(DeskMateLinkTask, "deskmate_link",
                    kDeskMateLinkTaskStackBytes, nullptr,
                    kDeskMateLinkTaskPriority, nullptr) != pdPASS) {
        g_endpoint = nullptr;
        g_transport.Close();
        return LinkUartStartResult::kTaskError;
    }
    return LinkUartStartResult::kStarted;
}

}  // namespace deskmate::xiaozhi
