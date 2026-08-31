#pragma once

#include "audio_capture_core.h"
#include "config_core.h"
#include "peripheral_power.h"

#include "driver/i2s_std.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "lwip/sockets.h"

#include <array>
#include <atomic>
#include <cstdint>

namespace deskmate::easyinput {

class AudioCaptureService {
public:
    bool begin(PeripheralPowerController& power);
    void configure(std::string_view raw_config);
    void prewarm_wifi();
    AudioCaptureDiagnostics snapshot() const;

private:
    enum class CaptureCommandKind : std::uint8_t { Start, Stop };
    struct ConfigMessage {
        AudioConfigProjectionStatus status{
            AudioConfigProjectionStatus::ConfigIncomplete};
        AudioCaptureConfig config{};
    };
    struct CaptureCommand {
        CaptureCommandKind kind{CaptureCommandKind::Stop};
        std::uint64_t session_id{};
    };
    struct CaptureResult {
        std::uint64_t session_id{};
        bool started{};
    };
    struct CapturedFrame {
        std::uint64_t session_id{};
        std::uint32_t sequence{};
        std::uint32_t timestamp_ms{};
        std::array<std::int16_t, kAudioFrameSamples> pcm{};
    };
    static constexpr EventBits_t kWifiConnectedBit = 1U << 0;
    static constexpr EventBits_t kWifiDisconnectedBit = 1U << 1;

    static void control_task_entry(void* context);
    static void capture_task_entry(void* context);
    static void network_event(void* context, esp_event_base_t base,
                              std::int32_t event_id, void* event_data);

    void control_loop();
    void capture_loop();
    bool initialize_network_stack();
    bool apply_wifi_config(const AudioCaptureConfig& config);
    bool resolve_target(const AudioCaptureConfig& config,
                        sockaddr_in& target);
    int open_control_socket();
    void stop_capture(std::uint64_t session_id);
    bool start_microphone();
    void stop_microphone();
    void set_state(AudioCaptureState state);
    void increment(std::atomic<std::uint32_t>& counter,
                   std::uint32_t amount = 1);

    PeripheralPowerController* power_{};
    esp_netif_t* wifi_netif_{};
    EventGroupHandle_t wifi_events_{};
    esp_event_handler_instance_t wifi_handler_{};
    esp_event_handler_instance_t ip_handler_{};
    i2s_chan_handle_t mic_rx_{};

    QueueHandle_t config_queue_{};
    QueueHandle_t capture_command_queue_{};
    QueueHandle_t capture_result_queue_{};
    QueueHandle_t frame_queue_{};
    StaticQueue_t config_queue_control_{};
    StaticQueue_t capture_command_queue_control_{};
    StaticQueue_t capture_result_queue_control_{};
    StaticQueue_t frame_queue_control_{};
    std::array<std::uint8_t, sizeof(ConfigMessage)> config_queue_storage_{};
    std::array<std::uint8_t, sizeof(CaptureCommand) * 4>
        capture_command_queue_storage_{};
    std::array<std::uint8_t, sizeof(CaptureResult) * 2>
        capture_result_queue_storage_{};
    std::uint8_t* frame_queue_storage_{};

    TaskHandle_t control_task_{};
    TaskHandle_t capture_task_{};

    std::atomic<std::uint8_t> state_{
        static_cast<std::uint8_t>(AudioCaptureState::Disabled)};
    std::atomic<std::uint32_t> captured_frames_{};
    std::atomic<std::uint32_t> sent_frames_{};
    std::atomic<std::uint32_t> dropped_frames_{};
    std::atomic<std::uint32_t> read_errors_{};
    std::atomic<std::uint32_t> send_errors_{};
    std::atomic<std::uint32_t> recoveries_{};
};

}  // namespace deskmate::easyinput
