#include "agent_state_core.h"

#include <algorithm>
#include <array>
#include <cstdio>
#include <cstdlib>

using namespace deskmate::easyinput;

namespace {

[[noreturn]] void fail(const char* expression, int line) {
    std::fprintf(stderr, "agent_state_core_tests:%d: %s\n", line, expression);
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
    std::uint8_t version, std::uint8_t state, std::uint32_t transition,
    std::uint32_t ttl, std::uint32_t source = 0x11223344) {
    std::array<std::uint8_t, kAgentStatePayloadBytes> payload{};
    payload[0] = version;
    payload[1] = state;
    write_u32(payload.data() + 4, transition);
    write_u32(payload.data() + 8, ttl);
    write_u32(payload.data() + 12, source);
    return payload;
}

LinkStatusSnapshot ready_link(std::uint32_t peer_restarts = 0) {
    LinkStatusSnapshot link{};
    link.state = LinkControllerState::Connected;
    link.implemented_capabilities = kLinkT09RequiredCapabilities;
    link.enabled_capabilities = kLinkT09RequiredCapabilities;
    link.peer_restarts = peer_restarts;
    return link;
}

void normalizes_both_tinyusb_shapes() {
    auto payload = command(2, 3, 9, 1000);
    AgentStateFeatureReportView view{};
    CHECK(!normalize_agent_state_feature_report(
        kAgentStateReportId, nullptr, payload.size(), view));
    CHECK(!normalize_agent_state_feature_report(
        kAgentStateReportId, payload.data(), 0, view));
    CHECK(normalize_agent_state_feature_report(
        kAgentStateReportId, payload.data(), payload.size(), view));
    CHECK(view.payload == payload.data() && view.length == payload.size());
    std::array<std::uint8_t, kAgentStatePayloadBytes + 1> wire{};
    wire[0] = kAgentStateReportId;
    std::copy(payload.begin(), payload.end(), wire.begin() + 1);
    CHECK(normalize_agent_state_feature_report(0, wire.data(), wire.size(), view));
    CHECK(view.payload == wire.data() + 1);
    CHECK(normalize_agent_state_feature_report(
        kAgentStateReportId, wire.data(), wire.size(), view));
    CHECK(!normalize_agent_state_feature_report(0x13, wire.data(), wire.size(), view));
    CHECK(!normalize_agent_state_feature_report(0, payload.data(), payload.size(), view));

    std::array<std::uint8_t, 64> windows_wire{};
    windows_wire[0] = kAgentStateReportId;
    std::copy(payload.begin(), payload.end(), windows_wire.begin() + 1);
    CHECK(normalize_agent_state_feature_report(
        0, windows_wire.data(), windows_wire.size(), view));
    CHECK(view.payload == windows_wire.data() + 1 &&
          view.length == payload.size());
    CHECK(normalize_agent_state_feature_report(
        kAgentStateReportId, windows_wire.data(), windows_wire.size(), view));
    windows_wire[63] = 1;
    CHECK(!normalize_agent_state_feature_report(
        0, windows_wire.data(), windows_wire.size(), view));

    std::array<std::uint8_t, 63> tinyusb_padded{};
    std::copy(payload.begin(), payload.end(), tinyusb_padded.begin());
    CHECK(normalize_agent_state_feature_report(
        kAgentStateReportId, tinyusb_padded.data(), tinyusb_padded.size(), view));
    CHECK(view.payload == tinyusb_padded.data() &&
          view.length == payload.size());
    tinyusb_padded[62] = 1;
    CHECK(!normalize_agent_state_feature_report(
        kAgentStateReportId, tinyusb_padded.data(), tinyusb_padded.size(), view));
}

void decodes_maker_and_deskmate_versions() {
    AgentStateCommand decoded{};
    auto maker = command(1, 1, 7, kAgentStateMakerMaxTtlMs + 1);
    CHECK(decode_agent_state_command(maker.data(), maker.size(), decoded));
    CHECK(decoded.state == LinkAgentState::Working);
    CHECK(decoded.ttl_ms == kAgentStateMakerMaxTtlMs);
    maker = command(1, 2, 8, 1);
    CHECK(decode_agent_state_command(maker.data(), maker.size(), decoded));
    CHECK(decoded.state == LinkAgentState::Waiting);
    auto idle = command(1, 0, 9, 1234);
    CHECK(decode_agent_state_command(idle.data(), idle.size(), decoded));
    CHECK(decoded.state == LinkAgentState::Idle && decoded.ttl_ms == 0);

    auto v2 = command(2, 1, 10, 600000);
    CHECK(decode_agent_state_command(v2.data(), v2.size(), decoded));
    CHECK(decoded.state == LinkAgentState::Listening);
    v2[1] = 6;
    CHECK(decode_agent_state_command(v2.data(), v2.size(), decoded));
    CHECK(decoded.state == LinkAgentState::Error);
}

void rejects_malformed_commands() {
    AgentStateCommand decoded{};
    auto payload = command(2, 3, 1, 1000);
    CHECK(!decode_agent_state_command(nullptr, payload.size(), decoded));
    CHECK(!decode_agent_state_command(payload.data(), payload.size() - 1, decoded));
    payload[0] = 3;
    CHECK(!decode_agent_state_command(payload.data(), payload.size(), decoded));
    payload = command(2, 7, 1, 1000);
    CHECK(!decode_agent_state_command(payload.data(), payload.size(), decoded));
    payload = command(2, 3, 0, 1000);
    CHECK(!decode_agent_state_command(payload.data(), payload.size(), decoded));
    payload = command(2, 3, 1, 0);
    CHECK(!decode_agent_state_command(payload.data(), payload.size(), decoded));
    payload = command(2, 0, 1, 1);
    CHECK(!decode_agent_state_command(payload.data(), payload.size(), decoded));
    payload = command(2, 3, 1, kAgentStateDeskMateMaxTtlMs + 1);
    CHECK(!decode_agent_state_command(payload.data(), payload.size(), decoded));
    payload = command(2, 3, 1, 1000);
    payload[2] = 1;
    CHECK(!decode_agent_state_command(payload.data(), payload.size(), decoded));
    payload[2] = 0;
    payload[3] = 1;
    CHECK(!decode_agent_state_command(payload.data(), payload.size(), decoded));
}

void bridge_gates_duplicate_ttl_and_disconnect() {
    AgentStateBridge bridge;
    AgentStateDispatch dispatch{};
    const auto link = ready_link();
    auto payload = command(2, 2, 0x10203040, 1000);
    CHECK(bridge.accept(payload.data(), payload.size(), 4, 100, link, dispatch));
    CHECK(dispatch.state == LinkAgentState::Thinking);
    CHECK(dispatch.transition_id == 0x10203040);
    bridge.note_forward_result(true);
    CHECK(!bridge.accept(payload.data(), payload.size(), 4, 101, link, dispatch));
    CHECK(!bridge.poll(1099, 4, link, dispatch));
    CHECK(bridge.poll(1100, 4, link, dispatch));
    CHECK(dispatch.state == LinkAgentState::Idle && dispatch.ttl_expiry);
    CHECK(dispatch.transition_id == 0x10203041);
    bridge.note_forward_result(false);

    payload = command(2, 3, 8, 10);
    CHECK(bridge.accept(payload.data(), payload.size(), 4, 2000, link, dispatch));
    auto waiting = link;
    waiting.state = LinkControllerState::Waiting;
    CHECK(!bridge.poll(2001, 4, waiting, dispatch));
    CHECK(!bridge.poll(2010, 4, link, dispatch));

    payload = command(2, 4, 9, 10);
    CHECK(bridge.accept(payload.data(), payload.size(), 4, 3000, link, dispatch));
    CHECK(!bridge.poll(3001, 4, ready_link(1), dispatch));
    CHECK(!bridge.poll(3010, 4, ready_link(1), dispatch));

    const auto diagnostics = bridge.diagnostics();
    CHECK(diagnostics.accepted == 4);
    CHECK(diagnostics.duplicates == 1);
    CHECK(diagnostics.expired == 1);
    CHECK(diagnostics.dropped_disconnected == 2);
    CHECK(diagnostics.forwarded == 1);
    CHECK(diagnostics.queue_drops == 1);
}

void bridge_drops_when_capability_or_epoch_is_invalid() {
    AgentStateBridge bridge;
    AgentStateDispatch dispatch{};
    auto link = ready_link();
    link.enabled_capabilities &= ~kLinkCapabilityDisplay;
    auto payload = command(2, 3, 1, 1000);
    CHECK(!bridge.accept(payload.data(), payload.size(), 1, 0, link, dispatch));
    CHECK(bridge.accept(payload.data(), payload.size(), 1, 1,
                        ready_link(), dispatch));
    CHECK(!bridge.accept(payload.data(), payload.size(), 1, 2,
                         ready_link(), dispatch));
    CHECK(bridge.accept(payload.data(), payload.size(), 2, 2,
                        ready_link(), dispatch));
    CHECK(!bridge.poll(1002, 3, ready_link(), dispatch));
    CHECK(bridge.diagnostics().dropped_disconnected == 1);
    CHECK(bridge.diagnostics().duplicates == 1);
}

void bridge_clears_idle_dedup_across_disconnect_and_peer_restart() {
    AgentStateBridge bridge;
    AgentStateDispatch dispatch{};
    auto idle = command(2, 0, 77, 0);
    auto link = ready_link();
    CHECK(bridge.accept(idle.data(), idle.size(), 7, 1, link, dispatch));
    CHECK(dispatch.state == LinkAgentState::Idle);

    auto disconnected = link;
    disconnected.state = LinkControllerState::Waiting;
    CHECK(!bridge.poll(2, 7, disconnected, dispatch));
    CHECK(bridge.accept(idle.data(), idle.size(), 7, 3, link, dispatch));

    CHECK(!bridge.poll(4, 7, ready_link(1), dispatch));
    CHECK(bridge.accept(idle.data(), idle.size(), 7, 5,
                        ready_link(1), dispatch));
    CHECK(bridge.diagnostics().dropped_disconnected == 2);
}

}  // namespace

int main() {
    normalizes_both_tinyusb_shapes();
    decodes_maker_and_deskmate_versions();
    rejects_malformed_commands();
    bridge_gates_duplicate_ttl_and_disconnect();
    bridge_drops_when_capability_or_epoch_is_invalid();
    bridge_clears_idle_dedup_across_disconnect_and_peer_restart();
    std::puts("agent_state_core_tests: PASS");
    return 0;
}
