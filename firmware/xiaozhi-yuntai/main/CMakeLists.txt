idf_component_register(
    SRCS
        "deskmate_link_uart.cpp"
        "deskmate_oled.cpp"
        "main.cpp"
    INCLUDE_DIRS "."
    REQUIRES
        endpoint_core
        esp_driver_i2c
        esp_driver_uart
        esp_lcd
        esp_system
        esp_timer
)
