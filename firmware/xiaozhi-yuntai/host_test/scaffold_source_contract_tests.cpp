#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace {

int failures = 0;

void Check(bool passed, const char* expression, int line) {
    if (passed) return;
    std::cerr << "line " << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

#define CHECK(expression) Check((expression), #expression, __LINE__)

std::string ReadAll(const char* path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        std::cerr << "unable to read " << path << '\n';
        ++failures;
        return {};
    }
    std::ostringstream output;
    output << input.rdbuf();
    return output.str();
}

bool Contains(const std::string& text, const char* token) {
    return text.find(token) != std::string::npos;
}

std::size_t Occurrences(const std::string& text, const char* token) {
    std::size_t count = 0;
    std::size_t position = 0;
    while ((position = text.find(token, position)) != std::string::npos) {
        ++count;
        position += std::string(token).size();
    }
    return count;
}

}  // namespace

int main() {
    const auto root_cmake = ReadAll(ROOT_CMAKE_PATH);
    const auto main_cmake = ReadAll(MAIN_CMAKE_PATH);
    const auto main_source = ReadAll(MAIN_SOURCE_PATH);
    const auto uart_source = ReadAll(UART_SOURCE_PATH);
    const auto uart_header = ReadAll(UART_HEADER_PATH);
    const auto pinout_header = ReadAll(PINOUT_HEADER_PATH);
    const auto model_header = ReadAll(MODEL_HEADER_PATH);
    const auto model_source = ReadAll(MODEL_SOURCE_PATH);
    const auto protocol_header = ReadAll(PROTOCOL_HEADER_PATH);
    const auto protocol_source = ReadAll(PROTOCOL_SOURCE_PATH);
    const auto endpoint_header = ReadAll(ENDPOINT_HEADER_PATH);
    const auto endpoint_source = ReadAll(ENDPOINT_SOURCE_PATH);
    const auto owner_header = ReadAll(OWNER_HEADER_PATH);
    const auto owner_source = ReadAll(OWNER_SOURCE_PATH);
    const auto display_header = ReadAll(DISPLAY_HEADER_PATH);
    const auto display_source = ReadAll(DISPLAY_SOURCE_PATH);
    const auto motion_header = ReadAll(MOTION_HEADER_PATH);
    const auto motion_source = ReadAll(MOTION_SOURCE_PATH);
    const auto manual_owner_header = ReadAll(MANUAL_OWNER_HEADER_PATH);
    const auto manual_owner_source = ReadAll(MANUAL_OWNER_SOURCE_PATH);
    const auto manual_protocol_header = ReadAll(MANUAL_PROTOCOL_HEADER_PATH);
    const auto manual_protocol_source = ReadAll(MANUAL_PROTOCOL_SOURCE_PATH);
    const auto servo_adapter_header = ReadAll(SERVO_ADAPTER_HEADER_PATH);
    const auto servo_adapter_source = ReadAll(SERVO_ADAPTER_SOURCE_PATH);
    const auto oled_header = ReadAll(OLED_HEADER_PATH);
    const auto oled_source = ReadAll(OLED_SOURCE_PATH);
    const auto transport_header = ReadAll(TRANSPORT_HEADER_PATH);
    const auto sdkconfig_defaults = ReadAll(SDKCONFIG_DEFAULTS_PATH);
    const auto partition_table = ReadAll(PARTITION_TABLE_PATH);
    const auto module_gitignore = ReadAll(MODULE_GITIGNORE_PATH);
    const auto link_contract = ReadAll(LINK_CONTRACT_PATH);
    const auto link_vectors = ReadAll(LINK_VECTORS_PATH);
    const auto t10c_link_contract = ReadAll(T10C_LINK_CONTRACT_PATH);
    const auto t10c_link_vectors = ReadAll(T10C_LINK_VECTORS_PATH);

    CHECK(Contains(root_cmake, "set(IDF_TARGET esp32s3)"));
    CHECK(Contains(root_cmake, "idf_build_set_property(MINIMAL_BUILD ON)"));
    CHECK(Contains(root_cmake, "CONFIG_ESP_CONSOLE_NONE"));
    CHECK(Contains(root_cmake, "CONFIG_BOOTLOADER_LOG_LEVEL_NONE"));
    CHECK(Contains(root_cmake, "CONFIG_LOG_DEFAULT_LEVEL_NONE"));
    CHECK(Contains(root_cmake, "CONFIG_PARTITION_TABLE_CUSTOM"));
    CHECK(Contains(root_cmake, "partitions/v1/16m.csv"));
    CHECK(Contains(main_cmake, "deskmate_link_uart.cpp"));
    CHECK(Contains(main_cmake, "deskmate_oled.cpp"));
    CHECK(Contains(main_cmake, "esp_driver_i2c"));
    CHECK(Contains(main_cmake, "esp_driver_uart"));
    CHECK(Contains(main_cmake, "esp_lcd"));

    CHECK(Contains(sdkconfig_defaults, "CONFIG_IDF_TARGET=\"esp32s3\""));
    CHECK(Contains(sdkconfig_defaults, "CONFIG_ESP_CONSOLE_NONE=y"));
    CHECK(Contains(sdkconfig_defaults,
                   "CONFIG_ESP_CONSOLE_SECONDARY_NONE=y"));
    CHECK(Contains(sdkconfig_defaults,
                   "CONFIG_BOOTLOADER_LOG_LEVEL_NONE=y"));
    CHECK(Contains(sdkconfig_defaults, "CONFIG_LOG_DEFAULT_LEVEL_NONE=y"));
    CHECK(Contains(sdkconfig_defaults, "CONFIG_LOG_MAXIMUM_EQUALS_DEFAULT=y"));
    CHECK(Contains(sdkconfig_defaults,
                   "CONFIG_PARTITION_TABLE_CUSTOM=y"));
    CHECK(Contains(sdkconfig_defaults,
                   "CONFIG_PARTITION_TABLE_CUSTOM_FILENAME=\"partitions/v1/16m.csv\""));
    CHECK(!Contains(sdkconfig_defaults, "CONFIG_ESP_CONSOLE_UART_DEFAULT=y"));
    CHECK(!Contains(sdkconfig_defaults, "CONFIG_ESP_CONSOLE_UART_CUSTOM=y"));
    CHECK(!Contains(sdkconfig_defaults, "CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG=y"));
    CHECK(Contains(partition_table,
                   "nvs,      data, nvs,     0x9000,    0x4000,"));
    CHECK(Contains(partition_table,
                   "otadata,  data, ota,     0xd000,    0x2000,"));
    CHECK(Contains(partition_table,
                   "phy_init, data, phy,     0xf000,    0x1000,"));
    CHECK(Contains(partition_table,
                   "model,    data, spiffs,  0x10000,   0xF0000,"));
    CHECK(Contains(partition_table,
                   "ota_0,    app,  ota_0,   0x100000,  6M,"));
    CHECK(Contains(partition_table,
                   "ota_1,    app,  ota_1,   0x700000,  6M,"));

    CHECK(Contains(protocol_header, "kLinkMaxPayloadBytes = 128"));
    CHECK(Contains(protocol_header, "kLinkInterByteTimeoutMs = 100"));
    CHECK(Contains(protocol_source, "LinkCrc16CcittFalse"));
    CHECK(Contains(protocol_source, "0x1021u"));
    CHECK(Contains(protocol_source, "0xffffu"));
    CHECK(Contains(endpoint_header, "kCacheEntries = 8"));
    CHECK(Contains(endpoint_source, "LinkErrorCode::kSequenceConflict"));
    CHECK(Contains(endpoint_source, "controller_restarts"));
    CHECK(Contains(endpoint_header, "kBaseCapabilities"));
    CHECK(Contains(endpoint_header, "kCapabilityDisplay"));
    CHECK(Contains(endpoint_source, "ImplementedCapabilities"));
    CHECK(Contains(endpoint_source, "EnabledCapabilities"));
    CHECK(Contains(endpoint_source, "DisplayAcceptResult::kBusy"));
    CHECK(Contains(endpoint_source, "DisplayAcceptResult::kNotReady"));
    CHECK(Contains(endpoint_source, "kManualCalibrationCommand"));
    CHECK(Contains(endpoint_source, "kGetManualCalibrationStatus"));
    CHECK(Contains(owner_header, "kReadChunkBytes = 64"));
    CHECK(Contains(owner_header, "kMaxReadsPerService = 4"));
    CHECK(Occurrences(owner_source, "transport_.Send(") == 1);

    CHECK(Contains(uart_source,
                   "constexpr uart_port_t kDeskMateLinkUart = UART_NUM_0"));
    CHECK(Contains(uart_source, "kDeskMateLinkBaud = 115200"));
    CHECK(Contains(uart_source, "UART_DATA_8_BITS"));
    CHECK(Contains(uart_source, "UART_PARITY_DISABLE"));
    CHECK(Contains(uart_source, "UART_STOP_BITS_1"));
    CHECK(Contains(uart_source, "UART_HW_FLOWCTRL_DISABLE"));
    CHECK(Contains(uart_source, "kDeskMateLinkRxBufferBytes = 512"));
    CHECK(Contains(uart_source, "UART_FIFO_OVF"));
    CHECK(Contains(uart_source, "UART_BUFFER_FULL"));
    CHECK(Occurrences(uart_source, "uart_write_bytes(") == 1);
    CHECK(Occurrences(uart_source, "uart_driver_delete(") == 1);
    CHECK(Occurrences(uart_source, "xTaskCreate(") == 1);
    CHECK(Contains(uart_source, "kHardwarePinoutBlocked"));
    CHECK(Contains(uart_source, "PlanBoardLinkUartInstall"));
    CHECK(Contains(pinout_header, "kBoardLinkPinout"));
    CHECK(Contains(pinout_header, "true,"));
    CHECK(Contains(pinout_header, "43,"));
    CHECK(Contains(pinout_header, "44,"));
    CHECK(Contains(pinout_header, "install_allowed"));
    CHECK(Contains(uart_header, "kHardwarePinoutBlocked"));
    CHECK(Contains(main_source, "InitializeDeskMateDisplayOwner()"));
    CHECK(Contains(main_source, "XiaozhiLinkEndpoint endpoint(display_owner)"));
    CHECK(Contains(main_source, "StartDeskMateLinkUart(endpoint)"));
    CHECK(Contains(main_source, "StartDeskMateDisplayOwnerTask()"));
    const auto display_initialize_position =
        main_source.find("InitializeDeskMateDisplayOwner()");
    const auto link_start_position =
        main_source.find("StartDeskMateLinkUart(endpoint)");
    const auto display_task_position =
        main_source.find("StartDeskMateDisplayOwnerTask()");
    CHECK(display_initialize_position != std::string::npos);
    CHECK(link_start_position != std::string::npos);
    CHECK(display_task_position != std::string::npos);
    CHECK(display_initialize_position < link_start_position);
    CHECK(link_start_position < display_task_position);
    CHECK(Contains(main_source, "LinkUartStartResult::kStarted"));
    CHECK(Contains(main_source, "AgentState::kError"));
    CHECK(!Contains(main_source, "uart_"));

    CHECK(Contains(display_header, "kMailboxCapacity = 1"));
    CHECK(Contains(display_header, "kBlinkMinIntervalMs = 3600"));
    CHECK(Contains(display_header, "kBlinkMaxIntervalMs = 6400"));
    CHECK(Contains(display_header, "kBlinkClosedMs = 120"));
    CHECK(Contains(display_header, "DisplayAcceptResult"));
    CHECK(Contains(display_source, "SelectAgentScene"));
    CHECK(Contains(display_source, "AgentScene::kNeutralBlink"));
    CHECK(Contains(display_source, "latest_replacements"));
    CHECK(Contains(display_source, "AgentScene::kAngry"));
    CHECK(!Contains(display_source,
                    "return {AgentScene::kAngry"));
    CHECK(Contains(display_source, "ResetSession"));
    CHECK(Contains(oled_header, "InitializeDeskMateDisplayOwner"));
    CHECK(Contains(oled_header, "StartDeskMateDisplayOwnerTask"));
    CHECK(Contains(oled_source, "I2C_NUM_0"));
    CHECK(Contains(oled_source, "GPIO_NUM_41"));
    CHECK(Contains(oled_source, "GPIO_NUM_42"));
    CHECK(!Contains(oled_source, "GPIO_NUM_11"));
    CHECK(!Contains(oled_source, "GPIO_NUM_12"));
    CHECK(Contains(oled_source, "0x3c"));
    CHECK(Contains(oled_source, "esp_lcd_new_panel_ssd1306"));
    CHECK(Contains(oled_source, "esp_lcd_panel_mirror(panel_, true, true)"));
    CHECK(Occurrences(oled_source, "esp_lcd_panel_draw_bitmap(") == 1);
    CHECK(Occurrences(oled_source, "xTaskCreate(") == 1);
    CHECK(Contains(oled_source, "WaitingIndicator"));
    CHECK(Contains(oled_source, "AgentScene::kNeutralBlink"));

    const auto link_production = main_source + uart_source + model_header +
                            model_source + protocol_header + protocol_source +
                            endpoint_header + endpoint_source + owner_header +
                            owner_source + display_header + display_source +
                            transport_header;
    const auto production = link_production + oled_header + oled_source;
    const auto motion_production = motion_header + motion_source;
    CHECK(!Contains(production, "ESP_LOG"));
    CHECK(!Contains(link_production, "esp_lcd"));
    CHECK(!Contains(production, "driver/ledc"));
    CHECK(!Contains(production, "ledc_"));
    CHECK(!Contains(motion_production, "driver/ledc"));
    CHECK(!Contains(motion_production, "ledc_"));
    CHECK(!Contains(motion_production, "GPIO_NUM_"));
    CHECK(!Contains(main_source, "MotionSafetyCore"));
    CHECK(!Contains(main_source, "ManualCalibrationOwner"));
    CHECK(!Contains(main_source, "ServoAdapter"));
    CHECK(Contains(motion_header, "kEmergencyStopped"));
    CHECK(Contains(motion_header, "power_path_verified"));
    CHECK(Contains(motion_header, "direction_verified"));
    CHECK(Contains(motion_header, "limits_verified"));
    CHECK(Contains(motion_source, "MotionSource::kRecovery"));
    CHECK(Contains(motion_source, "ClearPending"));
    const auto manual_candidate = manual_owner_header + manual_owner_source +
                                  manual_protocol_header +
                                  manual_protocol_source +
                                  servo_adapter_header + servo_adapter_source;
    CHECK(Contains(servo_adapter_header, "kYawGpio = 11"));
    CHECK(Contains(servo_adapter_header, "kPitchGpio = 12"));
    CHECK(Contains(servo_adapter_header, "kFrequencyHz = 50"));
    CHECK(Contains(servo_adapter_header,
                   "kReferenceBoardMapDocumented = true"));
    CHECK(Contains(servo_adapter_header,
                   "kInstalledMappingVerified = false"));
    CHECK(Contains(servo_adapter_header, "kInstallationAllowed = false"));
    CHECK(Contains(manual_owner_header,
                   "kManualCalibrationMaximumStepTenthsDegree = 10"));
    CHECK(Contains(manual_owner_header,
                   "kManualCalibrationMaximumArmTtlMs = 5000"));
    CHECK(Contains(manual_owner_source, "adapter_.DisableOutputs()"));
    CHECK(Contains(manual_owner_source, "normal_motion_.EmergencyStop()"));
    CHECK(!Contains(manual_candidate, "driver/ledc"));
    CHECK(!Contains(manual_candidate, "ledc_"));
    CHECK(!Contains(manual_candidate, "GPIO_NUM_"));
    CHECK(!Contains(manual_candidate, "uart_"));
    CHECK(!Contains(production, "driver/i2s"));
    CHECK(!Contains(production, "i2s_"));
    CHECK(!Contains(production, "esp_codec"));
    CHECK(!Contains(production, "uart_write_bytes") ||
          Occurrences(production, "uart_write_bytes") == 1);
    CHECK(Contains(model_source, "CapabilityGate::kReady"));
    CHECK(Occurrences(model_source, "CapabilityGate::kReady") >= 3);
    CHECK(Contains(model_source, "CapabilityGate::kDisabledByProduct"));
    CHECK(Contains(model_source, "ContractState::kFrozen"));
    CHECK(Contains(model_source, "RuntimeState::kProtocolReady"));

    CHECK(Contains(link_contract, "DESKMATE_LINK_V1_FROZEN"));
    CHECK(Contains(link_contract, "CRC16-CCITT-FALSE"));
    CHECK(Contains(link_vectors,
                   "444D4C4B01010100010000000700010101443322118228"));
    CHECK(Contains(t10c_link_contract,
                   "T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN"));
    CHECK(Contains(t10c_link_contract,
                   "MOTION` capability bit 3 remains clear"));
    CHECK(Contains(t10c_link_vectors,
                   "444D4C4B0101200024000000130044332211050000008977665503000100000000342C"));
    CHECK(Contains(module_gitignore, "build/"));
    CHECK(Contains(module_gitignore, "*.bin"));

    if (failures != 0) {
        std::cerr << "scaffold_source_contract_tests: " << failures
                  << " failure(s)\n";
        return 1;
    }
    std::cout << "scaffold_source_contract_tests: PASS\n";
    return 0;
}
