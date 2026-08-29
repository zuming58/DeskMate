#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>

namespace deskmate::easyinput {

inline constexpr uint8_t kAppCommandReportId = 0x11;
inline constexpr uint8_t kFixedTextCommandKind = 0x01;
inline constexpr uint8_t kHostActionCommandKind = 0x05;
inline constexpr size_t kAppCommandPayloadBytes = 63;
inline constexpr size_t kAppCommandHeaderBytes = 4;
inline constexpr size_t kAppCommandChunkBytes = 59;
inline constexpr size_t kFixedTextMaxUtf8Bytes = 960;
inline constexpr size_t kHostActionUuidBytes = 36;

enum class HostCommandKind : uint8_t { None, FixedText, HostAction };

bool is_canonical_host_action_uuid(std::string_view value);
bool is_valid_fixed_text(std::string_view value);

class HostCommandStream {
public:
    bool start(HostCommandKind kind, std::string_view value, uint32_t epoch);
    bool encode_next(std::array<uint8_t, kAppCommandPayloadBytes>& out) const;
    bool mark_sent();
    void abort();
    bool pending() const { return pending_; }
    uint32_t epoch() const { return epoch_; }
    uint8_t next_chunk() const { return next_chunk_; }
    uint8_t total_chunks() const { return total_chunks_; }

private:
    std::string value_;
    HostCommandKind kind_{HostCommandKind::None};
    uint32_t epoch_{0};
    uint8_t next_chunk_{0};
    uint8_t total_chunks_{0};
    bool pending_{false};
};

}  // namespace deskmate::easyinput
