#include "link_endpoint.h"

#include <algorithm>
#include <limits>

namespace deskmate::xiaozhi {
namespace {

void IncrementSaturated(std::uint32_t& value) noexcept {
    if (value != std::numeric_limits<std::uint32_t>::max()) {
        ++value;
    }
}

bool IsValidAgentState(std::uint8_t value) noexcept {
    return value <= static_cast<std::uint8_t>(AgentState::kError);
}

bool SameWire(const LinkWireFrame& left, const LinkWireFrame& right) noexcept {
    return left.length == right.length &&
           std::equal(left.bytes.begin(), left.bytes.begin() + left.length,
                      right.bytes.begin());
}

}  // namespace

void XiaozhiLinkEndpoint::Start(std::uint32_t peer_boot_id,
                                std::uint32_t now_ms) noexcept {
    peer_boot_id_ = peer_boot_id == 0 ? 1 : peer_boot_id;
    controller_boot_id_ = 0;
    boot_started_ms_ = now_ms;
    agent_state_ = AgentState::kIdle;
    last_error_ = LinkErrorCode::kNone;
    link_ready_ = false;
    diagnostics_ = {};
    ClearCache();
}

LinkEndpointSnapshot XiaozhiLinkEndpoint::snapshot() const noexcept {
    return LinkEndpointSnapshot{peer_boot_id_, controller_boot_id_, agent_state_,
                                last_error_, link_ready_, diagnostics_};
}

void XiaozhiLinkEndpoint::ClearCache() noexcept {
    cache_ = {};
    cache_cursor_ = 0;
}

XiaozhiLinkEndpoint::CacheLookup XiaozhiLinkEndpoint::LookupCache(
    std::uint32_t controller_boot_id, const LinkWireFrame& request,
    std::uint32_t sequence, LinkWireFrame& response) const noexcept {
    for (const auto& entry : cache_) {
        if (!entry.valid || entry.controller_boot_id != controller_boot_id ||
            entry.sequence != sequence) {
            continue;
        }
        if (SameWire(entry.request, request)) {
            response = entry.response;
            return CacheLookup::kDuplicate;
        }
        return CacheLookup::kConflict;
    }
    return CacheLookup::kMiss;
}

void XiaozhiLinkEndpoint::StoreCache(std::uint32_t controller_boot_id,
                                     const LinkWireFrame& request,
                                     const LinkWireFrame& response,
                                     std::uint32_t sequence,
                                     std::uint8_t type) noexcept {
    if (controller_boot_id == 0) {
        return;
    }
    cache_[cache_cursor_] =
        CacheEntry{controller_boot_id, sequence, type, request, response, true};
    cache_cursor_ = (cache_cursor_ + 1u) % cache_.size();
}

bool XiaozhiLinkEndpoint::Respond(const LinkFrame& request,
                                  const std::uint8_t* payload,
                                  std::uint16_t payload_length,
                                  LinkWireFrame& response) noexcept {
    if ((payload == nullptr && payload_length != 0) ||
        payload_length > kLinkMaxPayloadBytes) {
        return Error(request, LinkErrorCode::kInternal, response);
    }
    LinkFrame outgoing{};
    outgoing.flag = LinkFrameFlag::kResponse;
    outgoing.type = request.type;
    outgoing.sequence = request.sequence;
    outgoing.payload_length = payload_length;
    if (payload_length != 0) {
        std::copy_n(payload, payload_length, outgoing.payload.begin());
    }
    if (!EncodeLinkFrame(outgoing, response)) {
        return Error(request, LinkErrorCode::kInternal, response);
    }
    IncrementSaturated(diagnostics_.responses);
    return true;
}

bool XiaozhiLinkEndpoint::Error(const LinkFrame& request, LinkErrorCode error,
                                LinkWireFrame& response) noexcept {
    last_error_ = error;
    IncrementSaturated(diagnostics_.semantic_errors);
    if (error == LinkErrorCode::kSequenceConflict) {
        IncrementSaturated(diagnostics_.sequence_conflicts);
    }
    const bool encoded =
        EncodeLinkError(request.type, request.sequence, error, response);
    if (encoded) {
        IncrementSaturated(diagnostics_.responses);
    }
    return encoded;
}

bool XiaozhiLinkEndpoint::Process(const LinkFrame& request,
                                  std::uint32_t now_ms,
                                  LinkWireFrame& response) noexcept {
    if (request.flag != LinkFrameFlag::kRequest) {
        return Error(request, LinkErrorCode::kBadPayload, response);
    }

    switch (static_cast<LinkMessageType>(request.type)) {
        case LinkMessageType::kHello: {
            if (request.payload_length != 7 || request.payload[0] != 1 ||
                request.payload[1] != kLinkVersion ||
                request.payload[2] != kLinkVersion ||
                ReadLe32(request.payload.data() + 3) == 0) {
                return Error(request, LinkErrorCode::kBadPayload, response);
            }
            link_ready_ = true;
            std::array<std::uint8_t, 8> payload{};
            payload[0] = 2;
            payload[1] = kLinkVersion;
            WriteLe32(payload.data() + 2, peer_boot_id_);
            WriteLe16(payload.data() + 6,
                      static_cast<std::uint16_t>(kLinkMaxPayloadBytes));
            return Respond(request, payload.data(), payload.size(), response);
        }
        case LinkMessageType::kGetCapabilities: {
            if (!link_ready_) {
                return Error(request, LinkErrorCode::kNotReady, response);
            }
            if (request.payload_length != 0) {
                return Error(request, LinkErrorCode::kBadPayload, response);
            }
            std::array<std::uint8_t, 10> payload{};
            WriteLe32(payload.data(), kT08Capabilities);
            WriteLe32(payload.data() + 4, kT08Capabilities);
            WriteLe16(payload.data() + 8,
                      static_cast<std::uint16_t>(kLinkMaxPayloadBytes));
            return Respond(request, payload.data(), payload.size(), response);
        }
        case LinkMessageType::kGetStatus: {
            if (!link_ready_) {
                return Error(request, LinkErrorCode::kNotReady, response);
            }
            if (request.payload_length != 0) {
                return Error(request, LinkErrorCode::kBadPayload, response);
            }
            std::array<std::uint8_t, 11> payload{};
            WriteLe32(payload.data(), peer_boot_id_);
            WriteLe32(payload.data() + 4,
                      static_cast<std::uint32_t>(now_ms - boot_started_ms_));
            payload[8] = static_cast<std::uint8_t>(agent_state_);
            payload[9] = 0x01;
            payload[10] = static_cast<std::uint8_t>(last_error_);
            return Respond(request, payload.data(), payload.size(), response);
        }
        case LinkMessageType::kSetAgentState: {
            if (!link_ready_) {
                return Error(request, LinkErrorCode::kNotReady, response);
            }
            if (request.payload_length != 5 ||
                !IsValidAgentState(request.payload[4])) {
                return Error(request, LinkErrorCode::kBadPayload, response);
            }
            agent_state_ = static_cast<AgentState>(request.payload[4]);
            return Respond(request, request.payload.data(),
                           request.payload_length, response);
        }
    }
    return Error(request, LinkErrorCode::kUnknownType, response);
}

bool XiaozhiLinkEndpoint::Handle(const LinkFrame& request,
                                 std::uint32_t now_ms,
                                 LinkWireFrame& response) noexcept {
    response = {};
    IncrementSaturated(diagnostics_.requests);

    std::uint32_t request_boot_id = controller_boot_id_;
    if (request.flag == LinkFrameFlag::kRequest &&
        request.type == static_cast<std::uint8_t>(LinkMessageType::kHello) &&
        request.payload_length == 7 && request.payload[0] == 1 &&
        request.payload[1] == kLinkVersion &&
        request.payload[2] == kLinkVersion) {
        const auto hello_boot_id = ReadLe32(request.payload.data() + 3);
        if (hello_boot_id != 0) {
            request_boot_id = hello_boot_id;
            if (controller_boot_id_ != 0 &&
                controller_boot_id_ != hello_boot_id) {
                ClearCache();
                link_ready_ = false;
                IncrementSaturated(diagnostics_.controller_restarts);
            }
            controller_boot_id_ = hello_boot_id;
        }
    }

    LinkWireFrame request_wire{};
    if (!EncodeLinkFrame(request, request_wire)) {
        return false;
    }
    if (request_boot_id != 0) {
        const auto lookup = LookupCache(request_boot_id, request_wire,
                                        request.sequence, response);
        if (lookup == CacheLookup::kDuplicate) {
            IncrementSaturated(diagnostics_.duplicate_requests);
            return true;
        }
        if (lookup == CacheLookup::kConflict) {
            return Error(request, LinkErrorCode::kSequenceConflict, response);
        }
    }

    if (!Process(request, now_ms, response)) {
        return false;
    }
    StoreCache(request_boot_id, request_wire, response, request.sequence,
               request.type);
    return true;
}

}  // namespace deskmate::xiaozhi
