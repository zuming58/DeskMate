cmake_minimum_required(VERSION 3.16)

set(IDF_TARGET esp32s3)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(deskmate_xiaozhi_yuntai)

if(NOT CONFIG_IDF_TARGET_ESP32S3)
    message(FATAL_ERROR "DeskMate Xiaozhi Phase A must target esp32s3.")
endif()

if(NOT CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG OR CONFIG_ESP_CONSOLE_UART)
    message(FATAL_ERROR
        "DeskMate Xiaozhi Phase A routes application logs only through USB Serial/JTAG. "
        "Do not reserve a hardware UART for the console in this scaffold.")
endif()

if(NOT CONFIG_ESP_CONSOLE_SECONDARY_NONE)
    message(FATAL_ERROR
        "DeskMate Xiaozhi Phase A must not enable a secondary console.")
endif()
