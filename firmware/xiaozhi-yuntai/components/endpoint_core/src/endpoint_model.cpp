#include "endpoint_model.h"

namespace deskmate::xiaozhi {
namespace {

constexpr EndpointCapabilities kCapabilities{
    CapabilityGate::kReady,
    CapabilityGate::kPendingValidation,
    CapabilityGate::kLocked,
    CapabilityGate::kDisabledByProduct,
    CapabilityGate::kDisabledByProduct,
    CapabilityGate::kDisabledByProduct,
};

constexpr EndpointStatus kStatus{
    ContractState::kFrozen,
    RuntimeState::kProtocolReady,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
};

}  // namespace

const EndpointCapabilities& GetEndpointCapabilities() noexcept {
    return kCapabilities;
}

const EndpointStatus& GetEndpointStatus() noexcept {
    return kStatus;
}

const char* ToString(CapabilityGate gate) noexcept {
    switch (gate) {
        case CapabilityGate::kReady:
            return "ready";
        case CapabilityGate::kDisabledByProduct:
            return "disabled_by_product";
        case CapabilityGate::kPendingValidation:
            return "pending_validation";
        case CapabilityGate::kLocked:
            return "locked";
        case CapabilityGate::kHardwarePinoutBlocked:
            return "hardware_pinout_blocked";
    }
    return "unknown";
}

const char* ToString(ContractState state) noexcept {
    switch (state) {
        case ContractState::kFrozen:
            return "frozen";
    }
    return "unknown";
}

const char* ToString(RuntimeState state) noexcept {
    switch (state) {
        case RuntimeState::kProtocolReady:
            return "protocol_ready";
        case RuntimeState::kProtocolReadyPinoutBlocked:
            return "protocol_ready_pinout_blocked";
    }
    return "unknown";
}

}  // namespace deskmate::xiaozhi
