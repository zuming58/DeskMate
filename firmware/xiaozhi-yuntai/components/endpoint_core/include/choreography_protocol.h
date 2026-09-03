#pragma once

#include "choreography.h"
#include "link_protocol.h"

#include <array>
#include <cstdint>

namespace deskmate::xiaozhi {

inline constexpr std::uint16_t kChoreographyCommandPayloadBytes = 40;
inline constexpr std::uint16_t kChoreographyStatusPayloadBytes = 24;

bool DecodeChoreographyCommand(const LinkFrame& frame,
                               ChoreographyCommand& command) noexcept;
bool DecodeChoreographyCommandV2(const LinkFrame& frame,
                                 ChoreographyCommand& command) noexcept;

std::array<std::uint8_t, kChoreographyStatusPayloadBytes>
EncodeChoreographyResponse(const ChoreographyCommand& command,
                           MotionPresetResult result,
                           const ChoreographySnapshot& live_snapshot) noexcept;
std::array<std::uint8_t, kChoreographyStatusPayloadBytes>
EncodeChoreographyResponseV2(const ChoreographyCommand& command,
                             MotionPresetResult result,
                             const ChoreographySnapshot& live_snapshot) noexcept;

std::array<std::uint8_t, kChoreographyStatusPayloadBytes>
EncodeChoreographyStatus(const ChoreographySnapshot& snapshot) noexcept;
std::array<std::uint8_t, kChoreographyStatusPayloadBytes>
EncodeChoreographyStatusV2(const ChoreographySnapshot& snapshot) noexcept;

}  // namespace deskmate::xiaozhi
