#pragma once

#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::uint32_t kSpeakerSampleRate = 48000;
inline constexpr std::uint32_t kSpeakerFrameMilliseconds = 10;
inline constexpr std::size_t kSpeakerFrameSamples = 480;
inline constexpr std::size_t kSpeakerDmaDescriptorCount = 4;
inline constexpr std::size_t kSpeakerPreloadZeroFrames = 1;
inline constexpr std::size_t kSpeakerTailZeroFrames = 2;
inline constexpr std::size_t kSpeakerNormalDrainZeroFrames =
    kSpeakerDmaDescriptorCount + kSpeakerTailZeroFrames;
inline constexpr std::uint32_t kSpeakerFirstPcmQueueUpperBoundUs =
    static_cast<std::uint32_t>(kSpeakerDmaDescriptorCount - 1) *
    kSpeakerFrameMilliseconds * 1000;

static_assert(kSpeakerNormalDrainZeroFrames == 6);
static_assert(kSpeakerFirstPcmQueueUpperBoundUs == 30000);

enum class SpeakerOutputState : std::uint8_t {
    Disabled,
    Ready,
    Starting,
    Playing,
    Faulted,
};

enum class SpeakerProbeTerminal : std::uint8_t {
    Completed,
    CancelledForMicrophone,
    Faulted,
};

constexpr SpeakerProbeTerminal resolve_speaker_probe_terminal(
    bool playback_succeeded, bool cancelled_for_microphone,
    bool ownership_released) {
    // A cancellation is safe only after I2S and the shared-power lease have
    // been released. Cleanup failure must never be reported as completion.
    if (!ownership_released) return SpeakerProbeTerminal::Faulted;
    if (cancelled_for_microphone) {
        return SpeakerProbeTerminal::CancelledForMicrophone;
    }
    return playback_succeeded ? SpeakerProbeTerminal::Completed
                              : SpeakerProbeTerminal::Faulted;
}

const char* speaker_output_state_name(SpeakerOutputState state);

struct SpeakerOutputDiagnostics {
    SpeakerOutputState state{SpeakerOutputState::Disabled};
    std::uint32_t requests{};
    std::uint32_t completed{};
    std::uint32_t cancelled_for_microphone{};
    std::uint32_t busy_rejections{};
    std::uint32_t init_errors{};
    std::uint32_t write_errors{};
    std::uint32_t cleanup_errors{};
};

}  // namespace deskmate::easyinput
