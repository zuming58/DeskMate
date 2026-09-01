#include "agent_state_core.h"
#include "audio_capture_service.h"
#include "audio_io_arbiter.h"
#include "board_pins.h"
#include "input_core.h"
#include "input_runtime.h"
#include "led_feedback.h"
#include "led_strip.h"
#include "manual_calibration_bridge_core.h"
#include "peripheral_power.h"
#include "speaker_output_service.h"
#include "config_store.h"
#include "deskmate_link_uart.h"

#include "class/hid/hid_device.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "tinyusb.h"
#include "tusb.h"

#include <array>
#include <algorithm>
#include <atomic>
#include <cstdint>

using namespace deskmate::easyinput;

namespace {
struct RawEdge {
    uint8_t phase;
    uint32_t at_ms;
};

struct ConfigFeatureCommand {
    uint8_t report_id;
    uint8_t length;
    uint32_t epoch;
    std::array<uint8_t, kConfigFeaturePayloadBytes> payload;
};
struct ConfigSaveCommand { ConfigDocument document{}; ConfigSlot active{ConfigSlot::Invalid}; uint32_t generation{0}; uint32_t epoch{0}; };
struct ConfigSaveResult { ConfigSaveStatus status{ConfigSaveStatus::WriteFailed}; ConfigDocument document{}; ConfigSlot slot{ConfigSlot::Invalid}; uint32_t generation{0}; uint32_t epoch{0}; };

StaticQueue_t raw_edge_queue_control{};
std::array<uint8_t, kRawEdgeQueueCapacity * sizeof(RawEdge)> raw_edge_queue_storage{};
QueueHandle_t raw_edge_queue = nullptr;
StaticQueue_t config_command_queue_control{};
constexpr size_t kConfigCommandQueueCapacity = 8;
std::array<uint8_t, kConfigCommandQueueCapacity * sizeof(ConfigFeatureCommand)>
    config_command_queue_storage{};
QueueHandle_t config_command_queue = nullptr;
StaticQueue_t agent_state_command_queue_control{};
std::array<uint8_t, sizeof(ConfigFeatureCommand)>
    agent_state_command_queue_storage{};
QueueHandle_t agent_state_command_queue = nullptr;
StaticQueue_t manual_calibration_command_queue_control{};
constexpr size_t kManualCalibrationCommandQueueCapacity = 4;
std::array<uint8_t, kManualCalibrationCommandQueueCapacity *
                        sizeof(ConfigFeatureCommand)>
    manual_calibration_command_queue_storage{};
QueueHandle_t manual_calibration_command_queue = nullptr;
QueueHandle_t config_save_queue = nullptr;
QueueHandle_t config_result_queue = nullptr;
StaticQueue_t config_save_queue_control{}, config_result_queue_control{};
std::array<uint8_t, sizeof(ConfigSaveCommand) * 2> config_save_queue_storage{};
std::array<uint8_t, sizeof(ConfigSaveResult) * 2> config_result_queue_storage{};
TaskHandle_t owner_task = nullptr;
TaskHandle_t led_task_handle = nullptr;
TaskHandle_t deskmate_link_task_handle = nullptr;
std::atomic<uint32_t> raw_edge_drops{0};
UsbLifecycleEventQueue lifecycle_events;
UsbCallbackLifecycleState callback_lifecycle;
UsbInputRuntime runtime;
UsbPhysicalPresenceMonitor usb_physical_presence{kUsbDisconnectConfirmMs};
UsbDeviceConnectionGate usb_device_connection;
std::atomic<bool> tinyusb_driver_ready{false};
LedFeedbackMailbox led_feedback_mailbox;
LedFeedbackDiagnostics led_feedback_diagnostics;
PeripheralPowerController peripheral_power;
AudioIoArbiter audio_io_arbiter;
ConfigNvsStore config_store;
ConfigDocument active_config{};
ConfigSlot active_config_slot{ConfigSlot::Invalid};
uint32_t active_config_generation{0};
ConfigSaveCommand config_owner_command{};
ConfigSaveResult config_owner_result{};
ConfigSaveResult input_owner_save_result{};
ConfigFeatureCommand input_owner_config_command{};
ConfigSaveCommand input_owner_save_command{};
ConfigWriteAssembler config_write_assembler;
ConfigReadStream config_read_stream;
ConfigStatusStream config_status_stream;
DeskMateLinkUart deskmate_link_uart;
AgentStateBridge agent_state_bridge;
ManualCalibrationBridge manual_calibration_bridge;
AudioCaptureService audio_capture_service;
SpeakerOutputService speaker_output_service;
bool config_save_in_flight = false;
std::array<uint8_t, kConfigFeaturePayloadBytes> config_response_payload{};
ConfigTransferState config_transfer;
bool config_ack_pending = false;
std::array<uint8_t, kConfigFeaturePayloadBytes> config_ack_payload{};
std::array<uint8_t, kManualCalibrationHostPayloadBytes>
    manual_calibration_response_payload{};
void reset_config_save_result(ConfigSaveResult& result) {
    result.status = ConfigSaveStatus::WriteFailed;
    result.document.bytes.fill(0);
    result.document.length = 0;
    result.document.crc16 = 0;
    result.document.source = ConfigSource::Default;
    result.slot = ConfigSlot::Invalid;
    result.generation = 0;
    result.epoch = 0;
}
void queue_config_ack(uint8_t phase, bool ok, bool saved, uint16_t bytes,
                      uint16_t crc16) {
    config_ack_payload.fill(0);
    config_ack_payload[0] = 0x03;
    config_ack_payload[1] = 0;
    config_ack_payload[2] = 1;
    config_ack_payload[3] = 7;
    config_ack_payload[4] = 1;
    config_ack_payload[5] = phase;
    config_ack_payload[6] = ok ? 1 : 0;
    config_ack_payload[7] = static_cast<uint8_t>(bytes);
    config_ack_payload[8] = static_cast<uint8_t>(bytes >> 8);
    config_ack_payload[9] = static_cast<uint8_t>(crc16);
    config_ack_payload[10] = static_cast<uint8_t>(crc16 >> 8);
    config_ack_payload[11] = saved ? 1 : 0;
    config_ack_pending = true;
}
constexpr char kLogTag[] = "easyinput";

void IRAM_ATTR notify_owner_from_isr(BaseType_t* higher_priority_woken) {
    if (owner_task != nullptr) {
        vTaskNotifyGiveFromISR(owner_task, higher_priority_woken);
    }
}

void IRAM_ATTR encoder_edge_isr(void*) {
    const RawEdge edge{
        static_cast<uint8_t>(
            (gpio_get_level(static_cast<gpio_num_t>(kEncoderAGpio)) << 1) |
            gpio_get_level(static_cast<gpio_num_t>(kEncoderBGpio))),
        monotonic_milliseconds(static_cast<uint64_t>(esp_timer_get_time())),
    };
    BaseType_t higher_priority_woken = pdFALSE;
    if (xQueueSendFromISR(raw_edge_queue, &edge, &higher_priority_woken) != pdTRUE) {
        uint32_t current = raw_edge_drops.load(std::memory_order_relaxed);
        while (current != UINT32_MAX &&
               !raw_edge_drops.compare_exchange_weak(
                   current, current + 1, std::memory_order_relaxed)) {}
    }
    notify_owner_from_isr(&higher_priority_woken);
    if (higher_priority_woken == pdTRUE) portYIELD_FROM_ISR();
}

void IRAM_ATTR usb_presence_edge_isr(void*) {
    BaseType_t higher_priority_woken = pdFALSE;
    notify_owner_from_isr(&higher_priority_woken);
    if (higher_priority_woken == pdTRUE) portYIELD_FROM_ISR();
}

static_assert(sizeof(tusb_desc_device_t) == kUsbDeviceDescriptorLength);

uint8_t read_encoder_phase() {
    return static_cast<uint8_t>(
        (gpio_get_level(static_cast<gpio_num_t>(kEncoderAGpio)) << 1) |
        gpio_get_level(static_cast<gpio_num_t>(kEncoderBGpio)));
}

bool usb_physical_presence_present() {
    return gpio_get_level(static_cast<gpio_num_t>(kUsbPhysicalPresenceGpio)) ==
           kUsbPhysicalPresenceActiveLevel;
}

UsbCallbackSnapshot callback_snapshot() {
    return callback_lifecycle.snapshot();
}

void publish_led_feedback(const InputEvent& event) {
    const LedFeedbackEvent feedback = feedback_for_input_event(event);
    if (led_feedback_mailbox.publish(feedback, led_feedback_diagnostics) &&
        led_task_handle != nullptr) {
        xTaskNotifyGive(led_task_handle);
    }
}

void led_feedback_task(void*) {
    LedStrip strip;
    if (peripheral_power.begin_awake() != ESP_OK ||
        !peripheral_power.acquire_consumer(PeripheralPowerOwner::Led) ||
        strip.begin() != ESP_OK) {
        led_feedback_diagnostics.record_init_failure();
        for (;;) ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    }

    const LedFrame black{};
    if (strip.transmit(black) != ESP_OK) {
        led_feedback_diagnostics.record_tx_failure();
    }

    LedFeedbackAnimator animator;
    for (;;) {
        LedFeedbackEvent event{};
        if (led_feedback_mailbox.consume(event)) {
            animator.start(event, monotonic_milliseconds(
                static_cast<uint64_t>(esp_timer_get_time())));
        }

        const uint32_t now_ms = monotonic_milliseconds(
            static_cast<uint64_t>(esp_timer_get_time()));
        LedFrame frame{};
        if (animator.update(now_ms, frame) &&
            strip.transmit(frame) != ESP_OK) {
            led_feedback_diagnostics.record_tx_failure();
        }

        if (led_feedback_mailbox.pending()) continue;
        const TickType_t wait_ticks = animator.active()
            ? static_cast<TickType_t>(1)
            : portMAX_DELAY;
        ulTaskNotifyTake(pdTRUE, wait_ticks);
    }
}

void config_owner_task(void*) {
    for (;;) {
        if (xQueueReceive(config_save_queue, &config_owner_command, portMAX_DELAY) != pdTRUE) continue;
        reset_config_save_result(config_owner_result);
        config_owner_result.document = config_owner_command.document;
        config_owner_result.epoch = config_owner_command.epoch;
        config_owner_result.status = config_store.save(config_owner_command.document, config_owner_command.active, config_owner_command.generation);
        if (config_owner_result.status == ConfigSaveStatus::Saved) {
            const ConfigLoadResult& loaded = config_store.load();
            ConfigProjection projection{};
            if (loaded.slot == ConfigSlot::Invalid || !parse_config_projection(loaded.document.view(), projection)) {
                config_owner_result.status = ConfigSaveStatus::ReadbackFailed;
            } else {
                config_owner_result.document = loaded.document;
                config_owner_result.slot = loaded.slot;
                config_owner_result.generation = loaded.generation;
            }
        }
        (void)xQueueSend(config_result_queue, &config_owner_result, portMAX_DELAY);
    }
}

void deskmate_link_task(void*) {
    deskmate_link_uart.run();
}

void input_owner_task(void*) {
    InputCore input;
    HidReportTransferState transfer;
    for (;;) {
        const auto lifecycle = process_usb_lifecycle_events(
            lifecycle_events, runtime, transfer, callback_snapshot(),
            &config_transfer);
        if (config_transfer.completed) {
            config_transfer.completed = false;
            (void)config_read_stream.mark_sent();
        }
        if (config_transfer.completed_status) {
            config_transfer.completed_status = false;
            (void)config_status_stream.mark_sent();
        }
        if (config_transfer.completed_manual) {
            config_transfer.completed_manual = false;
            (void)manual_calibration_bridge.mark_response_sent();
        }
        if (config_transfer.failed_manual) {
            config_transfer.failed_manual = false;
        }
        if (config_transfer.failed) {
            config_transfer.failed = false;
            config_read_stream.abort();
            config_status_stream.abort();
            config_ack_pending = false;
        }
        if (lifecycle.dropped_events != 0) {
            ESP_LOGW(kLogTag, "USB lifecycle queue recovered after %lu dropped events",
                     static_cast<unsigned long>(lifecycle.dropped_events));
        }

        const uint32_t now_ms = monotonic_milliseconds(
            static_cast<uint64_t>(esp_timer_get_time()));
        const bool raw_usb_present = usb_physical_presence_present();
        runtime.observe_raw_physical_presence(raw_usb_present);
        if (usb_physical_presence.update(raw_usb_present, now_ms)) {
            if (!usb_physical_presence.present()) {
                callback_lifecycle.on_physical_disconnect();
                ESP_LOGI(kLogTag, "USB physical disconnect confirmed");
            } else {
                ESP_LOGI(kLogTag, "USB physical presence restored");
            }
            runtime.observe_physical_presence(usb_physical_presence.present());
        }
        const UsbDeviceConnectionAction usb_connection_action =
            usb_device_connection.next_action(
                tinyusb_driver_ready.load(std::memory_order_acquire),
                usb_physical_presence.present());
        if (usb_connection_action != UsbDeviceConnectionAction::None) {
            const bool applied =
                usb_connection_action == UsbDeviceConnectionAction::Connect
                    ? tud_connect()
                    : tud_disconnect();
            if (applied) {
                usb_device_connection.mark_applied(usb_connection_action);
            } else {
                ESP_LOGW(kLogTag, "USB physical connection action failed kind=%u",
                         static_cast<unsigned>(usb_connection_action));
            }
        }
        uint8_t key_mask = 0;
        for (uint8_t index = 0; index < kKeyGpios.size(); ++index) {
            if (gpio_get_level(static_cast<gpio_num_t>(kKeyGpios[index])) == 0) {
                key_mask |= static_cast<uint8_t>(1u << index);
            }
        }
        input.scan_keys(key_mask, now_ms);
        runtime.observe_physical_key_mask(input.stable_key_mask());
        input.scan_encoder_press(
            gpio_get_level(static_cast<gpio_num_t>(kEncoderPressGpio)) == 0,
            now_ms);

        const uint32_t dropped_edges =
            raw_edge_drops.exchange(0, std::memory_order_acq_rel);
        if (dropped_edges != 0) {
            xQueueReset(raw_edge_queue);
            runtime.on_raw_edge_drops(dropped_edges);
            input.resync_encoder(read_encoder_phase());
            runtime.on_encoder_resync();
        } else {
            RawEdge edge{};
            while (xQueueReceive(raw_edge_queue, &edge, 0) == pdTRUE) {
                input.scan_encoder_phase(edge.phase, edge.at_ms);
            }
        }
        const uint32_t dropped_events = input.take_event_drops();
        if (dropped_events != 0) {
            input.discard_pending_events();
            runtime.on_input_event_drops(dropped_events);
            runtime.recover_after_input_drop(key_mask);
        } else {
            InputEvent event{};
            while (input.pop_event(event)) {
                if (event.type == InputEventType::KeyPressed &&
                    (event.index == 0 || event.index == 2)) {
                    audio_capture_service.prewarm_wifi();
                }
                runtime.on_input(event);
                publish_led_feedback(event);
            }
        }

        while (xQueueReceive(config_result_queue, &input_owner_save_result, 0) == pdTRUE) {
            config_save_in_flight = false;
            if (input_owner_save_result.epoch != runtime.diagnostics().usb_mount_epoch || !runtime.mounted()) {
                continue;
            }
            if (input_owner_save_result.status == ConfigSaveStatus::Saved) {
                ConfigProjection projection{};
                if (parse_config_projection(input_owner_save_result.document.view(), projection)) {
                    active_config = input_owner_save_result.document;
                    active_config_slot = input_owner_save_result.slot;
                    active_config_generation = input_owner_save_result.generation;
                    runtime.set_configuration(projection);
                    audio_capture_service.configure(active_config.view());
                    queue_config_ack(2, true, true, input_owner_save_result.document.length, input_owner_save_result.document.crc16);
                } else {
                    queue_config_ack(3, false, false, input_owner_save_result.document.length, input_owner_save_result.document.crc16);
                }
            } else {
                queue_config_ack(static_cast<uint8_t>(input_owner_save_result.status), false, false,
                                 input_owner_save_result.document.length, input_owner_save_result.document.crc16);
            }
        }
        while (xQueueReceive(agent_state_command_queue,
                             &input_owner_config_command, 0) == pdTRUE) {
            const uint32_t current_epoch =
                runtime.diagnostics().usb_mount_epoch;
            if (input_owner_config_command.epoch != current_epoch) {
                agent_state_bridge.clear_for_usb_epoch(current_epoch);
                continue;
            }
            AgentStateDispatch dispatch{};
            if (agent_state_bridge.accept(
                    input_owner_config_command.payload.data(),
                    input_owner_config_command.length,
                    input_owner_config_command.epoch, now_ms,
                    deskmate_link_uart.snapshot(), dispatch)) {
                agent_state_bridge.note_forward_result(
                    deskmate_link_uart.queue_agent_state(
                        dispatch.state, dispatch.transition_id));
            }
        }
        while (xQueueReceive(manual_calibration_command_queue,
                             &input_owner_config_command, 0) == pdTRUE) {
            ManualCalibrationLinkRequest dispatch{};
            const LinkStatusSnapshot link = deskmate_link_uart.snapshot();
            if (manual_calibration_bridge.accept(
                    input_owner_config_command.payload.data(),
                    input_owner_config_command.length,
                    input_owner_config_command.epoch, link, dispatch)) {
                manual_calibration_bridge.note_forward_result(
                    deskmate_link_uart.queue_manual_calibration(dispatch),
                    link);
            }
        }
        ManualCalibrationLinkResult manual_terminal{};
        if (deskmate_link_uart.take_manual_calibration_result(
                manual_terminal)) {
            manual_calibration_bridge.complete(
                manual_terminal, deskmate_link_uart.snapshot());
        }
        while (xQueueReceive(config_command_queue,
                             &input_owner_config_command, 0) == pdTRUE) {
            if (input_owner_config_command.epoch != runtime.diagnostics().usb_mount_epoch) {
                config_write_assembler.abort();
                config_read_stream.abort();
                config_status_stream.abort();
                continue;
            }
            if (input_owner_config_command.report_id == 0x10) {
                if (config_save_in_flight || config_read_stream.pending() || config_status_stream.pending()) {
                    queue_config_ack(1, false, false, 0, 0);
                    continue;
                }
                const auto result = config_write_assembler.accept(
                    input_owner_config_command.payload.data(), input_owner_config_command.length,
                    input_owner_config_command.epoch);
                if (result == ConfigReceiveStatus::Complete) {
                    const ConfigDocument& candidate = config_write_assembler.document();
                    input_owner_save_command.document = candidate;
                    input_owner_save_command.active = active_config_slot;
                    input_owner_save_command.generation = active_config_generation;
                    input_owner_save_command.epoch = input_owner_config_command.epoch;
                    if (xQueueSend(config_save_queue, &input_owner_save_command, 0) == pdTRUE) {
                        config_save_in_flight = true;
                    } else {
                        queue_config_ack(4, false, false, candidate.length, candidate.crc16);
                    }
                } else if (result == ConfigReceiveStatus::Rejected) {
                    queue_config_ack(1, false, false, 0, 0);
                }
            } else {
                ConfigReadRequest request{};
                if (decode_config_read_request(input_owner_config_command.payload.data(),
                                               input_owner_config_command.length, request)) {
                    if (config_save_in_flight || config_write_assembler.active()) continue;
                    config_read_stream.abort();
                    config_status_stream.abort();
                    if (request.flag == ConfigReadFlag::CompleteConfig) {
                        (void)config_read_stream.replace(
                            request.request_id, active_config, input_owner_config_command.epoch);
                    } else {
                        (void)config_status_stream.replace(
                            request.request_id, input_owner_config_command.epoch,
                            deskmate_link_uart.snapshot(),
                            agent_state_bridge.diagnostics(),
                            audio_capture_service.snapshot(),
                            speaker_output_service.snapshot(),
                            manual_calibration_bridge.diagnostics());
                    }
                }
            }
        }

        agent_state_bridge.clear_for_usb_epoch(
            runtime.diagnostics().usb_mount_epoch);
        AgentStateDispatch expiry_dispatch{};
        if (agent_state_bridge.poll(
                now_ms, runtime.diagnostics().usb_mount_epoch,
                deskmate_link_uart.snapshot(), expiry_dispatch)) {
            agent_state_bridge.note_forward_result(
                deskmate_link_uart.queue_agent_state(
                    expiry_dispatch.state, expiry_dispatch.transition_id));
        }
        manual_calibration_bridge.poll_lifecycle(
            runtime.diagnostics().usb_mount_epoch,
            deskmate_link_uart.snapshot());

        runtime.service_release_reassertion(now_ms);

        QueuedHidReport report{};
        if (prepare_hid_report(runtime, tud_hid_ready() && !config_transfer.active,
                               transfer, report)) {
            const bool accepted = tud_hid_report(
                report.report_id, report.payload.data(), report.length);
            finish_hid_send_attempt(runtime, report, accepted, transfer);
        }
        if (tud_hid_ready() && !transfer.active &&
            !config_transfer.active &&
            manual_calibration_bridge.front_response(
                manual_calibration_response_payload)) {
            const bool accepted = tud_hid_report(
                kManualCalibrationStatusReportId,
                manual_calibration_response_payload.data(),
                manual_calibration_response_payload.size());
            if (accepted) {
                config_transfer.active = true;
                config_transfer.advances_read_stream = false;
                config_transfer.advances_status_stream = false;
                config_transfer.advances_host_command = false;
                config_transfer.advances_manual_response = true;
                config_transfer.report.report_id =
                    kManualCalibrationStatusReportId;
                config_transfer.report.length = static_cast<uint8_t>(
                    manual_calibration_response_payload.size());
                config_transfer.report.epoch =
                    runtime.diagnostics().usb_mount_epoch;
                std::copy(manual_calibration_response_payload.begin(),
                          manual_calibration_response_payload.end(),
                          config_transfer.report.payload.begin());
            }
        }
        if (config_ack_pending && tud_hid_ready() && !transfer.active &&
            !config_transfer.active) {
            const bool accepted = tud_hid_report(0x11, config_ack_payload.data(), config_ack_payload.size());
            if (accepted) {
                config_ack_pending = false;
                config_transfer.active = true;
                config_transfer.advances_read_stream = false;
                config_transfer.advances_status_stream = false;
                config_transfer.advances_host_command = false;
                config_transfer.report.report_id = 0x11;
                config_transfer.report.length = static_cast<uint8_t>(config_ack_payload.size());
                config_transfer.report.epoch = runtime.diagnostics().usb_mount_epoch;
                std::copy(config_ack_payload.begin(), config_ack_payload.end(), config_transfer.report.payload.begin());
            }
        }
        if (config_status_stream.pending() && tud_hid_ready() && !transfer.active &&
            !config_transfer.active && !config_ack_pending) {
            if (config_status_stream.encode_next(config_response_payload) &&
                tud_hid_report(0x11, config_response_payload.data(),
                               config_response_payload.size())) {
                config_transfer.active = true;
                config_transfer.advances_read_stream = false;
                config_transfer.advances_status_stream = true;
                config_transfer.advances_host_command = false;
                config_transfer.report.report_id = 0x11;
                config_transfer.report.length = static_cast<uint8_t>(config_response_payload.size());
                config_transfer.report.epoch = runtime.diagnostics().usb_mount_epoch;
                std::copy(config_response_payload.begin(), config_response_payload.end(),
                           config_transfer.report.payload.begin());
            }
        }
        if (!config_ack_pending && !config_status_stream.pending() && config_read_stream.pending() && tud_hid_ready() &&
            !transfer.active && !config_transfer.active) {
            if (config_read_stream.encode_next(config_response_payload)) {
                const bool accepted = tud_hid_report(0x11, config_response_payload.data(), config_response_payload.size());
                if (accepted) {
                    config_transfer.active = true;
                    config_transfer.advances_read_stream = true;
                    config_transfer.advances_status_stream = false;
                    config_transfer.advances_host_command = false;
                    config_transfer.report.report_id = 0x11;
                    config_transfer.report.length = static_cast<uint8_t>(config_response_payload.size());
                    config_transfer.report.epoch = runtime.diagnostics().usb_mount_epoch;
                    std::copy(config_response_payload.begin(), config_response_payload.end(), config_transfer.report.payload.begin());
                } else config_read_stream.abort();
            }
        }
        if (!config_ack_pending && !config_status_stream.pending() &&
            !config_read_stream.pending() && tud_hid_ready() &&
            !transfer.active && !config_transfer.active &&
            runtime.front_host_command(config_response_payload)) {
            const bool accepted = tud_hid_report(
                kAppCommandReportId, config_response_payload.data(),
                config_response_payload.size());
            if (accepted) {
                config_transfer.active = true;
                config_transfer.advances_read_stream = false;
                config_transfer.advances_status_stream = false;
                config_transfer.advances_host_command = true;
                config_transfer.report.report_id = kAppCommandReportId;
                config_transfer.report.length =
                    static_cast<uint8_t>(config_response_payload.size());
                config_transfer.report.epoch =
                    runtime.diagnostics().usb_mount_epoch;
                std::copy(config_response_payload.begin(),
                          config_response_payload.end(),
                          config_transfer.report.payload.begin());
            } else {
                runtime.fail_host_command();
            }
        }
        ulTaskNotifyTake(pdTRUE, 1);
    }
}

void notify_owner_from_callback() {
    if (owner_task != nullptr) xTaskNotifyGive(owner_task);
}

void publish_lifecycle_event(UsbLifecycleEventKind kind) {
    lifecycle_events.publish(callback_lifecycle.current_event(kind));
    notify_owner_from_callback();
}

void publish_transfer_event(UsbLifecycleEventKind kind,
                            const uint8_t* wire_report,
                            uint16_t wire_length) {
    lifecycle_events.publish(make_usb_transfer_event(
        kind, callback_lifecycle.snapshot().epoch, wire_report, wire_length));
    notify_owner_from_callback();
}
}  // namespace

