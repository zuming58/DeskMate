#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::easyinput {

inline constexpr std::array<std::uint8_t, 4> kDeskMateLinkMagic = {
    'D', 'M', 'L', 'K'};
inline constexpr std::uint8_t kDeskMateLinkVersion = 1;
inline constexpr std::size_t kDeskMateLinkHeaderBytes = 14;
inline constexpr std::size_t kDeskMateLinkMaxPayloadBytes = 128;
inline constexpr std::size_t kDeskMateLinkMaxFrameBytes = 144;
inline constexpr std::uint32_t kDeskMateLinkInterByteTimeoutMs = 100;
inline constexpr std::uint32_t kDeskMateLinkRequestTimeoutMs = 250;
inline constexpr std::uint8_t kDeskMateLinkMaxAttempts = 3;
inline constexpr std::uint32_t kDeskMateLinkHelloIntervalMs = 1000;
inline constexpr std::uint32_t kDeskMateLinkStatusIntervalMs = 2000;

enum class LinkFrameFlag : std::uint8_t {
    Request = 0x01,
    Response = 0x02,
    Error = 0x04,
};

enum class LinkMessageType : std::uint8_t {
    Hello = 0x01,
    GetCapabilities = 0x02,
    GetStatus = 0x03,
    SetAgentState = 0x04,
    ManualCalibrationCommand = 0x20,
    GetManualCalibrationStatus = 0x21,
};

enum class LinkErrorCode : std::uint8_t {
    None = 0,
    UnknownType = 1,
    BadPayload = 2,
    NotReady = 3,
    Busy = 4,
    SequenceConflict = 5,
    Internal = 6,
};

enum class LinkAgentState : std::uint8_t {
    Idle = 0,
    Listening = 1,
    Thinking = 2,
    Working = 3,
    Waiting = 4,
    Completed = 5,
    Error = 6,
};

enum class LinkControllerState : std::uint8_t {
    Disabled = 0,
    Waiting = 1,
    Connected = 2,
    Faulted = 3,
};

inline constexpr std::uint32_t kLinkCapabilityCore = 1u << 0;
inline constexpr std::uint32_t kLinkCapabilityAgentState = 1u << 1;
inline constexpr std::uint32_t kLinkCapabilityDisplay = 1u << 2;
inline constexpr std::uint32_t kLinkCapabilityMotion = 1u << 3;
inline constexpr std::uint32_t kLinkCapabilityAudio = 1u << 4;
inline constexpr std::uint32_t kLinkT08RequiredCapabilities =
    kLinkCapabilityCore | kLinkCapabilityAgentState;
inline constexpr std::uint32_t kLinkT08DeferredCapabilities =
    kLinkCapabilityDisplay | kLinkCapabilityMotion | kLinkCapabilityAudio;
inline constexpr std::uint32_t kLinkT09RequiredCapabilities =
    kLinkCapabilityCore | kLinkCapabilityAgentState | kLinkCapabilityDisplay;
inline constexpr std::uint32_t kLinkT09ForbiddenCapabilities =
    kLinkCapabilityMotion | kLinkCapabilityAudio;
inline constexpr std::uint8_t kLinkT08AllowedStatusFlags =
    (1u << 0) | (1u << 7);
inline constexpr std::uint8_t kLinkT09AllowedStatusFlags =
    kLinkT08AllowedStatusFlags | (1u << 1);

struct LinkFrame {
    std::uint8_t version{kDeskMateLinkVersion};
    LinkFrameFlag flag{LinkFrameFlag::Request};
    std::uint8_t type{};
    std::uint8_t reserved{};
    std::uint32_t sequence{};
    std::uint16_t payload_length{};
    std::array<std::uint8_t, kDeskMateLinkMaxPayloadBytes> payload{};
};

struct LinkWireFrame {
    std::array<std::uint8_t, kDeskMateLinkMaxFrameBytes> bytes{};
    std::uint16_t length{};
};

struct LinkParserDiagnostics {
    std::uint32_t accepted_frames{};
    std::uint32_t framing_errors{};
    std::uint32_t crc_errors{};
    std::uint32_t version_errors{};
    std::uint32_t length_errors{};
    std::uint32_t inter_byte_timeouts{};
};

struct LinkStatusSnapshot {
    LinkControllerState state{LinkControllerState::Disabled};
    LinkAgentState agent_state{LinkAgentState::Idle};
    std::uint8_t status_flags{};
    LinkErrorCode last_error{LinkErrorCode::None};
    std::uint32_t implemented_capabilities{};
    std::uint32_t enabled_capabilities{};
    std::uint32_t rx_frames{};
    std::uint32_t tx_frames{};
    std::uint32_t framing_errors{};
    std::uint32_t crc_errors{};
    std::uint32_t version_errors{};
    std::uint32_t length_errors{};
    std::uint32_t request_timeouts{};
    std::uint32_t retries{};
    std::uint32_t queue_drops{};
    std::uint32_t peer_restarts{};
    std::uint32_t unexpected_frames{};
    std::uint32_t semantic_errors{};
    std::uint32_t controller_boot_id{};
    std::uint32_t peer_boot_id{};
};

