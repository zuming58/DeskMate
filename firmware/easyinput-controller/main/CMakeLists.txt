idf_component_register(
    SRCS "main.cpp" "peripheral_power.cpp" "led_strip.cpp" "config_store.cpp" "deskmate_link_uart.cpp"
    REQUIRES input_core esp_driver_gpio esp_driver_rmt esp_driver_uart esp_timer esp_tinyusb nvs_flash
)
