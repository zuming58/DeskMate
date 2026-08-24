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

}  // namespace deskmate::easyinput