enum class ManualCalibrationLinkTerminalKind : std::uint8_t {
    Response = 0,
    LinkError = 1,
    Timeout = 2,
    Disconnected = 3,
    InvalidResponse = 4,
    Internal = 5,
};

struct ManualCalibrationLinkRequest {
    std::uint32_t host_request_id{};
    std::uint8_t message_type{};
    std::uint8_t payload_length{};
    std::array<std::uint8_t, 19> payload{};
};

struct ManualCalibrationLinkResult {
    std::uint32_t host_request_id{};
    std::uint32_t link_sequence{};
    std::uint32_t controller_boot_id{};
    std::uint32_t peer_boot_id{};
    std::uint8_t message_type{};
    std::uint8_t terminal_flag{};
    LinkErrorCode link_error{LinkErrorCode::None};
    ManualCalibrationLinkTerminalKind terminal{
        ManualCalibrationLinkTerminalKind::Internal};
    std::uint8_t payload_length{};
    std::array<std::uint8_t, 19> payload{};
};

std::uint16_t deskmate_link_crc16(const std::uint8_t* data,
                                  std::size_t length);
bool encode_deskmate_link_frame(const LinkFrame& frame, LinkWireFrame& wire);
const char* link_controller_state_name(LinkControllerState state);

class LinkStreamParser {
 public:
    bool push(std::uint8_t byte, std::uint32_t now_ms, LinkFrame& frame);
    void expire(std::uint32_t now_ms);
    void reset();
    const LinkParserDiagnostics& diagnostics() const { return diagnostics_; }

 private:
    void discard_prefix(std::size_t count);
    std::size_t find_magic() const;
    std::size_t magic_suffix_length() const;

    std::array<std::uint8_t, kDeskMateLinkMaxFrameBytes> buffer_{};
    std::size_t size_{};
    std::uint32_t last_byte_ms_{};
    bool has_last_byte_{};
    LinkParserDiagnostics diagnostics_{};
};

class LinkController {
 public:
    void start(std::uint32_t controller_boot_id, std::uint32_t now_ms);
    void fault();
    bool poll(std::uint32_t now_ms, LinkWireFrame& outgoing);
    void receive(const LinkFrame& incoming, std::uint32_t now_ms);
    bool queue_agent_state(LinkAgentState state, std::uint32_t transition_id);
    bool queue_manual_calibration(
        const ManualCalibrationLinkRequest& request);
    bool take_manual_calibration_result(ManualCalibrationLinkResult& result);
    void note_tx_drop();
    void set_parser_diagnostics(const LinkParserDiagnostics& diagnostics);
    LinkStatusSnapshot snapshot() const { return status_; }

 private:
    struct PendingRequest {
        LinkFrame frame{};
        std::uint8_t attempts{};
        std::uint32_t sent_at_ms{};
        bool active{};
        bool needs_send{};
        bool manual_calibration{};
        std::uint32_t host_request_id{};
    };

    struct QueuedAgentState {
        LinkAgentState state{LinkAgentState::Idle};
        std::uint32_t transition_id{};
        bool pending{};
    };

    struct QueuedManualCalibration {
        ManualCalibrationLinkRequest request{};
        bool pending{};
    };

    bool begin_request(LinkMessageType type, const std::uint8_t* payload,
                       std::uint16_t length, bool manual_calibration = false,
                       std::uint32_t host_request_id = 0);
    bool emit_pending(std::uint32_t now_ms, LinkWireFrame& outgoing);
    void complete_success();
    void complete_failure(std::uint32_t now_ms);
    void disconnect(std::uint32_t now_ms);
    bool handle_response(const LinkFrame& incoming, std::uint32_t now_ms);
    bool valid_manual_response(const LinkFrame& incoming) const;
    void finish_manual(ManualCalibrationLinkTerminalKind terminal,
                       std::uint8_t terminal_flag = 0,
                       LinkErrorCode link_error = LinkErrorCode::None,
                       const std::uint8_t* payload = nullptr,
                       std::uint8_t payload_length = 0);
    void cancel_manual(ManualCalibrationLinkTerminalKind terminal);
    std::uint32_t next_sequence();

    LinkStatusSnapshot status_{};
    PendingRequest pending_{};
    QueuedAgentState queued_agent_state_{};
    QueuedManualCalibration queued_manual_calibration_{};
    ManualCalibrationLinkResult manual_calibration_result_{};
    bool manual_calibration_result_pending_{};
    std::uint32_t controller_boot_id_{};
    std::uint32_t peer_boot_id_{};
    std::uint32_t sequence_{};
    std::uint32_t next_hello_ms_{};
    std::uint32_t next_capabilities_ms_{};
    std::uint32_t next_status_ms_{};
    std::uint8_t consecutive_failures_{};
    bool capabilities_known_{};
};

}  // namespace deskmate::easyinput
