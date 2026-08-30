#pragma once

#include "link_endpoint.h"
#include "link_protocol.h"
#include "transport.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::xiaozhi {

struct LinkUartOwnerDiagnostics {
    std::uint32_t rx_bytes{};
    std::uint32_t tx_bytes{};
    std::uint32_t rx_overflows{};
    std::uint32_t transport_errors{};
    std::uint32_t short_writes{};
};

class LinkUartOwner {
public:
    LinkUartOwner(Transport& transport, XiaozhiLinkEndpoint& endpoint) noexcept;
    void Service(std::uint32_t now_ms) noexcept;
    const LinkStreamParser& parser() const noexcept { return parser_; }
    LinkUartOwnerDiagnostics diagnostics() const noexcept { return diagnostics_; }

private:
    static constexpr std::size_t kReadChunkBytes = 64;
    static constexpr std::size_t kMaxReadsPerService = 4;

    Transport& transport_;
    XiaozhiLinkEndpoint& endpoint_;
    LinkStreamParser parser_{};
    std::array<std::uint8_t, kReadChunkBytes> read_buffer_{};
    LinkUartOwnerDiagnostics diagnostics_{};
};

}  // namespace deskmate::xiaozhi
