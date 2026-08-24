cmake_minimum_required(VERSION 3.16)
project(easyinput_host_test LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()
add_executable(input_core_tests input_core_tests.cpp ../components/input_core/src/input_core.cpp ../components/input_core/src/hid_report.cpp)
target_include_directories(input_core_tests PRIVATE ../components/input_core/include)
add_test(NAME input_core_tests COMMAND input_core_tests)

add_executable(firmware_source_contract_tests firmware_source_contract_tests.cpp)
target_compile_definitions(firmware_source_contract_tests PRIVATE
    MAIN_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/main.cpp"
    MAIN_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/CMakeLists.txt"
    ROOT_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../CMakeLists.txt"
)
add_test(NAME firmware_source_contract_tests COMMAND firmware_source_contract_tests)
