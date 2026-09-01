#include "servo_adapter.h"

namespace deskmate::xiaozhi {

bool DisabledServoAdapter::IsAvailable() const noexcept {
    return false;
}

bool DisabledServoAdapter::Apply(const ServoAdapterCommand&) noexcept {
    return false;
}

void DisabledServoAdapter::DisableOutputs() noexcept {}

}  // namespace deskmate::xiaozhi
