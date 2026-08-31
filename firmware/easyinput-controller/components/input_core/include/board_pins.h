#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::array<int, 8> kKeyGpios = {2, 47, 38, 41, 1, 6, 7, 48};
inline constexpr int kEncoderAGpio = 17;
inline constexpr int kEncoderBGpio = 16;
inline constexpr int kEncoderPressGpio = 18;
inline constexpr int kUsbDmGpio = 19;
inline constexpr int kUsbDpGpio = 20;
inline constexpr int kDeskMateLinkRxGpio = 44;
inline constexpr int kDeskMateLinkTxGpio = 43;
// V2 USB physical presence sense: active-low SEN_VIN. This is a read-only
// board signal; it is not a substitute for a TinyUSB mount callback.
inline constexpr int kUsbPhysicalPresenceGpio = 40;
inline constexpr int kUsbPhysicalPresenceActiveLevel = 0;
inline constexpr int kPeripheralPowerGpio = 8;
inline constexpr int kMicI2sBclkGpio = 9;
inline constexpr int kMicI2sWsGpio = 10;
inline constexpr int kMicI2sDinGpio = 11;
inline constexpr int kLedDataGpio = 12;
inline constexpr size_t kLedPixelCount = 5;
inline constexpr std::array<int, 6> kSharedPowerCommandGpios = {9, 10, 12, 13, 14, 15};
inline constexpr int kSharedPowerInputGpio = 11;

}  // namespace deskmate::easyinput
