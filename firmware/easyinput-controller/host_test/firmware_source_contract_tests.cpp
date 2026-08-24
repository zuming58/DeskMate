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
}  // namespace

int main() {
    const std::string main_source = read_all(MAIN_SOURCE_PATH);
    const std::string main_cmake = read_all(MAIN_CMAKE_PATH);
    const std::string root_cmake = read_all(ROOT_CMAKE_PATH);
    const std::string runtime_source = read_all(RUNTIME_SOURCE_PATH);
    const std::string runtime_header = read_all(RUNTIME_HEADER_PATH);
    const std::string manifest = read_all(MANIFEST_PATH);

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
    CHECK(contains(main_source, "tud_mount_cb"));
    CHECK(contains(main_source, "tud_umount_cb"));
    CHECK(!contains(main_source, "ESP_LOG"));
    CHECK(!contains(main_source, "GPIO_NUM_0"));
    CHECK(!contains(main_source, "GPIO_NUM_8"));
    CHECK(!contains(main_source, "GPIO_NUM_12"));
    CHECK(!contains(main_source, "GPIO_NUM_43"));
    CHECK(!contains(main_source, "GPIO_NUM_44"));
    CHECK(contains(runtime_header, "kRawEdgeQueueCapacity = 64"));
    CHECK(contains(runtime_header, "kInputEventQueueCapacity = 32"));
    CHECK(contains(runtime_header, "kHidReportQueueCapacity = 16"));
    CHECK(contains(runtime_source, "kHidReportDescriptor"));
    CHECK(contains(manifest, "espressif/esp_tinyusb"));

    if (failures != 0) {
        std::cerr << "firmware_source_contract_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "firmware_source_contract_tests: PASS\n";
    return 0;
}
