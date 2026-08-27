idf_component_register(
    SRCS "main.cpp" "peripheral_power.cpp" "led_strip.cpp"
    REQUIRES input_core esp_driver_gpio esp_driver_rmt esp_timer esp_tinyusb
)
