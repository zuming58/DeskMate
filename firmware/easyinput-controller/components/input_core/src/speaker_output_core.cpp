#include "speaker_output_core.h"

namespace deskmate::easyinput {

const char* speaker_output_state_name(SpeakerOutputState state) {
    switch (state) {
        case SpeakerOutputState::Disabled: return "disabled";
        case SpeakerOutputState::Ready: return "ready";
        case SpeakerOutputState::Starting: return "starting";
        case SpeakerOutputState::Playing: return "playing";
        case SpeakerOutputState::Faulted: return "faulted";
    }
    return "faulted";
}

}  // namespace deskmate::easyinput
