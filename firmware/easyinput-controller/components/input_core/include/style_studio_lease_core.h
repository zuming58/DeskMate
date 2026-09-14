#pragma once

#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::uint8_t kStyleStudioLeaseReportId = 0x1c;
inline constexpr std::size_t kStyleStudioLeasePayloadBytes = 63;
inline constexpr std::uint8_t kStyleStudioLeaseVersion = 1;
inline constexpr std::uint32_t kStyleStudioLeaseMinTtlMs = 1000;
inline constexpr std::uint32_t kStyleStudioLeaseMaxTtlMs = 5000;
inline constexpr char kStyleStudioConfirmHostActionId[] =
    "4c82a3a0-ff30-49a8-a76f-1bb3dcdbcd01";

struct StyleStudioLeaseFeatureReportView {
    const std::uint8_t* payload{};
    std::size_t length{};
};

bool normalize_style_studio_lease_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    StyleStudioLeaseFeatureReportView& out);

class StyleStudioLeaseCore {
 public:
    bool accept(const std::uint8_t* payload, std::size_t length,
                std::uint32_t usb_epoch, std::uint32_t now_ms);
    bool active(std::uint32_t usb_epoch, std::uint32_t now_ms) const;
    void clear_for_usb_epoch(std::uint32_t usb_epoch);
    std::uint32_t token() const { return token_; }

 private:
    void clear();

    std::uint32_t token_{};
    std::uint32_t usb_epoch_{};
    std::uint32_t acquired_at_ms_{};
    std::uint32_t ttl_ms_{};
    bool valid_{};
};

}  // namespace deskmate::easyinput
