cmake_minimum_required(VERSION 3.16)

set(IDF_TARGET esp32s3)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(deskmate_xiaozhi_yuntai)

if(NOT CONFIG_IDF_TARGET_ESP32S3)
    message(FATAL_ERROR "DeskMate Xiaozhi Phase B must target esp32s3.")
endif()

if(NOT CONFIG_ESP_CONSOLE_NONE OR CONFIG_ESP_CONSOLE_UART OR
   CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG)
    message(FATAL_ERROR
        "DeskMate Xiaozhi Phase B disables the application console so UART bytes "
        "cannot contend with DeskMate Link.")
endif()

if(NOT CONFIG_ESP_CONSOLE_SECONDARY_NONE)
    message(FATAL_ERROR
        "DeskMate Xiaozhi Phase B must not enable a secondary console.")
endif()

if(NOT CONFIG_BOOTLOADER_LOG_LEVEL_NONE OR NOT CONFIG_LOG_DEFAULT_LEVEL_NONE)
    message(FATAL_ERROR
        "DeskMate Xiaozhi Phase B requires bootloader and application logging off.")
endif()
