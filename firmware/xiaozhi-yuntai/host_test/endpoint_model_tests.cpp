#include "endpoint_model.h"

#include <cassert>
#include <string_view>

int main() {
    using namespace deskmate::xiaozhi;

    const auto& capabilities = GetEndpointCapabilities();
    assert(capabilities.link_transport == CapabilityGate::kReady);
    assert(capabilities.display == CapabilityGate::kPendingValidation);
    assert(capabilities.motion == CapabilityGate::kLocked);
    assert(capabilities.microphone == CapabilityGate::kDisabledByProduct);
    assert(capabilities.amplifier == CapabilityGate::kDisabledByProduct);
    assert(capabilities.speaker == CapabilityGate::kDisabledByProduct);

    const auto& status = GetEndpointStatus();
    assert(status.contract == ContractState::kFrozen);
    assert(status.runtime == RuntimeState::kProtocolReady);
    assert(status.transport_configured);
    assert(!status.transport_open);
    assert(!status.display_initialized);
    assert(!status.motion_initialized);
    assert(!status.microphone_initialized);
    assert(!status.amplifier_initialized);
    assert(!status.speaker_initialized);

    assert(std::string_view(ToString(CapabilityGate::kReady)) == "ready");
    assert(std::string_view(ToString(CapabilityGate::kDisabledByProduct)) == "disabled_by_product");
    assert(std::string_view(ToString(CapabilityGate::kPendingValidation)) == "pending_validation");
    assert(std::string_view(ToString(CapabilityGate::kLocked)) == "locked");
    assert(std::string_view(ToString(CapabilityGate::kHardwarePinoutBlocked)) ==
           "hardware_pinout_blocked");
    assert(std::string_view(ToString(ContractState::kFrozen)) == "frozen");
    assert(std::string_view(ToString(RuntimeState::kProtocolReady)) ==
           "protocol_ready");
    assert(std::string_view(ToString(RuntimeState::kProtocolReadyPinoutBlocked)) ==
           "protocol_ready_pinout_blocked");
    return 0;
}
