cmake_minimum_required(VERSION 3.16)

set(IDF_TARGET esp32s3)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(deskmate_easyinput_controller)

if(NOT CONFIG_PARTITION_TABLE_CUSTOM OR
   NOT "${CONFIG_PARTITION_TABLE_CUSTOM_FILENAME}" STREQUAL "partitions.csv" OR
   NOT "${CONFIG_PARTITION_TABLE_OFFSET}" STREQUAL "0x8000")
    message(FATAL_ERROR
        "DeskMate EasyInput must use the preserved Maker-compatible partitions.csv "
        "at offset 0x8000. Do not change the on-device partition layout in a feature package.")
endif()

file(STRINGS "${CMAKE_SOURCE_DIR}/partitions.csv" deskmate_partition_lines)
set(deskmate_partition_entries)
foreach(deskmate_partition_line IN LISTS deskmate_partition_lines)
    string(REGEX REPLACE "[ \t\r]" "" deskmate_partition_compact "${deskmate_partition_line}")
    if(NOT deskmate_partition_compact STREQUAL "" AND
       NOT deskmate_partition_compact MATCHES "^#")
        string(TOLOWER "${deskmate_partition_compact}" deskmate_partition_compact)
        list(APPEND deskmate_partition_entries "${deskmate_partition_compact}")
    endif()
endforeach()

set(deskmate_expected_partition_entries
    "nvs,data,nvs,0x9000,0x6000,"
    "phy_init,data,phy,0xf000,0x1000,"
    "factory,app,factory,0x10000,0x300000,"
    "sound_a,0x40,0x00,0x310000,0x90000,"
    "sound_b,0x40,0x01,0x3a0000,0x90000,"
)
if(NOT "${deskmate_partition_entries}" STREQUAL
       "${deskmate_expected_partition_entries}")
    message(FATAL_ERROR
        "DeskMate EasyInput partitions.csv drifted. Preserve the exact NVS, PHY, "
        "3 MiB factory app and two 576 KiB sound banks unless an explicit migration is authorized.")
endif()
