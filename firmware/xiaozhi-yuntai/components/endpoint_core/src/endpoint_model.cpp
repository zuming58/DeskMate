#include "endpoint_model.h"

namespace deskmate::xiaozhi {
namespace {

constexpr EndpointCapabilities kCapabilities{
    CapabilityGate::kLocked,
    CapabilityGate::kPendingValidation,
    CapabilityGate::kLocked,
    CapabilityGate::kDisabledByProduct,
    CapabilityGate::kDisabledByProduct,
    CapabilityGate::kDisabledByProduct,
};

constexpr EndpointStatus kStatus{
    ContractState::kNotFrozen,
    RuntimeState::kScaffoldOnly,
    false,
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
        case CapabilityGate::kDisabledByProduct:
            return "disabled_by_product";
        case CapabilityGate::kPendingValidation:
            return "pending_validation";
        case CapabilityGate::kLocked:
            return "locked";
    }
    return "unknown";
}

const char* ToString(ContractState state) noexcept {
    switch (state) {
        case ContractState::kNotFrozen:
            return "not_frozen";
    }
    return "unknown";
}

const char* ToString(RuntimeState state) noexcept {
    switch (state) {
        case RuntimeState::kScaffoldOnly:
            return "scaffold_only";
    }
    return "unknown";
}

}  // namespace deskmate::xiaozhi
