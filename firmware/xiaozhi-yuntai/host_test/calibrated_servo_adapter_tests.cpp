#include "servo_adapter.h"

#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>

namespace {

using namespace deskmate::xiaozhi;

struct BackendEvent {
    ServoAxis axis{ServoAxis::kYaw};
    int gpio{};
    std::uint16_t value{};
};

class FakePwmBackend final : public ServoPwmBackend {
public:
    bool ConfigureAxis(ServoAxis axis, int gpio,
                       std::uint16_t frequency_hz) noexcept override {
        configures.push_back({axis, gpio, frequency_hz});
        if (fail_configure) {
            fail_configure = false;
            return false;
        }
        return true;
    }

    bool WritePulse(ServoAxis axis,
                    std::uint16_t pulse_us) noexcept override {
        writes.push_back({axis, 0, pulse_us});
        if (fail_write) {
            fail_write = false;
            return false;
        }
        return true;
    }

    void DisableAxis(ServoAxis axis, int gpio) noexcept override {
        disables.push_back({axis, gpio, 0});
    }

    bool fail_configure{};
    bool fail_write{};
    std::vector<BackendEvent> configures{};
    std::vector<BackendEvent> writes{};
    std::vector<BackendEvent> disables{};
};

ServoAxisCalibrationProfile Axis(int gpio, std::uint16_t step,
                                 std::int8_t direction) {
    return ServoAxisCalibrationProfile{gpio, 1500, 1400, 1600, step,
                                       direction, true, true, true, true,
                                       true};
}

ServoCalibrationProfile SafeProfile() {
    return ServoCalibrationProfile{true, true, true, true,
                                   Axis(11, 10, 1), Axis(12, 8, -1)};
}

ServoAdapterCommand Command(ServoAdapterOperation operation, ServoAxis axis,
                            std::int16_t value = 0) {
    return ServoAdapterCommand{operation, axis, value};
}

void DefaultAndIncompleteProfilesStayLocked() {
    FakePwmBackend backend;
    ServoCalibrationProfile profile{};
    CalibratedServoAdapter locked(backend, profile);
    assert(!locked.IsAvailable());
    assert(locked.Apply(Command(ServoAdapterOperation::kProvisionalCenter,
                                ServoAxis::kYaw)) ==
           ServoAdapterResult::kUnavailable);
    assert(backend.configures.empty());
    assert(backend.writes.empty());

    profile = SafeProfile();
    profile.yaw.gpio = 13;
    assert(!CalibratedServoAdapter::ProfileIsSafe(profile));
    profile = SafeProfile();
    profile.pitch.center_verified = false;
    assert(!CalibratedServoAdapter::ProfileIsSafe(profile));
    profile = SafeProfile();
    profile.power_path_verified = false;
    assert(!CalibratedServoAdapter::ProfileIsSafe(profile));
}

void OutputIsLazySingleAxisAndFixedOneDegree() {
    FakePwmBackend backend;
    CalibratedServoAdapter adapter(backend, SafeProfile());
    assert(adapter.IsAvailable());
    assert(backend.configures.empty());
    assert(backend.writes.empty());

    assert(adapter.Apply(Command(ServoAdapterOperation::kProvisionalCenter,
                                 ServoAxis::kYaw)) ==
           ServoAdapterResult::kApplied);
    assert(backend.configures.size() == 1);
    assert(backend.configures[0].axis == ServoAxis::kYaw);
    assert(backend.configures[0].gpio == 11);
    assert(backend.configures[0].value == 50);
    assert(backend.writes.back().value == 1500);
    assert(adapter.output_enabled(ServoAxis::kYaw));
    assert(!adapter.output_enabled(ServoAxis::kPitch));

    assert(adapter.Apply(Command(ServoAdapterOperation::kRelativeStep,
                                 ServoAxis::kYaw, 10)) ==
           ServoAdapterResult::kApplied);
    assert(backend.writes.back().value == 1510);
    assert(adapter.Apply(Command(ServoAdapterOperation::kRelativeStep,
                                 ServoAxis::kYaw, 20)) ==
           ServoAdapterResult::kOutOfRange);
    assert(backend.writes.back().value == 1510);
}

void DirectionLimitsRecenterAndDisableAreConservative() {
    FakePwmBackend backend;
    CalibratedServoAdapter adapter(backend, SafeProfile());
    assert(adapter.Apply(Command(ServoAdapterOperation::kRelativeStep,
                                 ServoAxis::kPitch, 10)) ==
           ServoAdapterResult::kOutOfRange);
    assert(backend.configures.empty());

    assert(adapter.Apply(Command(ServoAdapterOperation::kProvisionalCenter,
                                 ServoAxis::kPitch)) ==
           ServoAdapterResult::kApplied);
    assert(adapter.Apply(Command(ServoAdapterOperation::kRelativeStep,
                                 ServoAxis::kPitch, 10)) ==
           ServoAdapterResult::kApplied);
    assert(backend.writes.back().value == 1492);
    assert(adapter.Apply(Command(ServoAdapterOperation::kRecenter,
                                 ServoAxis::kPitch)) ==
           ServoAdapterResult::kApplied);
    assert(backend.writes.back().value == 1500);

    for (int i = 0; i < 12; ++i) {
        const auto result = adapter.Apply(Command(
            ServoAdapterOperation::kRelativeStep, ServoAxis::kPitch, 10));
        assert(result == ServoAdapterResult::kApplied);
    }
    const auto writes = backend.writes.size();
    assert(adapter.Apply(Command(ServoAdapterOperation::kRelativeStep,
                                 ServoAxis::kPitch, 10)) ==
           ServoAdapterResult::kOutOfRange);
    assert(backend.writes.size() == writes);

    adapter.DisableOutputs();
    assert(!adapter.output_enabled(ServoAxis::kPitch));
    assert(backend.disables.size() == 1);
    assert(backend.disables[0].gpio == 12);
}

void BackendFailuresDisableOutputsAndRemainFailSoft() {
    FakePwmBackend backend;
    CalibratedServoAdapter adapter(backend, SafeProfile());
    backend.fail_configure = true;
    assert(adapter.Apply(Command(ServoAdapterOperation::kProvisionalCenter,
                                 ServoAxis::kYaw)) ==
           ServoAdapterResult::kFailure);
    assert(!adapter.output_enabled(ServoAxis::kYaw));
    assert(backend.disables.size() == 1);

    assert(adapter.Apply(Command(ServoAdapterOperation::kProvisionalCenter,
                                 ServoAxis::kYaw)) ==
           ServoAdapterResult::kApplied);
    backend.fail_write = true;
    assert(adapter.Apply(Command(ServoAdapterOperation::kRelativeStep,
                                 ServoAxis::kYaw, -10)) ==
           ServoAdapterResult::kFailure);
    assert(!adapter.output_enabled(ServoAxis::kYaw));
    assert(backend.disables.size() == 2);
}

void RuntimeEnvelopeIsFixedAndStrictlyChecked() {
    FakePwmBackend backend;
    CalibratedServoAdapter adapter(backend, SafeProfile());
    ServoRuntimeEnvelope envelope{};
    assert(adapter.GetRuntimeEnvelope(envelope));
    assert(envelope.yaw_minimum_tenths_degree == -100);
    assert(envelope.yaw_maximum_tenths_degree == 100);
    assert(envelope.pitch_minimum_tenths_degree == -40);
    assert(envelope.pitch_maximum_tenths_degree == 60);
    assert(envelope.maximum_step_tenths_degree == 10);

    assert(adapter.Apply(Command(
               ServoAdapterOperation::kAbsoluteRuntimeTarget,
               ServoAxis::kYaw, -100)) == ServoAdapterResult::kApplied);
    assert(backend.writes.back().value == 1400);
    assert(adapter.Apply(Command(
               ServoAdapterOperation::kAbsoluteRuntimeTarget,
               ServoAxis::kPitch, 60)) == ServoAdapterResult::kApplied);
    assert(backend.writes.back().value == 1452);
    const auto writes = backend.writes.size();
    assert(adapter.Apply(Command(
               ServoAdapterOperation::kAbsoluteRuntimeTarget,
               ServoAxis::kYaw, 110)) == ServoAdapterResult::kOutOfRange);
    assert(backend.writes.size() == writes);

    auto narrow = SafeProfile();
    narrow.yaw.minimum_pulse_us = 1450;
    CalibratedServoAdapter unavailable(backend, narrow);
    assert(unavailable.IsAvailable());
    assert(!unavailable.GetRuntimeEnvelope(envelope));
}

}  // namespace

int main() {
    DefaultAndIncompleteProfilesStayLocked();
    OutputIsLazySingleAxisAndFixedOneDegree();
    DirectionLimitsRecenterAndDisableAreConservative();
    BackendFailuresDisableOutputsAndRemainFailSoft();
    RuntimeEnvelopeIsFixedAndStrictlyChecked();
    std::cout << "calibrated_servo_adapter_tests: PASS\n";
    return 0;
}
