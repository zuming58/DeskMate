#include "speaker_output_service.h"

#include "board_pins.h"

#include <algorithm>

namespace deskmate::easyinput {
namespace {

constexpr std::uint32_t kWriteTimeoutMs = 60;
constexpr std::size_t kProbeToneFrames = 10;
constexpr std::size_t kProbeGapFrames = 5;
constexpr std::size_t kProbeFrameCount =
    kProbeToneFrames * 2 + kProbeGapFrames;
constexpr std::int16_t kProbeAmplitude = 2200;
constexpr std::uint32_t kTrianglePeriodSamples = 80;  // 600 Hz at 48 kHz.

void fill_probe_frame(std::array<std::int16_t, kSpeakerFrameSamples>& frame,
                      std::size_t frame_index) {
    if (frame_index >= kProbeToneFrames &&
        frame_index < kProbeToneFrames + kProbeGapFrames) {
        frame.fill(0);
        return;
    }
    const std::uint32_t base = static_cast<std::uint32_t>(
        frame_index * kSpeakerFrameSamples);
    for (std::size_t index = 0; index < frame.size(); ++index) {
        const std::uint32_t phase =
            (base + static_cast<std::uint32_t>(index)) %
            kTrianglePeriodSamples;
        const std::uint32_t quarter = kTrianglePeriodSamples / 4;
        std::int32_t value = 0;
        if (phase < quarter) {
            value = static_cast<std::int32_t>(phase) * kProbeAmplitude /
                    static_cast<std::int32_t>(quarter);
        } else if (phase < quarter * 3) {
            value = kProbeAmplitude -
                    static_cast<std::int32_t>(phase - quarter) *
                        (kProbeAmplitude * 2) /
                        static_cast<std::int32_t>(quarter * 2);
        } else {
            value = -kProbeAmplitude +
                    static_cast<std::int32_t>(phase - quarter * 3) *
                        kProbeAmplitude /
                        static_cast<std::int32_t>(quarter);
        }
        frame[index] = static_cast<std::int16_t>(value);
    }
}

}  // namespace

bool SpeakerOutputService::begin(PeripheralPowerController& power,
                                 AudioIoArbiter& arbiter) {
    power_ = &power;
    arbiter_ = &arbiter;
    if (!power.ready()) {
        set_state(SpeakerOutputState::Faulted);
        return false;
    }
    command_queue_ = xQueueCreateStatic(
        1, sizeof(Command), command_queue_storage_.data(),
        &command_queue_control_);
    if (command_queue_ == nullptr ||
        xTaskCreate(worker_entry, "speaker_output", 4096, this, 5,
                    &worker_task_) != pdPASS) {
        set_state(SpeakerOutputState::Faulted);
        return false;
    }
    set_state(SpeakerOutputState::Ready);
    return true;
}

bool SpeakerOutputService::request_startup_probe() {
    std::uint8_t expected = static_cast<std::uint8_t>(
        SpeakerOutputState::Ready);
    if (!state_.compare_exchange_strong(
            expected, static_cast<std::uint8_t>(SpeakerOutputState::Starting),
            std::memory_order_acq_rel, std::memory_order_acquire)) {
        increment(busy_rejections_);
        return false;
    }
    std::uint32_t generation = generation_counter_.fetch_add(
        1, std::memory_order_acq_rel) + 1;
    if (generation == 0) {
        generation_counter_.store(1, std::memory_order_release);
        generation = 1;
    }
    Command command{generation};
    if (command_queue_ == nullptr ||
        xQueueSend(command_queue_, &command, 0) != pdTRUE) {
        increment(busy_rejections_);
        set_state(SpeakerOutputState::Ready);
        return false;
    }
    increment(requests_);
    return true;
}

SpeakerOutputDiagnostics SpeakerOutputService::snapshot() const {
    SpeakerOutputDiagnostics result{};
    result.state = static_cast<SpeakerOutputState>(
        state_.load(std::memory_order_acquire));
    result.requests = requests_.load(std::memory_order_relaxed);
    result.completed = completed_.load(std::memory_order_relaxed);
    result.cancelled_for_microphone =
        cancelled_for_microphone_.load(std::memory_order_relaxed);
    result.busy_rejections = busy_rejections_.load(std::memory_order_relaxed);
    result.init_errors = init_errors_.load(std::memory_order_relaxed);
    result.write_errors = write_errors_.load(std::memory_order_relaxed);
    result.cleanup_errors = cleanup_errors_.load(std::memory_order_relaxed);
    return result;
}

void SpeakerOutputService::worker_entry(void* context) {
    static_cast<SpeakerOutputService*>(context)->worker_loop();
}

void SpeakerOutputService::worker_loop() {
    for (;;) {
        Command command{};
        if (xQueueReceive(command_queue_, &command, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        if (arbiter_ == nullptr || power_ == nullptr ||
            !arbiter_->try_begin_speaker(command.generation)) {
            increment(busy_rejections_);
            set_state(SpeakerOutputState::Ready);
            continue;
        }
        ProbeRunResult result = run_probe(command.generation);
        if (result.ownership_released &&
            !arbiter_->finish_speaker(command.generation)) {
            increment(cleanup_errors_);
            result.ownership_released = false;
        }
        switch (resolve_speaker_probe_terminal(
            result.playback_succeeded,
            result.cancelled_for_microphone,
            result.ownership_released)) {
            case SpeakerProbeTerminal::Completed:
                increment(completed_);
                set_state(SpeakerOutputState::Ready);
                break;
            case SpeakerProbeTerminal::CancelledForMicrophone:
                increment(cancelled_for_microphone_);
                set_state(SpeakerOutputState::Ready);
                break;
            case SpeakerProbeTerminal::Faulted:
                set_state(SpeakerOutputState::Faulted);
                break;
        }
    }
}

SpeakerOutputService::ProbeRunResult SpeakerOutputService::run_probe(
    std::uint32_t generation) {
    ProbeRunResult result{};
    if (arbiter_->microphone_requested()) {
        result.cancelled_for_microphone = true;
        result.ownership_released = true;
        return result;
    }

    if (!power_->acquire_consumer(PeripheralPowerOwner::Speaker)) {
        if (arbiter_->microphone_requested()) {
            result.cancelled_for_microphone = true;
        } else {
            increment(init_errors_);
        }
        result.ownership_released = true;
        return result;
    }

    bool channel_enabled = false;
    i2s_chan_config_t channel =
        I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
    channel.dma_desc_num = kSpeakerDmaDescriptorCount;
    channel.dma_frame_num = kSpeakerFrameSamples;
    channel.auto_clear_after_cb = true;
    esp_err_t error = ESP_OK;
    if (arbiter_->microphone_requested()) {
        result.cancelled_for_microphone = true;
    } else {
        error = i2s_new_channel(&channel, &tx_, nullptr);
    }
    if (error == ESP_OK) {
        if (result.cancelled_for_microphone ||
            arbiter_->microphone_requested()) {
            result.cancelled_for_microphone = true;
        } else {
            i2s_std_config_t standard{
                .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(kSpeakerSampleRate),
                .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
                    I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
                .gpio_cfg = {
                    .mclk = I2S_GPIO_UNUSED,
                    .bclk = static_cast<gpio_num_t>(kSpeakerI2sBclkGpio),
                    .ws = static_cast<gpio_num_t>(kSpeakerI2sWsGpio),
                    .dout = static_cast<gpio_num_t>(kSpeakerI2sDoutGpio),
                    .din = I2S_GPIO_UNUSED,
                    .invert_flags = {},
                },
            };
            standard.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;
            error = i2s_channel_init_std_mode(tx_, &standard);
        }
    }

    std::array<std::int16_t, kSpeakerFrameSamples> frame{};
    if (error == ESP_OK && !result.cancelled_for_microphone) {
        if (arbiter_->microphone_requested()) {
            result.cancelled_for_microphone = true;
        } else {
            std::size_t loaded = 0;
            error = i2s_channel_preload_data(
                tx_, frame.data(), frame.size() * sizeof(frame[0]), &loaded);
            if (error == ESP_OK &&
                loaded != frame.size() * sizeof(frame[0])) {
                error = ESP_ERR_INVALID_SIZE;
            }
        }
    }
    if (error == ESP_OK && !result.cancelled_for_microphone) {
        if (arbiter_->microphone_requested()) {
            result.cancelled_for_microphone = true;
        } else {
            error = i2s_channel_enable(tx_);
            channel_enabled = error == ESP_OK;
        }
    }
    if (error != ESP_OK) {
        increment(init_errors_);
    } else if (!result.cancelled_for_microphone) {
        for (std::size_t index = 0; index < kProbeFrameCount; ++index) {
            if (arbiter_->microphone_requested()) {
                result.cancelled_for_microphone = true;
                break;
            }
            fill_probe_frame(frame, index);
            if (!write_frame(frame.data(), frame.size())) {
                error = ESP_FAIL;
                increment(write_errors_);
                break;
            }
            if (index == 0) set_state(SpeakerOutputState::Playing);
        }
        if (error == ESP_OK && !result.cancelled_for_microphone) {
            frame.fill(0);
            for (std::size_t index = 0;
                 index < kSpeakerNormalDrainZeroFrames; ++index) {
                if (arbiter_->microphone_requested()) {
                    result.cancelled_for_microphone = true;
                    break;
                }
                if (!write_frame(frame.data(), frame.size())) {
                    error = ESP_FAIL;
                    increment(write_errors_);
                    break;
                }
            }
        }
    }

    bool cleanup_succeeded = true;
    if (channel_enabled) {
        const esp_err_t disable_error = i2s_channel_disable(tx_);
        if (disable_error != ESP_OK) {
            increment(cleanup_errors_);
            cleanup_succeeded = false;
        }
    }
    if (cleanup_succeeded && tx_ != nullptr) {
        if (i2s_del_channel(tx_) == ESP_OK) {
            tx_ = nullptr;
        } else {
            increment(cleanup_errors_);
            cleanup_succeeded = false;
        }
    }
    if (cleanup_succeeded) {
        if (!power_->release_consumer(PeripheralPowerOwner::Speaker)) {
            increment(cleanup_errors_);
            cleanup_succeeded = false;
        }
    }
    result.playback_succeeded = error == ESP_OK;
    result.ownership_released = cleanup_succeeded;
    // The worker acquired this exact generation before entering run_probe;
    // only worker_loop may release it after this result proves cleanup.
    (void)generation;
    return result;
}

bool SpeakerOutputService::write_frame(const std::int16_t* samples,
                                       std::size_t count) {
    if (tx_ == nullptr || samples == nullptr || count == 0) return false;
    const auto* bytes = reinterpret_cast<const std::uint8_t*>(samples);
    const std::size_t total = count * sizeof(samples[0]);
    std::size_t offset = 0;
    while (offset < total) {
        std::size_t written = 0;
        if (i2s_channel_write(tx_, bytes + offset, total - offset, &written,
                              kWriteTimeoutMs) != ESP_OK ||
            written == 0) {
            return false;
        }
        offset += written;
    }
    return true;
}

void SpeakerOutputService::set_state(SpeakerOutputState state) {
    state_.store(static_cast<std::uint8_t>(state), std::memory_order_release);
}

void SpeakerOutputService::increment(std::atomic<std::uint32_t>& counter) {
    counter.fetch_add(1, std::memory_order_relaxed);
}

}  // namespace deskmate::easyinput
