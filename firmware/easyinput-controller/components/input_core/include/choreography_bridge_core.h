#pragma once

#include "deskmate_link_core.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::uint8_t kChoreographyRequestReportId = 0x1a;
inline constexpr std::uint8_t kChoreographyStatusReportId = 0x1b;
inline constexpr std::size_t kChoreographyHostPayloadBytes = 63;
inline constexpr std::size_t kChoreographyCommandPayloadBytes = 40;
inline constexpr std::size_t kChoreographyStatusPayloadBytes = 24;

struct ChoreographyFeatureReportView {
    const std::uint8_t* payload{};
    std::size_t length{};
};

bool normalize_choreography_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    ChoreographyFeatureReportView& out);

class ChoreographyBridge {
 public:
    bool accept(const std::uint8_t* payload, std::size_t length,
                std::uint32_t usb_epoch, const LinkStatusSnapshot& link,
                ChoreographyLinkRequest& dispatch);
    void note_forward_result(bool accepted, const LinkStatusSnapshot& link);
    void complete(const ChoreographyLinkResult& result,
                  const LinkStatusSnapshot& link);
    void poll_lifecycle(std::uint32_t usb_epoch,
                        const LinkStatusSnapshot& link);
    void clear_for_usb_epoch(std::uint32_t usb_epoch);
    bool front_response(
        std::array<std::uint8_t, kChoreographyHostPayloadBytes>& out) const;
    bool mark_response_sent();

 private:
    struct Request {
        std::uint8_t version{};
        std::uint8_t kind{};
        std::uint32_t request_id{};
        std::uint8_t source{};
        std::uint8_t beat_count{};
        std::uint8_t beat_code{};
        std::uint8_t repeat_count{};
        std::uint8_t yaw_amplitude_degrees{};
        std::uint8_t pitch_amplitude_degrees{};
        std::uint8_t yaw_speed_degrees_per_second{};
        std::uint8_t pitch_speed_degrees_per_second{};
        std::array<std::uint8_t, 24> beats{};
    };
    struct Response {
        Request request{};
        std::uint8_t stage{};
        std::uint8_t transport{};
        std::uint32_t link_sequence{};
        std::uint8_t terminal_flag{};
        LinkErrorCode link_error{LinkErrorCode::None};
        std::uint8_t endpoint_length{};
        std::array<std::uint8_t, 24> endpoint{};
        std::uint32_t controller_boot_id{};
        std::uint32_t peer_boot_id{};
    };

    static bool link_ready(const LinkStatusSnapshot& link);
    static bool decode(const std::uint8_t* payload, std::size_t length,
                       Request& out);
    bool encode(const Response& response,
                std::array<std::uint8_t, kChoreographyHostPayloadBytes>& out)
        const;
    void queue(const Response& response);
    void finish(std::uint8_t transport, const LinkStatusSnapshot& link,
                const ChoreographyLinkResult* terminal = nullptr);

    static constexpr std::size_t kResponseCapacity = 4;
    std::array<Response, kResponseCapacity> responses_{};
    std::size_t response_head_{};
    std::size_t response_size_{};
    Request pending_request_{};
    bool pending_{};
    std::uint32_t usb_epoch_{};
    std::uint32_t peer_boot_id_{};
};

}  // namespace deskmate::easyinput
