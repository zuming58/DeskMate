#include "servo_adapter.h"

#include <cstdint>
#include <initializer_list>
#include <limits>

namespace deskmate::xiaozhi {

bool DisabledServoAdapter::IsAvailable() const noexcept {
    return false;
}

ServoAdapterResult DisabledServoAdapter::Apply(
    const ServoAdapterCommand&) noexcept {
    return ServoAdapterResult::kUnavailable;
}

bool DisabledServoAdapter::GetRuntimeEnvelope(
    ServoRuntimeEnvelope&) const noexcept {
    return false;
}

void DisabledServoAdapter::DisableOutputs() noexcept {}

namespace {

constexpr std::uint16_t kReferenceMinimumPulseUs = 500;
constexpr std::uint16_t kReferenceMaximumPulseUs = 2500;
constexpr std::int16_t kOneDegreeTenths = 10;

bool AxisProfileIsSafe(const ServoAxisCalibrationProfile& profile,
                       int evidence_gpio) noexcept {
    return profile.gpio == evidence_gpio &&
           profile.installed_mapping_verified && profile.center_verified &&
           profile.direction_verified && profile.limits_verified &&
           profile.pulse_scale_verified &&
           (profile.direction == -1 || profile.direction == 1) &&
           profile.pulse_per_degree_us > 0 &&
           profile.minimum_pulse_us >= kReferenceMinimumPulseUs &&
           profile.maximum_pulse_us <= kReferenceMaximumPulseUs &&
           profile.minimum_pulse_us < profile.center_pulse_us &&
           profile.center_pulse_us < profile.maximum_pulse_us &&
           profile.pulse_per_degree_us <=
               profile.center_pulse_us - profile.minimum_pulse_us &&
           profile.pulse_per_degree_us <=
               profile.maximum_pulse_us - profile.center_pulse_us;
}

bool PulseForLogicalOffset(const ServoAxisCalibrationProfile& profile,
                           std::int16_t tenths_degree,
                           std::uint16_t& pulse_us) noexcept {
    const std::int32_t scaled =
        static_cast<std::int32_t>(tenths_degree) *
        static_cast<std::int32_t>(profile.pulse_per_degree_us);
    if (scaled % kOneDegreeTenths != 0) return false;
    const std::int32_t target =
        static_cast<std::int32_t>(profile.center_pulse_us) +
        (scaled / kOneDegreeTenths) * profile.direction;
    if (target < profile.minimum_pulse_us ||
        target > profile.maximum_pulse_us || target < 0 ||
        target > std::numeric_limits<std::uint16_t>::max()) {
        return false;
    }
    pulse_us = static_cast<std::uint16_t>(target);
    return true;
}

bool RuntimeEnvelopeFits(const ServoCalibrationProfile& profile) noexcept {
    std::uint16_t ignored{};
    return PulseForLogicalOffset(
               profile.yaw, kRuntimeYawMinimumTenthsDegree, ignored) &&
           PulseForLogicalOffset(
               profile.yaw, kRuntimeYawMaximumTenthsDegree, ignored) &&
           PulseForLogicalOffset(
               profile.pitch, kRuntimePitchMinimumTenthsDegree, ignored) &&
           PulseForLogicalOffset(
               profile.pitch, kRuntimePitchMaximumTenthsDegree, ignored);
}

}  // namespace

CalibratedServoAdapter::CalibratedServoAdapter(
    ServoPwmBackend& backend,
    const ServoCalibrationProfile& profile) noexcept
    : backend_(backend), profile_(profile) {}

bool CalibratedServoAdapter::ProfileIsSafe(
    const ServoCalibrationProfile& profile) noexcept {
    return profile.calibration_build_enabled &&
           profile.power_path_verified && profile.common_ground_verified &&
           profile.emergency_cutoff_verified &&
           AxisProfileIsSafe(profile.yaw, ServoBoardEvidence::kYawGpio) &&
           AxisProfileIsSafe(profile.pitch, ServoBoardEvidence::kPitchGpio) &&
           profile.yaw.gpio != profile.pitch.gpio;
}

bool CalibratedServoAdapter::IsAvailable() const noexcept {
    return ProfileIsSafe(profile_);
}

bool CalibratedServoAdapter::GetRuntimeEnvelope(
    ServoRuntimeEnvelope& envelope) const noexcept {
    if (!ProfileIsSafe(profile_) || !RuntimeEnvelopeFits(profile_)) {
        return false;
    }
    envelope = ServoRuntimeEnvelope{
        kRuntimeYawMinimumTenthsDegree,
        kRuntimeYawMaximumTenthsDegree,
        kRuntimePitchMinimumTenthsDegree,
        kRuntimePitchMaximumTenthsDegree,
        kRuntimeMaximumStepTenthsDegree,
    };
    return true;
}

std::size_t CalibratedServoAdapter::AxisIndex(ServoAxis axis) noexcept {
    return axis == ServoAxis::kYaw ? 0u : 1u;
}

const ServoAxisCalibrationProfile& CalibratedServoAdapter::AxisProfile(
    ServoAxis axis) const noexcept {
    return axis == ServoAxis::kYaw ? profile_.yaw : profile_.pitch;
}

ServoAdapterResult CalibratedServoAdapter::Write(
    ServoAxis axis, std::uint16_t pulse_us) noexcept {
    const auto& profile = AxisProfile(axis);
    auto& runtime = runtime_[AxisIndex(axis)];
    if (!runtime.configured) {
        if (!backend_.ConfigureAxis(axis, profile.gpio,
                                    ServoBoardEvidence::kFrequencyHz)) {
            backend_.DisableAxis(axis, profile.gpio);
            return ServoAdapterResult::kFailure;
        }
        runtime.configured = true;
    }
    if (!backend_.WritePulse(axis, pulse_us)) {
        DisableOutputs();
        return ServoAdapterResult::kFailure;
    }
    runtime.center_written = true;
    runtime.current_pulse_us = pulse_us;
    return ServoAdapterResult::kApplied;
}

ServoAdapterResult CalibratedServoAdapter::Apply(
    const ServoAdapterCommand& command) noexcept {
    if (!IsAvailable()) return ServoAdapterResult::kUnavailable;
    if (command.axis != ServoAxis::kYaw && command.axis != ServoAxis::kPitch) {
        return ServoAdapterResult::kFailure;
    }

    const auto& profile = AxisProfile(command.axis);
    const auto& runtime = runtime_[AxisIndex(command.axis)];
    switch (command.operation) {
        case ServoAdapterOperation::kProvisionalCenter:
            if (command.value_tenths_degree != 0) {
                return ServoAdapterResult::kOutOfRange;
            }
            return Write(command.axis, profile.center_pulse_us);
        case ServoAdapterOperation::kRelativeStep: {
            if (!runtime.center_written ||
                (command.value_tenths_degree != -kOneDegreeTenths &&
                 command.value_tenths_degree != kOneDegreeTenths)) {
                return ServoAdapterResult::kOutOfRange;
            }
            const std::int32_t logical_direction =
                command.value_tenths_degree > 0 ? 1 : -1;
            const std::int32_t delta =
                logical_direction * profile.direction *
                profile.pulse_per_degree_us;
            const std::int32_t target =
                static_cast<std::int32_t>(runtime.current_pulse_us) + delta;
            if (target < profile.minimum_pulse_us ||
                target > profile.maximum_pulse_us || target < 0 ||
                target > std::numeric_limits<std::uint16_t>::max()) {
                return ServoAdapterResult::kOutOfRange;
            }
            return Write(command.axis, static_cast<std::uint16_t>(target));
        }
        case ServoAdapterOperation::kRecenter:
            if (!runtime.center_written || command.value_tenths_degree != 0) {
                return ServoAdapterResult::kOutOfRange;
            }
            return Write(command.axis, profile.center_pulse_us);
        case ServoAdapterOperation::kAbsoluteRuntimeTarget: {
            const std::int16_t minimum =
                command.axis == ServoAxis::kYaw
                    ? kRuntimeYawMinimumTenthsDegree
                    : kRuntimePitchMinimumTenthsDegree;
            const std::int16_t maximum =
                command.axis == ServoAxis::kYaw
                    ? kRuntimeYawMaximumTenthsDegree
                    : kRuntimePitchMaximumTenthsDegree;
            if (command.value_tenths_degree < minimum ||
                command.value_tenths_degree > maximum) {
                return ServoAdapterResult::kOutOfRange;
            }
            std::uint16_t pulse_us{};
            if (!PulseForLogicalOffset(profile,
                                       command.value_tenths_degree,
                                       pulse_us)) {
                return ServoAdapterResult::kOutOfRange;
            }
            return Write(command.axis, pulse_us);
        }
    }
    return ServoAdapterResult::kFailure;
}

void CalibratedServoAdapter::DisableOutputs() noexcept {
    for (const auto axis : {ServoAxis::kYaw, ServoAxis::kPitch}) {
        auto& runtime = runtime_[AxisIndex(axis)];
        if (runtime.configured) {
            backend_.DisableAxis(axis, AxisProfile(axis).gpio);
        }
        runtime = {};
    }
}

bool CalibratedServoAdapter::output_enabled(ServoAxis axis) const noexcept {
    return runtime_[AxisIndex(axis)].configured;
}

std::uint16_t CalibratedServoAdapter::current_pulse_us(
    ServoAxis axis) const noexcept {
    return runtime_[AxisIndex(axis)].current_pulse_us;
}

}  // namespace deskmate::xiaozhi
