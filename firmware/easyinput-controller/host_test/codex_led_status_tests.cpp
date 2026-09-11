#include "codex_led_status.h"

#include <array>
#include <cstdio>
#include <cstdlib>

using namespace deskmate::easyinput;

namespace {
[[noreturn]] void fail(const char* expression, int line) {
    std::fprintf(stderr, "codex_led_status_tests:%d: %s\n", line, expression);
    std::exit(1);
}
#define CHECK(expression) ((expression) ? static_cast<void>(0) : fail(#expression, __LINE__))

void write_u32(std::uint8_t* out, std::uint32_t value) {
    out[0] = static_cast<std::uint8_t>(value);
    out[1] = static_cast<std::uint8_t>(value >> 8U);
    out[2] = static_cast<std::uint8_t>(value >> 16U);
    out[3] = static_cast<std::uint8_t>(value >> 24U);
}

std::array<std::uint8_t, kAgentStatePayloadBytes> command(
    std::uint8_t state, std::uint32_t transition, std::uint32_t ttl,
    std::uint32_t source = kCodexLedSourceHash) {
    std::array<std::uint8_t, kAgentStatePayloadBytes> payload{};
    payload[0] = kAgentStateDeskMateVersion;
    payload[1] = state;
    write_u32(payload.data() + 4, transition);
    write_u32(payload.data() + 8, ttl);
    write_u32(payload.data() + 12, source);
    return payload;
}

void routes_only_dedicated_source_and_maps_all_states() {
    CodexLedStatusController controller;
    LedFrame frame{};
    auto foreign = command(3, 1, 1000, 0x43445848U);
    CHECK(controller.accept(foreign.data(), foreign.size(), 1, 0, frame) ==
          CodexLedRouteResult::NotForCodexLed);
    CHECK(controller.diagnostics().accepted == 0);

    constexpr std::array<Rgb, 7> colors{{
        {0, 0, 0}, {0, 8, 28}, {14, 0, 28}, {0, 22, 22},
        {26, 12, 0}, {0, 26, 8}, {28, 0, 0},
    }};
    for (std::uint8_t state = 0; state < colors.size(); ++state) {
        auto payload = command(state, state + 1, state == 0 ? 0 : 1000);
        CHECK(controller.accept(payload.data(), payload.size(), 1, state, frame) ==
              CodexLedRouteResult::Applied);
        for (const auto& pixel : frame) CHECK(pixel == colors[state]);
    }
}

void duplicate_expiry_epoch_and_malformed_fail_closed() {
    CodexLedStatusController controller;
    LedFrame frame{};
    auto waiting = command(4, 7, 100);
    CHECK(controller.accept(waiting.data(), waiting.size(), 4, 1000, frame) ==
          CodexLedRouteResult::Applied);
    CHECK(controller.accept(waiting.data(), waiting.size(), 4, 1001, frame) ==
          CodexLedRouteResult::ConsumedWithoutChange);
    CHECK(!controller.poll(1099, 4, frame));
    CHECK(controller.poll(1100, 4, frame));
    CHECK(frame == LedFrame{});

    auto working = command(3, 8, 1000);
    CHECK(controller.accept(working.data(), working.size(), 4, 1200, frame) ==
          CodexLedRouteResult::Applied);
    CHECK(controller.poll(1201, 5, frame));
    CHECK(frame == LedFrame{});

    auto malformed = command(3, 0, 1000);
    CHECK(controller.accept(malformed.data(), malformed.size(), 5, 1300, frame) ==
          CodexLedRouteResult::ConsumedWithoutChange);
    const auto diagnostics = controller.diagnostics();
    CHECK(diagnostics.accepted == 3);
    CHECK(diagnostics.duplicates == 1);
    CHECK(diagnostics.expired == 1);
    CHECK(diagnostics.epoch_clears == 1);
    CHECK(diagnostics.malformed == 1);
}
}  // namespace

int main() {
    routes_only_dedicated_source_and_maps_all_states();
    duplicate_expiry_epoch_and_malformed_fail_closed();
    std::puts("codex_led_status_tests: PASS");
    return 0;
}
