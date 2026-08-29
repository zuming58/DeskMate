#include "host_action_core.h"

#include <algorithm>

namespace deskmate::easyinput {
namespace {
bool is_uuid_hyphen(size_t index) {
    return index == 8 || index == 13 || index == 18 || index == 23;
}

bool is_lower_hex(char value) {
    return (value >= '0' && value <= '9') ||
           (value >= 'a' && value <= 'f');
}
}  // namespace

bool is_canonical_host_action_uuid(std::string_view value) {
    if (value.size() != kHostActionUuidBytes) return false;
    for (size_t index = 0; index < value.size(); ++index) {
        if (is_uuid_hyphen(index)) {
            if (value[index] != '-') return false;
        } else if (!is_lower_hex(value[index])) {
            return false;
        }
    }
    return true;
}

bool is_valid_fixed_text(std::string_view value) {
    if (value.empty() || value.size() > kFixedTextMaxUtf8Bytes) return false;
    size_t index = 0;
    while (index < value.size()) {
        const uint8_t first = static_cast<uint8_t>(value[index]);
        if (first <= 0x7f) {
            if (first == 0 ||
                (first < 0x20 && first != '\t' && first != '\n' &&
                 first != '\r') ||
                first == 0x7f) return false;
            ++index;
            continue;
        }
        const size_t count = first >= 0xc2 && first <= 0xdf ? 2
            : first >= 0xe0 && first <= 0xef ? 3
            : first >= 0xf0 && first <= 0xf4 ? 4 : 0;
        if (count == 0 || index + count > value.size()) return false;
        const uint8_t second = static_cast<uint8_t>(value[index + 1]);
        if ((first == 0xe0 && second < 0xa0) ||
            (first == 0xed && second > 0x9f) ||
            (first == 0xf0 && second < 0x90) ||
            (first == 0xf4 && second > 0x8f)) return false;
        for (size_t offset = 1; offset < count; ++offset) {
            if ((static_cast<uint8_t>(value[index + offset]) & 0xc0) != 0x80)
                return false;
        }
        index += count;
    }
    return true;
}

bool HostCommandStream::start(HostCommandKind kind, std::string_view value,
                              uint32_t epoch) {
    if (pending_ || epoch == 0 || kind == HostCommandKind::None ||
        (kind == HostCommandKind::FixedText && !is_valid_fixed_text(value)) ||
        (kind == HostCommandKind::HostAction &&
         !is_canonical_host_action_uuid(value))) return false;
    value_.assign(value);
    kind_ = kind;
    epoch_ = epoch;
    next_chunk_ = 0;
    total_chunks_ = kind == HostCommandKind::HostAction
        ? 1
        : static_cast<uint8_t>((value_.size() + kAppCommandChunkBytes - 1) /
                               kAppCommandChunkBytes);
    pending_ = total_chunks_ != 0;
    return pending_;
}

bool HostCommandStream::encode_next(
    std::array<uint8_t, kAppCommandPayloadBytes>& out) const {
    if (!pending_ || next_chunk_ >= total_chunks_) return false;
    out.fill(0);
    out[0] = kind_ == HostCommandKind::FixedText
        ? kFixedTextCommandKind : kHostActionCommandKind;
    out[1] = next_chunk_;
    out[2] = total_chunks_;
    const size_t offset = static_cast<size_t>(next_chunk_) *
                          kAppCommandChunkBytes;
    const size_t count = std::min(kAppCommandChunkBytes,
                                  value_.size() - offset);
    out[3] = static_cast<uint8_t>(count);
    std::copy_n(reinterpret_cast<const uint8_t*>(value_.data()) + offset,
                count, out.begin() + kAppCommandHeaderBytes);
    return true;
}

bool HostCommandStream::mark_sent() {
    if (!pending_) return false;
    ++next_chunk_;
    if (next_chunk_ < total_chunks_) return false;
    abort();
    return true;
}

void HostCommandStream::abort() {
    value_.clear();
    kind_ = HostCommandKind::None;
    epoch_ = 0;
    next_chunk_ = 0;
    total_chunks_ = 0;
    pending_ = false;
}

}  // namespace deskmate::easyinput