extern "C" void app_main(void) {
    ESP_ERROR_CHECK(config_store.begin());
    const ConfigLoadResult& loaded_config = config_store.load();
    active_config = loaded_config.document;
    active_config_slot = loaded_config.slot;
    active_config_generation = loaded_config.generation;
    ConfigProjection projection{};
    if (parse_config_projection(active_config.view(), projection)) runtime.set_configuration(projection);
    (void)peripheral_power.begin_awake();
    (void)speaker_output_service.begin(peripheral_power, audio_io_arbiter);
    (void)audio_capture_service.begin(peripheral_power, audio_io_arbiter);
    audio_capture_service.configure(active_config.view());
    raw_edge_queue = xQueueCreateStatic(
        kRawEdgeQueueCapacity, sizeof(RawEdge), raw_edge_queue_storage.data(),
        &raw_edge_queue_control);
    ESP_ERROR_CHECK(raw_edge_queue == nullptr ? ESP_ERR_NO_MEM : ESP_OK);
    config_command_queue = xQueueCreateStatic(
        kConfigCommandQueueCapacity, sizeof(ConfigFeatureCommand),
        config_command_queue_storage.data(), &config_command_queue_control);
    ESP_ERROR_CHECK(config_command_queue == nullptr ? ESP_ERR_NO_MEM : ESP_OK);
    agent_state_command_queue = xQueueCreateStatic(
        1, sizeof(ConfigFeatureCommand), agent_state_command_queue_storage.data(),
        &agent_state_command_queue_control);
    ESP_ERROR_CHECK(agent_state_command_queue == nullptr ? ESP_ERR_NO_MEM
                                                         : ESP_OK);
    manual_calibration_command_queue = xQueueCreateStatic(
        kManualCalibrationCommandQueueCapacity, sizeof(ConfigFeatureCommand),
        manual_calibration_command_queue_storage.data(),
        &manual_calibration_command_queue_control);
    ESP_ERROR_CHECK(manual_calibration_command_queue == nullptr
                        ? ESP_ERR_NO_MEM
                        : ESP_OK);
    config_save_queue = xQueueCreateStatic(2, sizeof(ConfigSaveCommand), config_save_queue_storage.data(), &config_save_queue_control);
    config_result_queue = xQueueCreateStatic(2, sizeof(ConfigSaveResult), config_result_queue_storage.data(), &config_result_queue_control);
    ESP_ERROR_CHECK(config_save_queue == nullptr || config_result_queue == nullptr ? ESP_ERR_NO_MEM : ESP_OK);
    ESP_ERROR_CHECK(xTaskCreate(config_owner_task, "config_owner", 4096, nullptr, 8, nullptr) == pdPASS ? ESP_OK : ESP_ERR_NO_MEM);

    if (xTaskCreate(deskmate_link_task, "deskmate_link", 4096, nullptr, 7,
                    &deskmate_link_task_handle) != pdPASS) {
        deskmate_link_task_handle = nullptr;
        deskmate_link_uart.mark_task_create_failure();
    }

    if (xTaskCreate(led_feedback_task, "led_feedback", 4096, nullptr, 5,
                    &led_task_handle) != pdPASS) {
        led_feedback_diagnostics.record_init_failure();
        led_task_handle = nullptr;
    }

    gpio_config_t inputs{};
    for (int pin : kKeyGpios) inputs.pin_bit_mask |= 1ULL << pin;
    inputs.pin_bit_mask |= (1ULL << kEncoderPressGpio);
    inputs.mode = GPIO_MODE_INPUT;
    inputs.pull_up_en = GPIO_PULLUP_ENABLE;
    inputs.pull_down_en = GPIO_PULLDOWN_DISABLE;
    inputs.intr_type = GPIO_INTR_DISABLE;
    ESP_ERROR_CHECK(gpio_config(&inputs));

    gpio_config_t usb_presence_input{};
    usb_presence_input.pin_bit_mask = 1ULL << kUsbPhysicalPresenceGpio;
    usb_presence_input.mode = GPIO_MODE_INPUT;
    usb_presence_input.pull_up_en = GPIO_PULLUP_ENABLE;
    usb_presence_input.pull_down_en = GPIO_PULLDOWN_DISABLE;
    usb_presence_input.intr_type = GPIO_INTR_ANYEDGE;
    ESP_ERROR_CHECK(gpio_config(&usb_presence_input));
    usb_physical_presence.reset(usb_physical_presence_present(),
                                monotonic_milliseconds(
                                    static_cast<uint64_t>(esp_timer_get_time())));

    gpio_config_t encoder_inputs{};
    encoder_inputs.pin_bit_mask =
        (1ULL << kEncoderAGpio) | (1ULL << kEncoderBGpio);
    encoder_inputs.mode = GPIO_MODE_INPUT;
    encoder_inputs.pull_up_en = GPIO_PULLUP_ENABLE;
    encoder_inputs.pull_down_en = GPIO_PULLDOWN_DISABLE;
    encoder_inputs.intr_type = GPIO_INTR_ANYEDGE;
    ESP_ERROR_CHECK(gpio_config(&encoder_inputs));

    ESP_ERROR_CHECK(xTaskCreate(input_owner_task, "input_owner", 4096, nullptr,
                                10, &owner_task) == pdPASS
                        ? ESP_OK
                        : ESP_ERR_NO_MEM);
    ESP_ERROR_CHECK(gpio_install_isr_service(ESP_INTR_FLAG_IRAM));
    ESP_ERROR_CHECK(gpio_isr_handler_add(
        static_cast<gpio_num_t>(kEncoderAGpio), encoder_edge_isr, nullptr));
    ESP_ERROR_CHECK(gpio_isr_handler_add(
        static_cast<gpio_num_t>(kEncoderBGpio), encoder_edge_isr, nullptr));
    ESP_ERROR_CHECK(gpio_isr_handler_add(
        static_cast<gpio_num_t>(kUsbPhysicalPresenceGpio),
        usb_presence_edge_isr, nullptr));

    const tinyusb_config_t usb_config = {
        .device_descriptor = reinterpret_cast<const tusb_desc_device_t*>(
            kUsbDeviceDescriptor.data()),
        .string_descriptor = kUsbStringDescriptors.data(),
        .string_descriptor_count =
            kUsbStringDescriptors.size(),
        .external_phy = false,
        .configuration_descriptor = kUsbConfigurationDescriptor.data(),
        .self_powered = false,
        .vbus_monitor_io = GPIO_NUM_NC,
    };
    ESP_ERROR_CHECK(tinyusb_driver_install(&usb_config));
    tinyusb_driver_ready.store(true, std::memory_order_release);
    xTaskNotifyGive(owner_task);
    (void)speaker_output_service.request_startup_probe();
}

