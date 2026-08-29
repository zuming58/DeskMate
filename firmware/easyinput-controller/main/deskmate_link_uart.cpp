#include "deskmate_link_uart.h"

#include "board_pins.h"

#include "driver/uart.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "freertos/task.h"

#include <array>
#include <cstdint>

namespace deskmate::easyinput {
namespace {

constexpr uart_port_t kDeskMateLinkUart = UART_NUM_0;
constexpr int kDeskMateLinkBaudRate = 115200;
constexpr int kDeskMateLinkRxBufferBytes = 512;
constexpr int kDeskMateLinkTxBufferBytes = 256;

std::uint32_t now_milliseconds() {
    return static_cast<std::uint32_t>(esp_timer_get_time() / 1000ULL);
}

}  // namespace

bool DeskMateLinkUart::begin() {
    uart_config_t config{};
    config.baud_rate = kDeskMateLinkBaudRate;
    config.data_bits = UART_DATA_8_BITS;
    config.parity = UART_PARITY_DISABLE;
    config.stop_bits = UART_STOP_BITS_1;
    config.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;
    config.rx_flow_ctrl_thresh = 0;
    config.source_clk = UART_SCLK_DEFAULT;
    if (uart_param_config(kDeskMateLinkUart, &config) != ESP_OK) return false;
    if (uart_set_pin(kDeskMateLinkUart, kDeskMateLinkTxGpio,
                     kDeskMateLinkRxGpio, UART_PIN_NO_CHANGE,
                     UART_PIN_NO_CHANGE) != ESP_OK) {
        return false;
    }
    return uart_driver_install(kDeskMateLinkUart, kDeskMateLinkRxBufferBytes,
                               kDeskMateLinkTxBufferBytes, 0, nullptr, 0) ==
           ESP_OK;
}

void DeskMateLinkUart::publish_status() {
    controller_.set_parser_diagnostics(parser_.diagnostics());
    const LinkStatusSnapshot next = controller_.snapshot();
    portENTER_CRITICAL(&status_mux_);
    published_status_ = next;
    portEXIT_CRITICAL(&status_mux_);
}

LinkStatusSnapshot DeskMateLinkUart::snapshot() const {
    portENTER_CRITICAL(&status_mux_);
    const LinkStatusSnapshot copy = published_status_;
    portEXIT_CRITICAL(&status_mux_);
    return copy;
}

bool DeskMateLinkUart::queue_agent_state(LinkAgentState state,
                                         std::uint32_t transition_id) {
    portENTER_CRITICAL(&status_mux_);
    const bool accepted =
        published_status_.state == LinkControllerState::Connected &&
        !agent_state_pending_ && transition_id != 0 &&
        static_cast<std::uint8_t>(state) <=
            static_cast<std::uint8_t>(LinkAgentState::Error);
    if (accepted) {
        queued_agent_state_ = state;
        queued_transition_id_ = transition_id;
        agent_state_pending_ = true;
    }
    portEXIT_CRITICAL(&status_mux_);
    return accepted;
}

void DeskMateLinkUart::mark_task_create_failure() {
    controller_.fault();
    publish_status();
}

[[noreturn]] void DeskMateLinkUart::run() {
    if (!begin()) {
        controller_.fault();
        publish_status();
        vTaskDelete(nullptr);
        for (;;) {}
    }

    std::uint32_t boot_id = esp_random();
    if (boot_id == 0) boot_id = 1;
    controller_.start(boot_id, now_milliseconds());
    publish_status();

    std::array<std::uint8_t, 64> received{};
    for (;;) {
        const int received_bytes = uart_read_bytes(
            kDeskMateLinkUart, received.data(), received.size(),
            pdMS_TO_TICKS(10));
        std::uint32_t now_ms = now_milliseconds();
        if (received_bytes > 0) {
            for (int index = 0; index < received_bytes; ++index) {
                LinkFrame frame{};
                if (parser_.push(received[static_cast<std::size_t>(index)],
                                 now_ms, frame)) {
                    controller_.receive(frame, now_ms);
                }
            }
        }
        parser_.expire(now_ms);

        LinkAgentState queued_state = LinkAgentState::Idle;
        std::uint32_t queued_transition = 0;
        bool agent_state_ready = false;
        portENTER_CRITICAL(&status_mux_);
        if (agent_state_pending_) {
            queued_state = queued_agent_state_;
            queued_transition = queued_transition_id_;
            agent_state_pending_ = false;
            agent_state_ready = true;
        }
        portEXIT_CRITICAL(&status_mux_);
        if (agent_state_ready &&
            !controller_.queue_agent_state(queued_state, queued_transition)) {
            controller_.note_tx_drop();
        }

        LinkWireFrame outgoing{};
        if (controller_.poll(now_ms, outgoing)) {
            const int written = uart_write_bytes(
                kDeskMateLinkUart, outgoing.bytes.data(), outgoing.length);
            if (written != outgoing.length) controller_.note_tx_drop();
        }
        publish_status();
    }
}

}  // namespace deskmate::easyinput
