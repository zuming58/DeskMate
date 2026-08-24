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

    CHECK(contains(main_source, "esp_timer_get_time()"));
    CHECK(contains(main_source, "monotonic_milliseconds"));
    CHECK(contains(main_source, "vTaskDelay(1)"));
    CHECK(contains(main_source, "ESP_ERROR_CHECK(gpio_config(&config))"));
    CHECK(!contains(main_source, "pdMS_TO_TICKS(1)"));
    CHECK(!contains(main_source, "tick++"));
    CHECK(contains(main_cmake, "esp_driver_gpio"));
    CHECK(contains(main_cmake, "esp_timer"));
    CHECK(contains(root_cmake, "idf_build_set_property(MINIMAL_BUILD ON)"));

    if (failures != 0) {
        std::cerr << "firmware_source_contract_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "firmware_source_contract_tests: PASS\n";
    return 0;
}
