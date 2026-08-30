#pragma once

namespace deskmate::xiaozhi {

struct BoardLinkPinout {
    bool verified;
    int tx_gpio;
    int rx_gpio;
};

// The board photo proves GND/TX/RX silkscreen labels, and source inspection
// proves current feature code does not occupy GPIO43/44. Neither proves PCB
// continuity from those pads to the ESP32-S3. Keep the hardware path closed
// until a schematic net or powered-off continuity measurement is recorded.
inline constexpr BoardLinkPinout kBoardLinkPinout{
    false,
    -1,
    -1,
};

}  // namespace deskmate::xiaozhi
