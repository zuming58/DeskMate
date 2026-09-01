idf_component_register(
    SRCS "main.cpp" "peripheral_power.cpp" "led_strip.cpp" "config_store.cpp" "deskmate_link_uart.cpp" "audio_capture_service.cpp" "speaker_output_service.cpp"
    REQUIRES input_core esp_driver_gpio esp_driver_i2s esp_driver_rmt esp_driver_uart esp_event esp_netif esp_psram esp_timer esp_tinyusb esp_wifi lwip nvs_flash
)
