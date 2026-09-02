#pragma once

#include "servo_adapter.h"

#include <vector>

namespace deskmate::xiaozhi::test {

class FakeServoAdapter final : public ServoAdapter {
public:
    bool IsAvailable() const noexcept override { return available; }

    ServoAdapterResult Apply(
        const ServoAdapterCommand& command) noexcept override {
        if (!available || fail_next_apply) {
            fail_next_apply = false;
            return available ? ServoAdapterResult::kFailure
                             : ServoAdapterResult::kUnavailable;
        }
        if (out_of_range_next_apply) {
            out_of_range_next_apply = false;
            return ServoAdapterResult::kOutOfRange;
        }
        commands.push_back(command);
        return ServoAdapterResult::kApplied;
    }

    bool GetRuntimeEnvelope(
        ServoRuntimeEnvelope& envelope) const noexcept override {
        if (!available || !runtime_motion_available) return false;
        envelope = ServoRuntimeEnvelope{
            kRuntimeYawMinimumTenthsDegree,
            kRuntimeYawMaximumTenthsDegree,
            kRuntimePitchMinimumTenthsDegree,
            kRuntimePitchMaximumTenthsDegree,
            kRuntimeMaximumStepTenthsDegree,
        };
        return true;
    }

    void DisableOutputs() noexcept override { ++disable_calls; }

    bool available{true};
    bool runtime_motion_available{};
    bool fail_next_apply{};
    bool out_of_range_next_apply{};
    std::uint32_t disable_calls{};
    std::vector<ServoAdapterCommand> commands{};
};

}  // namespace deskmate::xiaozhi::test
