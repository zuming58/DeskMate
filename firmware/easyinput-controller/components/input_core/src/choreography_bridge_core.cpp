#include "choreography_bridge_core.h"

#include <algorithm>

namespace deskmate::easyinput {
namespace {

constexpr std::array<std::uint8_t, 4> kRequestMagic{'D', 'M', 'C', 'Q'};
constexpr std::array<std::uint8_t, 4> kStatusMagic{'D', 'M', 'C', 'S'};
constexpr std::uint8_t kVersionOne = 1;
constexpr std::uint8_t kVersionTwo = 2;
constexpr std::uint8_t kKindCommand = 1;
constexpr std::uint8_t kKindStatus = 2;
constexpr std::uint8_t kStageAccepted = 1;
constexpr std::uint8_t kStageEndpoint = 2;

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

bool all_zero(const std::uint8_t* begin, const std::uint8_t* end) {
    return std::all_of(begin, end,
                       [](std::uint8_t value) { return value == 0; });
}

bool valid_beat(std::uint8_t yaw, std::uint8_t pitch,
                std::uint8_t expression) {
    return yaw <= 3 && pitch <= 3 && expression <= 3;
}

std::uint8_t terminal_transport(MotionPresetLinkTerminalKind terminal) {
    switch (terminal) {
        case MotionPresetLinkTerminalKind::Response: return 0;
        case MotionPresetLinkTerminalKind::LinkError: return 8;
        case MotionPresetLinkTerminalKind::Timeout: return 7;
        case MotionPresetLinkTerminalKind::Disconnected: return 9;
        case MotionPresetLinkTerminalKind::InvalidResponse: return 10;
        case MotionPresetLinkTerminalKind::Internal: return 11;
    }
    return 11;
}

}  // namespace

bool normalize_choreography_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    ChoreographyFeatureReportView& out) {
    out = {};
    if (buffer == nullptr) return false;
    if (length == 64 && buffer[0] == kChoreographyRequestReportId &&
        (report_id == 0 || report_id == kChoreographyRequestReportId)) {
        out = {buffer + 1, kChoreographyHostPayloadBytes};
        return true;
    }
    if (length == kChoreographyHostPayloadBytes &&
        report_id == kChoreographyRequestReportId) {
        out = {buffer, kChoreographyHostPayloadBytes};
        return true;
    }
    return false;
}

bool ChoreographyBridge::decode(const std::uint8_t* payload,
                                std::size_t length, Request& out) {
    out = {};
    if (payload == nullptr || length != kChoreographyHostPayloadBytes ||
        !std::equal(kRequestMagic.begin(), kRequestMagic.end(), payload) ||
        (payload[4] != kVersionOne && payload[4] != kVersionTwo) ||
        payload[5] < kKindCommand ||
        payload[5] > kKindStatus || payload[7] != 0 ||
        read_u32(payload + 8) == 0) {
        return false;
    }
    Request request{};
    request.version = payload[4];
    const bool version_two = request.version == kVersionTwo;
    const std::size_t crc_offset = version_two ? 43u : 41u;
    if (read_u16(payload + crc_offset) !=
            deskmate_link_crc16(payload, crc_offset) ||
        !all_zero(payload + crc_offset + 2u, payload + length)) {
        return false;
    }
    request.kind = payload[5];
    request.request_id = read_u32(payload + 8);
    request.source = payload[6];
    request.beat_count = payload[12];
    request.beat_code = payload[13];
    request.repeat_count = payload[14];
    request.yaw_amplitude_degrees = payload[15];
    request.pitch_amplitude_degrees = version_two ? payload[16] : payload[15];
    request.yaw_speed_degrees_per_second = payload[version_two ? 17 : 16];
    request.pitch_speed_degrees_per_second = version_two
        ? payload[18] : request.yaw_speed_degrees_per_second;
    std::copy_n(payload + (version_two ? 19 : 17), request.beats.size(),
                request.beats.begin());
    if (request.kind == kKindStatus) {
        if (request.source != 0 || request.beat_count != 0 ||
            request.beat_code != 0 || request.repeat_count != 0 ||
            request.yaw_amplitude_degrees != 0 ||
            request.pitch_amplitude_degrees != 0 ||
            request.yaw_speed_degrees_per_second != 0 ||
            request.pitch_speed_degrees_per_second != 0 ||
            !all_zero(request.beats.data(),
                      request.beats.data() + request.beats.size())) return false;
    } else {
        if (request.source < 1 || request.source > 4 ||
            request.beat_count < 2 || request.beat_count > 8 ||
            request.beat_code < 1 || request.beat_code > 4 ||
            request.repeat_count < 1 || request.repeat_count > 3) return false;
        const bool profile_valid = version_two
            ? request.yaw_amplitude_degrees >= 4 &&
                  request.yaw_amplitude_degrees <= 40 &&
                  request.pitch_amplitude_degrees >= 4 &&
                  request.pitch_amplitude_degrees <= 20 &&
                  request.yaw_speed_degrees_per_second >= 20 &&
                  request.yaw_speed_degrees_per_second <= 100 &&
                  request.pitch_speed_degrees_per_second >= 20 &&
                  request.pitch_speed_degrees_per_second <= 100
            : request.yaw_amplitude_degrees >= 1 &&
                  request.yaw_amplitude_degrees <= 3 &&
                  request.pitch_amplitude_degrees >= 1 &&
                  request.pitch_amplitude_degrees <= 3 &&
                  request.yaw_speed_degrees_per_second >= 1 &&
                  request.yaw_speed_degrees_per_second <= 3 &&
                  request.pitch_speed_degrees_per_second >= 1 &&
                  request.pitch_speed_degrees_per_second <= 3;
        if (!profile_valid) return false;
        bool changes = false;
        for (std::size_t index = 0; index < 8; ++index) {
            const std::size_t offset = index * 3;
            const bool used = index < request.beat_count;
            if (used && !valid_beat(request.beats[offset],
                                    request.beats[offset + 1],
                                    request.beats[offset + 2])) return false;
            if (!used && (request.beats[offset] != 0 ||
                          request.beats[offset + 1] != 0 ||
                          request.beats[offset + 2] != 0)) return false;
            changes = changes || (used && (request.beats[offset] != 0 ||
                                           request.beats[offset + 1] != 0 ||
                                           request.beats[offset + 2] != 0));
        }
        if (!changes) return false;
    }
    out = request;
    return true;
}

