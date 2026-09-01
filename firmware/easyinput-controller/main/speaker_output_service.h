#pragma once

#include "audio_io_arbiter.h"
#include "peripheral_power.h"
#include "speaker_output_core.h"

#include "driver/i2s_std.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

#include <array>
#include <atomic>
#include <cstdint>

namespace deskmate::easyinput {

// T11E-A local output endpoint. It intentionally has no network or HID audio
// wire: the first hardware gate is a short, synthesized startup probe only.
class SpeakerOutputService {
public:
    bool begin(PeripheralPowerController& power, AudioIoArbiter& arbiter);
    bool request_startup_probe();
    SpeakerOutputDiagnostics snapshot() const;

private:
    struct Command {
        std::uint32_t generation{};
    };

    struct ProbeRunResult {
        bool playback_succeeded{};
        bool cancelled_for_microphone{};
        bool ownership_released{};
    };

    static void worker_entry(void* context);
    void worker_loop();
    ProbeRunResult run_probe(std::uint32_t generation);
    bool write_frame(const std::int16_t* samples, std::size_t count);
    void set_state(SpeakerOutputState state);
    void increment(std::atomic<std::uint32_t>& counter);

    PeripheralPowerController* power_{};
    AudioIoArbiter* arbiter_{};
    i2s_chan_handle_t tx_{};
    QueueHandle_t command_queue_{};
    StaticQueue_t command_queue_control_{};
    std::array<std::uint8_t, sizeof(Command)> command_queue_storage_{};
    TaskHandle_t worker_task_{};

    std::atomic<std::uint8_t> state_{
        static_cast<std::uint8_t>(SpeakerOutputState::Disabled)};
    std::atomic<std::uint32_t> generation_counter_{};
    std::atomic<std::uint32_t> requests_{};
    std::atomic<std::uint32_t> completed_{};
    std::atomic<std::uint32_t> cancelled_for_microphone_{};
    std::atomic<std::uint32_t> busy_rejections_{};
    std::atomic<std::uint32_t> init_errors_{};
    std::atomic<std::uint32_t> write_errors_{};
    std::atomic<std::uint32_t> cleanup_errors_{};
};

}  // namespace deskmate::easyinput
