#include "manual_calibration_bridge_core.h"

#include <algorithm>
#include <limits>

namespace deskmate::easyinput {
namespace {

constexpr std::array<std::uint8_t, 4> kRequestMagic = {'D', 'M', 'C', 'R'};
constexpr std::array<std::uint8_t, 4> kStatusMagic = {'D', 'M', 'C', 'S'};
constexpr std::uint8_t kUserConfirmedFlag = 0x01;
constexpr std::uint8_t kSafetyFlags = 0x0f;
constexpr std::uint8_t kAxisNone = 0xff;
constexpr std::uint8_t kFixedStepTenthsDegree = 10;

std::uint16_t read_u16(const std::uint8_t* data) {
    return static_cast<std::uint16_t>(data[0]) |
           (static_cast<std::uint16_t>(data[1]) << 8u);
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

void increment_saturated(std::uint32_t& value) {
    if (value != std::numeric_limits<std::uint32_t>::max()) ++value;
}

bool padding_is_zero(const std::uint8_t* begin, const std::uint8_t* end) {
    return std::all_of(begin, end,
                       [](std::uint8_t value) { return value == 0; });
}

bool valid_axis(std::uint8_t axis) {
    return axis == 0 || axis == 1;
}

bool valid_t10c_command(const std::uint8_t* payload) {
    if (payload == nullptr || read_u32(payload) == 0 ||
        read_u32(payload + 4) == 0 || payload[15] != 0) {
        return false;
    }
    const std::uint32_t token = read_u32(payload + 8);
    const std::uint8_t operation = payload[12];
    const std::uint8_t axis = payload[13];
    const std::int8_t direction = static_cast<std::int8_t>(payload[14]);
    const std::uint16_t ttl_ms = read_u16(payload + 16);
    const std::uint8_t safety_flags = payload[18];
    switch (operation) {
        case 0:
            return valid_axis(axis) && token != 0 && direction == 0 &&
                   ttl_ms >= 1000 && ttl_ms <= 5000 &&
                   safety_flags == kSafetyFlags;
        case 1:
            return valid_axis(axis) && token == 0 && direction == 0 &&
                   ttl_ms == 0 && safety_flags == 0;
        case 2:
        case 4:
            return valid_axis(axis) && token != 0 && direction == 0 &&
                   ttl_ms == 0 && safety_flags == 0;
        case 3:
            return valid_axis(axis) && token != 0 &&
                   (direction == -1 || direction == 1) && ttl_ms == 0 &&
                   safety_flags == 0;
        case 5:
        case 6:
            return axis == kAxisNone && token == 0 && direction == 0 &&
                   ttl_ms == 0 && safety_flags == 0;
        default:
            return false;
    }
}

ManualCalibrationTransportResult map_terminal(
    ManualCalibrationLinkTerminalKind terminal) {
    switch (terminal) {
        case ManualCalibrationLinkTerminalKind::Response:
            return ManualCalibrationTransportResult::Completed;
        case ManualCalibrationLinkTerminalKind::LinkError:
            return ManualCalibrationTransportResult::LinkError;
        case ManualCalibrationLinkTerminalKind::Timeout:
            return ManualCalibrationTransportResult::Timeout;
        case ManualCalibrationLinkTerminalKind::Disconnected:
            return ManualCalibrationTransportResult::PeerDisconnected;
        case ManualCalibrationLinkTerminalKind::InvalidResponse:
            return ManualCalibrationTransportResult::InvalidLinkResponse;
        case ManualCalibrationLinkTerminalKind::Internal:
            return ManualCalibrationTransportResult::Internal;
    }
    return ManualCalibrationTransportResult::Internal;
}

}  // namespace

bool normalize_manual_calibration_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    ManualCalibrationFeatureReportView& out) {
    out = {};
    if (buffer == nullptr || length == 0) return false;
    if (buffer[0] == kManualCalibrationRequestReportId &&
        length == kManualCalibrationHostPayloadBytes + 1) {
        if (report_id != 0 && report_id != kManualCalibrationRequestReportId)
            return false;
        out = {buffer + 1, kManualCalibrationHostPayloadBytes};
        return true;
    }
    if (report_id == kManualCalibrationRequestReportId &&
        length == kManualCalibrationHostPayloadBytes) {
        out = {buffer, kManualCalibrationHostPayloadBytes};
        return true;
    }
    return false;
}

bool decode_manual_calibration_host_request(
    const std::uint8_t* payload, std::size_t length,
    ManualCalibrationHostRequest& out) {
    out = {};
    if (payload == nullptr || length != kManualCalibrationHostPayloadBytes ||
        !std::equal(kRequestMagic.begin(), kRequestMagic.end(), payload) ||
        payload[4] != kManualCalibrationHostVersion || payload[7] != 0 ||
        !padding_is_zero(payload + 37, payload + length) ||
        deskmate_link_crc16(payload, 35) != read_u16(payload + 35)) {
        return false;
    }
    const auto kind =
        static_cast<ManualCalibrationHostRequestKind>(payload[5]);
    const std::uint32_t request_id = read_u32(payload + 8);
    const std::uint32_t confirmation_id = read_u32(payload + 12);
    if (request_id == 0) return false;

    ManualCalibrationHostRequest request{};
    request.kind = kind;
    request.flags = payload[6];
    request.request_id = request_id;
    request.confirmation_id = confirmation_id;
    if (kind == ManualCalibrationHostRequestKind::Command) {
        if (request.flags != kUserConfirmedFlag || confirmation_id == 0 ||
            !valid_t10c_command(payload + 16)) {
            return false;
        }
        request.message_type = static_cast<std::uint8_t>(
            LinkMessageType::ManualCalibrationCommand);
        request.payload_length = kManualCalibrationCommandPayloadBytes;
        std::copy_n(payload + 16, request.payload_length,
                    request.payload.begin());
    } else if (kind == ManualCalibrationHostRequestKind::Status) {
        if (request.flags != 0 || confirmation_id != 0 ||
            !padding_is_zero(payload + 16,
                             payload + 16 +
                                 kManualCalibrationCommandPayloadBytes)) {
            return false;
        }
        request.message_type = static_cast<std::uint8_t>(
            LinkMessageType::GetManualCalibrationStatus);
    } else {
        return false;
    }
    out = request;
    return true;
}

bool encode_manual_calibration_host_response(
    const ManualCalibrationHostResponse& response,
    std::array<std::uint8_t, kManualCalibrationHostPayloadBytes>& out) {
    out.fill(0);
    const bool command =
        response.kind == ManualCalibrationHostRequestKind::Command;
    const bool status =
        response.kind == ManualCalibrationHostRequestKind::Status;
    const bool valid_stage =
        response.stage == ManualCalibrationHostStage::Accepted ||
        response.stage == ManualCalibrationHostStage::Terminal;
    const bool valid_type =
        (command && response.message_type == static_cast<std::uint8_t>(
                                               LinkMessageType::
                                                   ManualCalibrationCommand)) ||
        (status && response.message_type == static_cast<std::uint8_t>(
                                              LinkMessageType::
                                                  GetManualCalibrationStatus));
    if ((!command && !status) || !valid_stage || !valid_type ||
        response.request_id == 0 ||
        response.endpoint_payload_length > response.endpoint_payload.size() ||
        (response.terminal_flag != 0 &&
         response.terminal_flag !=
             static_cast<std::uint8_t>(LinkFrameFlag::Response) &&
         response.terminal_flag !=
             static_cast<std::uint8_t>(LinkFrameFlag::Error))) {
        return false;
    }
    std::copy(kStatusMagic.begin(), kStatusMagic.end(), out.begin());
    out[4] = kManualCalibrationHostVersion;
    out[5] = static_cast<std::uint8_t>(response.stage);
    out[6] = static_cast<std::uint8_t>(response.kind);
    out[7] = static_cast<std::uint8_t>(response.transport);
    write_u32(out.data() + 8, response.request_id);
    write_u32(out.data() + 12, response.confirmation_id);
    write_u32(out.data() + 16, response.link_sequence);
    out[20] = response.message_type;
    out[21] = response.terminal_flag;
    out[22] = static_cast<std::uint8_t>(response.link_error);
    out[23] = response.endpoint_payload_length;
    std::copy_n(response.endpoint_payload.begin(),
                response.endpoint_payload_length, out.begin() + 24);
    write_u32(out.data() + 43, response.accepted_count);
    write_u32(out.data() + 47, response.terminal_count);
    write_u32(out.data() + 51, response.controller_boot_id);
    write_u32(out.data() + 55, response.peer_boot_id);
    write_u16(out.data() + 59, deskmate_link_crc16(out.data(), 59));
    return true;
}

bool manual_calibration_host_requests_equal(
    const ManualCalibrationHostRequest& left,
    const ManualCalibrationHostRequest& right) {
    return left.kind == right.kind && left.flags == right.flags &&
           left.request_id == right.request_id &&
           left.confirmation_id == right.confirmation_id &&
           left.message_type == right.message_type &&
           left.payload_length == right.payload_length &&
           std::equal(left.payload.begin(), left.payload.end(),
                      right.payload.begin());
}

bool ManualCalibrationBridge::link_ready(const LinkStatusSnapshot& link) {
    return link.state == LinkControllerState::Connected &&
           (link.enabled_capabilities & kLinkT09RequiredCapabilities) ==
               kLinkT09RequiredCapabilities &&
           (link.enabled_capabilities & kLinkT09ForbiddenCapabilities) == 0 &&
           link.controller_boot_id != 0 && link.peer_boot_id != 0;
}

void ManualCalibrationBridge::queue_response(
    const ManualCalibrationHostResponse& response) {
    if (response_size_ == responses_.size()) {
        increment_saturated(diagnostics_.response_drops);
        return;
    }
    responses_[(response_head_ + response_size_) % responses_.size()] =
        response;
    ++response_size_;
}

void ManualCalibrationBridge::queue_accepted(
    const LinkStatusSnapshot& link) {
    ManualCalibrationHostResponse response{};
    response.stage = ManualCalibrationHostStage::Accepted;
    response.kind = pending_request_.kind;
    response.transport = ManualCalibrationTransportResult::Completed;
    response.request_id = pending_request_.request_id;
    response.confirmation_id = pending_request_.confirmation_id;
    response.message_type = pending_request_.message_type;
    response.accepted_count = accepted_count_;
    response.terminal_count = terminal_count_;
    response.controller_boot_id = link.controller_boot_id;
    response.peer_boot_id = link.peer_boot_id;
    queue_response(response);
}

void ManualCalibrationBridge::queue_terminal(
    ManualCalibrationTransportResult transport, const LinkStatusSnapshot& link,
    const ManualCalibrationLinkResult* terminal) {
    ManualCalibrationHostResponse response{};
    response.stage = ManualCalibrationHostStage::Terminal;
    response.kind = pending_request_.kind;
    response.transport = transport;
    response.request_id = pending_request_.request_id;
    response.confirmation_id = pending_request_.confirmation_id;
    response.message_type = pending_request_.message_type;
    response.controller_boot_id = link.controller_boot_id;
    response.peer_boot_id = link.peer_boot_id;
    if (terminal != nullptr) {
        response.link_sequence = terminal->link_sequence;
        response.terminal_flag = terminal->terminal_flag;
        response.link_error = terminal->link_error;
        response.endpoint_payload_length = terminal->payload_length;
        std::copy(terminal->payload.begin(), terminal->payload.end(),
                  response.endpoint_payload.begin());
        response.controller_boot_id = terminal->controller_boot_id;
        response.peer_boot_id = terminal->peer_boot_id;
    }
    increment_saturated(terminal_count_);
    increment_saturated(diagnostics_.terminal);
    response.accepted_count = accepted_count_;
    response.terminal_count = terminal_count_;
    completed_request_ = pending_request_;
    completed_response_ = response;
    completed_valid_ = true;
    queue_response(response);
    finish_pending();
}

void ManualCalibrationBridge::queue_immediate_terminal(
    const ManualCalibrationHostRequest& request,
    ManualCalibrationTransportResult transport,
    const LinkStatusSnapshot& link) {
    ManualCalibrationHostResponse response{};
    response.stage = ManualCalibrationHostStage::Terminal;
    response.kind = request.kind;
    response.transport = transport;
    response.request_id = request.request_id;
    response.confirmation_id = request.confirmation_id;
    response.message_type = request.message_type;
    response.controller_boot_id = link.controller_boot_id;
    response.peer_boot_id = link.peer_boot_id;
    increment_saturated(terminal_count_);
    increment_saturated(diagnostics_.terminal);
    response.accepted_count = accepted_count_;
    response.terminal_count = terminal_count_;
    queue_response(response);
}

void ManualCalibrationBridge::finish_pending() {
    pending_ = false;
    pending_request_ = {};
    pending_peer_restarts_ = 0;
}

void ManualCalibrationBridge::clear_for_usb_epoch(std::uint32_t usb_epoch) {
    if (usb_epoch_ == usb_epoch) return;
    if (pending_ || completed_valid_ || response_size_ != 0) {
        increment_saturated(diagnostics_.lifecycle_clears);
    }
    usb_epoch_ = usb_epoch;
    pending_ = false;
    completed_valid_ = false;
    pending_request_ = {};
    completed_request_ = {};
    completed_response_ = {};
    max_request_id_ = 0;
    pending_peer_restarts_ = 0;
    response_head_ = 0;
    response_size_ = 0;
}

bool ManualCalibrationBridge::accept(
    const std::uint8_t* payload, std::size_t length, std::uint32_t usb_epoch,
    const LinkStatusSnapshot& link, ManualCalibrationLinkRequest& dispatch) {
    dispatch = {};
    clear_for_usb_epoch(usb_epoch);
    ManualCalibrationHostRequest request{};
    if (usb_epoch == 0 ||
        !decode_manual_calibration_host_request(payload, length, request)) {
        increment_saturated(diagnostics_.malformed);
        return false;
    }
    if (pending_) {
        if (request.request_id == pending_request_.request_id) {
            if (manual_calibration_host_requests_equal(request,
                                                       pending_request_)) {
                increment_saturated(diagnostics_.duplicates);
                queue_accepted(link);
            } else {
                increment_saturated(diagnostics_.conflicts);
                queue_immediate_terminal(
                    request, ManualCalibrationTransportResult::RequestConflict,
                    link);
            }
        } else {
            increment_saturated(diagnostics_.busy);
            queue_immediate_terminal(request,
                                     ManualCalibrationTransportResult::Busy,
                                     link);
        }
        return false;
    }
    if (completed_valid_ &&
        request.request_id == completed_request_.request_id) {
        if (manual_calibration_host_requests_equal(request,
                                                   completed_request_)) {
            increment_saturated(diagnostics_.duplicates);
            queue_response(completed_response_);
        } else {
            increment_saturated(diagnostics_.conflicts);
            queue_immediate_terminal(
                request, ManualCalibrationTransportResult::RequestConflict,
                link);
        }
        return false;
    }
    if (max_request_id_ != 0 && request.request_id < max_request_id_) {
        increment_saturated(diagnostics_.stale);
        queue_immediate_terminal(
            request, ManualCalibrationTransportResult::StaleRequest, link);
        return false;
    }
    if (!link_ready(link) ||
        (request.kind == ManualCalibrationHostRequestKind::Command &&
         read_u32(request.payload.data()) != link.controller_boot_id)) {
        queue_immediate_terminal(
            request, ManualCalibrationTransportResult::LinkNotReady, link);
        return false;
    }

    max_request_id_ = request.request_id;
    pending_request_ = request;
    pending_ = true;
    pending_peer_restarts_ = link.peer_restarts;
    dispatch.host_request_id = request.request_id;
    dispatch.message_type = request.message_type;
    dispatch.payload_length = request.payload_length;
    std::copy(request.payload.begin(), request.payload.end(),
              dispatch.payload.begin());
    return true;
}

void ManualCalibrationBridge::note_forward_result(
    bool accepted, const LinkStatusSnapshot& link) {
    if (!pending_) return;
    if (!accepted) {
        queue_terminal(ManualCalibrationTransportResult::LinkQueueBusy, link);
        return;
    }
    increment_saturated(accepted_count_);
    increment_saturated(diagnostics_.accepted);
    queue_accepted(link);
}

void ManualCalibrationBridge::complete(
    const ManualCalibrationLinkResult& result,
    const LinkStatusSnapshot& link) {
    if (!pending_ || result.host_request_id != pending_request_.request_id ||
        result.message_type != pending_request_.message_type) {
        return;
    }
    queue_terminal(map_terminal(result.terminal), link, &result);
}

void ManualCalibrationBridge::poll_lifecycle(
    std::uint32_t usb_epoch, const LinkStatusSnapshot& link) {
    clear_for_usb_epoch(usb_epoch);
    if (!pending_) return;
    if (!link_ready(link) || link.peer_restarts != pending_peer_restarts_) {
        queue_terminal(ManualCalibrationTransportResult::PeerDisconnected,
                       link);
    }
}

bool ManualCalibrationBridge::front_response(
    std::array<std::uint8_t, kManualCalibrationHostPayloadBytes>& out) const {
    if (response_size_ == 0) return false;
    return encode_manual_calibration_host_response(responses_[response_head_],
                                                   out);
}

bool ManualCalibrationBridge::mark_response_sent() {
    if (response_size_ == 0) return false;
    responses_[response_head_] = {};
    response_head_ = (response_head_ + 1) % responses_.size();
    --response_size_;
    return true;
}

}  // namespace deskmate::easyinput
