idf_component_register(
    SRCS
        "deskmate_link_uart.cpp"
        "deskmate_oled.cpp"
        "deskmate_servo_adapter.cpp"
        "main.cpp"
    INCLUDE_DIRS "."
    REQUIRES
        endpoint_core
        esp_driver_gpio
        esp_driver_i2c
        esp_driver_ledc
        esp_driver_uart
        esp_lcd
        esp_system
        esp_timer
)
