#pragma once

#include "link_protocol.h"
#include "motion_preset.h"

#include <array>
#include <cstdint>

namespace deskmate::xiaozhi {

inline constexpr std::uint16_t kMotionPresetCommandPayloadBytes = 16;
inline constexpr std::uint16_t kMotionPresetStatusPayloadBytes = 20;

bool DecodeMotionPresetCommand(const LinkFrame& frame,
                               MotionPresetCommand& command) noexcept;

std::array<std::uint8_t, kMotionPresetStatusPayloadBytes>
EncodeMotionPresetResponse(const MotionPresetCommand& command,
                           MotionPresetResult result,
                           const MotionPresetSnapshot& live_snapshot) noexcept;

std::array<std::uint8_t, kMotionPresetStatusPayloadBytes>
EncodeMotionPresetStatus(const MotionPresetSnapshot& snapshot) noexcept;

}  // namespace deskmate::xiaozhi
