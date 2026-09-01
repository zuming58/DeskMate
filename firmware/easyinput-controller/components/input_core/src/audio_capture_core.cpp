#include "audio_capture_core.h"

#include <algorithm>
#include <cstring>

namespace deskmate::easyinput {
namespace {

constexpr std::array<std::uint8_t, 4> kHeartbeatMagic{'E', 'I', 'H', 'B'};
constexpr std::array<std::uint8_t, 4> kControlMagic{'E', 'I', 'C', 'C'};
constexpr std::array<std::uint8_t, 4> kAckMagic{'E', 'I', 'C', 'A'};
constexpr std::array<std::uint8_t, 4> kAudioMagic{'E', 'I', 'A', 'U'};

std::uint32_t read_u32(const std::uint8_t* value) {
    return static_cast<std::uint32_t>(value[0]) |
           (static_cast<std::uint32_t>(value[1]) << 8U) |
           (static_cast<std::uint32_t>(value[2]) << 16U) |
           (static_cast<std::uint32_t>(value[3]) << 24U);
}

std::uint64_t read_u64(const std::uint8_t* value) {
    std::uint64_t result = 0;
    for (unsigned index = 0; index < 8; ++index) {
        result |= static_cast<std::uint64_t>(value[index]) << (8U * index);
    }
    return result;
}

void write_u16(std::uint8_t* output, std::uint16_t value) {
    output[0] = static_cast<std::uint8_t>(value);
    output[1] = static_cast<std::uint8_t>(value >> 8U);
}

void write_u32(std::uint8_t* output, std::uint32_t value) {
    for (unsigned index = 0; index < 4; ++index) {
        output[index] = static_cast<std::uint8_t>(value >> (8U * index));
    }
}

void write_u64(std::uint8_t* output, std::uint64_t value) {
    for (unsigned index = 0; index < 8; ++index) {
        output[index] = static_cast<std::uint8_t>(value >> (8U * index));
    }
}

bool elapsed(std::uint32_t now, std::uint32_t since, std::uint32_t limit) {
    return static_cast<std::uint32_t>(now - since) >= limit;
}

bool same_command(const AudioControlCommand& left,
                  const AudioControlCommand& right) {
    return left.action == right.action &&
           left.session_id == right.session_id &&
           left.sequence == right.sequence && left.token == right.token;
}

}  // namespace

const char* audio_capture_state_name(AudioCaptureState state) {
    switch (state) {
        case AudioCaptureState::Disabled: return "disabled";
        case AudioCaptureState::ConfigIncomplete: return "config-incomplete";
        case AudioCaptureState::Ready: return "ready";
        case AudioCaptureState::Streaming: return "streaming";
        case AudioCaptureState::Faulted: return "faulted";
    }
    return "faulted";
}

bool decode_audio_control(const std::uint8_t* data, std::size_t length,
                          AudioControlCommand& command) {
    command = {};
    if (data == nullptr || length != kAudioControlBytes ||
        !std::equal(kControlMagic.begin(), kControlMagic.end(), data) ||
        data[4] != 1 || data[6] != 0 || data[7] != 0) {
        return false;
    }
    if (data[5] < static_cast<std::uint8_t>(AudioControlAction::Start) ||
        data[5] > static_cast<std::uint8_t>(AudioControlAction::Keepalive)) {
        return false;
    }
    command.action = static_cast<AudioControlAction>(data[5]);
    command.session_id = read_u64(data + 8);
    command.sequence = read_u32(data + 16);
    std::copy_n(data + 20, command.token.size(), command.token.begin());
    return command.session_id != 0;
}

void encode_audio_heartbeat(std::uint8_t* output, bool streaming,
                            bool audio_ready, std::uint64_t session_id,
                            std::uint32_t sequence) {
    std::fill_n(output, kAudioHeartbeatBytes, 0);
    std::copy(kHeartbeatMagic.begin(), kHeartbeatMagic.end(), output);
    output[4] = 1;
    output[5] = static_cast<std::uint8_t>((streaming ? 0x01U : 0U) |
                                          (audio_ready ? 0x02U : 0U));
    write_u64(output + 8, session_id);
    write_u32(output + 16, sequence);
}

void encode_audio_ack(std::uint8_t* output, AudioControlAction action,
                      AudioControlStatus status, std::uint64_t session_id,
                      std::uint32_t sequence) {
    std::fill_n(output, kAudioAckBytes, 0);
    std::copy(kAckMagic.begin(), kAckMagic.end(), output);
    output[4] = 1;
    output[5] = static_cast<std::uint8_t>(action);
    output[6] = static_cast<std::uint8_t>(status);
    write_u64(output + 8, session_id);
    write_u32(output + 16, sequence);
}

void encode_audio_packet_header(std::uint8_t* output,
                                std::uint64_t session_id,
                                std::uint32_t sequence,
                                std::uint32_t timestamp_ms,
                                std::uint16_t payload_bytes) {
    std::fill_n(output, kAudioPacketHeaderBytes, 0);
    std::copy(kAudioMagic.begin(), kAudioMagic.end(), output);
    output[4] = 2;
    output[5] = static_cast<std::uint8_t>(kAudioPacketHeaderBytes);
    output[6] = 1;  // PCM S16LE
    output[7] = 1;  // mono
    write_u64(output + 8, session_id);
    write_u32(output + 16, sequence);
    write_u32(output + 20, kAudioSampleRate);
    write_u32(output + 24, timestamp_ms);
    write_u16(output + 28, kAudioFrameSamples);
    write_u16(output + 30, payload_bytes);
}

void convert_i2s_32_to_pcm16(const std::int32_t* input, std::int16_t* output,
                             std::size_t samples) {
    if (input == nullptr || output == nullptr) return;
    for (std::size_t index = 0; index < samples; ++index) {
        output[index] = static_cast<std::int16_t>(input[index] >> 16);
    }
}

void AudioSessionController::configure_source(std::uint32_t source_ipv4,
                                              bool enabled) {
    if (!enabled || !configured_ || source_ipv4_ != source_ipv4) abort();
    configured_ = enabled;
    source_ipv4_ = source_ipv4;
}

AudioControlDecision AudioSessionController::accept(
    const AudioControlCommand& command, std::uint32_t source_ipv4,
    std::uint32_t now_ms) {
    AudioControlDecision result{};
    if (!configured_) {
        result.status = AudioControlStatus::Unavailable;
        return result;
    }
    if (source_ipv4 != source_ipv4_) {
        result.status = AudioControlStatus::Unauthorized;
        return result;
    }
    if (last_command_valid_ && same_command(command, last_command_)) {
        result.status = AudioControlStatus::Ok;
        result.duplicate = true;
        if (active_ && command.action == AudioControlAction::Keepalive) {
            lease_refreshed_at_ms_ = now_ms;
            result.refresh_lease = true;
        }
        return result;
    }

    if (command.action == AudioControlAction::Start) {
        if (active_) {
            result.status = AudioControlStatus::Busy;
            return result;
        }
        active_ = true;
        session_id_ = command.session_id;
        started_at_ms_ = now_ms;
        lease_refreshed_at_ms_ = now_ms;
        result.status = AudioControlStatus::Ok;
        result.start_capture = true;
        result.refresh_lease = true;
    } else if (!active_ || command.session_id != session_id_) {
        result.status = AudioControlStatus::BadRequest;
        return result;
    } else if (last_command_valid_ && command.sequence <= last_command_.sequence) {
        result.status = AudioControlStatus::BadRequest;
        return result;
    } else if (command.action == AudioControlAction::Keepalive) {
        lease_refreshed_at_ms_ = now_ms;
        result.status = AudioControlStatus::Ok;
        result.refresh_lease = true;
    } else {
        active_ = false;
        result.status = AudioControlStatus::Ok;
        result.stop_capture = true;
    }
    last_command_ = command;
    last_command_valid_ = true;
    return result;
}

AudioLeaseExpiry AudioSessionController::poll(std::uint32_t now_ms) {
    if (!active_) return AudioLeaseExpiry::None;
    if (elapsed(now_ms, started_at_ms_, kAudioMaximumStreamMs)) {
        active_ = false;
        return AudioLeaseExpiry::MaximumDuration;
    }
    if (elapsed(now_ms, lease_refreshed_at_ms_, kAudioControlTimeoutMs)) {
        active_ = false;
        return AudioLeaseExpiry::ControlTimeout;
    }
    return AudioLeaseExpiry::None;
}

void AudioSessionController::abort() {
    active_ = false;
    session_id_ = 0;
    started_at_ms_ = 0;
    lease_refreshed_at_ms_ = 0;
    last_command_ = {};
    last_command_valid_ = false;
}

AudioReadRecoveryDecision AudioReadRecoveryPolicy::on_failure() {
    if (++consecutive_errors_ < 2) {
        return AudioReadRecoveryDecision::Continue;
    }
    consecutive_errors_ = 0;
    if (++recoveries_ > 3) return AudioReadRecoveryDecision::Fault;
    return AudioReadRecoveryDecision::RestartI2s;
}

void AudioReadRecoveryPolicy::reset() {
    consecutive_errors_ = 0;
    recoveries_ = 0;
}

bool AudioQueueOverflowPolicy::drop_oldest_before_append(bool queue_full) {
    if (!queue_full) return false;
    if (dropped_frames_ != UINT32_MAX) ++dropped_frames_;
    return true;
}

}  // namespace deskmate::easyinput
