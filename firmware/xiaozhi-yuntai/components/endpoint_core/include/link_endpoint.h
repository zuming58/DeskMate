#pragma once

#include "display_owner.h"
#include "link_protocol.h"
#include "manual_calibration_owner.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::xiaozhi {

inline constexpr std::uint32_t kCapabilityLinkCore = 1u << 0;
inline constexpr std::uint32_t kCapabilityAgentState = 1u << 1;
inline constexpr std::uint32_t kCapabilityDisplay = 1u << 2;
inline constexpr std::uint32_t kCapabilityMotion = 1u << 3;
inline constexpr std::uint32_t kBaseCapabilities =
    kCapabilityLinkCore | kCapabilityAgentState;

struct EndpointDiagnostics {
    std::uint32_t requests{};
    std::uint32_t responses{};
    std::uint32_t semantic_errors{};
    std::uint32_t duplicate_requests{};
    std::uint32_t sequence_conflicts{};
    std::uint32_t controller_restarts{};
    std::uint32_t disconnects{};
};

struct LinkEndpointSnapshot {
    std::uint32_t peer_boot_id{};
    std::uint32_t controller_boot_id{};
    AgentState agent_state{AgentState::kIdle};
    LinkErrorCode last_error{LinkErrorCode::kNone};
    bool link_ready{};
    EndpointDiagnostics diagnostics{};
};

class XiaozhiLinkEndpoint {
public:
    explicit XiaozhiLinkEndpoint(
        DisplayOwner& display_owner,
        MotionCoordinator* motion_coordinator = nullptr) noexcept
        : display_owner_(display_owner),
          motion_coordinator_(motion_coordinator) {}

    void Start(std::uint32_t peer_boot_id, std::uint32_t now_ms) noexcept;
    void OnLinkDisconnected() noexcept;
    void Tick(std::uint32_t now_ms) noexcept;
    bool Handle(const LinkFrame& request, std::uint32_t now_ms,
                LinkWireFrame& response) noexcept;
    LinkEndpointSnapshot snapshot() const noexcept;

private:
    struct CacheEntry {
        std::uint32_t controller_boot_id{};
        std::uint32_t sequence{};
        std::uint8_t type{};
        LinkWireFrame request{};
        LinkWireFrame response{};
        bool valid{};
    };

    enum class CacheLookup : std::uint8_t {
        kMiss,
        kDuplicate,
        kConflict,
    };

    bool Process(const LinkFrame& request, std::uint32_t now_ms,
                 LinkWireFrame& response) noexcept;
    bool Respond(const LinkFrame& request, const std::uint8_t* payload,
                 std::uint16_t payload_length,
                 LinkWireFrame& response) noexcept;
    bool Error(const LinkFrame& request, LinkErrorCode error,
               LinkWireFrame& response) noexcept;
    CacheLookup LookupCache(std::uint32_t controller_boot_id,
                            const LinkWireFrame& request,
                            std::uint32_t sequence,
                            LinkWireFrame& response) const noexcept;
    void StoreCache(std::uint32_t controller_boot_id,
                    const LinkWireFrame& request,
                    const LinkWireFrame& response,
                    std::uint32_t sequence, std::uint8_t type) noexcept;
    void ClearCache() noexcept;
    void ResetControllerSession() noexcept;
    std::uint32_t ImplementedCapabilities() const noexcept;
    std::uint32_t EnabledCapabilities() const noexcept;

    static constexpr std::size_t kCacheEntries = 8;
    std::array<CacheEntry, kCacheEntries> cache_{};
    DisplayOwner& display_owner_;
    MotionCoordinator* motion_coordinator_{};
    std::size_t cache_cursor_{};
    std::uint32_t peer_boot_id_{};
    std::uint32_t controller_boot_id_{};
    std::uint32_t boot_started_ms_{};
    AgentState agent_state_{AgentState::kIdle};
    LinkErrorCode last_error_{LinkErrorCode::kNone};
    bool link_ready_{};
    bool motion_capability_enabled_{};
    EndpointDiagnostics diagnostics_{};
};

}  // namespace deskmate::xiaozhi
