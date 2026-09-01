cmake_minimum_required(VERSION 3.16)
project(xiaozhi_endpoint_host_test LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()

set(CORE_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/include")
set(CORE_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/display_owner.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/endpoint_model.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/link_endpoint.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/link_protocol.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/link_uart_owner.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/manual_calibration_owner.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/manual_calibration_protocol.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/motion_safety_core.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/servo_adapter.cpp"
)

add_executable(motion_safety_core_tests
    motion_safety_core_tests.cpp
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/motion_safety_core.cpp"
)
target_include_directories(motion_safety_core_tests PRIVATE "${CORE_INCLUDE_DIR}")
if(MSVC)
    target_compile_options(motion_safety_core_tests PRIVATE /W4 /WX)
else()
    target_compile_options(motion_safety_core_tests PRIVATE
        -Wall -Wextra -Wpedantic -Werror
    )
endif()
add_test(NAME motion_safety_core_tests COMMAND motion_safety_core_tests)

add_executable(manual_calibration_owner_tests
    manual_calibration_owner_tests.cpp
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/manual_calibration_owner.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/motion_safety_core.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/servo_adapter.cpp"
)
target_include_directories(manual_calibration_owner_tests PRIVATE
    "${CORE_INCLUDE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}"
)
if(MSVC)
    target_compile_options(manual_calibration_owner_tests PRIVATE /W4 /WX)
else()
    target_compile_options(manual_calibration_owner_tests PRIVATE
        -Wall -Wextra -Wpedantic -Werror
    )
endif()
add_test(NAME manual_calibration_owner_tests
    COMMAND manual_calibration_owner_tests
)

add_executable(manual_calibration_link_tests
    manual_calibration_link_tests.cpp ${CORE_SOURCES}
)
target_include_directories(manual_calibration_link_tests PRIVATE
    "${CORE_INCLUDE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}"
)
target_compile_definitions(manual_calibration_link_tests PRIVATE
    T10C_GOLDEN_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-t10c-manual-calibration-v1.json"
)
add_test(NAME manual_calibration_link_tests
    COMMAND manual_calibration_link_tests
)

add_executable(display_owner_tests
    display_owner_tests.cpp
    "${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/display_owner.cpp"
)
target_include_directories(display_owner_tests PRIVATE "${CORE_INCLUDE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}")
add_test(NAME display_owner_tests COMMAND display_owner_tests)

add_executable(endpoint_model_tests endpoint_model_tests.cpp ${CORE_SOURCES})
target_include_directories(endpoint_model_tests PRIVATE "${CORE_INCLUDE_DIR}")
add_test(NAME endpoint_model_tests COMMAND endpoint_model_tests)

add_executable(fake_uart_tests fake_uart_tests.cpp fake_uart.cpp)
target_include_directories(fake_uart_tests PRIVATE "${CORE_INCLUDE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}")
add_test(NAME fake_uart_tests COMMAND fake_uart_tests)

add_executable(link_protocol_tests link_protocol_tests.cpp ${CORE_SOURCES})
target_include_directories(link_protocol_tests PRIVATE "${CORE_INCLUDE_DIR}")
target_compile_definitions(link_protocol_tests PRIVATE
    GOLDEN_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-v1.json"
)
add_test(NAME link_protocol_tests COMMAND link_protocol_tests)

add_executable(link_endpoint_tests link_endpoint_tests.cpp ${CORE_SOURCES})
target_include_directories(link_endpoint_tests PRIVATE "${CORE_INCLUDE_DIR}")
target_compile_definitions(link_endpoint_tests PRIVATE
    GOLDEN_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-v1.json"
)
add_test(NAME link_endpoint_tests COMMAND link_endpoint_tests)

add_executable(link_uart_owner_tests link_uart_owner_tests.cpp fake_uart.cpp ${CORE_SOURCES})
target_include_directories(link_uart_owner_tests PRIVATE "${CORE_INCLUDE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}")
add_test(NAME link_uart_owner_tests COMMAND link_uart_owner_tests)

add_executable(board_link_pinout_tests board_link_pinout_tests.cpp)
target_include_directories(board_link_pinout_tests PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/../main"
)
add_test(NAME board_link_pinout_tests COMMAND board_link_pinout_tests)

add_executable(scaffold_source_contract_tests scaffold_source_contract_tests.cpp)
target_compile_definitions(scaffold_source_contract_tests PRIVATE
    ROOT_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../CMakeLists.txt"
    MAIN_CMAKE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/CMakeLists.txt"
    MAIN_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/main.cpp"
    UART_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/deskmate_link_uart.cpp"
    UART_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/deskmate_link_uart.h"
    PINOUT_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/board_link_pinout.h"
    MODEL_HEADER_PATH="${CORE_INCLUDE_DIR}/endpoint_model.h"
    MODEL_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/endpoint_model.cpp"
    PROTOCOL_HEADER_PATH="${CORE_INCLUDE_DIR}/link_protocol.h"
    PROTOCOL_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/link_protocol.cpp"
    ENDPOINT_HEADER_PATH="${CORE_INCLUDE_DIR}/link_endpoint.h"
    ENDPOINT_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/link_endpoint.cpp"
    OWNER_HEADER_PATH="${CORE_INCLUDE_DIR}/link_uart_owner.h"
    OWNER_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/link_uart_owner.cpp"
    DISPLAY_HEADER_PATH="${CORE_INCLUDE_DIR}/display_owner.h"
    DISPLAY_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/display_owner.cpp"
    MOTION_HEADER_PATH="${CORE_INCLUDE_DIR}/motion_safety_core.h"
    MOTION_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/motion_safety_core.cpp"
    MANUAL_OWNER_HEADER_PATH="${CORE_INCLUDE_DIR}/manual_calibration_owner.h"
    MANUAL_OWNER_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/manual_calibration_owner.cpp"
    MANUAL_PROTOCOL_HEADER_PATH="${CORE_INCLUDE_DIR}/manual_calibration_protocol.h"
    MANUAL_PROTOCOL_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/manual_calibration_protocol.cpp"
    SERVO_ADAPTER_HEADER_PATH="${CORE_INCLUDE_DIR}/servo_adapter.h"
    SERVO_ADAPTER_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../components/endpoint_core/src/servo_adapter.cpp"
    OLED_HEADER_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/deskmate_oled.h"
    OLED_SOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../main/deskmate_oled.cpp"
    TRANSPORT_HEADER_PATH="${CORE_INCLUDE_DIR}/transport.h"
    SDKCONFIG_DEFAULTS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../sdkconfig.defaults"
    PARTITION_TABLE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../partitions/v1/16m.csv"
    MODULE_GITIGNORE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../.gitignore"
    LINK_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/v1.md"
    LINK_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-v1.json"
    T10C_LINK_CONTRACT_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/t10c-manual-calibration-v1.md"
    T10C_LINK_VECTORS_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../../../contracts/deskmate-link/golden-vectors-t10c-manual-calibration-v1.json"
)
add_test(NAME scaffold_source_contract_tests COMMAND scaffold_source_contract_tests)
