#include "board_link_pinout.h"

#include <cassert>

int main() {
    using namespace deskmate::xiaozhi;

    constexpr BoardLinkPinout unverified{false, 43, 44};
    constexpr auto blocked = PlanBoardLinkUartInstall(unverified);
    static_assert(!blocked.install_allowed);
    static_assert(blocked.tx_gpio == -1);
    static_assert(blocked.rx_gpio == -1);

    constexpr BoardLinkPinout invalid_same_pin{true, 43, 43};
    static_assert(
        !PlanBoardLinkUartInstall(invalid_same_pin).install_allowed);

    constexpr auto verified = PlanBoardLinkUartInstall(kBoardLinkPinout);
    static_assert(verified.install_allowed);
    static_assert(verified.tx_gpio == 43);
    static_assert(verified.rx_gpio == 44);

    assert(verified.tx_gpio == kBoardLinkPinout.tx_gpio);
    assert(verified.rx_gpio == kBoardLinkPinout.rx_gpio);
    return 0;
}
