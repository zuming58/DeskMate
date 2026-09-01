#include "audio_io_arbiter.h"

namespace deskmate::easyinput {

bool AudioIoArbiter::try_begin_speaker(std::uint32_t generation) {
    if (generation == 0 || microphone_requested()) return false;
    std::uint32_t expected = 0;
    if (!speaker_generation_.compare_exchange_strong(
            expected, generation, std::memory_order_acq_rel,
            std::memory_order_acquire)) {
        return false;
    }
    // Close the race where a microphone request arrives after the first
    // microphone check but before the speaker reservation is published.
    if (microphone_requested()) {
        expected = generation;
        (void)speaker_generation_.compare_exchange_strong(
            expected, 0, std::memory_order_acq_rel,
            std::memory_order_acquire);
        return false;
    }
    return true;
}

bool AudioIoArbiter::finish_speaker(std::uint32_t generation) {
    if (generation == 0) return false;
    std::uint32_t expected = generation;
    return speaker_generation_.compare_exchange_strong(
        expected, 0, std::memory_order_acq_rel, std::memory_order_acquire);
}

bool AudioIoArbiter::request_microphone(std::uint32_t generation) {
    if (generation == 0) return false;
    std::uint32_t expected = 0;
    if (!microphone_generation_.compare_exchange_strong(
            expected, generation, std::memory_order_acq_rel,
            std::memory_order_acquire)) {
        return false;
    }
    microphone_ready_generation_.store(0, std::memory_order_release);
    return true;
}

bool AudioIoArbiter::mark_microphone_ready(std::uint32_t generation) {
    if (generation == 0 || microphone_generation() != generation ||
        speaker_active()) {
        return false;
    }
    microphone_ready_generation_.store(generation, std::memory_order_release);
    return true;
}

bool AudioIoArbiter::finish_microphone(std::uint32_t generation) {
    if (generation == 0) return false;
    std::uint32_t expected = generation;
    if (!microphone_generation_.compare_exchange_strong(
            expected, 0, std::memory_order_acq_rel,
            std::memory_order_acquire)) {
        return false;
    }
    expected = generation;
    (void)microphone_ready_generation_.compare_exchange_strong(
        expected, 0, std::memory_order_acq_rel, std::memory_order_acquire);
    return true;
}

std::uint32_t AudioIoArbiter::speaker_generation() const {
    return speaker_generation_.load(std::memory_order_acquire);
}

std::uint32_t AudioIoArbiter::microphone_generation() const {
    return microphone_generation_.load(std::memory_order_acquire);
}

bool AudioIoArbiter::microphone_ready(std::uint32_t generation) const {
    return generation != 0 && microphone_generation() == generation &&
           microphone_ready_generation_.load(std::memory_order_acquire) ==
               generation &&
           !speaker_active();
}

}  // namespace deskmate::easyinput
