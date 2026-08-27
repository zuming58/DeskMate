#include <algorithm>
#include <cctype>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace {
int failures = 0;

void check(bool passed, const char* expression, const char* file, int line) {
    if (passed) return;
    std::cerr << file << ':' << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

#define CHECK(expression) check((expression), #expression, __FILE__, __LINE__)

std::string read_all(const char* path) {
    std::ifstream stream(path, std::ios::binary);
    if (!stream) {
        std::cerr << "Unable to read source contract file: " << path << '\n';
        ++failures;
        return {};
    }
    std::ostringstream contents;
    contents << stream.rdbuf();
    return contents.str();
}

bool contains(const std::string& text, const char* value) {
    return text.find(value) != std::string::npos;
}

size_t occurrences(const std::string& text, const char* value) {
    size_t count = 0;
    size_t position = 0;
    while ((position = text.find(value, position)) != std::string::npos) {
        ++count;
        position += std::string(value).size();
    }
    return count;
}

std::string normalize_partition_entries(const std::string& text) {
    std::istringstream input(text);
    std::ostringstream normalized;
    std::string line;
    while (std::getline(input, line)) {
        line.erase(std::remove_if(line.begin(), line.end(), [](unsigned char value) {
            return std::isspace(value) != 0;
        }), line.end());
        if (line.empty() || line.front() == '#') continue;
        std::transform(line.begin(), line.end(), line.begin(), [](unsigned char value) {
            return static_cast<char>(std::tolower(value));
        });
        normalized << line << '\n';
    }
    return normalized.str();
}
}  // namespace

