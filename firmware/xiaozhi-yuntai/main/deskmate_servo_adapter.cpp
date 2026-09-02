#include "deskmate_servo_adapter.h"

#include "driver/gpio.h"
#include "driver/ledc.h"
#include "sdkconfig.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::xiaozhi {
namespace {

constexpr ledc_mode_t kServoSpeedMode = LEDC_LOW_SPEED_MODE;
constexpr ledc_timer_t kServoTimer = LEDC_TIMER_0;
constexpr ledc_timer_bit_t kServoResolution = LEDC_TIMER_14_BIT;
constexpr std::uint32_t kServoPeriodUs = 20000;
constexpr std::uint32_t kServoDutyMaximum = (1u << 14u) - 1u;

std::size_t AxisIndex(ServoAxis axis) noexcept {
    return axis == ServoAxis::kYaw ? 0u : 1u;
}

ledc_channel_t ChannelFor(ServoAxis axis) noexcept {
    return axis == ServoAxis::kYaw ? LEDC_CHANNEL_0 : LEDC_CHANNEL_1;
}

class EspIdfServoPwmBackend final : public ServoPwmBackend {
public:
    bool ConfigureAxis(ServoAxis axis, int gpio,
                       std::uint16_t frequency_hz) noexcept override {
        if ((axis != ServoAxis::kYaw && axis != ServoAxis::kPitch) ||
            frequency_hz != ServoBoardEvidence::kFrequencyHz) {
            return false;
        }
        const int evidence_gpio = axis == ServoAxis::kYaw
                                      ? ServoBoardEvidence::kYawGpio
                                      : ServoBoardEvidence::kPitchGpio;
        if (gpio != evidence_gpio) return false;

        if (!timer_configured_) {
            ledc_timer_config_t timer{};
            timer.speed_mode = kServoSpeedMode;
            timer.duty_resolution = kServoResolution;
            timer.timer_num = kServoTimer;
            timer.freq_hz = frequency_hz;
            timer.clk_cfg = LEDC_AUTO_CLK;
            if (ledc_timer_config(&timer) != ESP_OK) return false;
            timer_configured_ = true;
        }

        ledc_channel_config_t channel{};
        channel.gpio_num = gpio;
        channel.speed_mode = kServoSpeedMode;
        channel.channel = ChannelFor(axis);
        channel.intr_type = LEDC_INTR_DISABLE;
        channel.timer_sel = kServoTimer;
        channel.duty = 0;
        channel.hpoint = 0;
        if (ledc_channel_config(&channel) != ESP_OK) return false;
        configured_[AxisIndex(axis)] = true;
        return true;
    }

    bool WritePulse(ServoAxis axis,
                    std::uint16_t pulse_us) noexcept override {
        if ((axis != ServoAxis::kYaw && axis != ServoAxis::kPitch) ||
            !configured_[AxisIndex(axis)] || pulse_us >= kServoPeriodUs) {
            return false;
        }
        const std::uint32_t duty =
            (static_cast<std::uint32_t>(pulse_us) * kServoDutyMaximum) /
            kServoPeriodUs;
        const auto channel = ChannelFor(axis);
        return ledc_set_duty(kServoSpeedMode, channel, duty) == ESP_OK &&
               ledc_update_duty(kServoSpeedMode, channel) == ESP_OK;
    }

