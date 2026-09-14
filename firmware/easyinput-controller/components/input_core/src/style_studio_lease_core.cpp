#include "style_studio_lease_core.h"

#include <algorithm>
#include <array>

namespace deskmate::easyinput {
namespace {

constexpr std::array<std::uint8_t, 4> kMagic = {'D', 'M', 'S', 'L'};

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

std::uint16_t crc16_ccitt(const std::uint8_t* data, std::size_t length) {
    std::uint16_t crc = 0xffff;
    for (std::size_t index = 0; index < length; ++index) {
        crc ^= static_cast<std::uint16_t>(data[index]) << 8u;
        for (unsigned bit = 0; bit < 8; ++bit) {
            crc = static_cast<std::uint16_t>(
                (crc & 0x8000u) != 0 ? (crc << 1u) ^ 0x1021u
                                     : crc << 1u);
        }
    }
    return crc;
}

bool all_zero(const std::uint8_t* begin, const std::uint8_t* end) {
    return std::all_of(begin, end,
                       [](std::uint8_t value) { return value == 0; });
}

}  // namespace

bool normalize_style_studio_lease_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    StyleStudioLeaseFeatureReportView& out) {
    out = {};
    if (buffer == nullptr || length == 0) return false;
    if (buffer[0] == kStyleStudioLeaseReportId && length == 64) {
        if (report_id != 0 && report_id != kStyleStudioLeaseReportId) {
            return false;
        }
        out = {buffer + 1, kStyleStudioLeasePayloadBytes};
        return true;
    }
    if (report_id != kStyleStudioLeaseReportId ||
        length != kStyleStudioLeasePayloadBytes) {
        return false;
    }
    out = {buffer, kStyleStudioLeasePayloadBytes};
    return true;
}

bool StyleStudioLeaseCore::accept(const std::uint8_t* payload,
                                  std::size_t length,
                                  std::uint32_t usb_epoch,
                                  std::uint32_t now_ms) {
    if (payload == nullptr || length != kStyleStudioLeasePayloadBytes ||
        !std::equal(kMagic.begin(), kMagic.end(), payload) ||
        payload[4] != kStyleStudioLeaseVersion ||
        (payload[5] != 1 && payload[5] != 2) || payload[6] != 1 ||
        payload[7] != 0 || usb_epoch == 0 ||
        !all_zero(payload + 18, payload + length) ||
        read_u16(payload + 16) != crc16_ccitt(payload, 16)) {
        return false;
    }
    const std::uint32_t token = read_u32(payload + 8);
    const std::uint32_t ttl_ms = read_u32(payload + 12);
    if (token == 0) return false;
    if (payload[5] == 1) {
        if (ttl_ms < kStyleStudioLeaseMinTtlMs ||
            ttl_ms > kStyleStudioLeaseMaxTtlMs) {
            return false;
        }
        token_ = token;
        usb_epoch_ = usb_epoch;
        acquired_at_ms_ = now_ms;
        ttl_ms_ = ttl_ms;
        valid_ = true;
        return true;
    }
    if (ttl_ms != 0 || !valid_ || token != token_ ||
        usb_epoch != usb_epoch_) {
        return false;
    }
    clear();
    return true;
}

bool StyleStudioLeaseCore::active(std::uint32_t usb_epoch,
                                  std::uint32_t now_ms) const {
    return valid_ && usb_epoch != 0 && usb_epoch == usb_epoch_ &&
           static_cast<std::uint32_t>(now_ms - acquired_at_ms_) < ttl_ms_;
}

void StyleStudioLeaseCore::clear_for_usb_epoch(std::uint32_t usb_epoch) {
    if (valid_ && usb_epoch != usb_epoch_) clear();
}

void StyleStudioLeaseCore::clear() {
    token_ = 0;
    usb_epoch_ = 0;
    acquired_at_ms_ = 0;
    ttl_ms_ = 0;
    valid_ = false;
}

}  // namespace deskmate::easyinput
