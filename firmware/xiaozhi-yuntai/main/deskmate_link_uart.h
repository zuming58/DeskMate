#pragma once

#include "link_endpoint.h"

#include <cstdint>

namespace deskmate::xiaozhi {

enum class LinkUartStartResult : std::uint8_t {
    kStarted,
    kHardwarePinoutBlocked,
    kDriverError,
    kTaskError,
};

LinkUartStartResult StartDeskMateLinkUart(
    XiaozhiLinkEndpoint& endpoint) noexcept;

}  // namespace deskmate::xiaozhi
