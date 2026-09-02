#pragma once

#include <cstddef>
#include <cstdint>

namespace deskmate::xiaozhi {

enum class ServoAxis : std::uint8_t {
    kYaw = 0,
    kPitch = 1,
};

enum class ServoAdapterOperation : std::uint8_t {
    kProvisionalCenter,
    kRelativeStep,
    kRecenter,
};

enum class ServoAdapterResult : std::uint8_t {
    kApplied,
    kUnavailable,
    kOutOfRange,
    kFailure,
};

struct ServoAdapterCommand {
    ServoAdapterOperation operation{ServoAdapterOperation::kProvisionalCenter};
    ServoAxis axis{ServoAxis::kYaw};
    std::int16_t value_tenths_degree{};
};

struct ServoBoardEvidence {
    static constexpr int kYawGpio = 11;
    static constexpr int kPitchGpio = 12;
    static constexpr std::uint16_t kFrequencyHz = 50;
    static constexpr bool kReferenceBoardMapDocumented = true;
    static constexpr bool kInstalledMappingVerified = false;
    static constexpr bool kInstallationAllowed = false;
};

struct ServoAxisCalibrationProfile {
    int gpio{-1};
    std::uint16_t center_pulse_us{};
    std::uint16_t minimum_pulse_us{};
    std::uint16_t maximum_pulse_us{};
    std::uint16_t pulse_per_degree_us{};
    std::int8_t direction{};
    bool installed_mapping_verified{};
    bool center_verified{};
    bool direction_verified{};
    bool limits_verified{};
    bool pulse_scale_verified{};
};

struct ServoCalibrationProfile {
    bool calibration_build_enabled{};
    bool power_path_verified{};
    bool common_ground_verified{};
    bool emergency_cutoff_verified{};
    ServoAxisCalibrationProfile yaw{};
    ServoAxisCalibrationProfile pitch{};
};

class ServoPwmBackend {
public:
    virtual ~ServoPwmBackend() = default;
    virtual bool ConfigureAxis(ServoAxis axis, int gpio,
                               std::uint16_t frequency_hz) noexcept = 0;
    virtual bool WritePulse(ServoAxis axis,
                            std::uint16_t pulse_us) noexcept = 0;
    virtual void DisableAxis(ServoAxis axis, int gpio) noexcept = 0;
};

class ServoAdapter {
public:
    virtual ~ServoAdapter() = default;
    virtual bool IsAvailable() const noexcept = 0;
    virtual ServoAdapterResult Apply(
        const ServoAdapterCommand& command) noexcept = 0;
    virtual void DisableOutputs() noexcept = 0;
};

class DisabledServoAdapter final : public ServoAdapter {
public:
    bool IsAvailable() const noexcept override;
    ServoAdapterResult Apply(
        const ServoAdapterCommand& command) noexcept override;
    void DisableOutputs() noexcept override;
};

class CalibratedServoAdapter final : public ServoAdapter {
public:
    CalibratedServoAdapter(ServoPwmBackend& backend,
                           const ServoCalibrationProfile& profile) noexcept;

    bool IsAvailable() const noexcept override;
    ServoAdapterResult Apply(
        const ServoAdapterCommand& command) noexcept override;
    void DisableOutputs() noexcept override;

    static bool ProfileIsSafe(
        const ServoCalibrationProfile& profile) noexcept;
    bool output_enabled(ServoAxis axis) const noexcept;
    std::uint16_t current_pulse_us(ServoAxis axis) const noexcept;

private:
    struct AxisRuntime {
        bool configured{};
        bool center_written{};
        std::uint16_t current_pulse_us{};
    };

    static std::size_t AxisIndex(ServoAxis axis) noexcept;
    const ServoAxisCalibrationProfile& AxisProfile(ServoAxis axis) const noexcept;
    ServoAdapterResult Write(ServoAxis axis,
                             std::uint16_t pulse_us) noexcept;

    ServoPwmBackend& backend_;
    ServoCalibrationProfile profile_{};
    AxisRuntime runtime_[2]{};
};

}  // namespace deskmate::xiaozhi
