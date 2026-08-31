#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::uint32_t kAudioSampleRate = 16000;
inline constexpr std::uint16_t kAudioFrameSamples = 320;
inline constexpr std::uint16_t kAudioFramePayloadBytes = 640;
inline constexpr std::uint32_t kAudioFrameDurationMs = 20;
inline constexpr std::size_t kAudioFrameQueueCapacity = 64;
inline constexpr std::size_t kAudioHeartbeatBytes = 20;
inline constexpr std::size_t kAudioControlBytes = 36;
inline constexpr std::size_t kAudioAckBytes = 20;
inline constexpr std::size_t kAudioPacketHeaderBytes = 32;
inline constexpr std::size_t kAudioPacketBytes =
    kAudioPacketHeaderBytes + kAudioFramePayloadBytes;
inline constexpr std::uint32_t kAudioControlTimeoutMs = 15000;
inline constexpr std::uint32_t kAudioMaximumStreamMs = 300000;

enum class AudioCaptureState : std::uint8_t {
    Disabled,
    ConfigIncomplete,
    Ready,
    Streaming,
    Faulted,
};

const char* audio_capture_state_name(AudioCaptureState state);

struct AudioCaptureDiagnostics {
    AudioCaptureState state{AudioCaptureState::Disabled};
    std::uint32_t captured_frames{};
    std::uint32_t sent_frames{};
    std::uint32_t dropped_frames{};
    std::uint32_t read_errors{};
    std::uint32_t send_errors{};
    std::uint32_t recoveries{};
};

enum class AudioControlAction : std::uint8_t {
    Start = 1,
    Stop = 2,
    Keepalive = 3,
};

enum class AudioControlStatus : std::uint8_t {
    Ok = 0,
    BadRequest = 1,
    Unauthorized = 2,
    Busy = 3,
    Unavailable = 4,
};

struct AudioControlCommand {
    AudioControlAction action{AudioControlAction::Stop};
    std::uint64_t session_id{};
    std::uint32_t sequence{};
    std::array<std::uint8_t, 16> token{};
};

struct AudioControlDecision {
    AudioControlStatus status{AudioControlStatus::BadRequest};
    bool start_capture{};
    bool stop_capture{};
    bool refresh_lease{};
    bool duplicate{};
};

enum class AudioLeaseExpiry : std::uint8_t {
    None,
    ControlTimeout,
    MaximumDuration,
};

bool decode_audio_control(const std::uint8_t* data, std::size_t length,
                          AudioControlCommand& command);
void encode_audio_heartbeat(std::uint8_t* output, bool streaming,
                            bool audio_ready, std::uint64_t session_id,
                            std::uint32_t sequence);
void encode_audio_ack(std::uint8_t* output, AudioControlAction action,
                      AudioControlStatus status, std::uint64_t session_id,
                      std::uint32_t sequence);
void encode_audio_packet_header(std::uint8_t* output,
                                std::uint64_t session_id,
                                std::uint32_t sequence,
                                std::uint32_t timestamp_ms,
                                std::uint16_t payload_bytes =
                                    kAudioFramePayloadBytes);
void convert_i2s_32_to_pcm16(const std::int32_t* input, std::int16_t* output,
                             std::size_t samples);

class AudioSessionController {
public:
    void configure_source(std::uint32_t source_ipv4, bool enabled);
    AudioControlDecision accept(const AudioControlCommand& command,
                                std::uint32_t source_ipv4,
                                std::uint32_t now_ms);
    AudioLeaseExpiry poll(std::uint32_t now_ms);
    void abort();

    bool active() const { return active_; }
    std::uint64_t session_id() const { return session_id_; }

private:
    bool configured_{};
    std::uint32_t source_ipv4_{};
    bool active_{};
    std::uint64_t session_id_{};
    std::uint32_t started_at_ms_{};
    std::uint32_t lease_refreshed_at_ms_{};
    AudioControlCommand last_command_{};
    bool last_command_valid_{};
};

enum class AudioReadRecoveryDecision : std::uint8_t {
    Continue,
    RestartI2s,
    Fault,
};

class AudioReadRecoveryPolicy {
public:
    AudioReadRecoveryDecision on_failure();
    void on_success() { consecutive_errors_ = 0; }
    void reset();
    std::uint32_t recoveries() const { return recoveries_; }

private:
    std::uint32_t consecutive_errors_{};
    std::uint32_t recoveries_{};
};

class AudioQueueOverflowPolicy {
public:
    bool drop_oldest_before_append(bool queue_full);
    std::uint32_t dropped_frames() const { return dropped_frames_; }
    void reset() { dropped_frames_ = 0; }

private:
    std::uint32_t dropped_frames_{};
};

}  // namespace deskmate::easyinput
