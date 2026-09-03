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
        (published_status_.enabled_capabilities &
         kLinkT09RequiredCapabilities) == kLinkT09RequiredCapabilities &&
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

bool DeskMateLinkUart::queue_manual_calibration(
    const ManualCalibrationLinkRequest& request) {
    portENTER_CRITICAL(&status_mux_);
    const bool accepted =
        published_status_.state == LinkControllerState::Connected &&
        !manual_calibration_active_ &&
        !manual_calibration_result_pending_ && !motion_preset_active_ &&
        !motion_preset_result_pending_ && !choreography_active_ &&
        !choreography_result_pending_ && request.host_request_id != 0 &&
        (request.message_type == static_cast<std::uint8_t>(
                                     LinkMessageType::
                                         ManualCalibrationCommand) ||
         request.message_type == static_cast<std::uint8_t>(
                                     LinkMessageType::
                                         GetManualCalibrationStatus));
    if (accepted) {
        queued_manual_calibration_ = request;
        manual_calibration_command_pending_ = true;
        manual_calibration_active_ = true;
    }
    portEXIT_CRITICAL(&status_mux_);
    return accepted;
}

bool DeskMateLinkUart::queue_motion_preset(
    const MotionPresetLinkRequest& request) {
    portENTER_CRITICAL(&status_mux_);
    const bool accepted =
        published_status_.state == LinkControllerState::Connected &&
        !motion_preset_active_ && !motion_preset_result_pending_ &&
        !manual_calibration_active_ &&
        !manual_calibration_result_pending_ && !choreography_active_ &&
        !choreography_result_pending_ && request.host_request_id != 0 &&
        (request.message_type == static_cast<std::uint8_t>(
                                     LinkMessageType::MotionPresetCommand) ||
         request.message_type == static_cast<std::uint8_t>(
                                     LinkMessageType::GetMotionPresetStatus));
    if (accepted) {
        queued_motion_preset_ = request;
        motion_preset_command_pending_ = true;
        motion_preset_active_ = true;
    }
    portEXIT_CRITICAL(&status_mux_);
    return accepted;
}

bool DeskMateLinkUart::take_manual_calibration_result(
    ManualCalibrationLinkResult& result) {
    portENTER_CRITICAL(&status_mux_);
    const bool ready = manual_calibration_result_pending_;
    if (ready) {
        result = manual_calibration_result_;
        manual_calibration_result_ = {};
        manual_calibration_result_pending_ = false;
        manual_calibration_active_ = false;
    }
    portEXIT_CRITICAL(&status_mux_);
    return ready;
}

bool DeskMateLinkUart::queue_choreography(
    const ChoreographyLinkRequest& request) {
    portENTER_CRITICAL(&status_mux_);
    const bool accepted =
        published_status_.state == LinkControllerState::Connected &&
        !choreography_active_ && !choreography_result_pending_ &&
        !manual_calibration_active_ &&
        !manual_calibration_result_pending_ && !motion_preset_active_ &&
        !motion_preset_result_pending_ && request.host_request_id != 0 &&
        (request.message_type == static_cast<std::uint8_t>(
                                     LinkMessageType::RunChoreography) ||
         request.message_type == static_cast<std::uint8_t>(
                                     LinkMessageType::
                                         GetChoreographyStatus) ||
         request.message_type == static_cast<std::uint8_t>(
                                     LinkMessageType::RunChoreographyV2) ||
         request.message_type == static_cast<std::uint8_t>(
                                     LinkMessageType::
                                         GetChoreographyStatusV2));
    if (accepted) {
        queued_choreography_ = request;
        choreography_command_pending_ = true;
        choreography_active_ = true;
    }
    portEXIT_CRITICAL(&status_mux_);
    return accepted;
}

bool DeskMateLinkUart::take_motion_preset_result(
    MotionPresetLinkResult& result) {
    portENTER_CRITICAL(&status_mux_);
    const bool ready = motion_preset_result_pending_;
    if (ready) {
        result = motion_preset_result_;
        motion_preset_result_ = {};
        motion_preset_result_pending_ = false;
        motion_preset_active_ = false;
    }
    portEXIT_CRITICAL(&status_mux_);
    return ready;
}

