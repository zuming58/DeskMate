#include "fake_uart.h"

#include <array>
#include <cassert>
#include <cstdint>
#include <vector>

int main() {
    using deskmate::xiaozhi::test::FakeUartTransport;

    FakeUartTransport transport;
    const std::array<std::uint8_t, 3> outgoing{0x10, 0x20, 0x30};
    std::array<std::uint8_t, 4> incoming{};

    assert(!transport.IsOpen());
    assert(transport.Send(outgoing.data(), outgoing.size()) == 0);
    assert(transport.Receive(incoming.data(), incoming.size()).status ==
           deskmate::xiaozhi::TransportReadStatus::kIdle);

    transport.SetOpen(true);
    assert(transport.IsOpen());
    assert(transport.Send(nullptr, outgoing.size()) == 0);
    assert(transport.Send(outgoing.data(), 0) == 0);
    assert(transport.Send(outgoing.data(), outgoing.size()) == outgoing.size());
    assert(transport.TakeSent() == std::vector<std::uint8_t>(outgoing.begin(), outgoing.end()));
    assert(transport.TakeSent().empty());

    transport.FeedReceive({0x41, 0x42, 0x43});
    assert(transport.Receive(nullptr, incoming.size()).size == 0);
    assert(transport.Receive(incoming.data(), 2).size == 2);
    assert(incoming[0] == 0x41);
    assert(incoming[1] == 0x42);
    assert(transport.Receive(incoming.data(), incoming.size()).size == 1);
    assert(incoming[0] == 0x43);
    assert(transport.Receive(incoming.data(), incoming.size()).size == 0);
    transport.SignalOverflow();
    assert(transport.Receive(incoming.data(), incoming.size()).status ==
           deskmate::xiaozhi::TransportReadStatus::kOverflow);
    transport.SignalError();
    assert(transport.Receive(incoming.data(), incoming.size()).status ==
           deskmate::xiaozhi::TransportReadStatus::kError);
    transport.SetSendLimit(2);
    assert(transport.Send(outgoing.data(), outgoing.size()) == 2);
    return 0;
}
