#pragma once

#include "deskmate_link_core.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::uint8_t kManualCalibrationRequestReportId = 0x16;
inline constexpr std::uint8_t kManualCalibrationStatusReportId = 0x17;
inline constexpr std::size_t kManualCalibrationHostPayloadBytes = 63;
inline constexpr std::size_t kManualCalibrationCommandPayloadBytes = 19;
inline constexpr std::size_t kManualCalibrationStatusPayloadBytes = 18;
inline constexpr std::uint8_t kManualCalibrationHostVersion = 1;

enum class ManualCalibrationHostRequestKind : std::uint8_t {
    Command = 1,
    Status = 2,
};

enum class ManualCalibrationHostStage : std::uint8_t {
    Accepted = 1,
    Terminal = 2,
};

enum class ManualCalibrationTransportResult : std::uint8_t {
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

struct ManualCalibrationFeatureReportView {
    const std::uint8_t* payload{};
    std::size_t length{};
};

struct ManualCalibrationHostRequest {
    ManualCalibrationHostRequestKind kind{
        ManualCalibrationHostRequestKind::Status};
    std::uint8_t flags{};
    std::uint32_t request_id{};
    std::uint32_t confirmation_id{};
    std::uint8_t message_type{};
    std::uint8_t payload_length{};
    std::array<std::uint8_t, kManualCalibrationCommandPayloadBytes> payload{};
};

struct ManualCalibrationHostResponse {
    ManualCalibrationHostStage stage{ManualCalibrationHostStage::Terminal};
    ManualCalibrationHostRequestKind kind{
        ManualCalibrationHostRequestKind::Status};
    ManualCalibrationTransportResult transport{
        ManualCalibrationTransportResult::Internal};
    std::uint32_t request_id{};
    std::uint32_t confirmation_id{};
    std::uint32_t link_sequence{};
    std::uint8_t message_type{};
    std::uint8_t terminal_flag{};
    LinkErrorCode link_error{LinkErrorCode::None};
    std::uint8_t endpoint_payload_length{};
    std::array<std::uint8_t, kManualCalibrationCommandPayloadBytes>
        endpoint_payload{};
    std::uint32_t accepted_count{};
    std::uint32_t terminal_count{};
    std::uint32_t controller_boot_id{};
    std::uint32_t peer_boot_id{};
};

bool normalize_manual_calibration_feature_report(
    std::uint8_t report_id, const std::uint8_t* buffer, std::size_t length,
    ManualCalibrationFeatureReportView& out);
bool decode_manual_calibration_host_request(
    const std::uint8_t* payload, std::size_t length,
    ManualCalibrationHostRequest& out);
bool encode_manual_calibration_host_response(
    const ManualCalibrationHostResponse& response,
    std::array<std::uint8_t, kManualCalibrationHostPayloadBytes>& out);
bool manual_calibration_host_requests_equal(
    const ManualCalibrationHostRequest& left,
    const ManualCalibrationHostRequest& right);

struct ManualCalibrationBridgeDiagnostics {
    std::uint32_t accepted{};
    std::uint32_t terminal{};
    std::uint32_t malformed{};
    std::uint32_t duplicates{};
    std::uint32_t busy{};
    std::uint32_t stale{};
    std::uint32_t conflicts{};
    std::uint32_t lifecycle_clears{};
    std::uint32_t response_drops{};
};

class ManualCalibrationBridge {
 public:
    bool accept(const std::uint8_t* payload, std::size_t length,
                std::uint32_t usb_epoch, const LinkStatusSnapshot& link,
                ManualCalibrationLinkRequest& dispatch);
    void note_forward_result(bool accepted, const LinkStatusSnapshot& link);
    void complete(const ManualCalibrationLinkResult& result,
                  const LinkStatusSnapshot& link);
    void poll_lifecycle(std::uint32_t usb_epoch,
                        const LinkStatusSnapshot& link);
    void clear_for_usb_epoch(std::uint32_t usb_epoch);
    bool front_response(
        std::array<std::uint8_t, kManualCalibrationHostPayloadBytes>& out) const;
    bool mark_response_sent();
    const ManualCalibrationBridgeDiagnostics& diagnostics() const {
        return diagnostics_;
    }

 private:
    static bool link_ready(const LinkStatusSnapshot& link);
    void queue_response(const ManualCalibrationHostResponse& response);
    void queue_accepted(const LinkStatusSnapshot& link);
    void queue_terminal(ManualCalibrationTransportResult result,
                        const LinkStatusSnapshot& link,
                        const ManualCalibrationLinkResult* terminal = nullptr);
    void queue_immediate_terminal(
        const ManualCalibrationHostRequest& request,
        ManualCalibrationTransportResult result,
        const LinkStatusSnapshot& link);
    void finish_pending();

    static constexpr std::size_t kResponseQueueCapacity = 4;
    std::array<ManualCalibrationHostResponse, kResponseQueueCapacity>
        responses_{};
    std::size_t response_head_{};
    std::size_t response_size_{};
    ManualCalibrationHostRequest pending_request_{};
    ManualCalibrationHostRequest completed_request_{};
    ManualCalibrationHostResponse completed_response_{};
    bool pending_{};
    bool completed_valid_{};
    std::uint32_t usb_epoch_{};
    std::uint32_t max_request_id_{};
    std::uint32_t pending_peer_restarts_{};
    std::uint32_t accepted_count_{};
    std::uint32_t terminal_count_{};
    ManualCalibrationBridgeDiagnostics diagnostics_{};
};

}  // namespace deskmate::easyinput
