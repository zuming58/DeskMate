#pragma once

#include <cstdint>

namespace deskmate::xiaozhi {

enum class CapabilityGate : std::uint8_t {
    kDisabledByProduct,
    kPendingValidation,
    kLocked,
};

enum class ContractState : std::uint8_t {
    kNotFrozen,
};

enum class RuntimeState : std::uint8_t {
    kScaffoldOnly,
};

struct EndpointCapabilities {
    CapabilityGate link_transport;
    CapabilityGate display;
    CapabilityGate motion;
    CapabilityGate microphone;
    CapabilityGate amplifier;
    CapabilityGate speaker;
};

struct EndpointStatus {
    ContractState contract;
    RuntimeState runtime;
    bool transport_configured;
    bool transport_open;
    bool display_initialized;
    bool motion_initialized;
    bool microphone_initialized;
    bool amplifier_initialized;
    bool speaker_initialized;
};

const EndpointCapabilities& GetEndpointCapabilities() noexcept;
const EndpointStatus& GetEndpointStatus() noexcept;
const char* ToString(CapabilityGate gate) noexcept;
const char* ToString(ContractState state) noexcept;
const char* ToString(RuntimeState state) noexcept;

}  // namespace deskmate::xiaozhi
