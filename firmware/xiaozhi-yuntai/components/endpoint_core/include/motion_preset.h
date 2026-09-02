#pragma once

#include <cstdint>

namespace deskmate::xiaozhi {

enum class MotionPresetOperation : std::uint8_t {
    kNone = 0,
    kRun = 1,
    kStopAndCenter = 2,
    kEmergencyStop = 3,
    kClearEmergencyStopAndCenter = 4,
};

enum class MotionPreset : std::uint8_t {
    kNone = 0,
    kAttention = 1,
    kNod = 2,
    kSearch = 3,
    kDance = 4,
};

enum class MotionPresetSource : std::uint8_t {
    kNone = 0,
    kUi = 1,
    kExplicitVoice = 2,
    kContext = 3,
    kIdle = 4,
};

enum class MotionPresetResult : std::uint8_t {
    kAccepted = 0,
    kDuplicate = 1,
    kCompleted = 2,
    kCancelled = 3,
    kNotReady = 4,
    kBadPayload = 5,
    kWrongSession = 6,
    kStaleAction = 7,
    kBusy = 8,
    kRecenterRequired = 9,
    kEmergencyStopped = 10,
    kFaulted = 11,
    kAdapterUnavailable = 12,
    kAdapterFailure = 13,
    kSequenceConflict = 14,
};

enum class MotionPresetState : std::uint8_t {
    kNotReady = 0,
    kRecentering = 1,
    kReady = 2,
    kRunning = 3,
    kEmergencyStopped = 4,
    kFaulted = 5,
};

struct MotionPresetCommand {
    std::uint32_t session_id{};
    std::uint32_t action_id{};
    MotionPresetOperation operation{MotionPresetOperation::kNone};
    MotionPreset preset{MotionPreset::kNone};
    std::uint8_t repeat_count{};
    MotionPresetSource source{MotionPresetSource::kNone};
};

struct MotionPresetSnapshot {
    std::uint32_t session_id{};
    std::uint32_t action_id{};
    std::uint32_t completed_preset_count{};
    MotionPresetResult result{MotionPresetResult::kNotReady};
    MotionPresetState state{MotionPresetState::kNotReady};
    MotionPresetOperation operation{MotionPresetOperation::kNone};
    MotionPreset preset{MotionPreset::kNone};
    std::uint8_t repeat_count{};
    std::uint8_t completed_repeats{};
    MotionPresetSource source{MotionPresetSource::kNone};
    bool adapter_available{};
    bool logical_center_accepted{};
    bool emergency_stop_latched{};
    bool faulted{};
    bool servo_output_enabled{};
    bool operation_terminal{};
};

}  // namespace deskmate::xiaozhi
