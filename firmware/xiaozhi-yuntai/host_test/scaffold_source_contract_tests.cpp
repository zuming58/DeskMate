#include <cassert>
#include <fstream>
#include <initializer_list>
#include <sstream>
#include <string>

namespace {

std::string ReadFile(const char* path) {
    std::ifstream input(path, std::ios::binary);
    assert(input.good());
    std::ostringstream output;
    output << input.rdbuf();
    return output.str();
}

void RequireContains(const std::string& text, const char* token) {
    assert(text.find(token) != std::string::npos);
}

void RequireAbsent(const std::string& text, std::initializer_list<const char*> tokens) {
    for (const auto* token : tokens) {
        assert(text.find(token) == std::string::npos);
    }
}

}  // namespace

int main() {
    const auto root_cmake = ReadFile(ROOT_CMAKE_PATH);
    const auto main_cmake = ReadFile(MAIN_CMAKE_PATH);
    const auto main_source = ReadFile(MAIN_SOURCE_PATH);
    const auto model_header = ReadFile(MODEL_HEADER_PATH);
    const auto model_source = ReadFile(MODEL_SOURCE_PATH);
    const auto transport_header = ReadFile(TRANSPORT_HEADER_PATH);
    const auto sdkconfig_defaults = ReadFile(SDKCONFIG_DEFAULTS_PATH);
    const auto module_gitignore = ReadFile(MODULE_GITIGNORE_PATH);

    RequireContains(root_cmake, "set(IDF_TARGET esp32s3)");
    RequireContains(root_cmake, "idf_build_set_property(MINIMAL_BUILD ON)");
    RequireContains(main_cmake, "REQUIRES endpoint_core");
    RequireContains(sdkconfig_defaults, "CONFIG_IDF_TARGET=\"esp32s3\"");
    RequireContains(sdkconfig_defaults, "CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG=y");
    RequireContains(sdkconfig_defaults, "CONFIG_ESP_CONSOLE_SECONDARY_NONE=y");
    RequireAbsent(sdkconfig_defaults,
                  {"CONFIG_ESP_CONSOLE_UART_DEFAULT=y", "CONFIG_ESP_CONSOLE_UART_CUSTOM=y"});
    RequireContains(module_gitignore, "build/");
    RequireContains(module_gitignore, "*.bin");

    const auto production_sources = main_source + model_header + model_source + transport_header;
    RequireAbsent(production_sources,
                  {"driver/uart",
                   "uart_set_pin",
                   "UART_NUM_",
                   "GPIO_NUM_",
                   "driver/i2s",
                   "i2s_",
                   "esp_codec",
                   "esp_lcd",
                   "driver/ledc",
                   "ledc_",
                   "magic",
                   "crc",
                   "message_id",
                   "frame_header",
                   "baud",
                   "retry",
                   "timeout"});

    RequireContains(model_source, "CapabilityGate::kPendingValidation");
    RequireContains(model_source, "CapabilityGate::kLocked");
    RequireContains(model_source, "CapabilityGate::kDisabledByProduct");
    RequireContains(model_source, "ContractState::kNotFrozen");
    RequireContains(model_source, "RuntimeState::kScaffoldOnly");
    return 0;
}
