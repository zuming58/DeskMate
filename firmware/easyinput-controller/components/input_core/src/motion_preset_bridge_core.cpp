#include "motion_preset_bridge_core.h"

#include <algorithm>
#include <limits>

namespace deskmate::easyinput {
namespace {

constexpr std::array<std::uint8_t, 4> kRequestMagic = {'D', 'M', 'R', 'Q'};
constexpr std::array<std::uint8_t, 4> kStatusMagic = {'D', 'M', 'R', 'S'};

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

bool all_zero(const std::uint8_t* begin, const std::uint8_t* end) {
    return std::all_of(begin, end,
                       [](std::uint8_t value) { return value == 0; });
}

bool valid_command_shape(std::uint8_t source, std::uint8_t operation,
                         std::uint8_t preset, std::uint8_t repeat_count) {
    if (source < 1 || source > 4 || operation < 1 || operation > 4) {
        return false;
    }
    if (operation == 1) {
        return preset >= 1 && preset <= 4 && repeat_count >= 1 &&
               repeat_count <= 3;
    }
    if (preset != 0 || repeat_count != 0) return false;
    if (operation == 4) return source == 1;
    return source == 1 || source == 2;
}

bool valid_request_shape(MotionPresetHostRequestKind kind,
                         std::uint8_t source, std::uint8_t operation,
                         std::uint8_t preset, std::uint8_t repeat_count) {
    if (kind == MotionPresetHostRequestKind::Command) {
        return valid_command_shape(source, operation, preset, repeat_count);
    }
    return kind == MotionPresetHostRequestKind::Status && source == 0 &&
           operation == 0 && preset == 0 && repeat_count == 0;
}

MotionPresetTransportResult map_terminal(MotionPresetLinkTerminalKind terminal) {
    switch (terminal) {
        case MotionPresetLinkTerminalKind::Response:
            return MotionPresetTransportResult::Completed;
        case MotionPresetLinkTerminalKind::LinkError:
            return MotionPresetTransportResult::LinkError;
        case MotionPresetLinkTerminalKind::Timeout:
            return MotionPresetTransportResult::Timeout;
        case MotionPresetLinkTerminalKind::Disconnected:
            return MotionPresetTransportResult::PeerDisconnected;
        case MotionPresetLinkTerminalKind::InvalidResponse:
            return MotionPresetTransportResult::InvalidLinkResponse;
        case MotionPresetLinkTerminalKind::Internal:
            return MotionPresetTransportResult::Internal;
    }
    return MotionPresetTransportResult::Internal;
}

}  // namespace

bool normalize_motion_preset_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    MotionPresetFeatureReportView& out) {
    out = {};
    if (buffer == nullptr || length == 0) return false;
    if (buffer[0] == kMotionPresetRequestReportId &&
        length == kMotionPresetHostPayloadBytes + 1) {
        if (report_id != 0 && report_id != kMotionPresetRequestReportId) {
            return false;
        }
        out = {buffer + 1, kMotionPresetHostPayloadBytes};
        return true;
    }
    if (report_id == kMotionPresetRequestReportId &&
        length == kMotionPresetHostPayloadBytes) {
        out = {buffer, kMotionPresetHostPayloadBytes};
        return true;
    }
    return false;
}

bool decode_motion_preset_host_request(const std::uint8_t* payload,
                                       std::size_t length,
                                       MotionPresetHostRequest& out) {
    out = {};
    if (payload == nullptr || length != kMotionPresetHostPayloadBytes ||
        !std::equal(kRequestMagic.begin(), kRequestMagic.end(), payload) ||
        payload[4] != kMotionPresetHostVersion ||
        !all_zero(payload + 14, payload + 16) ||
        deskmate_link_crc16(payload, 16) != read_u16(payload + 16) ||
        !all_zero(payload + 18, payload + length)) {
        return false;
    }

    MotionPresetHostRequest request{};
    request.kind = static_cast<MotionPresetHostRequestKind>(payload[5]);
    request.source = payload[6];
    request.operation = payload[7];
    request.request_id = read_u32(payload + 8);
    request.preset = payload[12];
    request.repeat_count = payload[13];
    if (request.request_id == 0 ||
        !valid_request_shape(request.kind, request.source, request.operation,
                             request.preset, request.repeat_count)) {
        return false;
    }
    request.message_type = static_cast<std::uint8_t>(
        request.kind == MotionPresetHostRequestKind::Command
            ? LinkMessageType::MotionPresetCommand
            : LinkMessageType::GetMotionPresetStatus);
    out = request;
    return true;
}

