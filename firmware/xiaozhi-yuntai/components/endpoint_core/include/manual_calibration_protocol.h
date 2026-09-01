#pragma once

#include "link_protocol.h"
#include "manual_calibration_owner.h"

#include <array>
#include <cstdint>

namespace deskmate::xiaozhi {

inline constexpr std::uint16_t kManualCalibrationCommandPayloadBytes = 19;
inline constexpr std::uint16_t kManualCalibrationResponsePayloadBytes = 19;
inline constexpr std::uint16_t kManualCalibrationStatusPayloadBytes = 18;

bool DecodeManualCalibrationCommand(
    const LinkFrame& frame, ManualCalibrationCommand& command) noexcept;

std::array<std::uint8_t, kManualCalibrationResponsePayloadBytes>
EncodeManualCalibrationResponse(const ManualCalibrationCommand& command,
                                ManualCalibrationResult result,
                                const ManualCalibrationSnapshot& snapshot)
    noexcept;

std::array<std::uint8_t, kManualCalibrationStatusPayloadBytes>
EncodeManualCalibrationStatus(
    const ManualCalibrationSnapshot& snapshot) noexcept;

}  // namespace deskmate::xiaozhi
