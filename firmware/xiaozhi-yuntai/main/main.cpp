#include "deskmate_link_uart.h"
#include "deskmate_oled.h"
#include "deskmate_servo_adapter.h"
#include "link_endpoint.h"
#include "manual_calibration_owner.h"

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
    auto& display_owner = deskmate::xiaozhi::GetDeskMateDisplayOwner();
    const auto display_initialize_result =
        deskmate::xiaozhi::InitializeDeskMateDisplayOwner();

    auto& servo_adapter = deskmate::xiaozhi::GetDeskMateServoAdapter();
    static deskmate::xiaozhi::MotionCoordinator motion_coordinator(
        servo_adapter, &display_owner);
    static deskmate::xiaozhi::XiaozhiLinkEndpoint endpoint(
        display_owner, &motion_coordinator);
    endpoint.Start(NewBootEpoch(), MonotonicMilliseconds());

    const auto link_result =
        deskmate::xiaozhi::StartDeskMateLinkUart(endpoint);
    const auto display_task_result =
        deskmate::xiaozhi::StartDeskMateDisplayOwnerTask();

    if (display_initialize_result ==
            deskmate::xiaozhi::DisplayStartResult::kStarted &&
        display_task_result ==
            deskmate::xiaozhi::DisplayStartResult::kStarted &&
        link_result != deskmate::xiaozhi::LinkUartStartResult::kStarted) {
        constexpr std::uint32_t kLinkStartupFaultTransition = 0xffffffffu;
        (void)display_owner.Accept(kLinkStartupFaultTransition,
                                   deskmate::xiaozhi::AgentState::kError);
    }
}
