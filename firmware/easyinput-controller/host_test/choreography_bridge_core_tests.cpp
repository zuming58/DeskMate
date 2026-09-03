#include "choreography_bridge_core.h"

#include <array>
#include <cassert>
#include <cstdint>

using namespace deskmate::easyinput;

namespace {

void write_u16(std::uint8_t* data, std::uint16_t value) {
    data[0] = static_cast<std::uint8_t>(value);
    data[1] = static_cast<std::uint8_t>(value >> 8u);
}

void write_u32(std::uint8_t* data, std::uint32_t value) {
    for (unsigned index = 0; index < 4; ++index) {
        data[index] = static_cast<std::uint8_t>(value >> (index * 8u));
    }
}

std::array<std::uint8_t, 63> request() {
    std::array<std::uint8_t, 63> value{};
    value[0] = 'D'; value[1] = 'M'; value[2] = 'C'; value[3] = 'Q';
    value[4] = 1; value[5] = 1; value[6] = 1;
    write_u32(value.data() + 8, 77);
    value[12] = 2; value[13] = 2; value[14] = 1;
    value[15] = 3; value[16] = 3;
    value[17] = 1; value[18] = 1; value[19] = 3;
    value[20] = 3; value[21] = 3; value[22] = 3;
    write_u16(value.data() + 41,
              deskmate_link_crc16(value.data(), 41));
    return value;
}

void BoundedProgramIsForwardedWithoutServoData() {
    ChoreographyBridge bridge;
    LinkStatusSnapshot link{};
    link.state = LinkControllerState::Connected;
    link.enabled_capabilities = kLinkT15RequiredCapabilities;
    link.controller_boot_id = 0x11223344;
    link.peer_boot_id = 0x55667788;
    const auto host = request();
    ChoreographyLinkRequest dispatch{};
    assert(bridge.accept(host.data(), host.size(), 4, link, dispatch));
    assert(dispatch.message_type == 0x24);
    assert(dispatch.payload_length == 40);
    assert(dispatch.payload[8] == 1);
    assert(dispatch.payload[9] == 2);
    assert(dispatch.payload[12] == 3);
    assert(dispatch.payload[13] == 3);
    assert(dispatch.payload[16] == 1);
    bridge.note_forward_result(true, link);

    std::array<std::uint8_t, 63> response{};
    assert(bridge.front_response(response));
    assert(response[0] == 'D' && response[2] == 'C');
    assert(response[5] == 1 && response[7] == 0);
    assert(bridge.mark_response_sent());

    ChoreographyLinkResult terminal{};
    terminal.host_request_id = 77;
    terminal.link_sequence = 9;
    terminal.controller_boot_id = link.controller_boot_id;
    terminal.peer_boot_id = link.peer_boot_id;
    terminal.message_type = 0x24;
    terminal.terminal_flag = 2;
    terminal.terminal = MotionPresetLinkTerminalKind::Response;
    terminal.payload_length = 24;
    write_u32(terminal.payload.data(), link.controller_boot_id);
    write_u32(terminal.payload.data() + 4, 77);
    terminal.payload[12] = 0;
    terminal.payload[13] = 3;
    terminal.payload[14] = 2;
    terminal.payload[15] = 0;
    terminal.payload[16] = 1;
    terminal.payload[18] = 1;
    terminal.payload[19] = 1;
    terminal.payload[20] = 3;
    terminal.payload[21] = 3;
    bridge.complete(terminal, link);
    assert(bridge.front_response(response));
    assert(response[5] == 2 && response[7] == 0);
    assert(response[19] == 24 && response[20 + 12] == 0);
}

void BadPaddingIsRejected() {
    ChoreographyBridge bridge;
    LinkStatusSnapshot link{};
    link.state = LinkControllerState::Connected;
    link.enabled_capabilities = kLinkT15RequiredCapabilities;
    link.controller_boot_id = 1;
    link.peer_boot_id = 2;
    auto host = request();
    host[62] = 1;
    ChoreographyLinkRequest dispatch{};
    assert(!bridge.accept(host.data(), host.size(), 1, link, dispatch));
}

}  // namespace

int main() {
    BoundedProgramIsForwardedWithoutServoData();
    BadPaddingIsRejected();
    return 0;
}