bool ChoreographyBridge::link_ready(const LinkStatusSnapshot& link) {
    return link.state == LinkControllerState::Connected &&
           (link.enabled_capabilities & kLinkT15RequiredCapabilities) ==
               kLinkT15RequiredCapabilities &&
           (link.enabled_capabilities & kLinkT15ForbiddenCapabilities) == 0 &&
           link.controller_boot_id != 0 && link.peer_boot_id != 0;
}

bool ChoreographyBridge::accept(const std::uint8_t* payload,
                                std::size_t length, std::uint32_t usb_epoch,
                                const LinkStatusSnapshot& link,
                                ChoreographyLinkRequest& dispatch) {
    dispatch = {};
    Request request{};
    if (!decode(payload, length, request) || pending_ || !link_ready(link)) {
        return false;
    }
    pending_request_ = request;
    pending_ = true;
    usb_epoch_ = usb_epoch;
    peer_boot_id_ = link.peer_boot_id;
    dispatch.host_request_id = request.request_id;
    dispatch.message_type = request.kind == kKindCommand
        ? static_cast<std::uint8_t>(request.version == kVersionTwo
              ? LinkMessageType::RunChoreographyV2
              : LinkMessageType::RunChoreography)
        : static_cast<std::uint8_t>(request.version == kVersionTwo
              ? LinkMessageType::GetChoreographyStatusV2
              : LinkMessageType::GetChoreographyStatus);
    if (request.kind == kKindCommand) {
        dispatch.payload_length = 40;
        write_u32(dispatch.payload.data(), link.controller_boot_id);
        write_u32(dispatch.payload.data() + 4, request.request_id);
        dispatch.payload[8] = request.source;
        dispatch.payload[9] = request.beat_count;
        dispatch.payload[10] = request.beat_code;
        dispatch.payload[11] = request.repeat_count;
        dispatch.payload[12] = request.yaw_amplitude_degrees;
        dispatch.payload[13] = request.version == kVersionTwo
            ? request.pitch_amplitude_degrees
            : request.yaw_speed_degrees_per_second;
        if (request.version == kVersionTwo) {
            dispatch.payload[14] = request.yaw_speed_degrees_per_second;
            dispatch.payload[15] = request.pitch_speed_degrees_per_second;
        }
        std::copy(request.beats.begin(), request.beats.end(),
                  dispatch.payload.begin() + 16);
    }
    Response accepted{};
    accepted.request = request;
    accepted.stage = kStageAccepted;
    accepted.transport = 0;
    accepted.controller_boot_id = link.controller_boot_id;
    accepted.peer_boot_id = link.peer_boot_id;
    queue(accepted);
    return true;
}

