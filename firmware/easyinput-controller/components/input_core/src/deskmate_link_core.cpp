#include "deskmate_link_core.h"

#include <algorithm>
#include <cstring>
#include <limits>

namespace deskmate::easyinput {
namespace {

std::uint16_t read_u16(const std::uint8_t* data) {
    return static_cast<std::uint16_t>(data[0]) |
           static_cast<std::uint16_t>(data[1] << 8u);
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

bool due(std::uint32_t now_ms, std::uint32_t deadline_ms) {
    return static_cast<std::int32_t>(now_ms - deadline_ms) >= 0;
}

bool valid_flag(LinkFrameFlag flag) {
    return flag == LinkFrameFlag::Request ||
           flag == LinkFrameFlag::Response ||
           flag == LinkFrameFlag::Error;
}

bool valid_agent_state(std::uint8_t value) {
    return value <= static_cast<std::uint8_t>(LinkAgentState::Error);
}

bool valid_error(std::uint8_t value) {
    return value >= static_cast<std::uint8_t>(LinkErrorCode::UnknownType) &&
           value <= static_cast<std::uint8_t>(LinkErrorCode::Internal);
}

}  // namespace

std::uint16_t deskmate_link_crc16(const std::uint8_t* data,
                                  std::size_t length) {
    std::uint16_t crc = 0xffff;
    if (data == nullptr && length != 0) return crc;
    for (std::size_t index = 0; index < length; ++index) {
        crc ^= static_cast<std::uint16_t>(data[index]) << 8u;
        for (unsigned bit = 0; bit < 8; ++bit) {
            crc = (crc & 0x8000u) != 0
                      ? static_cast<std::uint16_t>((crc << 1u) ^ 0x1021u)
                      : static_cast<std::uint16_t>(crc << 1u);
        }
    }
    return crc;
}

bool encode_deskmate_link_frame(const LinkFrame& frame, LinkWireFrame& wire) {
    wire = {};
    if (frame.version != kDeskMateLinkVersion || !valid_flag(frame.flag) ||
        frame.reserved != 0 || frame.sequence == 0 ||
        frame.payload_length > kDeskMateLinkMaxPayloadBytes) {
        return false;
    }
    std::copy(kDeskMateLinkMagic.begin(), kDeskMateLinkMagic.end(),
              wire.bytes.begin());
    wire.bytes[4] = frame.version;
    wire.bytes[5] = static_cast<std::uint8_t>(frame.flag);
    wire.bytes[6] = frame.type;
    wire.bytes[7] = 0;
    write_u32(wire.bytes.data() + 8, frame.sequence);
    write_u16(wire.bytes.data() + 12, frame.payload_length);
    std::copy_n(frame.payload.begin(), frame.payload_length,
                wire.bytes.begin() + kDeskMateLinkHeaderBytes);
    const std::size_t crc_length = 10u + frame.payload_length;
    const std::uint16_t crc =
        deskmate_link_crc16(wire.bytes.data() + 4, crc_length);
    write_u16(wire.bytes.data() + kDeskMateLinkHeaderBytes +
                  frame.payload_length,
              crc);
    wire.length = static_cast<std::uint16_t>(
        kDeskMateLinkHeaderBytes + frame.payload_length + 2u);
    return true;
}

const char* link_controller_state_name(LinkControllerState state) {
    switch (state) {
        case LinkControllerState::Disabled:
            return "disabled";
        case LinkControllerState::Waiting:
            return "waiting";
        case LinkControllerState::Connected:
            return "connected";
        case LinkControllerState::Faulted:
            return "faulted";
    }
    return "faulted";
}

void LinkStreamParser::discard_prefix(std::size_t count) {
    count = std::min(count, size_);
    if (count == 0) return;
    std::move(buffer_.begin() + count, buffer_.begin() + size_, buffer_.begin());
    size_ -= count;
}

std::size_t LinkStreamParser::find_magic() const {
    if (size_ < kDeskMateLinkMagic.size()) return size_;
    for (std::size_t offset = 0;
         offset + kDeskMateLinkMagic.size() <= size_; ++offset) {
        if (std::equal(kDeskMateLinkMagic.begin(), kDeskMateLinkMagic.end(),
                       buffer_.begin() + offset)) {
            return offset;
        }
    }
    return size_;
}

std::size_t LinkStreamParser::magic_suffix_length() const {
    const std::size_t maximum =
        std::min(size_, kDeskMateLinkMagic.size() - 1u);
    for (std::size_t count = maximum; count > 0; --count) {
        if (std::equal(buffer_.begin() + size_ - count, buffer_.begin() + size_,
                       kDeskMateLinkMagic.begin())) {
            return count;
        }
    }
    return 0;
}

bool LinkStreamParser::push(std::uint8_t byte, std::uint32_t now_ms,
                            LinkFrame& frame) {
    if (has_last_byte_ &&
        static_cast<std::uint32_t>(now_ms - last_byte_ms_) >=
            kDeskMateLinkInterByteTimeoutMs &&
        size_ != 0) {
        size_ = 0;
        increment_saturated(diagnostics_.inter_byte_timeouts);
    }
    has_last_byte_ = true;
    last_byte_ms_ = now_ms;
    if (size_ == buffer_.size()) {
        discard_prefix(1);
        increment_saturated(diagnostics_.length_errors);
    }
    buffer_[size_++] = byte;

    for (;;) {
        if (size_ < kDeskMateLinkMagic.size()) return false;
        const std::size_t magic = find_magic();
        if (magic == size_) {
            const std::size_t suffix = magic_suffix_length();
            if (size_ > suffix) {
                discard_prefix(size_ - suffix);
                increment_saturated(diagnostics_.framing_errors);
            }
            return false;
        }
        if (magic != 0) {
            discard_prefix(magic);
            increment_saturated(diagnostics_.framing_errors);
        }
        if (size_ < kDeskMateLinkHeaderBytes) return false;

        const std::uint16_t payload_length = read_u16(buffer_.data() + 12);
        if (payload_length > kDeskMateLinkMaxPayloadBytes) {
            discard_prefix(1);
            increment_saturated(diagnostics_.length_errors);
            continue;
        }
        const std::size_t frame_length =
            kDeskMateLinkHeaderBytes + payload_length + 2u;
        if (size_ < frame_length) return false;

        const std::uint16_t expected_crc =
            read_u16(buffer_.data() + kDeskMateLinkHeaderBytes + payload_length);
        const std::uint16_t actual_crc =
            deskmate_link_crc16(buffer_.data() + 4, 10u + payload_length);
        if (expected_crc != actual_crc) {
            discard_prefix(1);
            increment_saturated(diagnostics_.crc_errors);
            continue;
        }
        if (buffer_[4] != kDeskMateLinkVersion) {
            discard_prefix(frame_length);
            increment_saturated(diagnostics_.version_errors);
            continue;
        }
        const auto flag = static_cast<LinkFrameFlag>(buffer_[5]);
        if (!valid_flag(flag) || buffer_[7] != 0 || read_u32(buffer_.data() + 8) == 0) {
            discard_prefix(frame_length);
            increment_saturated(diagnostics_.framing_errors);
            continue;
        }

        frame = {};
        frame.version = buffer_[4];
        frame.flag = flag;
        frame.type = buffer_[6];
        frame.sequence = read_u32(buffer_.data() + 8);
        frame.payload_length = payload_length;
        std::copy_n(buffer_.begin() + kDeskMateLinkHeaderBytes, payload_length,
                    frame.payload.begin());
        discard_prefix(frame_length);
        increment_saturated(diagnostics_.accepted_frames);
        return true;
    }
}

void LinkStreamParser::expire(std::uint32_t now_ms) {
    if (size_ != 0 && has_last_byte_ &&
        static_cast<std::uint32_t>(now_ms - last_byte_ms_) >=
            kDeskMateLinkInterByteTimeoutMs) {
        size_ = 0;
        increment_saturated(diagnostics_.inter_byte_timeouts);
    }
}

void LinkStreamParser::reset() {
    size_ = 0;
    last_byte_ms_ = 0;
    has_last_byte_ = false;
}

void LinkController::start(std::uint32_t controller_boot_id,
                           std::uint32_t now_ms) {
    status_ = {};
    status_.state = LinkControllerState::Waiting;
    pending_ = {};
    queued_agent_state_ = {};
    controller_boot_id_ = controller_boot_id == 0 ? 1 : controller_boot_id;
    peer_boot_id_ = 0;
    sequence_ = 0;
    next_hello_ms_ = now_ms;
    next_capabilities_ms_ = now_ms;
    next_status_ms_ = now_ms;
    consecutive_failures_ = 0;
    capabilities_known_ = false;
}

void LinkController::fault() {
    pending_ = {};
    queued_agent_state_ = {};
    peer_boot_id_ = 0;
    capabilities_known_ = false;
    status_.implemented_capabilities = 0;
    status_.enabled_capabilities = 0;
    status_.state = LinkControllerState::Faulted;
}

std::uint32_t LinkController::next_sequence() {
    ++sequence_;
    if (sequence_ == 0) ++sequence_;
    return sequence_;
}

bool LinkController::begin_request(LinkMessageType type,
                                   const std::uint8_t* payload,
                                   std::uint16_t length) {
    if (pending_.active || length > kDeskMateLinkMaxPayloadBytes ||
        (payload == nullptr && length != 0)) {
        return false;
    }
    pending_ = {};
    pending_.frame.flag = LinkFrameFlag::Request;
    pending_.frame.type = static_cast<std::uint8_t>(type);
    pending_.frame.sequence = next_sequence();
    pending_.frame.payload_length = length;
    if (length != 0) {
        std::copy_n(payload, length, pending_.frame.payload.begin());
    }
    pending_.active = true;
    pending_.needs_send = true;
    return true;
}

bool LinkController::emit_pending(std::uint32_t now_ms,
                                  LinkWireFrame& outgoing) {
    if (!pending_.active || !pending_.needs_send ||
        !encode_deskmate_link_frame(pending_.frame, outgoing)) {
        return false;
    }
    pending_.needs_send = false;
    pending_.sent_at_ms = now_ms;
    ++pending_.attempts;
    increment_saturated(status_.tx_frames);
    if (pending_.attempts > 1) increment_saturated(status_.retries);
    return true;
}

bool LinkController::poll(std::uint32_t now_ms, LinkWireFrame& outgoing) {
    outgoing = {};
    if (status_.state == LinkControllerState::Disabled ||
        status_.state == LinkControllerState::Faulted) {
        return false;
    }

    if (pending_.active && !pending_.needs_send &&
        due(now_ms, pending_.sent_at_ms + kDeskMateLinkRequestTimeoutMs)) {
        if (pending_.attempts < kDeskMateLinkMaxAttempts) {
            pending_.needs_send = true;
        } else {
            increment_saturated(status_.request_timeouts);
            pending_.active = false;
            complete_failure(now_ms);
        }
    }
    if (pending_.active) return emit_pending(now_ms, outgoing);

    if (status_.state == LinkControllerState::Waiting) {
        if (!due(now_ms, next_hello_ms_)) return false;
        std::array<std::uint8_t, 7> payload{};
        payload[0] = 1;
        payload[1] = kDeskMateLinkVersion;
        payload[2] = kDeskMateLinkVersion;
        write_u32(payload.data() + 3, controller_boot_id_);
        next_hello_ms_ = now_ms + kDeskMateLinkHelloIntervalMs;
        return begin_request(LinkMessageType::Hello, payload.data(), payload.size()) &&
               emit_pending(now_ms, outgoing);
    }

    if (!capabilities_known_ && due(now_ms, next_capabilities_ms_)) {
        return begin_request(LinkMessageType::GetCapabilities, nullptr, 0) &&
               emit_pending(now_ms, outgoing);
    }
    if (queued_agent_state_.pending) {
        std::array<std::uint8_t, 5> payload{};
        write_u32(payload.data(), queued_agent_state_.transition_id);
        payload[4] = static_cast<std::uint8_t>(queued_agent_state_.state);
        queued_agent_state_.pending = false;
        return begin_request(LinkMessageType::SetAgentState, payload.data(),
                             payload.size()) &&
               emit_pending(now_ms, outgoing);
    }
    if (capabilities_known_ && due(now_ms, next_status_ms_)) {
        next_status_ms_ = now_ms + kDeskMateLinkStatusIntervalMs;
        return begin_request(LinkMessageType::GetStatus, nullptr, 0) &&
               emit_pending(now_ms, outgoing);
    }
    return false;
}

void LinkController::complete_success() {
    pending_ = {};
    consecutive_failures_ = 0;
}

void LinkController::disconnect(std::uint32_t now_ms) {
    pending_ = {};
    queued_agent_state_ = {};
    capabilities_known_ = false;
    status_.implemented_capabilities = 0;
    status_.enabled_capabilities = 0;
    status_.status_flags = 0;
    status_.state = LinkControllerState::Waiting;
    next_hello_ms_ = now_ms + kDeskMateLinkHelloIntervalMs;
}

void LinkController::complete_failure(std::uint32_t now_ms) {
    if (consecutive_failures_ != std::numeric_limits<std::uint8_t>::max()) {
        ++consecutive_failures_;
    }
    if (consecutive_failures_ >= 3) {
        consecutive_failures_ = 0;
        disconnect(now_ms);
        return;
    }
    if (status_.state == LinkControllerState::Waiting) {
        next_hello_ms_ = now_ms + kDeskMateLinkHelloIntervalMs;
    } else if (!capabilities_known_) {
        next_capabilities_ms_ = now_ms + kDeskMateLinkHelloIntervalMs;
    } else {
        next_status_ms_ = now_ms + kDeskMateLinkStatusIntervalMs;
    }
}

bool LinkController::handle_response(const LinkFrame& incoming,
                                     std::uint32_t now_ms) {
    const auto type = static_cast<LinkMessageType>(incoming.type);
    if (type == LinkMessageType::Hello) {
        if (incoming.payload_length != 8 || incoming.payload[0] != 2 ||
            incoming.payload[1] != kDeskMateLinkVersion ||
            read_u32(incoming.payload.data() + 2) == 0 ||
            read_u16(incoming.payload.data() + 6) !=
                kDeskMateLinkMaxPayloadBytes) {
            return false;
        }
        const std::uint32_t new_peer_boot_id =
            read_u32(incoming.payload.data() + 2);
        if (peer_boot_id_ != 0 && peer_boot_id_ != new_peer_boot_id) {
            increment_saturated(status_.peer_restarts);
        }
        peer_boot_id_ = new_peer_boot_id;
        capabilities_known_ = false;
        status_.state = LinkControllerState::Connected;
        status_.implemented_capabilities = 0;
        status_.enabled_capabilities = 0;
        next_capabilities_ms_ = now_ms;
        next_status_ms_ = now_ms;
        return true;
    }
    if (type == LinkMessageType::GetCapabilities) {
        if (incoming.payload_length != 10) return false;
        const std::uint32_t implemented = read_u32(incoming.payload.data());
        const std::uint32_t enabled = read_u32(incoming.payload.data() + 4);
        const std::uint16_t max_payload = read_u16(incoming.payload.data() + 8);
        if ((enabled & ~implemented) != 0 ||
            (enabled & kLinkT08RequiredCapabilities) !=
                kLinkT08RequiredCapabilities ||
            max_payload != kDeskMateLinkMaxPayloadBytes) {
            return false;
        }
        status_.implemented_capabilities = implemented;
        status_.enabled_capabilities = enabled;
        capabilities_known_ = true;
        next_status_ms_ = now_ms;
        return true;
    }
    if (type == LinkMessageType::GetStatus) {
        if (incoming.payload_length != 11 ||
            read_u32(incoming.payload.data()) != peer_boot_id_ ||
            !valid_agent_state(incoming.payload[8]) ||
            (incoming.payload[9] & 0x70u) != 0 ||
            incoming.payload[10] >
                static_cast<std::uint8_t>(LinkErrorCode::Internal)) {
            return false;
        }
        status_.agent_state =
            static_cast<LinkAgentState>(incoming.payload[8]);
        status_.status_flags = incoming.payload[9];
        status_.last_error =
            static_cast<LinkErrorCode>(incoming.payload[10]);
        next_status_ms_ = now_ms + kDeskMateLinkStatusIntervalMs;
        return true;
    }
    if (type == LinkMessageType::SetAgentState) {
        return incoming.payload_length == pending_.frame.payload_length &&
               std::equal(incoming.payload.begin(),
                          incoming.payload.begin() + incoming.payload_length,
                          pending_.frame.payload.begin());
    }
    return false;
}

void LinkController::receive(const LinkFrame& incoming,
                             std::uint32_t now_ms) {
    increment_saturated(status_.rx_frames);
    if (!pending_.active || incoming.sequence != pending_.frame.sequence ||
        incoming.type != pending_.frame.type ||
        (incoming.flag != LinkFrameFlag::Response &&
         incoming.flag != LinkFrameFlag::Error)) {
        increment_saturated(status_.unexpected_frames);
        return;
    }
    if (incoming.flag == LinkFrameFlag::Error) {
        if (incoming.payload_length != 1 || !valid_error(incoming.payload[0])) {
            increment_saturated(status_.semantic_errors);
            pending_.active = false;
            complete_failure(now_ms);
            return;
        }
        status_.last_error = static_cast<LinkErrorCode>(incoming.payload[0]);
        increment_saturated(status_.semantic_errors);
        pending_.active = false;
        complete_failure(now_ms);
        return;
    }
    if (!handle_response(incoming, now_ms)) {
        increment_saturated(status_.semantic_errors);
        pending_.active = false;
        complete_failure(now_ms);
        return;
    }
    complete_success();
}

bool LinkController::queue_agent_state(LinkAgentState state,
                                       std::uint32_t transition_id) {
    if (status_.state != LinkControllerState::Connected ||
        !capabilities_known_ || queued_agent_state_.pending ||
        transition_id == 0 ||
        !valid_agent_state(static_cast<std::uint8_t>(state))) {
        return false;
    }
    queued_agent_state_ = {state, transition_id, true};
    return true;
}

void LinkController::note_tx_drop() {
    increment_saturated(status_.queue_drops);
}

void LinkController::set_parser_diagnostics(
    const LinkParserDiagnostics& diagnostics) {
    status_.framing_errors = diagnostics.framing_errors;
    if (std::numeric_limits<std::uint32_t>::max() - status_.framing_errors <
        diagnostics.inter_byte_timeouts) {
        status_.framing_errors = std::numeric_limits<std::uint32_t>::max();
    } else {
        status_.framing_errors += diagnostics.inter_byte_timeouts;
    }
    status_.crc_errors = diagnostics.crc_errors;
    status_.version_errors = diagnostics.version_errors;
    status_.length_errors = diagnostics.length_errors;
}

}  // namespace deskmate::easyinput
