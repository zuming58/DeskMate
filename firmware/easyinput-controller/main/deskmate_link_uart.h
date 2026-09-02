#pragma once

#include "deskmate_link_core.h"

#include "freertos/FreeRTOS.h"

namespace deskmate::easyinput {

class DeskMateLinkUart {
 public:
    [[noreturn]] void run();
    LinkStatusSnapshot snapshot() const;
    bool queue_agent_state(LinkAgentState state, std::uint32_t transition_id);
    bool queue_manual_calibration(
        const ManualCalibrationLinkRequest& request);
    bool take_manual_calibration_result(ManualCalibrationLinkResult& result);
    bool queue_motion_preset(const MotionPresetLinkRequest& request);
    bool take_motion_preset_result(MotionPresetLinkResult& result);
    void mark_task_create_failure();

 private:
    bool begin();
    void publish_status();

    LinkStreamParser parser_{};
    LinkController controller_{};
    mutable portMUX_TYPE status_mux_ = portMUX_INITIALIZER_UNLOCKED;
    LinkStatusSnapshot published_status_{};
    LinkAgentState queued_agent_state_{LinkAgentState::Idle};
    std::uint32_t queued_transition_id_{};
    bool agent_state_pending_{};
    ManualCalibrationLinkRequest queued_manual_calibration_{};
    ManualCalibrationLinkResult manual_calibration_result_{};
    bool manual_calibration_command_pending_{};
    bool manual_calibration_active_{};
    bool manual_calibration_result_pending_{};
    MotionPresetLinkRequest queued_motion_preset_{};
    MotionPresetLinkResult motion_preset_result_{};
    bool motion_preset_command_pending_{};
    bool motion_preset_active_{};
    bool motion_preset_result_pending_{};
};

}  // namespace deskmate::easyinput