bool encode_motion_preset_host_response(
    const MotionPresetHostResponse& response,
    std::array<std::uint8_t, kMotionPresetHostPayloadBytes>& out) {
    out.fill(0);
    const bool command =
        response.kind == MotionPresetHostRequestKind::Command;
    const bool status = response.kind == MotionPresetHostRequestKind::Status;
    const bool valid_stage =
        response.stage == MotionPresetHostStage::Accepted ||
        response.stage == MotionPresetHostStage::EndpointAcknowledgement;
    const bool valid_type =
        (command && response.message_type == static_cast<std::uint8_t>(
                                               LinkMessageType::
                                                   MotionPresetCommand)) ||
        (status && response.message_type == static_cast<std::uint8_t>(
                                              LinkMessageType::
                                                  GetMotionPresetStatus));
    const bool valid_terminal_flag =
        response.terminal_flag == 0 ||
        response.terminal_flag ==
            static_cast<std::uint8_t>(LinkFrameFlag::Response) ||
        response.terminal_flag ==
            static_cast<std::uint8_t>(LinkFrameFlag::Error);
    const bool accepted_shape =
        response.stage == MotionPresetHostStage::Accepted &&
        response.transport == MotionPresetTransportResult::Completed &&
        response.link_sequence == 0 && response.terminal_flag == 0 &&
        response.link_error == LinkErrorCode::None &&
        response.endpoint_payload_length == 0;
    const bool endpoint_success_shape =
        response.stage == MotionPresetHostStage::EndpointAcknowledgement &&
        response.transport == MotionPresetTransportResult::Completed &&
        response.link_sequence != 0 &&
        response.terminal_flag ==
            static_cast<std::uint8_t>(LinkFrameFlag::Response) &&
        response.link_error == LinkErrorCode::None &&
        response.endpoint_payload_length == kMotionPresetStatusPayloadBytes;
    const bool endpoint_link_error_shape =
        response.stage == MotionPresetHostStage::EndpointAcknowledgement &&
        response.transport == MotionPresetTransportResult::LinkError &&
        response.link_sequence != 0 &&
        response.terminal_flag ==
            static_cast<std::uint8_t>(LinkFrameFlag::Error) &&
        response.link_error != LinkErrorCode::None &&
        response.endpoint_payload_length == 0;
    const bool endpoint_local_error_shape =
        response.stage == MotionPresetHostStage::EndpointAcknowledgement &&
        response.transport != MotionPresetTransportResult::Completed &&
        response.transport != MotionPresetTransportResult::LinkError &&
        response.terminal_flag == 0 &&
        response.link_error == LinkErrorCode::None &&
        response.endpoint_payload_length == 0;
    if ((!command && !status) || !valid_stage || !valid_type ||
        !valid_request_shape(response.kind, response.source,
                             response.operation, response.preset,
                             response.repeat_count) ||
        response.request_id == 0 || !valid_terminal_flag ||
        static_cast<std::uint8_t>(response.transport) >
            static_cast<std::uint8_t>(MotionPresetTransportResult::Internal) ||
        static_cast<std::uint8_t>(response.link_error) >
            static_cast<std::uint8_t>(LinkErrorCode::Internal) ||
        (!accepted_shape && !endpoint_success_shape &&
         !endpoint_link_error_shape && !endpoint_local_error_shape)) {
        return false;
    }

    std::copy(kStatusMagic.begin(), kStatusMagic.end(), out.begin());
    out[4] = kMotionPresetHostVersion;
    out[5] = static_cast<std::uint8_t>(response.stage);
    out[6] = static_cast<std::uint8_t>(response.kind);
    out[7] = static_cast<std::uint8_t>(response.transport);
    write_u32(out.data() + 8, response.request_id);
    write_u32(out.data() + 12, response.link_sequence);
    out[16] = response.message_type;
    out[17] = response.terminal_flag;
    out[18] = static_cast<std::uint8_t>(response.link_error);
    out[19] = response.endpoint_payload_length;
    std::copy_n(response.endpoint_payload.begin(),
                response.endpoint_payload_length, out.begin() + 20);
    write_u32(out.data() + 40, response.accepted_count);
    write_u32(out.data() + 44, response.terminal_count);
    write_u32(out.data() + 48, response.controller_boot_id);
    write_u32(out.data() + 52, response.peer_boot_id);
    out[56] = response.source;
    out[57] = response.operation;
    out[58] = response.preset;
    out[59] = response.repeat_count;
    write_u16(out.data() + 60, deskmate_link_crc16(out.data(), 60));
    return true;
}

bool motion_preset_host_requests_equal(const MotionPresetHostRequest& left,
                                       const MotionPresetHostRequest& right) {
    return left.kind == right.kind && left.source == right.source &&
           left.operation == right.operation &&
           left.request_id == right.request_id && left.preset == right.preset &&
           left.repeat_count == right.repeat_count &&
           left.message_type == right.message_type;
}

