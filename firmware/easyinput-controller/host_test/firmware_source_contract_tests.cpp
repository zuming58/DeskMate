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
    CHECK(contains(root_cmake, "idf_build_set_property(MINIMAL_BUILD ON)"));
    CHECK(contains(main_source, "GPIO_INTR_ANYEDGE"));
    CHECK(contains(main_source, "xQueueCreateStatic"));
    CHECK(contains(main_source, "kRawEdgeQueueCapacity"));
    CHECK(contains(main_source, "xQueueReset(raw_edge_queue)"));
    CHECK(contains(main_source, "UsbLifecycleEventQueue lifecycle_events"));
    CHECK(contains(main_source, "process_usb_lifecycle_events"));
    CHECK(contains(main_source, "input.stable_key_mask()"));
    CHECK(contains(main_source, "prepare_hid_report"));
    CHECK(contains(main_source, "finish_hid_send_attempt"));
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
    CHECK(contains(module_gitignore, "managed_components/"));
    CHECK(contains(manifest, "espressif/esp_tinyusb"));
    CHECK(contains(sdkconfig_defaults, "CONFIG_ESPTOOLPY_FLASHSIZE_16MB=y"));
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
