#include "deskmate_link_uart.h"
#include "link_endpoint.h"

#include "esp_random.h"
#include "esp_timer.h"

#include <cstdint>

namespace {

std::uint32_t MonotonicMilliseconds() noexcept {
    return static_cast<std::uint32_t>(esp_timer_get_time() / 1000);
}

std::uint32_t NewBootEpoch() noexcept {
    std::uint32_t epoch = 0;
    while (epoch == 0) {
        epoch = esp_random();
    }
    return epoch;
}

}  // namespace

extern "C" void app_main() {
    static deskmate::xiaozhi::XiaozhiLinkEndpoint endpoint;
    endpoint.Start(NewBootEpoch(), MonotonicMilliseconds());

    const auto result = deskmate::xiaozhi::StartDeskMateLinkUart(endpoint);
    (void)result;
}
