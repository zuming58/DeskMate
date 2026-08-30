#include "link_protocol.h"

#include <algorithm>
#include <limits>

namespace deskmate::xiaozhi {
namespace {

void IncrementSaturated(std::uint32_t& value) noexcept {
    if (value != std::numeric_limits<std::uint32_t>::max()) {
        ++value;
    }
}

bool IsValidFlag(LinkFrameFlag flag) noexcept {
    return flag == LinkFrameFlag::kRequest ||
           flag == LinkFrameFlag::kResponse ||
           flag == LinkFrameFlag::kError;
}

bool IsValidError(LinkErrorCode error) noexcept {
    return error >= LinkErrorCode::kUnknownType &&
           error <= LinkErrorCode::kInternal;
}

}  // namespace

std::uint16_t ReadLe16(const std::uint8_t* data) noexcept {
    return static_cast<std::uint16_t>(data[0]) |
           (static_cast<std::uint16_t>(data[1]) << 8u);
}

std::uint32_t ReadLe32(const std::uint8_t* data) noexcept {
    return static_cast<std::uint32_t>(data[0]) |
           (static_cast<std::uint32_t>(data[1]) << 8u) |
           (static_cast<std::uint32_t>(data[2]) << 16u) |
           (static_cast<std::uint32_t>(data[3]) << 24u);
}

void WriteLe16(std::uint8_t* data, std::uint16_t value) noexcept {
    data[0] = static_cast<std::uint8_t>(value);
    data[1] = static_cast<std::uint8_t>(value >> 8u);
}

void WriteLe32(std::uint8_t* data, std::uint32_t value) noexcept {
    for (unsigned index = 0; index < 4; ++index) {
        data[index] = static_cast<std::uint8_t>(value >> (index * 8u));
    }
}

std::uint16_t LinkCrc16CcittFalse(const std::uint8_t* data,
                                  std::size_t length) noexcept {
    std::uint16_t crc = 0xffffu;
    if (data == nullptr && length != 0) {
        return crc;
    }
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

bool EncodeLinkFrame(const LinkFrame& frame, LinkWireFrame& wire) noexcept {
    wire = {};
    if (frame.version != kLinkVersion || !IsValidFlag(frame.flag) ||
        frame.reserved != 0 || frame.sequence == 0 ||
        frame.payload_length > kLinkMaxPayloadBytes) {
        return false;
    }

    std::copy(kLinkMagic.begin(), kLinkMagic.end(), wire.bytes.begin());
    wire.bytes[4] = frame.version;
    wire.bytes[5] = static_cast<std::uint8_t>(frame.flag);
    wire.bytes[6] = frame.type;
    wire.bytes[7] = 0;
    WriteLe32(wire.bytes.data() + 8, frame.sequence);
    WriteLe16(wire.bytes.data() + 12, frame.payload_length);
    std::copy_n(frame.payload.begin(), frame.payload_length,
                wire.bytes.begin() + kLinkHeaderBytes);
    const auto crc = LinkCrc16CcittFalse(wire.bytes.data() + 4,
                                         10u + frame.payload_length);
    WriteLe16(wire.bytes.data() + kLinkHeaderBytes + frame.payload_length, crc);
    wire.length = static_cast<std::uint16_t>(kLinkHeaderBytes +
                                             frame.payload_length + 2u);
    return true;
}

bool EncodeLinkError(std::uint8_t type, std::uint32_t sequence,
                     LinkErrorCode error, LinkWireFrame& wire) noexcept {
    if (!IsValidError(error)) {
        wire = {};
        return false;
    }
    LinkFrame frame{};
    frame.flag = LinkFrameFlag::kError;
    frame.type = type;
    frame.sequence = sequence;
    frame.payload_length = 1;
    frame.payload[0] = static_cast<std::uint8_t>(error);
    return EncodeLinkFrame(frame, wire);
}

void LinkStreamParser::DiscardPrefix(std::size_t count) noexcept {
    count = std::min(count, size_);
    if (count == 0) {
        return;
    }
    std::move(buffer_.begin() + count, buffer_.begin() + size_, buffer_.begin());
    size_ -= count;
}

std::size_t LinkStreamParser::FindMagic() const noexcept {
    if (size_ < kLinkMagic.size()) {
        return size_;
    }
    for (std::size_t offset = 0;
         offset + kLinkMagic.size() <= size_; ++offset) {
        if (std::equal(kLinkMagic.begin(), kLinkMagic.end(),
                       buffer_.begin() + offset)) {
            return offset;
        }
    }
    return size_;
}

std::size_t LinkStreamParser::MagicSuffixLength() const noexcept {
    const auto maximum = std::min(size_, kLinkMagic.size() - 1u);
    for (std::size_t count = maximum; count > 0; --count) {
        if (std::equal(buffer_.begin() + size_ - count, buffer_.begin() + size_,
                       kLinkMagic.begin())) {
            return count;
        }
    }
    return 0;
}

bool LinkStreamParser::Push(std::uint8_t byte, std::uint32_t now_ms,
                            LinkFrame& frame) noexcept {
    if (has_last_byte_ && size_ != 0 &&
        static_cast<std::uint32_t>(now_ms - last_byte_ms_) >=
            kLinkInterByteTimeoutMs) {
        size_ = 0;
        IncrementSaturated(diagnostics_.inter_byte_timeouts);
    }
    has_last_byte_ = true;
    last_byte_ms_ = now_ms;

    if (size_ == buffer_.size()) {
        size_ = 0;
        IncrementSaturated(diagnostics_.transport_overflows);
    }
    buffer_[size_++] = byte;

    for (;;) {
        if (size_ < kLinkMagic.size()) {
            return false;
        }
        const auto magic = FindMagic();
        if (magic == size_) {
            const auto suffix = MagicSuffixLength();
            if (size_ > suffix) {
                DiscardPrefix(size_ - suffix);
                IncrementSaturated(diagnostics_.framing_errors);
            }
            return false;
        }
        if (magic != 0) {
            DiscardPrefix(magic);
            IncrementSaturated(diagnostics_.framing_errors);
        }
        if (size_ < kLinkHeaderBytes) {
            return false;
        }

        const auto payload_length = ReadLe16(buffer_.data() + 12);
        if (payload_length > kLinkMaxPayloadBytes) {
            DiscardPrefix(1);
            IncrementSaturated(diagnostics_.length_errors);
            continue;
        }
        const auto frame_length = kLinkHeaderBytes + payload_length + 2u;
        if (size_ < frame_length) {
            return false;
        }

        const auto expected_crc =
            ReadLe16(buffer_.data() + kLinkHeaderBytes + payload_length);
        const auto actual_crc = LinkCrc16CcittFalse(buffer_.data() + 4,
                                                    10u + payload_length);
        if (expected_crc != actual_crc) {
            DiscardPrefix(1);
            IncrementSaturated(diagnostics_.crc_errors);
            continue;
        }
        if (buffer_[4] != kLinkVersion) {
            DiscardPrefix(frame_length);
            IncrementSaturated(diagnostics_.version_errors);
            continue;
        }
        const auto flag = static_cast<LinkFrameFlag>(buffer_[5]);
        if (!IsValidFlag(flag)) {
            DiscardPrefix(frame_length);
            IncrementSaturated(diagnostics_.flags_errors);
            continue;
        }
        if (buffer_[7] != 0) {
            DiscardPrefix(frame_length);
            IncrementSaturated(diagnostics_.reserved_errors);
            continue;
        }
        const auto sequence = ReadLe32(buffer_.data() + 8);
        if (sequence == 0) {
            DiscardPrefix(frame_length);
            IncrementSaturated(diagnostics_.sequence_errors);
            continue;
        }

        frame = {};
        frame.version = buffer_[4];
        frame.flag = flag;
        frame.type = buffer_[6];
        frame.sequence = sequence;
        frame.payload_length = payload_length;
        std::copy_n(buffer_.begin() + kLinkHeaderBytes, payload_length,
                    frame.payload.begin());
        DiscardPrefix(frame_length);
        IncrementSaturated(diagnostics_.accepted_frames);
        return true;
    }
}

void LinkStreamParser::Expire(std::uint32_t now_ms) noexcept {
    if (size_ != 0 && has_last_byte_ &&
        static_cast<std::uint32_t>(now_ms - last_byte_ms_) >=
            kLinkInterByteTimeoutMs) {
        size_ = 0;
        IncrementSaturated(diagnostics_.inter_byte_timeouts);
    }
}

void LinkStreamParser::NoteTransportOverflow() noexcept {
    size_ = 0;
    has_last_byte_ = false;
    IncrementSaturated(diagnostics_.transport_overflows);
}

void LinkStreamParser::Reset() noexcept {
    size_ = 0;
    last_byte_ms_ = 0;
    has_last_byte_ = false;
}

}  // namespace deskmate::xiaozhi
