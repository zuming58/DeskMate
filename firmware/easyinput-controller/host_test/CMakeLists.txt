cmake_minimum_required(VERSION 3.16)
project(easyinput_host_test LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()
add_executable(input_core_tests input_core_tests.cpp ../components/input_core/src/input_core.cpp ../components/input_core/src/hid_report.cpp)
target_include_directories(input_core_tests PRIVATE ../components/input_core/include)
add_test(NAME input_core_tests COMMAND input_core_tests)

add_executable(input_runtime_tests
    input_runtime_tests.cpp
    ../components/input_core/src/input_runtime.cpp
    ../components/input_core/src/input_core.cpp
    ../components/input_core/src/hid_report.cpp
)
target_include_directories(input_runtime_tests PRIVATE ../components/input_core/include)
add_test(NAME input_runtime_tests COMMAND input_runtime_tests)

add_executable(firmware_source_contract_tests firmware_source_contract_tests.cpp)
target_compile_definitions(firmware_source_contract_tests PRIVATE
    MAIN_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/main.cpp"
    MAIN_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/CMakeLists.txt"
    ROOT_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../CMakeLists.txt"
    RUNTIME_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/src/input_runtime.cpp"
    RUNTIME_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/input_runtime.h"
    INPUT_CORE_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/input_core.h"
    BOARD_PINS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/input_core/include/board_pins.h"
    MODULE_GITIGNORE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../.gitignore"
    MANIFEST_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/idf_component.yml"
    SDKCONFIG_DEFAULTS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../sdkconfig.defaults"
    PARTITIONS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../partitions.csv"
)
add_test(NAME firmware_source_contract_tests COMMAND firmware_source_contract_tests)