    void DisableAxis(ServoAxis axis, int gpio) noexcept override {
        if (axis != ServoAxis::kYaw && axis != ServoAxis::kPitch) return;
        const auto index = AxisIndex(axis);
        if (configured_[index]) {
            (void)ledc_stop(kServoSpeedMode, ChannelFor(axis), 0);
            configured_[index] = false;
        }
        if (gpio == ServoBoardEvidence::kYawGpio ||
            gpio == ServoBoardEvidence::kPitchGpio) {
            (void)gpio_reset_pin(static_cast<gpio_num_t>(gpio));
        }
    }

private:
    bool timer_configured_{};
    std::array<bool, 2> configured_{};
};

bool CalibrationBuildEnabled() noexcept {
#ifdef CONFIG_DESKMATE_T10DC_SERVO_CALIBRATION_ENABLE
    return true;
#else
    return false;
#endif
}

bool InstalledPinoutVerified() noexcept {
#ifdef CONFIG_DESKMATE_T10DC_INSTALLED_PINOUT_VERIFIED
    return true;
#else
    return false;
#endif
}

bool PowerPathVerified() noexcept {
#ifdef CONFIG_DESKMATE_T10DC_POWER_PATH_VERIFIED
    return true;
#else
    return false;
#endif
}

bool CommonGroundVerified() noexcept {
#ifdef CONFIG_DESKMATE_T10DC_COMMON_GROUND_VERIFIED
    return true;
#else
    return false;
#endif
}

bool EmergencyCutoffVerified() noexcept {
#ifdef CONFIG_DESKMATE_T10DC_EMERGENCY_CUTOFF_VERIFIED
    return true;
#else
    return false;
#endif
}

ServoAxisCalibrationProfile YawProfile() noexcept {
    return ServoAxisCalibrationProfile{
        ServoBoardEvidence::kYawGpio,
        CONFIG_DESKMATE_T10DC_YAW_CENTER_PULSE_US,
        CONFIG_DESKMATE_T10DC_YAW_MINIMUM_PULSE_US,
        CONFIG_DESKMATE_T10DC_YAW_MAXIMUM_PULSE_US,
        CONFIG_DESKMATE_T10DC_YAW_PULSE_PER_DEGREE_US,
        CONFIG_DESKMATE_T10DC_YAW_DIRECTION,
        InstalledPinoutVerified(),
#ifdef CONFIG_DESKMATE_T10DC_YAW_CENTER_VERIFIED
        true,
#else
        false,
#endif
#ifdef CONFIG_DESKMATE_T10DC_YAW_DIRECTION_VERIFIED
        true,
#else
        false,
#endif
#ifdef CONFIG_DESKMATE_T10DC_YAW_LIMITS_VERIFIED
        true,
#else
        false,
#endif
#ifdef CONFIG_DESKMATE_T10DC_YAW_PULSE_SCALE_VERIFIED
        true,
#else
        false,
#endif
    };
}

ServoAxisCalibrationProfile PitchProfile() noexcept {
    return ServoAxisCalibrationProfile{
        ServoBoardEvidence::kPitchGpio,
        CONFIG_DESKMATE_T10DC_PITCH_CENTER_PULSE_US,
        CONFIG_DESKMATE_T10DC_PITCH_MINIMUM_PULSE_US,
        CONFIG_DESKMATE_T10DC_PITCH_MAXIMUM_PULSE_US,
        CONFIG_DESKMATE_T10DC_PITCH_PULSE_PER_DEGREE_US,
        CONFIG_DESKMATE_T10DC_PITCH_DIRECTION,
        InstalledPinoutVerified(),
#ifdef CONFIG_DESKMATE_T10DC_PITCH_CENTER_VERIFIED
        true,
#else
        false,
#endif
#ifdef CONFIG_DESKMATE_T10DC_PITCH_DIRECTION_VERIFIED
        true,
#else
        false,
#endif
#ifdef CONFIG_DESKMATE_T10DC_PITCH_LIMITS_VERIFIED
        true,
#else
        false,
#endif
#ifdef CONFIG_DESKMATE_T10DC_PITCH_PULSE_SCALE_VERIFIED
        true,
#else
        false,
#endif
    };
}

ServoCalibrationProfile BuildProfile() noexcept {
    return ServoCalibrationProfile{
        CalibrationBuildEnabled(), PowerPathVerified(), CommonGroundVerified(),
        EmergencyCutoffVerified(), YawProfile(), PitchProfile()};
}

}  // namespace

ServoAdapter& GetDeskMateServoAdapter() noexcept {
    static EspIdfServoPwmBackend backend;
    static CalibratedServoAdapter adapter(backend, BuildProfile());
    return adapter;
}

}  // namespace deskmate::xiaozhi
