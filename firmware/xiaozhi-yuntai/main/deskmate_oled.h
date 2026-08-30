#pragma once

#include "display_owner.h"

#include <cstdint>

namespace deskmate::xiaozhi {

enum class DisplayStartResult : std::uint8_t {
    kStarted,
    kInitializationFailed,
    kTaskFailed,
};

DisplayOwner& GetDeskMateDisplayOwner() noexcept;
DisplayStartResult InitializeDeskMateDisplayOwner() noexcept;
DisplayStartResult StartDeskMateDisplayOwnerTask() noexcept;

}  // namespace deskmate::xiaozhi
