idf_component_register(
    SRCS
        "deskmate_link_uart.cpp"
        "main.cpp"
    INCLUDE_DIRS "."
    REQUIRES
        endpoint_core
        esp_driver_uart
        esp_system
        esp_timer
)
