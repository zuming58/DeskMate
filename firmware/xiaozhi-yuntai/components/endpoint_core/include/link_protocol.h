#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::xiaozhi {

inline constexpr std::array<std::uint8_t, 4> kLinkMagic = {'D', 'M', 'L', 'K'};
inline constexpr std::uint8_t kLinkVersion = 0x01;
inline constexpr std::size_t kLinkHeaderBytes = 14;
inline constexpr std::size_t kLinkMaxPayloadBytes = 128;
inline constexpr std::size_t kLinkMaxFrameBytes = 144;
inline constexpr std::uint32_t kLinkInterByteTimeoutMs = 100;

enum class LinkFrameFlag : std::uint8_t {
    kRequest = 0x01,
    kResponse = 0x02,
    kError = 0x04,
};

enum class LinkMessageType : std::uint8_t {
    kHello = 0x01,
    kGetCapabilities = 0x02,
    kGetStatus = 0x03,
    kSetAgentState = 0x04,
    kManualCalibrationCommand = 0x20,
    kGetManualCalibrationStatus = 0x21,
    kRunMotionPreset = 0x22,
    kGetMotionStatus = 0x23,
};

enum class LinkErrorCode : std::uint8_t {
    kNone = 0,
    kUnknownType = 1,
    kBadPayload = 2,
    kNotReady = 3,
    kBusy = 4,
    kSequenceConflict = 5,
    kInternal = 6,
};

enum class AgentState : std::uint8_t {
    kIdle = 0,
    kListening = 1,
    kThinking = 2,
    kWorking = 3,
    kWaiting = 4,
    kCompleted = 5,
    kError = 6,
};

struct LinkFrame {
    std::uint8_t version{kLinkVersion};
    LinkFrameFlag flag{LinkFrameFlag::kRequest};
    std::uint8_t type{};
    std::uint8_t reserved{};
    std::uint32_t sequence{};
    std::uint16_t payload_length{};
    std::array<std::uint8_t, kLinkMaxPayloadBytes> payload{};
};

struct LinkWireFrame {
    std::array<std::uint8_t, kLinkMaxFrameBytes> bytes{};
    std::uint16_t length{};
};

struct LinkParserDiagnostics {
    std::uint32_t accepted_frames{};
    std::uint32_t framing_errors{};
    std::uint32_t version_errors{};
    std::uint32_t flags_errors{};
    std::uint32_t reserved_errors{};
    std::uint32_t sequence_errors{};
    std::uint32_t length_errors{};
    std::uint32_t crc_errors{};
    std::uint32_t inter_byte_timeouts{};
    std::uint32_t transport_overflows{};
};

std::uint16_t LinkCrc16CcittFalse(const std::uint8_t* data,
                                  std::size_t length) noexcept;
bool EncodeLinkFrame(const LinkFrame& frame, LinkWireFrame& wire) noexcept;
bool EncodeLinkError(std::uint8_t type, std::uint32_t sequence,
                     LinkErrorCode error, LinkWireFrame& wire) noexcept;
std::uint16_t ReadLe16(const std::uint8_t* data) noexcept;
std::uint32_t ReadLe32(const std::uint8_t* data) noexcept;
void WriteLe16(std::uint8_t* data, std::uint16_t value) noexcept;
void WriteLe32(std::uint8_t* data, std::uint32_t value) noexcept;

class LinkStreamParser {
public:
    bool Push(std::uint8_t byte, std::uint32_t now_ms, LinkFrame& frame) noexcept;
    void Expire(std::uint32_t now_ms) noexcept;
    void NoteTransportOverflow() noexcept;
    void Reset() noexcept;
    const LinkParserDiagnostics& diagnostics() const noexcept {
        return diagnostics_;
    }

private:
    void DiscardPrefix(std::size_t count) noexcept;
    std::size_t FindMagic() const noexcept;
    std::size_t MagicSuffixLength() const noexcept;

    std::array<std::uint8_t, kLinkMaxFrameBytes> buffer_{};
    std::size_t size_{};
    std::uint32_t last_byte_ms_{};
    bool has_last_byte_{};
    LinkParserDiagnostics diagnostics_{};
};

}  // namespace deskmate::xiaozhi
