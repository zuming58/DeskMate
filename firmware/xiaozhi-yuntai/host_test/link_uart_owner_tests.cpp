#include "fake_uart.h"
#include "fake_display.h"
#include "link_endpoint.h"
#include "link_protocol.h"
#include "link_uart_owner.h"

#include <algorithm>
#include <cstdint>
#include <iostream>
#include <vector>

namespace {

int failures = 0;

void Check(bool passed, const char* expression, int line) {
    if (passed) return;
    std::cerr << "line " << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

#define CHECK(expression) Check((expression), #expression, __LINE__)

deskmate::xiaozhi::LinkWireFrame Request(
    deskmate::xiaozhi::LinkMessageType type, std::uint32_t sequence,
    const std::vector<std::uint8_t>& payload = {}) {
    using namespace deskmate::xiaozhi;
    LinkFrame frame{};
    frame.flag = LinkFrameFlag::kRequest;
    frame.type = static_cast<std::uint8_t>(type);
    frame.sequence = sequence;
    frame.payload_length = static_cast<std::uint16_t>(payload.size());
    std::copy(payload.begin(), payload.end(), frame.payload.begin());
    LinkWireFrame wire{};
    CHECK(EncodeLinkFrame(frame, wire));
    return wire;
}

deskmate::xiaozhi::LinkWireFrame Hello(std::uint32_t sequence) {
    std::vector<std::uint8_t> payload(7);
    payload[0] = 1;
    payload[1] = 1;
    payload[2] = 1;
    deskmate::xiaozhi::WriteLe32(payload.data() + 3, 0x11223344);
    return Request(deskmate::xiaozhi::LinkMessageType::kHello, sequence,
                   payload);
}

std::vector<std::uint8_t> Bytes(
    const deskmate::xiaozhi::LinkWireFrame& wire) {
    return {wire.bytes.begin(), wire.bytes.begin() + wire.length};
}

unsigned CountFrames(const std::vector<std::uint8_t>& bytes) {
    deskmate::xiaozhi::LinkStreamParser parser;
    deskmate::xiaozhi::LinkFrame frame{};
    unsigned count = 0;
    for (const auto byte : bytes) {
        if (parser.Push(byte, 1, frame)) ++count;
    }
    return count;
}

void OneOwnerHandlesNoiseAndConcatenatedRequests() {
    using namespace deskmate::xiaozhi;
    using deskmate::xiaozhi::test::FakeUartTransport;
    FakeUartTransport transport;
    transport.SetOpen(true);
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    XiaozhiLinkEndpoint endpoint(display);
    endpoint.Start(0xaabbccdd, 0);
    LinkUartOwner owner(transport, endpoint);

    auto bytes = std::vector<std::uint8_t>{'E', 'S', 'P', '-', 'R', 'O', 'M'};
    const auto hello = Bytes(Hello(1));
    const auto capabilities = Bytes(Request(LinkMessageType::kGetCapabilities, 2));
    bytes.insert(bytes.end(), hello.begin(), hello.end());
    bytes.insert(bytes.end(), capabilities.begin(), capabilities.end());
    transport.FeedReceive(bytes);
    owner.Service(10);

    const auto sent = transport.TakeSent();
    CHECK(CountFrames(sent) == 2);
    CHECK(endpoint.snapshot().link_ready);
    CHECK(owner.parser().diagnostics().framing_errors >= 1);
    CHECK(owner.diagnostics().short_writes == 0);
}

void OverflowDropsPartialCandidateAndResynchronizes() {
    using namespace deskmate::xiaozhi;
    using deskmate::xiaozhi::test::FakeUartTransport;
    FakeUartTransport transport;
    transport.SetOpen(true);
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    XiaozhiLinkEndpoint endpoint(display);
    endpoint.Start(0xaabbccdd, 0);
    LinkUartOwner owner(transport, endpoint);

    const auto hello = Bytes(Hello(1));
    transport.FeedReceive(std::vector<std::uint8_t>(hello.begin(),
                                                    hello.begin() + 8));
    owner.Service(1);
    CHECK(transport.TakeSent().empty());

    transport.SignalOverflow();
    owner.Service(2);
    CHECK(owner.diagnostics().rx_overflows == 1);
    CHECK(owner.parser().diagnostics().transport_overflows == 1);

    transport.FeedReceive(hello);
    owner.Service(3);
    CHECK(CountFrames(transport.TakeSent()) == 1);
}

void WorkPerServiceIsBoundedAndTransportFaultsAreCounted() {
    using namespace deskmate::xiaozhi;
    using deskmate::xiaozhi::test::FakeUartTransport;
    FakeUartTransport transport;
    transport.SetOpen(true);
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    XiaozhiLinkEndpoint endpoint(display);
    endpoint.Start(0xaabbccdd, 0);
    LinkUartOwner owner(transport, endpoint);

    transport.FeedReceive(std::vector<std::uint8_t>(320, 0x55));
    owner.Service(1);
    CHECK(owner.diagnostics().rx_bytes == 256);
    owner.Service(2);
    CHECK(owner.diagnostics().rx_bytes == 320);

    transport.SignalError();
    owner.Service(3);
    CHECK(owner.diagnostics().transport_errors == 1);
}

void OnlyOwnerWritesAndShortWritesFailClosed() {
    using namespace deskmate::xiaozhi;
    using deskmate::xiaozhi::test::FakeUartTransport;
    FakeUartTransport transport;
    transport.SetOpen(true);
    transport.SetSendLimit(5);
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    XiaozhiLinkEndpoint endpoint(display);
    endpoint.Start(0xaabbccdd, 0);
    LinkUartOwner owner(transport, endpoint);
    transport.FeedReceive(Bytes(Hello(1)));
    owner.Service(1);
    CHECK(owner.diagnostics().short_writes == 1);
    CHECK(owner.diagnostics().tx_bytes == 5);
    CHECK(transport.TakeSent().size() == 5);
}

void TransportDisconnectClearsDisplayStateBeforeReconnect() {
    using namespace deskmate::xiaozhi;
    using deskmate::xiaozhi::test::FakeUartTransport;
    FakeUartTransport transport;
    transport.SetOpen(true);
    test::FakeDisplayRenderer renderer;
    DisplayOwner display(renderer);
    CHECK(display.Initialize());
    XiaozhiLinkEndpoint endpoint(display);
    endpoint.Start(0xaabbccdd, 0);
    CHECK(!display.Service(0));
    LinkUartOwner owner(transport, endpoint);

    transport.FeedReceive(Bytes(Hello(1)));
    owner.Service(1);
    CHECK(endpoint.snapshot().link_ready);
    transport.TakeSent();

    std::vector<std::uint8_t> state_payload(5);
    WriteLe32(state_payload.data(), 7);
    state_payload[4] = static_cast<std::uint8_t>(AgentState::kCompleted);
    transport.FeedReceive(Bytes(Request(LinkMessageType::kSetAgentState, 2,
                                        state_payload)));
    owner.Service(2);
    CHECK(display.snapshot().desired_state == AgentState::kCompleted);
    CHECK(display.Service(2));
    CHECK(display.snapshot().current_state == AgentState::kCompleted);
    transport.TakeSent();

    transport.SetOpen(false);
    owner.Service(3);
    CHECK(owner.diagnostics().disconnects == 1);
    CHECK(!endpoint.snapshot().link_ready);
    CHECK(display.snapshot().desired_state == AgentState::kIdle);
    CHECK(display.snapshot().queued == 1);

    transport.SetOpen(true);
    transport.FeedReceive(Bytes(Hello(3)));
    owner.Service(4);
    CHECK(endpoint.snapshot().link_ready);
    CHECK(display.snapshot().desired_state == AgentState::kIdle);
    CHECK(display.Service(5));
    CHECK(display.snapshot().current_state == AgentState::kIdle);
}

}  // namespace

int main() {
    OneOwnerHandlesNoiseAndConcatenatedRequests();
    OverflowDropsPartialCandidateAndResynchronizes();
    WorkPerServiceIsBoundedAndTransportFaultsAreCounted();
    OnlyOwnerWritesAndShortWritesFailClosed();
    TransportDisconnectClearsDisplayStateBeforeReconnect();
    if (failures != 0) {
        std::cerr << "link_uart_owner_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "link_uart_owner_tests: PASS\n";
    return 0;
}