void ChoreographyBridge::note_forward_result(
    bool accepted, const LinkStatusSnapshot& link) {
    if (!pending_ || accepted) return;
    finish(6, link);
}

void ChoreographyBridge::complete(const ChoreographyLinkResult& result,
                                  const LinkStatusSnapshot& link) {
    if (!pending_ || result.host_request_id != pending_request_.request_id) {
        return;
    }
    finish(terminal_transport(result.terminal), link, &result);
}

void ChoreographyBridge::poll_lifecycle(std::uint32_t usb_epoch,
                                        const LinkStatusSnapshot& link) {
    if (!pending_) return;
    if (usb_epoch != usb_epoch_) {
        pending_ = false;
        return;
    }
    if (!link_ready(link) || link.peer_boot_id != peer_boot_id_) finish(9, link);
}

void ChoreographyBridge::clear_for_usb_epoch(std::uint32_t usb_epoch) {
    if (pending_ && usb_epoch != usb_epoch_) pending_ = false;
    response_head_ = 0;
    response_size_ = 0;
}

void ChoreographyBridge::finish(std::uint8_t transport,
                                const LinkStatusSnapshot& link,
                                const ChoreographyLinkResult* terminal) {
    Response response{};
    response.request = pending_request_;
    response.stage = kStageEndpoint;
    response.transport = transport;
    response.controller_boot_id = link.controller_boot_id;
    response.peer_boot_id = link.peer_boot_id;
    if (terminal != nullptr) {
        response.link_sequence = terminal->link_sequence;
        response.terminal_flag = terminal->terminal_flag;
        response.link_error = terminal->link_error;
        response.endpoint_length = terminal->payload_length;
        if (terminal->payload_length <= response.endpoint.size()) {
            std::copy_n(terminal->payload.begin(), terminal->payload_length,
                        response.endpoint.begin());
        }
        response.controller_boot_id = terminal->controller_boot_id;
        response.peer_boot_id = terminal->peer_boot_id;
    }
    queue(response);
    pending_ = false;
}

void ChoreographyBridge::queue(const Response& response) {
    if (response_size_ == responses_.size()) return;
    responses_[(response_head_ + response_size_) % responses_.size()] = response;
    ++response_size_;
}

bool ChoreographyBridge::encode(
    const Response& response,
    std::array<std::uint8_t, kChoreographyHostPayloadBytes>& out) const {
    if (response.request.request_id == 0) return false;
    out.fill(0);
    std::copy(kStatusMagic.begin(), kStatusMagic.end(), out.begin());
    out[4] = response.request.version;
    out[5] = response.stage;
    out[6] = response.request.kind;
    out[7] = response.transport;
    write_u32(out.data() + 8, response.request.request_id);
    write_u32(out.data() + 12, response.link_sequence);
    out[16] = response.request.kind == kKindCommand
        ? (response.request.version == kVersionTwo ? 0x26 : 0x24)
        : (response.request.version == kVersionTwo ? 0x27 : 0x25);
    out[17] = response.terminal_flag;
    out[18] = static_cast<std::uint8_t>(response.link_error);
    out[19] = response.endpoint_length;
    std::copy_n(response.endpoint.begin(), response.endpoint_length,
                out.begin() + 20);
    write_u32(out.data() + 44, response.controller_boot_id);
    write_u32(out.data() + 48, response.peer_boot_id);
    out[52] = response.request.source;
    out[53] = response.request.beat_count;
    out[54] = response.request.beat_code;
    out[55] = response.request.repeat_count;
    out[56] = response.request.yaw_amplitude_degrees;
    if (response.request.version == kVersionTwo) {
        out[57] = response.request.pitch_amplitude_degrees;
        out[58] = response.request.yaw_speed_degrees_per_second;
        out[59] = response.request.pitch_speed_degrees_per_second;
        write_u16(out.data() + 60, deskmate_link_crc16(out.data(), 60));
    } else {
        out[57] = response.request.yaw_speed_degrees_per_second;
        write_u16(out.data() + 58, deskmate_link_crc16(out.data(), 58));
    }
    return true;
}

bool ChoreographyBridge::front_response(
    std::array<std::uint8_t, kChoreographyHostPayloadBytes>& out) const {
    return response_size_ != 0 && encode(responses_[response_head_], out);
}

bool ChoreographyBridge::mark_response_sent() {
    if (response_size_ == 0) return false;
    response_head_ = (response_head_ + 1) % responses_.size();
    --response_size_;
    return true;
}

}  // namespace deskmate::easyinput
