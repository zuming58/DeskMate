cmake_minimum_required(VERSION 3.16)
project(xiaozhi_endpoint_host_test LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()

set(CORE_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/include")
set(CORE_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/endpoint_model.cpp")

add_executable(endpoint_model_tests endpoint_model_tests.cpp "${CORE_SOURCE}")
target_include_directories(endpoint_model_tests PRIVATE "${CORE_INCLUDE_DIR}")
add_test(NAME endpoint_model_tests COMMAND endpoint_model_tests)

add_executable(fake_uart_tests fake_uart_tests.cpp fake_uart.cpp)
target_include_directories(fake_uart_tests PRIVATE "${CORE_INCLUDE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}")
add_test(NAME fake_uart_tests COMMAND fake_uart_tests)

add_executable(scaffold_source_contract_tests scaffold_source_contract_tests.cpp)
target_compile_definitions(scaffold_source_contract_tests PRIVATE
    ROOT_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../CMakeLists.txt"
    MAIN_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/CMakeLists.txt"
    MAIN_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/main.cpp"
    MODEL_HEADER_PATH="${CORE_INCLUDE_DIR}/endpoint_model.h"
    MODEL_SOURCE_PATH="${CORE_SOURCE}"
    TRANSPORT_HEADER_PATH="${CORE_INCLUDE_DIR}/transport.h"
    SDKCONFIG_DEFAULTS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../sdkconfig.defaults"
    MODULE_GITIGNORE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../.gitignore"
)
add_test(NAME scaffold_source_contract_tests COMMAND scaffold_source_contract_tests)
