#include "manual_calibration_bridge_core.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using namespace deskmate::easyinput;

namespace {
int failures = 0;

void check(bool passed, const char* expression, const char* file, int line) {
    if (passed) return;
    std::cerr << file << ':' << line << ": CHECK failed: " << expression
              << '\n';
    ++failures;
}

#define CHECK(expression) check((expression), #expression, __FILE__, __LINE__)

std::uint8_t nibble(char value) {
    if (value >= '0' && value <= '9')
        return static_cast<std::uint8_t>(value - '0');
    return static_cast<std::uint8_t>(
        std::toupper(static_cast<unsigned char>(value)) - 'A' + 10);
}

std::vector<std::uint8_t> from_hex(const std::string& hex) {
    std::vector<std::uint8_t> bytes;
    CHECK((hex.size() % 2) == 0);
    for (std::size_t index = 0; index + 1 < hex.size(); index += 2) {
        bytes.push_back(static_cast<std::uint8_t>(
            (nibble(hex[index]) << 4u) | nibble(hex[index + 1])));
    }
    return bytes;
}

std::string vector_hex(const char* path, const char* name) {
    std::ifstream input(path, std::ios::binary);
    CHECK(input.good());
    std::ostringstream output;
    output << input.rdbuf();
    const std::string json = output.str();
    const std::string marker = std::string("\"") + name + "\"";
    const auto item = json.find(marker);
    CHECK(item != std::string::npos);
    const auto field = json.find("\"hex\"", item);
    CHECK(field != std::string::npos);
    if (field == std::string::npos) return {};
    const auto colon = json.find(':', field);
    const auto quote = colon == std::string::npos
                           ? std::string::npos
                           : json.find('"', colon + 1);
    CHECK(quote != std::string::npos);
    if (quote == std::string::npos) return {};
    const auto begin = quote + 1;
    const auto end = json.find('"', begin);
    CHECK(end != std::string::npos);
    return end == std::string::npos ? std::string{}
                                    : json.substr(begin, end - begin);
}

std::vector<std::uint8_t> host_vector(const char* name) {
    return from_hex(vector_hex(HOST_MANUAL_VECTORS_PATH, name));
}

std::vector<std::uint8_t> link_vector(const char* name) {
    return from_hex(vector_hex(LINK_MANUAL_VECTORS_PATH, name));
}

std::uint32_t read_u32(const std::uint8_t* data) {
    return static_cast<std::uint32_t>(data[0]) |
           (static_cast<std::uint32_t>(data[1]) << 8u) |
           (static_cast<std::uint32_t>(data[2]) << 16u) |
           (static_cast<std::uint32_t>(data[3]) << 24u);
}

void write_u16(std::uint8_t* data, std::uint16_t value) {
    data[0] = static_cast<std::uint8_t>(value);
    data[1] = static_cast<std::uint8_t>(value >> 8u);
}

void write_u32(std::uint8_t* data, std::uint32_t value) {
    for (unsigned index = 0; index < 4; ++index) {
        data[index] = static_cast<std::uint8_t>(value >> (index * 8u));
    }
}

std::array<std::uint8_t, 63> make_request(
    ManualCalibrationHostRequestKind kind, std::uint32_t request_id,
    std::uint32_t confirmation_id,
    const std::array<std::uint8_t, 19>& command = {}) {
    std::array<std::uint8_t, 63> payload{};
    payload[0] = 'D';
    payload[1] = 'M';
    payload[2] = 'C';
    payload[3] = 'R';
    payload[4] = 1;
    payload[5] = static_cast<std::uint8_t>(kind);
    payload[6] = kind == ManualCalibrationHostRequestKind::Command ? 1 : 0;
    write_u32(payload.data() + 8, request_id);
    write_u32(payload.data() + 12, confirmation_id);
    if (kind == ManualCalibrationHostRequestKind::Command) {
        std::copy(command.begin(), command.end(), payload.begin() + 16);
    }
    write_u16(payload.data() + 35,
              deskmate_link_crc16(payload.data(), 35));
    return payload;
}

std::array<std::uint8_t, 19> select_payload(std::uint32_t action_id = 1) {
    std::array<std::uint8_t, 19> payload{};
    write_u32(payload.data(), 0x11223344);
    write_u32(payload.data() + 4, action_id);
    payload[12] = 1;
    payload[13] = 0;
    return payload;
}

LinkStatusSnapshot ready_link() {
    LinkStatusSnapshot link{};
    link.state = LinkControllerState::Connected;
    link.implemented_capabilities = kLinkT15RequiredCapabilities;
    link.enabled_capabilities = kLinkT15RequiredCapabilities;
    link.controller_boot_id = 0x11223344;
    link.peer_boot_id = 0xaabbccdd;
    return link;
}

bool same_payload(const std::array<std::uint8_t, 63>& actual,
                  const std::vector<std::uint8_t>& wire) {
    return wire.size() == 64 && wire[0] == kManualCalibrationStatusReportId &&
           std::equal(actual.begin(), actual.end(), wire.begin() + 1);
}

void codec_is_byte_exact_and_rejects_unsafe_shapes() {
    for (const char* name : {"status_request", "select_request"}) {
        const auto wire = host_vector(name);
        CHECK(wire.size() == 64);
        ManualCalibrationFeatureReportView view{};
        CHECK(normalize_manual_calibration_feature_report(
            0, wire.data(), wire.size(), view));
        ManualCalibrationHostRequest request{};
        CHECK(decode_manual_calibration_host_request(view.payload, view.length,
                                                     request));
        if (std::string(name) == "status_request") {
            CHECK(request.kind == ManualCalibrationHostRequestKind::Status);
            CHECK(request.request_id == 0x01020304);
            CHECK(request.payload_length == 0);
        } else {
            CHECK(request.kind == ManualCalibrationHostRequestKind::Command);
            CHECK(request.request_id == 0x01020305);
            CHECK(request.confirmation_id == 0xa1b2c3d4);
            CHECK(request.payload == select_payload());
        }
    }

    auto unsafe = make_request(ManualCalibrationHostRequestKind::Command, 8,
                               9, select_payload(2));
    unsafe[16 + 14] = 2;
    write_u16(unsafe.data() + 35,
              deskmate_link_crc16(unsafe.data(), 35));
    ManualCalibrationHostRequest decoded{};
    CHECK(!decode_manual_calibration_host_request(unsafe.data(), unsafe.size(),
                                                  decoded));
    unsafe = make_request(ManualCalibrationHostRequestKind::Command, 8, 9,
                          select_payload(2));
    unsafe[40] = 1;
    CHECK(!decode_manual_calibration_host_request(unsafe.data(), unsafe.size(),
                                                  decoded));
    unsafe = make_request(ManualCalibrationHostRequestKind::Command, 8, 9,
                          select_payload(2));
    unsafe[35] ^= 1;
    CHECK(!decode_manual_calibration_host_request(unsafe.data(), unsafe.size(),
                                                  decoded));
}

void bridge_reports_distinct_acceptance_and_terminal_evidence() {
    ManualCalibrationBridge bridge;
    const auto link = ready_link();
    const auto wire = host_vector("select_request");
    ManualCalibrationFeatureReportView view{};
    CHECK(normalize_manual_calibration_feature_report(
        0, wire.data(), wire.size(), view));
    ManualCalibrationLinkRequest dispatch{};
    CHECK(bridge.accept(view.payload, view.length, 1, link, dispatch));
    CHECK(dispatch.host_request_id == 0x01020305);
    CHECK(dispatch.message_type == 0x20);
    CHECK(dispatch.payload == select_payload());
    bridge.note_forward_result(true, link);

    std::array<std::uint8_t, 63> response{};
    CHECK(bridge.front_response(response));
    CHECK(same_payload(response, host_vector("select_accepted")));
    CHECK(bridge.mark_response_sent());

    ManualCalibrationLinkResult terminal{};
    terminal.host_request_id = dispatch.host_request_id;
    terminal.link_sequence = 0x20;
    terminal.controller_boot_id = link.controller_boot_id;
    terminal.peer_boot_id = link.peer_boot_id;
    terminal.message_type = 0x20;
    terminal.terminal_flag = 0x02;
    terminal.terminal = ManualCalibrationLinkTerminalKind::Response;
    const auto link_response = link_vector("select_response");
    CHECK(link_response.size() >= 14 + 19);
    if (link_response.size() < 14 + 19) return;
    terminal.payload_length = 19;
    std::copy_n(link_response.begin() + 14, 19, terminal.payload.begin());
    bridge.complete(terminal, link);
    CHECK(bridge.front_response(response));
    CHECK(same_payload(response, host_vector("select_terminal")));
    CHECK(bridge.mark_response_sent());

    dispatch = {};
    CHECK(!bridge.accept(view.payload, view.length, 1, link, dispatch));
    CHECK(bridge.front_response(response));
    CHECK(same_payload(response, host_vector("select_terminal")));
    CHECK(bridge.diagnostics().duplicates == 1);
}

void duplicate_busy_conflict_stale_and_lifecycle_fail_closed() {
    ManualCalibrationBridge bridge;
    auto link = ready_link();
    const auto request = make_request(
        ManualCalibrationHostRequestKind::Command, 10, 20,
        select_payload(1));
    ManualCalibrationLinkRequest dispatch{};
    CHECK(bridge.accept(request.data(), request.size(), 2, link, dispatch));
    bridge.note_forward_result(true, link);
    std::array<std::uint8_t, 63> response{};
    CHECK(bridge.front_response(response));
    CHECK(bridge.mark_response_sent());

    ManualCalibrationLinkRequest duplicate{};
    CHECK(!bridge.accept(request.data(), request.size(), 2, link, duplicate));
    CHECK(bridge.front_response(response));
    CHECK(response[5] ==
          static_cast<std::uint8_t>(ManualCalibrationHostStage::Accepted));
    CHECK(bridge.mark_response_sent());

    const auto busy = make_request(ManualCalibrationHostRequestKind::Status,
                                   11, 0);
    CHECK(!bridge.accept(busy.data(), busy.size(), 2, link, duplicate));
    CHECK(bridge.front_response(response));
    CHECK(response[7] == static_cast<std::uint8_t>(
                              ManualCalibrationTransportResult::Busy));
    CHECK(bridge.mark_response_sent());

    auto conflict = request;
    conflict[12] ^= 1;
    write_u16(conflict.data() + 35,
              deskmate_link_crc16(conflict.data(), 35));
    CHECK(!bridge.accept(conflict.data(), conflict.size(), 2, link, duplicate));
    CHECK(bridge.front_response(response));
    CHECK(response[7] == static_cast<std::uint8_t>(
                              ManualCalibrationTransportResult::
                                  RequestConflict));
    CHECK(bridge.mark_response_sent());

    link.peer_restarts = 1;
    bridge.poll_lifecycle(2, link);
    CHECK(bridge.front_response(response));
    CHECK(response[7] == static_cast<std::uint8_t>(
                              ManualCalibrationTransportResult::
                                  PeerDisconnected));
    CHECK(bridge.mark_response_sent());

    const auto stale = make_request(ManualCalibrationHostRequestKind::Status,
                                    9, 0);
    CHECK(!bridge.accept(stale.data(), stale.size(), 2, link, duplicate));
    CHECK(bridge.front_response(response));
    CHECK(response[7] == static_cast<std::uint8_t>(
                              ManualCalibrationTransportResult::
                                  StaleRequest));
    CHECK(bridge.mark_response_sent());

    bridge.clear_for_usb_epoch(3);
    CHECK(bridge.accept(stale.data(), stale.size(), 3, ready_link(), dispatch));
}

LinkFrame response_frame(LinkMessageType type, std::uint32_t sequence,
                         const std::uint8_t* payload, std::uint16_t length,
                         LinkFrameFlag flag = LinkFrameFlag::Response) {
    LinkFrame frame{};
    frame.flag = flag;
    frame.type = static_cast<std::uint8_t>(type);
    frame.sequence = sequence;
    frame.payload_length = length;
    if (length != 0) std::copy_n(payload, length, frame.payload.begin());
    return frame;
}

LinkFrame parse_wire(const LinkWireFrame& wire) {
    LinkStreamParser parser;
    LinkFrame frame{};
    bool ready = false;
    for (std::size_t index = 0; index < wire.length; ++index) {
        ready = parser.push(wire.bytes[index],
                            static_cast<std::uint32_t>(index), frame) ||
                ready;
    }
    CHECK(ready);
    return frame;
}

void connect_controller(LinkController& controller) {
    controller.start(0x11223344, 0);
    LinkWireFrame wire{};
    CHECK(controller.poll(0, wire));
    const auto hello_request = parse_wire(wire);
    const std::array<std::uint8_t, 8> hello = {
        2, 1, 0xdd, 0xcc, 0xbb, 0xaa, 0x80, 0};
    controller.receive(response_frame(LinkMessageType::Hello,
                                      hello_request.sequence, hello.data(),
                                      hello.size()),
                       1);
    CHECK(controller.poll(1, wire));
    const auto capabilities_request = parse_wire(wire);
    const std::array<std::uint8_t, 10> capabilities = {
        7, 0, 0, 0, 7, 0, 0, 0, 0x80, 0};
    controller.receive(response_frame(LinkMessageType::GetCapabilities,
                                      capabilities_request.sequence,
                                      capabilities.data(), capabilities.size()),
                       2);
    CHECK(controller.poll(2, wire));
    const auto status_request = parse_wire(wire);
    const std::array<std::uint8_t, 11> status = {
        0xdd, 0xcc, 0xbb, 0xaa, 4, 3, 2, 1, 0, 3, 0};
    controller.receive(response_frame(LinkMessageType::GetStatus,
                                      status_request.sequence, status.data(),
                                      status.size()),
                       3);
}

void fake_xiaozhi_endpoint_receives_exact_payload_and_timeout_is_terminal() {
    LinkController controller;
    connect_controller(controller);
    ManualCalibrationLinkRequest request{};
    request.host_request_id = 77;
    request.message_type = 0x20;
    request.payload_length = 19;
    request.payload = select_payload();
    CHECK(controller.queue_manual_calibration(request));
    LinkWireFrame wire{};
    CHECK(controller.poll(3, wire));
    const auto outgoing = parse_wire(wire);
    CHECK(outgoing.type == 0x20);
    CHECK(outgoing.payload_length == 19);
    CHECK(std::equal(outgoing.payload.begin(), outgoing.payload.begin() + 19,
                     request.payload.begin()));

    std::array<std::uint8_t, 19> endpoint{};
    std::copy_n(request.payload.begin(), 8, endpoint.begin());
    endpoint[13] = 1;
    endpoint[15] = 0x24;
    endpoint[17] = 10;
    controller.receive(response_frame(
                           LinkMessageType::ManualCalibrationCommand,
                           outgoing.sequence, endpoint.data(), endpoint.size()),
                       4);
    ManualCalibrationLinkResult result{};
    CHECK(controller.take_manual_calibration_result(result));
    CHECK(result.host_request_id == 77);
    CHECK(result.link_sequence == outgoing.sequence);
    CHECK(result.terminal == ManualCalibrationLinkTerminalKind::Response);
    CHECK(result.payload == endpoint);

    ManualCalibrationLinkRequest timeout{};
    timeout.host_request_id = 78;
    timeout.message_type = 0x21;
    CHECK(controller.queue_manual_calibration(timeout));
    CHECK(controller.poll(4, wire));
    CHECK(controller.poll(254, wire));
    CHECK(controller.poll(504, wire));
    CHECK(!controller.poll(754, wire));
    CHECK(controller.take_manual_calibration_result(result));
    CHECK(result.host_request_id == 78);
    CHECK(result.terminal == ManualCalibrationLinkTerminalKind::Timeout);
    CHECK(!controller.take_manual_calibration_result(result));
}

}  // namespace

int main() {
    codec_is_byte_exact_and_rejects_unsafe_shapes();
    bridge_reports_distinct_acceptance_and_terminal_evidence();
    duplicate_busy_conflict_stale_and_lifecycle_fail_closed();
    fake_xiaozhi_endpoint_receives_exact_payload_and_timeout_is_terminal();
    if (failures != 0) {
        std::cerr << "manual_calibration_bridge_core_tests: " << failures
                  << " failure(s)\n";
        return 1;
    }
    std::cout << "manual_calibration_bridge_core_tests: PASS\n";
    return 0;
}
