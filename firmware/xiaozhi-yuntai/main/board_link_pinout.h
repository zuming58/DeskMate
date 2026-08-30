#pragma once

namespace deskmate::xiaozhi {

struct BoardLinkPinout {
    bool verified;
    int tx_gpio;
    int rx_gpio;
};

struct BoardLinkUartInstallPlan {
    bool install_allowed;
    int tx_gpio;
    int rx_gpio;
};

constexpr BoardLinkUartInstallPlan PlanBoardLinkUartInstall(
    const BoardLinkPinout& pinout) noexcept {
    if (!pinout.verified || pinout.tx_gpio < 0 || pinout.rx_gpio < 0 ||
        pinout.tx_gpio == pinout.rx_gpio) {
        return {false, -1, -1};
    }
    return {true, pinout.tx_gpio, pinout.rx_gpio};
}

// Board1_2 schematic and PCB network evidence identifies the physical
// GND/TX/RX header as GND, TXD0 and RXD0. Espressif's ESP32-S3 definition maps
// TXD0 to GPIO43 and RXD0 to GPIO44. See the T08 pinout provenance audit.
inline constexpr BoardLinkPinout kBoardLinkPinout{
    true,
    43,
    44,
};

static_assert(PlanBoardLinkUartInstall(kBoardLinkPinout).install_allowed);

}  // namespace deskmate::xiaozhi
