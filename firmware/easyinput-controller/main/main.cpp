#include "board_pins.h"
#include "input_core.h"
#include "input_runtime.h"

#include "class/hid/hid_device.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "tinyusb.h"
#include "tusb.h"

#include <array>
#include <atomic>
#include <cstdint>

using namespace deskmate::easyinput;

namespace {
struct RawEdge {
    uint8_t phase;
    uint32_t at_ms;
};

StaticQueue_t raw_edge_queue_control{};
std::array<uint8_t, kRawEdgeQueueCapacity * sizeof(RawEdge)> raw_edge_queue_storage{};
QueueHandle_t raw_edge_queue = nullptr;
TaskHandle_t owner_task = nullptr;
std::atomic<uint32_t> raw_edge_drops{0};
UsbLifecycleEventQueue lifecycle_events;
std::atomic<uint32_t> callback_epoch{0};
UsbInputRuntime runtime;

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

static_assert(sizeof(tusb_desc_device_t) == kUsbDeviceDescriptorLength);

uint8_t read_encoder_phase() {
    return static_cast<uint8_t>(
        (gpio_get_level(static_cast<gpio_num_t>(kEncoderAGpio)) << 1) |
        gpio_get_level(static_cast<gpio_num_t>(kEncoderBGpio)));
}

void publish_callback_work(bool& report_in_flight, uint32_t& report_in_flight_epoch) {
    UsbLifecycleEvent event{};
    while (lifecycle_events.consume(event)) {
        switch (event.kind) {
            case UsbLifecycleEventKind::Mount:
                if (!runtime.mounted()) {
                    runtime.on_mount();
                    report_in_flight = false;
                }
                break;
            case UsbLifecycleEventKind::Unmount:
                if (runtime.mounted()) {
                    runtime.on_unmount();
                    report_in_flight = false;
                }
                break;
            case UsbLifecycleEventKind::Resume:
                if (runtime.mounted()) runtime.on_resume();
                break;
            case UsbLifecycleEventKind::TransferComplete:
                if (report_in_flight && event.epoch == report_in_flight_epoch &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch) {
                    runtime.complete_report();
                    report_in_flight = false;
                }
                break;
            case UsbLifecycleEventKind::TransferFailed:
                if (report_in_flight && event.epoch == report_in_flight_epoch &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch) {
                    runtime.on_transfer_failed();
                    report_in_flight = false;
                }
                break;
        }
    }
}

void input_owner_task(void*) {
    InputCore input;
    bool report_in_flight = false;
    uint32_t report_in_flight_epoch = 0;
    for (;;) {
        publish_callback_work(report_in_flight, report_in_flight_epoch);

        const uint32_t now_ms = monotonic_milliseconds(
            static_cast<uint64_t>(esp_timer_get_time()));
        uint8_t key_mask = 0;
        for (uint8_t index = 0; index < kKeyGpios.size(); ++index) {
            if (gpio_get_level(static_cast<gpio_num_t>(kKeyGpios[index])) == 0) {
                key_mask |= static_cast<uint8_t>(1u << index);
            }
        }
        input.scan_keys(key_mask, now_ms);
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
            while (input.pop_event(event)) runtime.on_input(event);
        }

        QueuedHidReport report{};
        if (!report_in_flight && runtime.front_report(report) && tud_hid_ready()) {
            if (tud_hid_report(report.report_id, report.payload.data(), report.length)) {
                report_in_flight = true;
                report_in_flight_epoch = report.epoch;
            } else {
                runtime.on_transfer_failed();
            }
        }
        ulTaskNotifyTake(pdTRUE, 1);
    }
}

void notify_owner_from_callback() {
    if (owner_task != nullptr) xTaskNotifyGive(owner_task);
}

void publish_lifecycle_event(UsbLifecycleEventKind kind) {
    const uint32_t epoch = callback_epoch.load(std::memory_order_acquire);
    lifecycle_events.publish({kind, epoch});
    notify_owner_from_callback();
}
}  // namespace

extern "C" void app_main(void) {
    raw_edge_queue = xQueueCreateStatic(
        kRawEdgeQueueCapacity, sizeof(RawEdge), raw_edge_queue_storage.data(),
        &raw_edge_queue_control);
    ESP_ERROR_CHECK(raw_edge_queue == nullptr ? ESP_ERR_NO_MEM : ESP_OK);

    gpio_config_t inputs{};
    for (int pin : kKeyGpios) inputs.pin_bit_mask |= 1ULL << pin;
    inputs.pin_bit_mask |= (1ULL << kEncoderPressGpio);
    inputs.mode = GPIO_MODE_INPUT;
    inputs.pull_up_en = GPIO_PULLUP_ENABLE;
    inputs.pull_down_en = GPIO_PULLDOWN_DISABLE;
    inputs.intr_type = GPIO_INTR_DISABLE;
    ESP_ERROR_CHECK(gpio_config(&inputs));

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
}

extern "C" void tud_mount_cb(void) {
    const uint32_t epoch = callback_epoch.fetch_add(1, std::memory_order_acq_rel) + 1;
    lifecycle_events.publish({UsbLifecycleEventKind::Mount, epoch});
    notify_owner_from_callback();
}
extern "C" void tud_umount_cb(void) {
    publish_lifecycle_event(UsbLifecycleEventKind::Unmount);
}
extern "C" void tud_resume_cb(void) {
    publish_lifecycle_event(UsbLifecycleEventKind::Resume);
}
extern "C" void tud_hid_report_complete_cb(
    uint8_t, uint8_t const*, uint16_t) {
    publish_lifecycle_event(UsbLifecycleEventKind::TransferComplete);
}
extern "C" void tud_hid_report_failed_cb(
    uint8_t, hid_report_type_t report_type, uint8_t const*, uint16_t) {
    if (report_type == HID_REPORT_TYPE_INPUT) {
        publish_lifecycle_event(UsbLifecycleEventKind::TransferFailed);
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
    if (report_type == HID_REPORT_TYPE_FEATURE) {
        (void)runtime.reject_vendor_feature(report_id, buffer, length);
    }
}
