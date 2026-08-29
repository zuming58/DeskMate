#include "endpoint_model.h"

#include <cassert>
#include <string_view>

int main() {
    using namespace deskmate::xiaozhi;

    const auto& capabilities = GetEndpointCapabilities();
    assert(capabilities.link_transport == CapabilityGate::kLocked);
    assert(capabilities.display == CapabilityGate::kPendingValidation);
    assert(capabilities.motion == CapabilityGate::kLocked);
    assert(capabilities.microphone == CapabilityGate::kDisabledByProduct);
    assert(capabilities.amplifier == CapabilityGate::kDisabledByProduct);
    assert(capabilities.speaker == CapabilityGate::kDisabledByProduct);

    const auto& status = GetEndpointStatus();
    assert(status.contract == ContractState::kNotFrozen);
    assert(status.runtime == RuntimeState::kScaffoldOnly);
    assert(!status.transport_configured);
    assert(!status.transport_open);
    assert(!status.display_initialized);
    assert(!status.motion_initialized);
    assert(!status.microphone_initialized);
    assert(!status.amplifier_initialized);
    assert(!status.speaker_initialized);

    assert(std::string_view(ToString(CapabilityGate::kDisabledByProduct)) == "disabled_by_product");
    assert(std::string_view(ToString(CapabilityGate::kPendingValidation)) == "pending_validation");
    assert(std::string_view(ToString(CapabilityGate::kLocked)) == "locked");
    assert(std::string_view(ToString(ContractState::kNotFrozen)) == "not_frozen");
    assert(std::string_view(ToString(RuntimeState::kScaffoldOnly)) == "scaffold_only");
    return 0;
}