extern "C" void tud_mount_cb(void) {
    const UsbLifecycleEvent event = callback_lifecycle.on_mount();
    lifecycle_events.publish(event);
    ESP_LOGI(kLogTag, "USB mount epoch=%lu physical_sample=%u",
             static_cast<unsigned long>(event.epoch),
             usb_physical_presence_present() ? 1u : 0u);
    notify_owner_from_callback();
}
extern "C" void tud_umount_cb(void) {
    const UsbLifecycleEvent event = callback_lifecycle.on_unmount();
    lifecycle_events.publish(event);
    ESP_LOGI(kLogTag, "USB unmount epoch=%lu",
             static_cast<unsigned long>(event.epoch));
    notify_owner_from_callback();
}
extern "C" void tud_resume_cb(void) {
    publish_lifecycle_event(UsbLifecycleEventKind::Resume);
}
extern "C" void tud_hid_report_complete_cb(
    uint8_t, uint8_t const* report, uint16_t length) {
    publish_transfer_event(UsbLifecycleEventKind::TransferComplete,
                           report, length);
}
extern "C" void tud_hid_report_failed_cb(
    uint8_t, hid_report_type_t report_type, uint8_t const* report,
    uint16_t) {
    if (report_type == HID_REPORT_TYPE_INPUT) {
        const uint16_t wire_length = report == nullptr
            ? 0
            : usb_wire_report_length(report[0]);
        publish_transfer_event(UsbLifecycleEventKind::TransferFailed,
                               report, wire_length);
    }
}
extern "C" uint8_t const* tud_hid_descriptor_report_cb(uint8_t) {
    return kHidReportDescriptor;
}
extern "C" uint16_t tud_hid_get_report_cb(
    uint8_t, uint8_t, hid_report_type_t, uint8_t*, uint16_t) {
    return 0;
}
extern "C" void tud_hid_set_report_cb(
    uint8_t, uint8_t report_id, hid_report_type_t report_type,
    uint8_t const* buffer, uint16_t length) {
    if (report_type != HID_REPORT_TYPE_FEATURE) return;
    ConfigFeatureReportView feature{};
    AgentStateFeatureReportView agent_feature{};
    ManualCalibrationFeatureReportView manual_feature{};
    if (normalize_manual_calibration_feature_report(
            report_id, buffer, length, manual_feature)) {
        feature.report_id = kManualCalibrationRequestReportId;
        feature.payload = manual_feature.payload;
        feature.length = manual_feature.length;
    } else if (normalize_agent_state_feature_report(
            report_id, buffer, length, agent_feature)) {
        feature.report_id = kAgentStateReportId;
        feature.payload = agent_feature.payload;
        feature.length = agent_feature.length;
    } else if (!normalize_config_feature_report(
                   report_id, buffer, length, feature)) {
        return;
    }
    const bool config_read = feature.report_id == 0x13;
    ConfigFeatureCommand command{};
    command.report_id = feature.report_id;
    command.length = static_cast<uint8_t>(config_read ? kConfigReadRequestPayloadBytes : feature.length);
    command.epoch = callback_lifecycle.snapshot().epoch;
    std::copy_n(feature.payload, command.length, command.payload.begin());
    QueueHandle_t destination = config_command_queue;
    if (feature.report_id == kAgentStateReportId) {
        destination = agent_state_command_queue;
    } else if (feature.report_id == kManualCalibrationRequestReportId) {
        destination = manual_calibration_command_queue;
    }
    const BaseType_t queued = feature.report_id == kAgentStateReportId
        ? (destination == nullptr ? pdFALSE
                                  : xQueueOverwrite(destination, &command))
        : (destination == nullptr ? pdFALSE
                                  : xQueueSend(destination, &command, 0));
    if (queued == pdTRUE) {
        notify_owner_from_callback();
    }
}
