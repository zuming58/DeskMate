cmake_minimum_required(VERSION 3.16)
project(easyinput_host_test LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()
add_executable(host_action_core_tests
    host_action_core_tests.cpp
    ../components/input_core/src/host_action_core.cpp
)
target_include_directories(host_action_core_tests PRIVATE ../components/input_core/include)
add_test(NAME host_action_core_tests COMMAND host_action_core_tests)

add_executable(deskmate_link_core_tests
    deskmate_link_core_tests.cpp
    ../components/input_core/src/deskmate_link_core.cpp
)
target_include_directories(deskmate_link_core_tests PRIVATE ../components/input_core/include)
add_test(NAME deskmate_link_core_tests COMMAND deskmate_link_core_tests)

add_executable(input_core_tests input_core_tests.cpp ../components/input_core/src/input_core.cpp ../components/input_core/src/hid_report.cpp)
target_include_directories(input_core_tests PRIVATE ../components/input_core/include)
add_test(NAME input_core_tests COMMAND input_core_tests)

add_executable(input_runtime_tests
    input_runtime_tests.cpp
    ../components/input_core/src/input_runtime.cpp
    ../components/input_core/src/input_core.cpp
    ../components/input_core/src/hid_report.cpp
    ../components/input_core/src/config_core.cpp
    ../components/input_core/src/host_action_core.cpp
    ../components/input_core/src/deskmate_link_core.cpp
)
target_include_directories(input_runtime_tests PRIVATE ../components/input_core/include)
add_test(NAME input_runtime_tests COMMAND input_runtime_tests)

add_executable(led_feedback_tests
    led_feedback_tests.cpp
    ../components/input_core/src/led_feedback.cpp
    ../components/input_core/src/input_runtime.cpp
    ../components/input_core/src/input_core.cpp
    ../components/input_core/src/hid_report.cpp
    ../components/input_core/src/host_action_core.cpp
)
target_include_directories(led_feedback_tests PRIVATE ../components/input_core/include)
add_test(NAME led_feedback_tests COMMAND led_feedback_tests)

add_executable(peripheral_power_lease_tests
    peripheral_power_lease_tests.cpp
    ../components/input_core/src/peripheral_power_lease.cpp
)
target_include_directories(peripheral_power_lease_tests PRIVATE ../components/input_core/include)
add_test(NAME peripheral_power_lease_tests COMMAND peripheral_power_lease_tests)

add_executable(config_core_tests config_core_tests.cpp ../components/input_core/src/config_core.cpp ../components/input_core/src/host_action_core.cpp ../components/input_core/src/deskmate_link_core.cpp)
target_include_directories(config_core_tests PRIVATE ../components/input_core/include)
add_test(NAME config_core_tests COMMAND config_core_tests)

add_executable(firmware_source_contract_tests firmware_source_contract_tests.cpp)
target_compile_definitions(firmware_source_contract_tests PRIVATE
    MAIN_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/main.cpp"
    MAIN_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/CMakeLists.txt"
    ROOT_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../CMakeLists.txt"
    RUNTIME_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/input_runtime.cpp"
    RUNTIME_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/input_runtime.h"
    INPUT_CORE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/input_core.h"
    BOARD_PINS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/board_pins.h"
    LED_FEEDBACK_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/led_feedback.h"
    LED_FEEDBACK_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/led_feedback.cpp"
    LED_STRIP_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/led_strip.cpp"
    POWER_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/peripheral_power.cpp"
    POWER_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/peripheral_power.h"
    POWER_LEASE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/peripheral_power_lease.h"
    POWER_LEASE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/peripheral_power_lease.cpp"
    MODULE_GITIGNORE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../.gitignore"
    MANIFEST_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/idf_component.yml"
    SDKCONFIG_DEFAULTS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../sdkconfig.defaults"
    PARTITIONS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../partitions.csv"
    CONFIG_STORE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/config_store.cpp"
    CONFIG_STORE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/config_store.h"
    CONFIG_CORE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/config_core.h"
    CONFIG_CORE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/config_core.cpp"
    LINK_CORE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/deskmate_link_core.h"
    LINK_CORE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/deskmate_link_core.cpp"
    LINK_UART_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/deskmate_link_uart.cpp"
    LINK_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/v1.md"
    LINK_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-v1.json"
)
add_test(NAME firmware_source_contract_tests COMMAND firmware_source_contract_tests)