bool DeskMateLinkUart::take_choreography_result(
    ChoreographyLinkResult& result) {
    portENTER_CRITICAL(&status_mux_);
    const bool ready = choreography_result_pending_;
    if (ready) {
        result = choreography_result_;
        choreography_result_ = {};
        choreography_result_pending_ = false;
        choreography_active_ = false;
    }
    portEXIT_CRITICAL(&status_mux_);
    return ready;
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

        ManualCalibrationLinkRequest manual_request{};
        bool manual_request_ready = false;
        portENTER_CRITICAL(&status_mux_);
        if (manual_calibration_command_pending_) {
            manual_request = queued_manual_calibration_;
            queued_manual_calibration_ = {};
            manual_calibration_command_pending_ = false;
            manual_request_ready = true;
        }
        portEXIT_CRITICAL(&status_mux_);
        if (manual_request_ready &&
            !controller_.queue_manual_calibration(manual_request)) {
            ManualCalibrationLinkResult rejected{};
            rejected.host_request_id = manual_request.host_request_id;
            rejected.controller_boot_id =
                controller_.snapshot().controller_boot_id;
            rejected.peer_boot_id = controller_.snapshot().peer_boot_id;
            rejected.message_type = manual_request.message_type;
            rejected.terminal =
                controller_.snapshot().state == LinkControllerState::Connected
                    ? ManualCalibrationLinkTerminalKind::Internal
                    : ManualCalibrationLinkTerminalKind::Disconnected;
            portENTER_CRITICAL(&status_mux_);
            manual_calibration_result_ = rejected;
            manual_calibration_result_pending_ = true;
            portEXIT_CRITICAL(&status_mux_);
        }

        MotionPresetLinkRequest motion_request{};
        bool motion_request_ready = false;
        portENTER_CRITICAL(&status_mux_);
        if (motion_preset_command_pending_) {
            motion_request = queued_motion_preset_;
            queued_motion_preset_ = {};
            motion_preset_command_pending_ = false;
            motion_request_ready = true;
        }
        portEXIT_CRITICAL(&status_mux_);
        if (motion_request_ready &&
            !controller_.queue_motion_preset(motion_request)) {
            MotionPresetLinkResult rejected{};
            rejected.host_request_id = motion_request.host_request_id;
            rejected.controller_boot_id =
                controller_.snapshot().controller_boot_id;
            rejected.peer_boot_id = controller_.snapshot().peer_boot_id;
            rejected.message_type = motion_request.message_type;
            rejected.terminal =
                controller_.snapshot().state == LinkControllerState::Connected
                    ? MotionPresetLinkTerminalKind::Internal
                    : MotionPresetLinkTerminalKind::Disconnected;
            portENTER_CRITICAL(&status_mux_);
            motion_preset_result_ = rejected;
            motion_preset_result_pending_ = true;
            portEXIT_CRITICAL(&status_mux_);
        }

        ChoreographyLinkRequest choreography_request{};
        bool choreography_request_ready = false;
        portENTER_CRITICAL(&status_mux_);
        if (choreography_command_pending_) {
            choreography_request = queued_choreography_;
            queued_choreography_ = {};
            choreography_command_pending_ = false;
            choreography_request_ready = true;
        }
        portEXIT_CRITICAL(&status_mux_);
        if (choreography_request_ready &&
            !controller_.queue_choreography(choreography_request)) {
            ChoreographyLinkResult rejected{};
            rejected.host_request_id = choreography_request.host_request_id;
            rejected.controller_boot_id =
                controller_.snapshot().controller_boot_id;
            rejected.peer_boot_id = controller_.snapshot().peer_boot_id;
            rejected.message_type = choreography_request.message_type;
            rejected.terminal =
                controller_.snapshot().state == LinkControllerState::Connected
                    ? MotionPresetLinkTerminalKind::Internal
                    : MotionPresetLinkTerminalKind::Disconnected;
            portENTER_CRITICAL(&status_mux_);
            choreography_result_ = rejected;
            choreography_result_pending_ = true;
            portEXIT_CRITICAL(&status_mux_);
        }

        LinkWireFrame outgoing{};
        if (controller_.poll(now_ms, outgoing)) {
            const int written = uart_write_bytes(
                kDeskMateLinkUart, outgoing.bytes.data(), outgoing.length);
            if (written != outgoing.length) controller_.note_tx_drop();
        }
        ManualCalibrationLinkResult manual_result{};
        if (controller_.take_manual_calibration_result(manual_result)) {
            portENTER_CRITICAL(&status_mux_);
            manual_calibration_result_ = manual_result;
            manual_calibration_result_pending_ = true;
            portEXIT_CRITICAL(&status_mux_);
        }
        MotionPresetLinkResult motion_result{};
        if (controller_.take_motion_preset_result(motion_result)) {
            portENTER_CRITICAL(&status_mux_);
            motion_preset_result_ = motion_result;
            motion_preset_result_pending_ = true;
            portEXIT_CRITICAL(&status_mux_);
        }
        ChoreographyLinkResult choreography_result{};
        if (controller_.take_choreography_result(choreography_result)) {
            portENTER_CRITICAL(&status_mux_);
            choreography_result_ = choreography_result;
            choreography_result_pending_ = true;
            portEXIT_CRITICAL(&status_mux_);
        }
        publish_status();
    }
}

}  // namespace deskmate::easyinput
