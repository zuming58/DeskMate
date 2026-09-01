#pragma once

#include <atomic>
#include <cstdint>

namespace deskmate::easyinput {

// Owns the cross-task handoff between the board microphone and speaker.
// Microphone requests have absolute priority: a non-zero microphone
// generation prevents new speaker admission and makes an active speaker stop.
class AudioIoArbiter {
public:
    bool try_begin_speaker(std::uint32_t generation);
    bool finish_speaker(std::uint32_t generation);

    bool request_microphone(std::uint32_t generation);
    bool mark_microphone_ready(std::uint32_t generation);
    bool finish_microphone(std::uint32_t generation);

    std::uint32_t speaker_generation() const;
    std::uint32_t microphone_generation() const;
    bool speaker_active() const { return speaker_generation() != 0; }
    bool microphone_requested() const { return microphone_generation() != 0; }
    bool microphone_ready(std::uint32_t generation) const;

private:
    std::atomic<std::uint32_t> speaker_generation_{};
    std::atomic<std::uint32_t> microphone_generation_{};
    std::atomic<std::uint32_t> microphone_ready_generation_{};
};

}  // namespace deskmate::easyinput
