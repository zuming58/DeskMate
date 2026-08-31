#include "audio_capture_service.h"

#include "board_pins.h"

#include "esp_heap_caps.h"
#include "esp_netif.h"
#include "esp_psram.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "lwip/netdb.h"
#include "lwip/sockets.h"

#include <algorithm>
#include <array>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <unistd.h>

namespace deskmate::easyinput {
namespace {

constexpr std::uint32_t kHeartbeatIntervalMs = 1000;
constexpr std::uint32_t kReconnectDelayMs = 1000;
constexpr std::uint32_t kControlReceiveTimeoutMs = 10;
constexpr std::uint32_t kMicrophoneReadTimeoutMs = 80;
constexpr std::uint32_t kCaptureStartTimeoutMs = 750;
constexpr std::uint32_t kCaptureRecoveryDelayMs = 80;

TickType_t ticks(std::uint32_t milliseconds) {
    return pdMS_TO_TICKS(milliseconds) == 0 ? 1 : pdMS_TO_TICKS(milliseconds);
}

std::uint32_t now_ms() {
    return static_cast<std::uint32_t>(
        static_cast<std::uint64_t>(esp_timer_get_time()) / 1000ULL);
}

}  // namespace

bool AudioCaptureService::begin(PeripheralPowerController& power) {
    power_ = &power;
    if (!power.ready() || !esp_psram_is_initialized()) {
        set_state(AudioCaptureState::Faulted);
        return false;
    }
    frame_queue_storage_ = static_cast<std::uint8_t*>(heap_caps_malloc(
        kAudioFrameQueueCapacity * sizeof(CapturedFrame),
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (frame_queue_storage_ == nullptr) {
        set_state(AudioCaptureState::Faulted);
        return false;
    }
    config_queue_ = xQueueCreateStatic(
        1, sizeof(ConfigMessage), config_queue_storage_.data(),
        &config_queue_control_);
    capture_command_queue_ = xQueueCreateStatic(
        4, sizeof(CaptureCommand), capture_command_queue_storage_.data(),
        &capture_command_queue_control_);
    capture_result_queue_ = xQueueCreateStatic(
        2, sizeof(CaptureResult), capture_result_queue_storage_.data(),
        &capture_result_queue_control_);
    frame_queue_ = xQueueCreateStatic(
        kAudioFrameQueueCapacity, sizeof(CapturedFrame), frame_queue_storage_,
        &frame_queue_control_);
    wifi_events_ = xEventGroupCreate();
    if (config_queue_ == nullptr || capture_command_queue_ == nullptr ||
        capture_result_queue_ == nullptr || frame_queue_ == nullptr ||
        wifi_events_ == nullptr ||
        !initialize_network_stack()) {
        set_state(AudioCaptureState::Faulted);
        return false;
    }
    if (xTaskCreate(capture_task_entry, "audio_capture", 6144, this, 6,
                    &capture_task_) != pdPASS ||
        xTaskCreate(control_task_entry, "audio_control", 8192, this, 4,
                    &control_task_) != pdPASS) {
        set_state(AudioCaptureState::Faulted);
        return false;
    }
    set_state(AudioCaptureState::ConfigIncomplete);
    return true;
}

void AudioCaptureService::configure(std::string_view raw_config) {
    ConfigMessage message{};
    message.status = parse_audio_capture_config(raw_config, message.config);
    if (config_queue_ == nullptr ||
        xQueueOverwrite(config_queue_, &message) != pdTRUE) {
        set_state(AudioCaptureState::Faulted);
        return;
    }
    if (control_task_ != nullptr) xTaskNotifyGive(control_task_);
}

void AudioCaptureService::prewarm_wifi() {
    if (control_task_ != nullptr) xTaskNotifyGive(control_task_);
}

AudioCaptureDiagnostics AudioCaptureService::snapshot() const {
    AudioCaptureDiagnostics result{};
    result.state = static_cast<AudioCaptureState>(
        state_.load(std::memory_order_acquire));
    result.captured_frames = captured_frames_.load(std::memory_order_relaxed);
    result.sent_frames = sent_frames_.load(std::memory_order_relaxed);
    result.dropped_frames = dropped_frames_.load(std::memory_order_relaxed);
    result.read_errors = read_errors_.load(std::memory_order_relaxed);
    result.send_errors = send_errors_.load(std::memory_order_relaxed);
    result.recoveries = recoveries_.load(std::memory_order_relaxed);
    return result;
}

void AudioCaptureService::control_task_entry(void* context) {
    static_cast<AudioCaptureService*>(context)->control_loop();
}

void AudioCaptureService::capture_task_entry(void* context) {
    static_cast<AudioCaptureService*>(context)->capture_loop();
}

void AudioCaptureService::network_event(void* context, esp_event_base_t base,
                                        std::int32_t event_id, void*) {
    auto* service = static_cast<AudioCaptureService*>(context);
    if (service == nullptr || service->wifi_events_ == nullptr) return;
    if (base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        xEventGroupClearBits(service->wifi_events_, kWifiDisconnectedBit);
        xEventGroupSetBits(service->wifi_events_, kWifiConnectedBit);
    } else if (base == WIFI_EVENT &&
               event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(service->wifi_events_, kWifiConnectedBit);
        xEventGroupSetBits(service->wifi_events_, kWifiDisconnectedBit);
    }
}

bool AudioCaptureService::initialize_network_stack() {
    esp_err_t error = esp_netif_init();
    if (error != ESP_OK && error != ESP_ERR_INVALID_STATE) return false;
    error = esp_event_loop_create_default();
    if (error != ESP_OK && error != ESP_ERR_INVALID_STATE) return false;
    wifi_netif_ = esp_netif_create_default_wifi_sta();
    if (wifi_netif_ == nullptr) return false;
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    error = esp_wifi_init(&init);
    if (error != ESP_OK && error != ESP_ERR_INVALID_STATE) return false;
    if (esp_event_handler_instance_register(
            WIFI_EVENT, ESP_EVENT_ANY_ID, network_event, this,
            &wifi_handler_) != ESP_OK ||
        esp_event_handler_instance_register(
            IP_EVENT, IP_EVENT_STA_GOT_IP, network_event, this,
            &ip_handler_) != ESP_OK) {
        return false;
    }
    error = esp_wifi_set_mode(WIFI_MODE_STA);
    return error == ESP_OK || error == ESP_ERR_INVALID_STATE;
}

bool AudioCaptureService::apply_wifi_config(const AudioCaptureConfig& config) {
    wifi_config_t station{};
    std::copy_n(config.wifi_ssid.data(),
                std::min(config.wifi_ssid.size(), sizeof(station.sta.ssid)),
                station.sta.ssid);
    std::copy_n(config.wifi_password.data(),
                std::min(config.wifi_password.size(),
                         sizeof(station.sta.password)),
                station.sta.password);
    station.sta.threshold.authmode = config.wifi_password[0] == '\0'
        ? WIFI_AUTH_OPEN
        : WIFI_AUTH_WPA2_PSK;
    xEventGroupClearBits(wifi_events_,
                         kWifiConnectedBit | kWifiDisconnectedBit);
    esp_err_t error = esp_wifi_set_config(WIFI_IF_STA, &station);
    if (error != ESP_OK) return false;
    error = esp_wifi_start();
    if (error != ESP_OK && error != ESP_ERR_WIFI_CONN) return false;
    (void)esp_wifi_disconnect();
    error = esp_wifi_connect();
    return error == ESP_OK || error == ESP_ERR_WIFI_CONN;
}

bool AudioCaptureService::resolve_target(const AudioCaptureConfig& config,
                                         sockaddr_in& target) {
    addrinfo hints{};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_DGRAM;
    addrinfo* result = nullptr;
    std::array<char, 6> port{};
    std::snprintf(port.data(), port.size(), "%u",
                  static_cast<unsigned>(config.audio_port));
    const int status = getaddrinfo(config.audio_host.data(), port.data(),
                                   &hints, &result);
    if (status != 0 || result == nullptr || result->ai_addr == nullptr ||
        result->ai_addr->sa_family != AF_INET) {
        if (result != nullptr) freeaddrinfo(result);
        return false;
    }
    std::memcpy(&target, result->ai_addr, sizeof(target));
    freeaddrinfo(result);
    return true;
}

int AudioCaptureService::open_control_socket() {
    const int socket_fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_IP);
    if (socket_fd < 0) return -1;
    sockaddr_in local{};
    local.sin_family = AF_INET;
    local.sin_addr.s_addr = htonl(INADDR_ANY);
    local.sin_port = 0;
    timeval timeout{};
    timeout.tv_usec = static_cast<suseconds_t>(kControlReceiveTimeoutMs) * 1000;
    if (bind(socket_fd, reinterpret_cast<sockaddr*>(&local), sizeof(local)) < 0 ||
        setsockopt(socket_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout,
                   sizeof(timeout)) < 0) {
        close(socket_fd);
        return -1;
    }
    return socket_fd;
}

void AudioCaptureService::control_loop() {
    ConfigMessage current{};
    bool have_config = false;
    bool wifi_configured = false;
    bool transport_fault = false;
    int control_socket = -1;
    sockaddr_in target{};
    AudioSessionController session;
    std::uint32_t heartbeat_sequence = 0;
    std::uint32_t last_heartbeat = 0;

    for (;;) {
        ConfigMessage incoming{};
        if (xQueueReceive(config_queue_, &incoming, 0) == pdTRUE) {
            current = incoming;
            have_config = incoming.status == AudioConfigProjectionStatus::Ready;
            wifi_configured = false;
            session.abort();
            stop_capture(0);
            if (control_socket >= 0) {
                close(control_socket);
                control_socket = -1;
            }
            if (!have_config) {
                set_state(incoming.status ==
                                  AudioConfigProjectionStatus::ConfigIncomplete
                              ? AudioCaptureState::ConfigIncomplete
                              : AudioCaptureState::Faulted);
                continue;
            }
            if (!apply_wifi_config(current.config)) {
                transport_fault = true;
                set_state(AudioCaptureState::Faulted);
                vTaskDelay(ticks(kReconnectDelayMs));
                continue;
            }
            wifi_configured = true;
        }

        if (!have_config) {
            ulTaskNotifyTake(pdTRUE, ticks(250));
            continue;
        }
        if (!wifi_configured) {
            if (!apply_wifi_config(current.config)) {
                transport_fault = true;
                set_state(AudioCaptureState::Faulted);
                ulTaskNotifyTake(pdTRUE, ticks(kReconnectDelayMs));
                continue;
            }
            wifi_configured = true;
        }
        if ((xEventGroupGetBits(wifi_events_) & kWifiConnectedBit) == 0) {
            if (session.active()) {
                session.abort();
                stop_capture(0);
            }
            if ((xEventGroupGetBits(wifi_events_) & kWifiDisconnectedBit) != 0) {
                transport_fault = true;
            }
            set_state(AudioCaptureState::Ready);
            (void)esp_wifi_connect();
            ulTaskNotifyTake(pdTRUE, ticks(kReconnectDelayMs));
            continue;
        }
        if (control_socket < 0) {
            if (!resolve_target(current.config, target)) {
                transport_fault = true;
                set_state(AudioCaptureState::Faulted);
                vTaskDelay(ticks(kReconnectDelayMs));
                continue;
            }
            control_socket = open_control_socket();
            if (control_socket < 0) {
                transport_fault = true;
                set_state(AudioCaptureState::Faulted);
                vTaskDelay(ticks(kReconnectDelayMs));
                continue;
            }
            session.configure_source(target.sin_addr.s_addr, true);
            if (transport_fault) {
                increment(recoveries_);
                transport_fault = false;
            }
            set_state(AudioCaptureState::Ready);
        }

        const std::uint32_t current_time = now_ms();
        CaptureResult asynchronous_capture{};
        while (xQueueReceive(capture_result_queue_, &asynchronous_capture, 0) ==
               pdTRUE) {
            if (!asynchronous_capture.started && session.active() &&
                asynchronous_capture.session_id == session.session_id()) {
                session.abort();
                stop_capture(asynchronous_capture.session_id);
                set_state(AudioCaptureState::Faulted);
            }
        }
        const AudioLeaseExpiry expiry = session.poll(current_time);
        if (expiry != AudioLeaseExpiry::None) {
            stop_capture(session.session_id());
            set_state(AudioCaptureState::Ready);
        }

        // Heartbeats, ACKs and PCM must use the same UDP socket. The desktop
        // locks the peer only after a matching ACK, including its source port.
        // A second sender socket would therefore make every valid EIAU packet
        // look like a spoofed source and be rejected.
        bool audio_send_failed = false;
        std::array<std::uint8_t, kAudioPacketBytes> packet{};
        for (std::uint8_t drained = 0; drained < 8; ++drained) {
            CapturedFrame frame{};
            if (xQueueReceive(frame_queue_, &frame, 0) != pdTRUE) break;
            if (!session.active() || frame.session_id != session.session_id()) {
                increment(dropped_frames_);
                continue;
            }
            encode_audio_packet_header(packet.data(), frame.session_id,
                                       frame.sequence, frame.timestamp_ms);
            std::memcpy(packet.data() + kAudioPacketHeaderBytes,
                        frame.pcm.data(), kAudioFramePayloadBytes);
            const int sent = sendto(
                control_socket, packet.data(), packet.size(), 0,
                reinterpret_cast<sockaddr*>(&target), sizeof(target));
            if (sent != static_cast<int>(packet.size())) {
                increment(send_errors_);
                increment(dropped_frames_);
                const std::uint64_t failed_session = session.session_id();
                session.abort();
                stop_capture(failed_session);
                close(control_socket);
                control_socket = -1;
                transport_fault = true;
                audio_send_failed = true;
                break;
            }
            increment(sent_frames_);
        }
        if (audio_send_failed) continue;

        if (static_cast<std::uint32_t>(current_time - last_heartbeat) >=
            kHeartbeatIntervalMs) {
            std::array<std::uint8_t, kAudioHeartbeatBytes> heartbeat{};
            encode_audio_heartbeat(heartbeat.data(), session.active(), true,
                                   session.session_id(),
                                   ++heartbeat_sequence);
            if (sendto(control_socket, heartbeat.data(), heartbeat.size(), 0,
                       reinterpret_cast<sockaddr*>(&target),
                       sizeof(target)) < 0) {
                increment(send_errors_);
                if (session.active()) {
                    const std::uint64_t failed_session = session.session_id();
                    session.abort();
                    stop_capture(failed_session);
                }
                close(control_socket);
                control_socket = -1;
                transport_fault = true;
                continue;
            }
            last_heartbeat = current_time;
        }

        std::array<std::uint8_t, kAudioControlBytes + 1> received{};
        sockaddr_in source{};
        socklen_t source_length = sizeof(source);
        const int count = recvfrom(
            control_socket, received.data(), received.size(), 0,
            reinterpret_cast<sockaddr*>(&source), &source_length);
        if (count <= 0) continue;
        AudioControlCommand command{};
        AudioControlStatus response_status = AudioControlStatus::BadRequest;
        if (count == static_cast<int>(kAudioControlBytes) &&
            decode_audio_control(received.data(), count, command)) {
            AudioControlDecision decision = session.accept(
                command, source.sin_addr.s_addr, current_time);
            response_status = decision.status;
            if (decision.start_capture && !decision.duplicate) {
                CaptureCommand start{CaptureCommandKind::Start,
                                     command.session_id};
                CaptureResult result{};
                xQueueReset(capture_result_queue_);
                if (xQueueSend(capture_command_queue_, &start, 0) != pdTRUE ||
                    xQueueReceive(capture_result_queue_, &result,
                                  ticks(kCaptureStartTimeoutMs)) != pdTRUE ||
                    !result.started || result.session_id != command.session_id) {
                    session.abort();
                    response_status = AudioControlStatus::Unavailable;
                    set_state(AudioCaptureState::Faulted);
                } else {
                    set_state(AudioCaptureState::Streaming);
                }
            } else if (decision.stop_capture && !decision.duplicate) {
                stop_capture(command.session_id);
                set_state(AudioCaptureState::Ready);
            }
        }
        std::array<std::uint8_t, kAudioAckBytes> ack{};
        encode_audio_ack(ack.data(), command.action, response_status,
                         command.session_id, command.sequence);
        if (sendto(control_socket, ack.data(), ack.size(), 0,
                   reinterpret_cast<sockaddr*>(&source), source_length) < 0) {
            increment(send_errors_);
            if (session.active()) {
                const std::uint64_t failed_session = session.session_id();
                session.abort();
                stop_capture(failed_session);
            }
            close(control_socket);
            control_socket = -1;
            transport_fault = true;
        }
    }
}

void AudioCaptureService::stop_capture(std::uint64_t session_id) {
    if (capture_command_queue_ == nullptr) return;
    CaptureCommand stop{CaptureCommandKind::Stop, session_id};
    if (xQueueSendToFront(capture_command_queue_, &stop, 0) != pdTRUE) {
        xQueueReset(capture_command_queue_);
        (void)xQueueSendToFront(capture_command_queue_, &stop, 0);
    }
}

bool AudioCaptureService::start_microphone() {
    if (power_ == nullptr ||
        !power_->acquire_consumer(PeripheralPowerOwner::KeyboardMic)) {
        return false;
    }
    i2s_chan_config_t channel =
        I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    channel.dma_desc_num = 4;
    channel.dma_frame_num = kAudioFrameSamples;
    esp_err_t error = i2s_new_channel(&channel, nullptr, &mic_rx_);
    if (error != ESP_OK) {
        power_->release_consumer(PeripheralPowerOwner::KeyboardMic);
        return false;
    }
    i2s_std_config_t standard{
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(kAudioSampleRate),
        .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(
            I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = static_cast<gpio_num_t>(kMicI2sBclkGpio),
            .ws = static_cast<gpio_num_t>(kMicI2sWsGpio),
            .dout = I2S_GPIO_UNUSED,
            .din = static_cast<gpio_num_t>(kMicI2sDinGpio),
            .invert_flags = {},
        },
    };
    standard.slot_cfg.slot_mask = I2S_STD_SLOT_RIGHT;
    error = i2s_channel_init_std_mode(mic_rx_, &standard);
    if (error == ESP_OK) error = i2s_channel_enable(mic_rx_);
    if (error != ESP_OK) {
        stop_microphone();
        return false;
    }
    return true;
}

void AudioCaptureService::stop_microphone() {
    if (mic_rx_ != nullptr) {
        (void)i2s_channel_disable(mic_rx_);
        (void)i2s_del_channel(mic_rx_);
        mic_rx_ = nullptr;
    }
    if (power_ != nullptr &&
        power_->held(PeripheralPowerOwner::KeyboardMic)) {
        (void)power_->release_consumer(PeripheralPowerOwner::KeyboardMic);
    }
}

void AudioCaptureService::capture_loop() {
    std::array<std::int32_t, kAudioFrameSamples> raw{};
    std::uint32_t sequence = 0;
    for (;;) {
        CaptureCommand command{};
        if (xQueueReceive(capture_command_queue_, &command, portMAX_DELAY) !=
            pdTRUE) {
            continue;
        }
        if (command.kind != CaptureCommandKind::Start) {
            stop_microphone();
            continue;
        }
        xQueueReset(frame_queue_);
        sequence = 0;
        bool running = start_microphone();
        CaptureResult result{command.session_id, running};
        (void)xQueueSend(capture_result_queue_, &result, 0);
        if (!running) continue;

        AudioReadRecoveryPolicy recovery_policy;
        AudioQueueOverflowPolicy overflow_policy;
        while (running) {
            CaptureCommand pending{};
            if (xQueueReceive(capture_command_queue_, &pending, 0) == pdTRUE) {
                if (pending.kind == CaptureCommandKind::Stop ||
                    pending.session_id != command.session_id) {
                    break;
                }
            }
            std::size_t bytes_read = 0;
            const esp_err_t error = i2s_channel_read(
                mic_rx_, raw.data(), sizeof(raw), &bytes_read,
                kMicrophoneReadTimeoutMs);
            if (error != ESP_OK || bytes_read != sizeof(raw)) {
                increment(read_errors_);
                const AudioReadRecoveryDecision recovery =
                    recovery_policy.on_failure();
                if (recovery == AudioReadRecoveryDecision::Continue) continue;
                stop_microphone();
                if (recovery == AudioReadRecoveryDecision::Fault) {
                    running = false;
                    set_state(AudioCaptureState::Faulted);
                    break;
                }
                vTaskDelay(ticks(kCaptureRecoveryDelayMs));
                increment(recoveries_);
                running = start_microphone();
                if (!running) set_state(AudioCaptureState::Faulted);
                continue;
            }
            recovery_policy.on_success();
            CapturedFrame frame{};
            frame.session_id = command.session_id;
            frame.sequence = ++sequence;
            frame.timestamp_ms = now_ms();
            convert_i2s_32_to_pcm16(raw.data(), frame.pcm.data(),
                                    frame.pcm.size());
            if (xQueueSend(frame_queue_, &frame, 0) != pdTRUE) {
                CapturedFrame discarded{};
                if (overflow_policy.drop_oldest_before_append(true)) {
                    (void)xQueueReceive(frame_queue_, &discarded, 0);
                    increment(dropped_frames_);
                }
                if (xQueueSend(frame_queue_, &frame, 0) != pdTRUE) {
                    increment(dropped_frames_);
                }
            }
            increment(captured_frames_);
        }
        stop_microphone();
        if (!running) {
            CaptureResult failure{command.session_id, false};
            (void)xQueueSend(capture_result_queue_, &failure, 0);
        }
        xQueueReset(frame_queue_);
    }
}

void AudioCaptureService::set_state(AudioCaptureState state) {
    state_.store(static_cast<std::uint8_t>(state), std::memory_order_release);
}

void AudioCaptureService::increment(std::atomic<std::uint32_t>& counter,
                                    std::uint32_t amount) {
    std::uint32_t current = counter.load(std::memory_order_relaxed);
    while (current != UINT32_MAX) {
        const std::uint32_t next = UINT32_MAX - current < amount
            ? UINT32_MAX
            : current + amount;
        if (counter.compare_exchange_weak(current, next,
                                          std::memory_order_relaxed)) {
            break;
        }
    }
}

}  // namespace deskmate::easyinput