bool MotionPresetBridge::link_ready(const LinkStatusSnapshot& link) {
    return link.state == LinkControllerState::Connected &&
           (link.enabled_capabilities & kLinkT15RequiredCapabilities) ==
               kLinkT15RequiredCapabilities &&
           (link.enabled_capabilities & kLinkT15ForbiddenCapabilities) == 0 &&
           link.controller_boot_id != 0 && link.peer_boot_id != 0;
}

void MotionPresetBridge::queue_response(
    const MotionPresetHostResponse& response) {
    if (response_size_ == responses_.size()) {
        increment_saturated(diagnostics_.response_drops);
        return;
    }
    responses_[(response_head_ + response_size_) % responses_.size()] =
        response;
    ++response_size_;
}

void MotionPresetBridge::queue_accepted(const LinkStatusSnapshot& link) {
    MotionPresetHostResponse response{};
    response.stage = MotionPresetHostStage::Accepted;
    response.kind = pending_request_.kind;
    response.transport = MotionPresetTransportResult::Completed;
    response.request_id = pending_request_.request_id;
    response.message_type = pending_request_.message_type;
    response.accepted_count = accepted_count_;
    response.terminal_count = endpoint_acknowledgement_count_;
    response.controller_boot_id = link.controller_boot_id;
    response.peer_boot_id = link.peer_boot_id;
    response.source = pending_request_.source;
    response.operation = pending_request_.operation;
    response.preset = pending_request_.preset;
    response.repeat_count = pending_request_.repeat_count;
    queue_response(response);
}

void MotionPresetBridge::queue_endpoint_acknowledgement(
    MotionPresetTransportResult transport, const LinkStatusSnapshot& link,
    const MotionPresetLinkResult* terminal, bool cache_result) {
    MotionPresetHostResponse response{};
    response.stage = MotionPresetHostStage::EndpointAcknowledgement;
    response.kind = pending_request_.kind;
    response.transport = transport;
    response.request_id = pending_request_.request_id;
    response.message_type = pending_request_.message_type;
    response.controller_boot_id = link.controller_boot_id;
    response.peer_boot_id = link.peer_boot_id;
    response.source = pending_request_.source;
    response.operation = pending_request_.operation;
    response.preset = pending_request_.preset;
    response.repeat_count = pending_request_.repeat_count;
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
    increment_saturated(endpoint_acknowledgement_count_);
    increment_saturated(diagnostics_.endpoint_acknowledgements);
    response.accepted_count = accepted_count_;
    response.terminal_count = endpoint_acknowledgement_count_;
    if (cache_result) {
        completed_request_ = pending_request_;
        completed_response_ = response;
        completed_valid_ = true;
    } else {
        completed_request_ = {};
        completed_response_ = {};
        completed_valid_ = false;
    }
    queue_response(response);
    finish_pending();
}

void MotionPresetBridge::queue_immediate_endpoint_acknowledgement(
    const MotionPresetHostRequest& request, MotionPresetTransportResult transport,
    const LinkStatusSnapshot& link) {
    MotionPresetHostResponse response{};
    response.stage = MotionPresetHostStage::EndpointAcknowledgement;
    response.kind = request.kind;
    response.transport = transport;
    response.request_id = request.request_id;
    response.message_type = request.message_type;
    response.accepted_count = accepted_count_;
    increment_saturated(endpoint_acknowledgement_count_);
    increment_saturated(diagnostics_.endpoint_acknowledgements);
    response.terminal_count = endpoint_acknowledgement_count_;
    response.controller_boot_id = link.controller_boot_id;
    response.peer_boot_id = link.peer_boot_id;
    response.source = request.source;
    response.operation = request.operation;
    response.preset = request.preset;
    response.repeat_count = request.repeat_count;
    queue_response(response);
}

void MotionPresetBridge::finish_pending() {
    pending_ = false;
    pending_request_ = {};
    pending_peer_restarts_ = 0;
}

