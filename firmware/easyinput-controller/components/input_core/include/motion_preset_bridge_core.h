#pragma once

#include "deskmate_link_core.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::uint8_t kMotionPresetRequestReportId = 0x18;
inline constexpr std::uint8_t kMotionPresetStatusReportId = 0x19;
inline constexpr std::size_t kMotionPresetHostPayloadBytes = 63;
inline constexpr std::size_t kMotionPresetCommandPayloadBytes = 16;
inline constexpr std::size_t kMotionPresetStatusPayloadBytes = 20;
inline constexpr std::uint8_t kMotionPresetHostVersion = 1;

enum class MotionPresetHostRequestKind : std::uint8_t {
    Command = 1,
    Status = 2,
};

enum class MotionPresetHostStage : std::uint8_t {
    Accepted = 1,
    EndpointAcknowledgement = 2,
};

enum class MotionPresetTransportResult : std::uint8_t {
    Completed = 0,
    Malformed = 1,
    Busy = 2,
    StaleRequest = 3,
    RequestConflict = 4,
    LinkNotReady = 5,
    LinkQueueBusy = 6,
    Timeout = 7,
    LinkError = 8,
    PeerDisconnected = 9,
    InvalidLinkResponse = 10,
    Internal = 11,
};

struct MotionPresetFeatureReportView {
    const std::uint8_t* payload{};
    std::size_t length{};
};

struct MotionPresetHostRequest {
    MotionPresetHostRequestKind kind{MotionPresetHostRequestKind::Status};
    std::uint8_t source{};
    std::uint8_t operation{};
    std::uint32_t request_id{};
    std::uint8_t preset{};
    std::uint8_t repeat_count{};
    std::uint8_t message_type{};
};

struct MotionPresetHostResponse {
    MotionPresetHostStage stage{
        MotionPresetHostStage::EndpointAcknowledgement};
    MotionPresetHostRequestKind kind{MotionPresetHostRequestKind::Status};
    MotionPresetTransportResult transport{MotionPresetTransportResult::Internal};
    std::uint32_t request_id{};
    std::uint32_t link_sequence{};
    std::uint8_t message_type{};
    std::uint8_t terminal_flag{};
    LinkErrorCode link_error{LinkErrorCode::None};
    std::uint8_t endpoint_payload_length{};
    std::array<std::uint8_t, kMotionPresetStatusPayloadBytes> endpoint_payload{};
    std::uint32_t accepted_count{};
    std::uint32_t terminal_count{};
    std::uint32_t controller_boot_id{};
    std::uint32_t peer_boot_id{};
    std::uint8_t source{};
    std::uint8_t operation{};
    std::uint8_t preset{};
    std::uint8_t repeat_count{};
};

bool normalize_motion_preset_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    MotionPresetFeatureReportView& out);
bool decode_motion_preset_host_request(const std::uint8_t* payload,
                                       std::size_t length,
                                       MotionPresetHostRequest& out);
bool encode_motion_preset_host_response(
    const MotionPresetHostResponse& response,
    std::array<std::uint8_t, kMotionPresetHostPayloadBytes>& out);
bool motion_preset_host_requests_equal(const MotionPresetHostRequest& left,
                                       const MotionPresetHostRequest& right);

struct MotionPresetBridgeDiagnostics {
    std::uint32_t accepted{};
    std::uint32_t endpoint_acknowledgements{};
    std::uint32_t malformed{};
    std::uint32_t duplicates{};
    std::uint32_t busy{};
    std::uint32_t stale{};
    std::uint32_t conflicts{};
    std::uint32_t lifecycle_clears{};
    std::uint32_t response_drops{};
};

class MotionPresetBridge {
 public:
    bool accept(const std::uint8_t* payload, std::size_t length,
                std::uint32_t usb_epoch, const LinkStatusSnapshot& link,
                MotionPresetLinkRequest& dispatch);
    void note_forward_result(bool accepted, const LinkStatusSnapshot& link);
    void complete(const MotionPresetLinkResult& result,
                  const LinkStatusSnapshot& link);
    void poll_lifecycle(std::uint32_t usb_epoch,
                        const LinkStatusSnapshot& link);
    void clear_for_usb_epoch(std::uint32_t usb_epoch);
    bool front_response(
        std::array<std::uint8_t, kMotionPresetHostPayloadBytes>& out) const;
    bool mark_response_sent();
    const MotionPresetBridgeDiagnostics& diagnostics() const {
        return diagnostics_;
    }

 private:
    static bool link_ready(const LinkStatusSnapshot& link);
    void queue_response(const MotionPresetHostResponse& response);
    void queue_accepted(const LinkStatusSnapshot& link);
    void queue_endpoint_acknowledgement(
        MotionPresetTransportResult result, const LinkStatusSnapshot& link,
        const MotionPresetLinkResult* terminal = nullptr,
        bool cache_result = true);
    void queue_immediate_endpoint_acknowledgement(
        const MotionPresetHostRequest& request,
        MotionPresetTransportResult result, const LinkStatusSnapshot& link);
    void finish_pending();

    static constexpr std::size_t kResponseQueueCapacity = 4;
    std::array<MotionPresetHostResponse, kResponseQueueCapacity> responses_{};
    std::size_t response_head_{};
    std::size_t response_size_{};
    MotionPresetHostRequest pending_request_{};
    MotionPresetHostRequest completed_request_{};
    MotionPresetHostResponse completed_response_{};
    bool pending_{};
    bool completed_valid_{};
    std::uint32_t usb_epoch_{};
    std::uint32_t max_request_id_{};
    std::uint32_t pending_peer_restarts_{};
    std::uint32_t accepted_count_{};
    std::uint32_t endpoint_acknowledgement_count_{};
    MotionPresetBridgeDiagnostics diagnostics_{};
};

}  // namespace deskmate::easyinput
