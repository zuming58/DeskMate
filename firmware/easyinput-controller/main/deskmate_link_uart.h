#pragma once

#include "deskmate_link_core.h"

#include "freertos/FreeRTOS.h"

namespace deskmate::easyinput {

class DeskMateLinkUart {
 public:
    [[noreturn]] void run();
    LinkStatusSnapshot snapshot() const;
    bool queue_agent_state(LinkAgentState state, std::uint32_t transition_id);
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
};

}  // namespace deskmate::easyinput