void MotionPresetBridge::clear_for_usb_epoch(std::uint32_t usb_epoch) {
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

bool MotionPresetBridge::accept(
    const std::uint8_t* payload, std::size_t length, std::uint32_t usb_epoch,
    const LinkStatusSnapshot& link, MotionPresetLinkRequest& dispatch) {
    dispatch = {};
    clear_for_usb_epoch(usb_epoch);
    MotionPresetHostRequest request{};
    if (usb_epoch == 0 ||
        !decode_motion_preset_host_request(payload, length, request)) {
        increment_saturated(diagnostics_.malformed);
        return false;
    }
    if (pending_) {
        if (request.request_id == pending_request_.request_id) {
            if (motion_preset_host_requests_equal(request, pending_request_)) {
                increment_saturated(diagnostics_.duplicates);
                queue_accepted(link);
            } else {
                increment_saturated(diagnostics_.conflicts);
                queue_immediate_endpoint_acknowledgement(
                    request, MotionPresetTransportResult::RequestConflict,
                    link);
            }
        } else {
            increment_saturated(diagnostics_.busy);
            queue_immediate_endpoint_acknowledgement(
                request, MotionPresetTransportResult::Busy, link);
        }
        return false;
    }
    if (completed_valid_ &&
        request.request_id == completed_request_.request_id) {
        if (motion_preset_host_requests_equal(request, completed_request_)) {
            increment_saturated(diagnostics_.duplicates);
            queue_response(completed_response_);
        } else {
            increment_saturated(diagnostics_.conflicts);
            queue_immediate_endpoint_acknowledgement(
                request, MotionPresetTransportResult::RequestConflict, link);
        }
        return false;
    }
    if (max_request_id_ != 0 && request.request_id <= max_request_id_) {
        increment_saturated(diagnostics_.stale);
        queue_immediate_endpoint_acknowledgement(
            request, MotionPresetTransportResult::StaleRequest, link);
        return false;
    }
    if (!link_ready(link)) {
        queue_immediate_endpoint_acknowledgement(
            request, MotionPresetTransportResult::LinkNotReady, link);
        return false;
    }

    max_request_id_ = request.request_id;
    pending_request_ = request;
    pending_ = true;
    pending_peer_restarts_ = link.peer_restarts;
    dispatch.host_request_id = request.request_id;
    dispatch.message_type = request.message_type;
    if (request.kind == MotionPresetHostRequestKind::Command) {
        dispatch.payload_length = kMotionPresetCommandPayloadBytes;
        write_u32(dispatch.payload.data(), link.controller_boot_id);
        write_u32(dispatch.payload.data() + 4, request.request_id);
        dispatch.payload[8] = request.operation;
        dispatch.payload[9] = request.preset;
        dispatch.payload[10] = request.repeat_count;
        dispatch.payload[11] = request.source;
    }
    return true;
}

void MotionPresetBridge::note_forward_result(
    bool accepted, const LinkStatusSnapshot& link) {
    if (!pending_) return;
    if (!accepted) {
        queue_endpoint_acknowledgement(
            MotionPresetTransportResult::LinkQueueBusy, link);
        return;
    }
    increment_saturated(accepted_count_);
    increment_saturated(diagnostics_.accepted);
    queue_accepted(link);
}

void MotionPresetBridge::complete(const MotionPresetLinkResult& result,
                                  const LinkStatusSnapshot& link) {
    if (!pending_ || result.host_request_id != pending_request_.request_id ||
        result.message_type != pending_request_.message_type) {
        return;
    }
    const bool cache_result =
        result.terminal != MotionPresetLinkTerminalKind::Disconnected;
    queue_endpoint_acknowledgement(map_terminal(result.terminal), link,
                                   &result, cache_result);
}

void MotionPresetBridge::poll_lifecycle(
    std::uint32_t usb_epoch, const LinkStatusSnapshot& link) {
    clear_for_usb_epoch(usb_epoch);
    bool lifecycle_cleared = false;
    if (completed_valid_ &&
        (!link_ready(link) ||
         completed_response_.controller_boot_id != link.controller_boot_id ||
         completed_response_.peer_boot_id != link.peer_boot_id)) {
        completed_valid_ = false;
        completed_request_ = {};
        completed_response_ = {};
        increment_saturated(diagnostics_.lifecycle_clears);
        lifecycle_cleared = true;
    }
    if (!pending_) return;
    if (!link_ready(link) || link.peer_restarts != pending_peer_restarts_) {
        if (!lifecycle_cleared) {
            increment_saturated(diagnostics_.lifecycle_clears);
        }
        queue_endpoint_acknowledgement(
            MotionPresetTransportResult::PeerDisconnected, link, nullptr,
            false);
    }
}

bool MotionPresetBridge::front_response(
    std::array<std::uint8_t, kMotionPresetHostPayloadBytes>& out) const {
    if (response_size_ == 0) return false;
    return encode_motion_preset_host_response(responses_[response_head_], out);
}

bool MotionPresetBridge::mark_response_sent() {
    if (response_size_ == 0) return false;
    responses_[response_head_] = {};
    response_head_ = (response_head_ + 1) % responses_.size();
    --response_size_;
    return true;
}

}  // namespace deskmate::easyinput
