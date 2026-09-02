cmake_minimum_required(VERSION 3.16)
project(easyinput_host_test LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()
add_executable(audio_io_arbiter_tests
    audio_io_arbiter_tests.cpp
    ../components/input_core/src/audio_io_arbiter.cpp
)
target_include_directories(audio_io_arbiter_tests PRIVATE ../components/input_core/include)
add_test(NAME audio_io_arbiter_tests COMMAND audio_io_arbiter_tests)

add_executable(speaker_output_core_tests
    speaker_output_core_tests.cpp
    ../components/input_core/src/speaker_output_core.cpp
)
target_include_directories(speaker_output_core_tests PRIVATE ../components/input_core/include)
add_test(NAME speaker_output_core_tests COMMAND speaker_output_core_tests)

add_executable(audio_capture_core_tests
    audio_capture_core_tests.cpp
    ../components/input_core/src/audio_capture_core.cpp
)
target_include_directories(audio_capture_core_tests PRIVATE ../components/input_core/include)
add_test(NAME audio_capture_core_tests COMMAND audio_capture_core_tests)

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

add_executable(agent_state_core_tests
    agent_state_core_tests.cpp
    ../components/input_core/src/agent_state_core.cpp
)
target_include_directories(agent_state_core_tests PRIVATE ../components/input_core/include)
add_test(NAME agent_state_core_tests COMMAND agent_state_core_tests)

add_executable(manual_calibration_bridge_core_tests
    manual_calibration_bridge_core_tests.cpp
    ../components/input_core/src/manual_calibration_bridge_core.cpp
    ../components/input_core/src/deskmate_link_core.cpp
)
target_include_directories(manual_calibration_bridge_core_tests PRIVATE ../components/input_core/include)
target_compile_definitions(manual_calibration_bridge_core_tests PRIVATE
    HOST_MANUAL_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-host/golden-vectors-easyinput-manual-calibration-v1.json"
    LINK_MANUAL_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-t10c-manual-calibration-v1.json"
)
add_test(NAME manual_calibration_bridge_core_tests COMMAND manual_calibration_bridge_core_tests)

add_executable(motion_preset_bridge_core_tests
    motion_preset_bridge_core_tests.cpp
    ../components/input_core/src/motion_preset_bridge_core.cpp
    ../components/input_core/src/deskmate_link_core.cpp
)
target_include_directories(motion_preset_bridge_core_tests PRIVATE ../components/input_core/include)
target_compile_definitions(motion_preset_bridge_core_tests PRIVATE
    HOST_MOTION_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-host/golden-vectors-easyinput-motion-presets-v1.json"
    LINK_MOTION_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-t15-motion-presets-v1.json"
)
add_test(NAME motion_preset_bridge_core_tests COMMAND motion_preset_bridge_core_tests)

add_executable(input_core_tests input_core_tests.cpp ../components/input_core/src/input_core.cpp ../components/input_core/src/hid_report.cpp)
target_include_directories(input_core_tests PRIVATE ../components/input_core/include)
add_test(NAME input_core_tests COMMAND input_core_tests)

add_executable(input_runtime_tests
    input_runtime_tests.cpp
    ../components/input_core/src/input_runtime.cpp
    ../components/input_core/src/input_core.cpp
    ../components/input_core/src/hid_report.cpp
    ../components/input_core/src/config_core.cpp
    ../components/input_core/src/audio_capture_core.cpp
    ../components/input_core/src/host_action_core.cpp
    ../components/input_core/src/deskmate_link_core.cpp
    ../components/input_core/src/speaker_output_core.cpp
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

add_executable(config_core_tests config_core_tests.cpp ../components/input_core/src/config_core.cpp ../components/input_core/src/host_action_core.cpp ../components/input_core/src/deskmate_link_core.cpp ../components/input_core/src/audio_capture_core.cpp ../components/input_core/src/speaker_output_core.cpp)
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
    MANUAL_BRIDGE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/manual_calibration_bridge_core.h"
    MANUAL_BRIDGE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/manual_calibration_bridge_core.cpp"
    MANUAL_HOST_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-host/easyinput-manual-calibration-v1.md"
    MANUAL_HOST_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-host/golden-vectors-easyinput-manual-calibration-v1.json"
    MANUAL_LINK_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/t10c-manual-calibration-v1.md"
    MOTION_BRIDGE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/motion_preset_bridge_core.h"
    MOTION_BRIDGE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/motion_preset_bridge_core.cpp"
    MOTION_HOST_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-host/easyinput-motion-presets-v1.md"
    MOTION_HOST_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-host/golden-vectors-easyinput-motion-presets-v1.json"
    MOTION_LINK_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/t15-motion-presets-v1.md"
    MOTION_LINK_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-t15-motion-presets-v1.json"
    AUDIO_CORE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/audio_capture_core.h"
    AUDIO_CORE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/audio_capture_core.cpp"
    AUDIO_SERVICE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/audio_capture_service.h"
    AUDIO_SERVICE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/audio_capture_service.cpp"
    AUDIO_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../docs/contracts/easyinput-audio-capture-v1.md"
    SPEAKER_CORE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/speaker_output_core.h"
    SPEAKER_CORE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/speaker_output_core.cpp"
    SPEAKER_SERVICE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/speaker_output_service.h"
    SPEAKER_SERVICE_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/speaker_output_service.cpp"
    SPEAKER_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../docs/contracts/easyinput-speaker-output-v1.md"
)
add_test(NAME firmware_source_contract_tests COMMAND firmware_source_contract_tests)
