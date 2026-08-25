#pragma once

#include <array>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::array<int, 8> kKeyGpios = {2, 47, 38, 41, 1, 6, 7, 48};
inline constexpr int kEncoderAGpio = 17;
inline constexpr int kEncoderBGpio = 16;
inline constexpr int kEncoderPressGpio = 18;
inline constexpr int kUsbDmGpio = 19;
inline constexpr int kUsbDpGpio = 20;
// V2 USB physical presence sense: active-low SEN_VIN. This is a read-only
// board signal; it is not a substitute for a TinyUSB mount callback.
inline constexpr int kUsbPhysicalPresenceGpio = 40;
inline constexpr int kUsbPhysicalPresenceActiveLevel = 0;

}  // namespace deskmate::easyinput