int main() {
    const std::string main_source = read_all(MAIN_SOURCE_PATH);
    const std::string main_cmake = read_all(MAIN_CMAKE_PATH);
    const std::string root_cmake = read_all(ROOT_CMAKE_PATH);
    const std::string runtime_source = read_all(RUNTIME_SOURCE_PATH);
    const std::string runtime_header = read_all(RUNTIME_HEADER_PATH);
    const std::string input_core_header = read_all(INPUT_CORE_HEADER_PATH);
    const std::string board_pins = read_all(BOARD_PINS_PATH);
    const std::string led_feedback_header = read_all(LED_FEEDBACK_HEADER_PATH);
    const std::string led_feedback_source = read_all(LED_FEEDBACK_SOURCE_PATH);
    const std::string led_strip_source = read_all(LED_STRIP_SOURCE_PATH);
    const std::string power_source = read_all(POWER_SOURCE_PATH);
    const std::string power_header = read_all(POWER_HEADER_PATH);
    const std::string power_lease_header = read_all(POWER_LEASE_HEADER_PATH);
    const std::string power_lease_source = read_all(POWER_LEASE_SOURCE_PATH);
    const std::string module_gitignore = read_all(MODULE_GITIGNORE_PATH);
    const std::string manifest = read_all(MANIFEST_PATH);
    const std::string sdkconfig_defaults = read_all(SDKCONFIG_DEFAULTS_PATH);
    const std::string partitions = read_all(PARTITIONS_PATH);

    CHECK(contains(main_source, "esp_timer_get_time()"));
    CHECK(contains(main_source, "monotonic_milliseconds"));
    CHECK(contains(main_source, "ulTaskNotifyTake(pdTRUE, 1)"));
    CHECK(contains(main_source, "ESP_ERROR_CHECK(gpio_config(&inputs))"));
    CHECK(!contains(main_source, "pdMS_TO_TICKS(1)"));
    CHECK(!contains(main_source, "tick++"));
    CHECK(contains(main_cmake, "esp_driver_gpio"));
    CHECK(contains(main_cmake, "esp_timer"));
    CHECK(contains(main_cmake, "esp_driver_rmt"));
    CHECK(contains(root_cmake, "idf_build_set_property(MINIMAL_BUILD ON)"));
    CHECK(contains(main_source, "GPIO_INTR_ANYEDGE"));
    CHECK(contains(main_source, "kUsbPhysicalPresenceGpio"));
    CHECK(contains(main_source, "usb_physical_presence.update"));
    CHECK(contains(main_source, "usb_presence_edge_isr"));
    CHECK(contains(main_source, "runtime.observe_raw_physical_presence"));
    CHECK(contains(main_source, "runtime.service_release_reassertion(now_ms)"));
    CHECK(contains(main_source, "UsbDeviceConnectionGate usb_device_connection"));
    CHECK(contains(main_source, "tud_disconnect()"));
    CHECK(contains(main_source, "tud_connect()"));
    CHECK(contains(main_source, "tinyusb_driver_ready.store"));
    CHECK(contains(main_source, ".vbus_monitor_io = GPIO_NUM_NC"));
    CHECK(contains(main_source, "callback_lifecycle.on_mount"));
    CHECK(!contains(main_source, "try_mount"));
    CHECK(contains(main_source, "xQueueCreateStatic"));
    CHECK(contains(main_source, "kRawEdgeQueueCapacity"));
    CHECK(contains(main_source, "xQueueReset(raw_edge_queue)"));
    CHECK(contains(main_source, "UsbLifecycleEventQueue lifecycle_events"));
    CHECK(contains(main_source, "process_usb_lifecycle_events"));
    CHECK(contains(main_source, "input.stable_key_mask()"));
    CHECK(contains(main_source, "prepare_hid_report"));
    CHECK(contains(main_source, "finish_hid_send_attempt"));
    CHECK(contains(main_source, "publish_transfer_event"));
    CHECK(contains(main_source, "tud_hid_report_complete_cb("));
    CHECK(contains(main_source, "report, length"));
    CHECK(contains(runtime_header, "HidReportTransferState"));
    CHECK(contains(runtime_header, "report_identity_valid"));
    CHECK(contains(runtime_source, "make_usb_transfer_event"));
    CHECK(contains(runtime_source, "event.report_id == transfer.report.report_id"));
    CHECK(contains(runtime_source, "event.length == transfer.report.length"));
    CHECK(contains(runtime_source, "DefaultKeyMode::Tap"));
    CHECK(contains(runtime_source, "enqueue_keyboard_pair"));
    CHECK(contains(runtime_source, "queue_.size() - queue_size_ < 2"));
    CHECK(contains(runtime_header, "tap_pressed_"));
    CHECK(contains(runtime_header, "keyboard_restore_pending"));
    CHECK(contains(main_source, "lifecycle_events.publish"));
    CHECK(!contains(main_source, "mount_pending"));
    CHECK(!contains(main_source, "unmount_pending"));
    CHECK(!contains(main_source, "resume_pending"));
    CHECK(!contains(main_source, "transfer_complete_pending"));
    CHECK(!contains(main_source, "transfer_failed_pending"));
    CHECK(contains(main_source, "input.discard_pending_events()"));
    CHECK(contains(main_source, "if (dropped_events != 0)"));
    CHECK(contains(main_source, "} else {\n            InputEvent event{};"));
    CHECK(contains(main_source, "tud_mount_cb"));
    CHECK(contains(main_source, "tud_umount_cb"));
    CHECK(contains(main_source, "ESP_LOGW(kLogTag, \"USB lifecycle queue recovered"));
    CHECK(!contains(main_source, "GPIO_NUM_0"));
    CHECK(!contains(main_source, "GPIO_NUM_8"));
    CHECK(!contains(main_source, "GPIO_NUM_12"));
    CHECK(!contains(main_source, "GPIO_NUM_43"));
    CHECK(!contains(main_source, "GPIO_NUM_44"));
    CHECK(contains(runtime_header, "kRawEdgeQueueCapacity = 64"));
    CHECK(contains(runtime_header, "kInputEventQueueCapacity = 32"));
    CHECK(contains(runtime_header, "kHidReportQueueCapacity = 16"));
    CHECK(contains(runtime_header, "kUsbLifecycleQueueCapacity = 16"));
    CHECK(contains(runtime_header, "kUsbDisconnectConfirmMs = 25"));
    CHECK(contains(runtime_header, "kUsbReleaseReassertIntervalMs = 25"));
    CHECK(contains(runtime_header, "kUsbReleaseReassertWindowMs = 500"));
    CHECK(contains(runtime_header, "UsbDeviceConnectionGate"));
    CHECK(contains(board_pins, "kUsbPhysicalPresenceGpio = 40"));
    CHECK(contains(board_pins, "kUsbPhysicalPresenceActiveLevel = 0"));
    CHECK(contains(board_pins, "kPeripheralPowerGpio = 8"));
    CHECK(contains(board_pins, "kLedDataGpio = 12"));
    CHECK(contains(board_pins, "kLedPixelCount = 5"));
    CHECK(contains(runtime_header, "UsbLifecycleEventQueue"));
    CHECK(contains(runtime_header, "kUsbInterfaceStringIndex = 0"));
    CHECK(contains(runtime_header, "kUsbDeviceDescriptor"));
    CHECK(contains(runtime_header, "kUsbConfigurationDescriptor"));
    CHECK(contains(runtime_header, "kUsbStringDescriptors"));
    CHECK(contains(input_core_header, "discard_pending_events()"));
    CHECK(contains(input_core_header, "stable_key_mask()"));
    CHECK(contains(runtime_source, "kHidReportDescriptor"));
    CHECK(contains(main_source, "kUsbDeviceDescriptor.data()"));
    CHECK(contains(main_source, "kUsbConfigurationDescriptor.data()"));
    CHECK(contains(main_source, "kUsbStringDescriptors.data()"));
    CHECK(!contains(main_source, "TUD_HID_DESCRIPTOR"));

    // T04 remains a fail-soft consumer of confirmed T03 events.
    CHECK(contains(main_source,
                   "runtime.on_input(event);\n                publish_led_feedback(event);"));
    CHECK(contains(main_source, "void led_feedback_task(void*)"));
    CHECK(contains(main_source, "xTaskCreate(led_feedback_task"));
    CHECK(contains(main_source, "LedFeedbackMailbox led_feedback_mailbox"));
    CHECK(contains(main_source, "led_feedback_diagnostics.record_init_failure()"));
    CHECK(contains(main_source, "led_feedback_diagnostics.record_tx_failure()"));
    CHECK(!contains(main_source, "publish_led_feedback(event);\n                runtime.on_input"));
    const size_t first_isr = main_source.find("void IRAM_ATTR encoder_edge_isr");
    const size_t after_isrs = main_source.find("static_assert", first_isr);
    CHECK(first_isr < after_isrs);
    CHECK(!contains(main_source.substr(first_isr, after_isrs - first_isr),
                    "strip.transmit"));
    CHECK(!contains(main_source.substr(first_isr, after_isrs - first_isr),
                    "publish_led_feedback"));
    CHECK(contains(led_feedback_header, "LedFeedbackDiagnosticsSnapshot"));
    CHECK(contains(led_feedback_header, "std::atomic_flag lock_"));
    CHECK(contains(led_feedback_source, "pending_.store(true"));
    CHECK(contains(led_feedback_source, "diagnostics.record_feedback_drop()"));

    // GPIO8 has one physical write site and is held high while Awake.
    CHECK(occurrences(power_source, "gpio_set_level(") == 2);
    CHECK(occurrences(power_source,
                      "gpio_set_level(static_cast<gpio_num_t>(kPeripheralPowerGpio)") == 1);
    const size_t preload_position = power_source.find("write_enable_latch(false)");
    const size_t safe_position = power_source.find("configure_safe_command_pins()",
                                                   preload_position);
    const size_t output_position = power_source.find("gpio_config(&power)", safe_position);
    const size_t enable_position = power_source.find("write_enable_latch(true)",
                                                     output_position);
    const size_t settle_position = power_source.find("vTaskDelay(settle_ticks())",
                                                     enable_position);
    CHECK(preload_position < safe_position);
    CHECK(safe_position < output_position);
    CHECK(output_position < enable_position);
    CHECK(enable_position < settle_position);
    CHECK(contains(power_source, "kPeripheralPowerSettleMs = 50"));
    CHECK(contains(power_source, "kSharedPowerCommandGpios"));
    CHECK(contains(power_source, "kSharedPowerInputGpio"));
    CHECK(contains(power_source, "GPIO_MODE_DISABLE"));
    CHECK(contains(power_source, "GPIO_PULLUP_DISABLE"));
    CHECK(contains(power_source, "GPIO_PULLDOWN_DISABLE"));
    CHECK(!contains(power_source, "i2s"));
    CHECK(!contains(main_source, "i2s"));
    CHECK(contains(power_header, "PeripheralPowerLeaseSet leases_"));
    CHECK(contains(power_header, "acquire_consumer"));
    CHECK(contains(power_header, "release_consumer"));
    CHECK(contains(power_lease_header, "enum class PeripheralPowerOwner"));
    CHECK(contains(power_lease_header, "KeyboardMic"));
    CHECK(contains(power_lease_header, "Speaker"));
    CHECK(contains(power_lease_header, "DeviceAwake"));
    CHECK(contains(power_lease_source, "held_mask_"));
    CHECK(contains(power_source,
                   "leases_.acquire(PeripheralPowerOwner::DeviceAwake)"));
    CHECK(contains(main_source, "PeripheralPowerController peripheral_power"));
    CHECK(contains(main_source,
                   "acquire_consumer(PeripheralPowerOwner::Led)"));

    // The five-pixel GRB RMT transfer is fixed-capacity and bounded.
    CHECK(contains(led_strip_source, "kRmtResolutionHz = 20'000'000"));
    CHECK(contains(led_strip_source, "kT0HighTicks = 6"));
    CHECK(contains(led_strip_source, "kT0LowTicks = 18"));
    CHECK(contains(led_strip_source, "kT1HighTicks = 16"));
    CHECK(contains(led_strip_source, "kT1LowTicks = 12"));
    CHECK(contains(led_strip_source, "kResetTicks = 6000"));
    CHECK(contains(led_strip_source,
                   "kWs2812SymbolCount = kLedPixelCount * 24u + 1u"));
    CHECK(contains(led_strip_source, "serialize_led_frame_grb(frame)"));
    CHECK(contains(led_strip_source, "std::array<rmt_symbol_word_t"));
    CHECK(contains(led_strip_source, "trans_queue_depth = 1"));
    CHECK(contains(led_strip_source, "rmt_tx_wait_all_done"));
    CHECK(contains(led_strip_source, "kRmtCompletionWaitMs"));
    CHECK(contains(led_strip_source, "rmt_disable(channel_)"));
    CHECK(!contains(led_strip_source, "new "));
    CHECK(!contains(led_strip_source, "malloc"));
    CHECK(contains(module_gitignore, "managed_components/"));
    CHECK(contains(manifest, "espressif/esp_tinyusb"));
    CHECK(contains(sdkconfig_defaults, "CONFIG_ESPTOOLPY_FLASHSIZE_16MB=y"));
    CHECK(contains(sdkconfig_defaults, "CONFIG_APP_REPRODUCIBLE_BUILD=y"));
    CHECK(contains(sdkconfig_defaults, "CONFIG_PARTITION_TABLE_CUSTOM=y"));
    CHECK(contains(sdkconfig_defaults,
                   "CONFIG_PARTITION_TABLE_CUSTOM_FILENAME=\"partitions.csv\""));
    CHECK(contains(sdkconfig_defaults, "CONFIG_PARTITION_TABLE_OFFSET=0x8000"));
    CHECK(contains(root_cmake, "deskmate_expected_partition_entries"));
    CHECK(contains(root_cmake, "DeskMate EasyInput partitions.csv drifted"));
    CHECK(normalize_partition_entries(partitions) ==
          "nvs,data,nvs,0x9000,0x6000,\n"
          "phy_init,data,phy,0xf000,0x1000,\n"
          "factory,app,factory,0x10000,0x300000,\n"
          "sound_a,0x40,0x00,0x310000,0x90000,\n"
          "sound_b,0x40,0x01,0x3a0000,0x90000,\n");

    if (failures != 0) {
        std::cerr << "firmware_source_contract_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "firmware_source_contract_tests: PASS\n";
    return 0;
}
