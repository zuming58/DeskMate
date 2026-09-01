#pragma once

#include "servo_adapter.h"

#include <vector>

namespace deskmate::xiaozhi::test {

class FakeServoAdapter final : public ServoAdapter {
public:
    bool IsAvailable() const noexcept override { return available; }

    bool Apply(const ServoAdapterCommand& command) noexcept override {
        if (!available || fail_next_apply) {
            fail_next_apply = false;
            return false;
        }
        commands.push_back(command);
        return true;
    }

    void DisableOutputs() noexcept override { ++disable_calls; }

    bool available{true};
    bool fail_next_apply{};
    std::uint32_t disable_calls{};
    std::vector<ServoAdapterCommand> commands{};
};

}  // namespace deskmate::xiaozhi::test
