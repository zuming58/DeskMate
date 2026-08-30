#pragma once

#include "display_owner.h"

#include <vector>

namespace deskmate::xiaozhi::test {

class FakeDisplayRenderer final : public DisplayRenderer {
public:
    bool Initialize() noexcept override {
        ++initialize_calls;
        return initialize_result;
    }

    bool Supports(AgentScene scene) const noexcept override {
        return scene != AgentScene::kFocused || focused_available;
    }

    bool Render(AgentScene scene) noexcept override {
        rendered_scenes.push_back(scene);
        if (fail_next_render) {
            fail_next_render = false;
            return false;
        }
        return render_result;
    }

    bool initialize_result{true};
    bool render_result{true};
    bool fail_next_render{};
    bool focused_available{true};
    unsigned initialize_calls{};
    std::vector<AgentScene> rendered_scenes{};
};

}  // namespace deskmate::xiaozhi::test
