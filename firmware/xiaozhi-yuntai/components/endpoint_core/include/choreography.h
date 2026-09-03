#pragma once

#include "motion_preset.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace deskmate::xiaozhi {

inline constexpr std::size_t kChoreographyMaximumBeats = 8;

enum class ChoreographyYaw : std::uint8_t {
    kHold = 0,
    kLeft = 1,
    kCenter = 2,
    kRight = 3,
};

enum class ChoreographyPitch : std::uint8_t {
    kHold = 0,
    kUp = 1,
    kCenter = 2,
    kDown = 3,
};

enum class ChoreographyExpression : std::uint8_t {
    kHold = 0,
    kCompleted = 1,
    kThinking = 2,
    kWorking = 3,
};

enum class ChoreographyIntensity : std::uint8_t {
    kGentle = 1,
    kStandard = 2,
    kVivid = 3,
};

enum class ChoreographyTempo : std::uint8_t {
    kRelaxed = 1,
    kStandard = 2,
    kQuick = 3,
};

struct ChoreographyBeat {
    ChoreographyYaw yaw{ChoreographyYaw::kHold};
    ChoreographyPitch pitch{ChoreographyPitch::kHold};
    ChoreographyExpression expression{ChoreographyExpression::kHold};
};

struct ChoreographyCommand {
    std::uint32_t session_id{};
    std::uint32_t action_id{};
    MotionPresetSource source{MotionPresetSource::kNone};
    std::uint8_t beat_count{};
    std::uint16_t beat_ms{};
    std::uint8_t repeat_count{};
    ChoreographyIntensity intensity{ChoreographyIntensity::kStandard};
    ChoreographyTempo tempo{ChoreographyTempo::kStandard};
    std::array<ChoreographyBeat, kChoreographyMaximumBeats> beats{};
};

struct ChoreographySnapshot {
    std::uint32_t session_id{};
    std::uint32_t action_id{};
    std::uint32_t completed_choreography_count{};
    MotionPresetResult result{MotionPresetResult::kNotReady};
    MotionPresetState state{MotionPresetState::kNotReady};
    std::uint8_t beat_count{};
    std::uint8_t current_beat{0xff};
    std::uint8_t repeat_count{};
    std::uint8_t completed_repeats{};
    MotionPresetSource source{MotionPresetSource::kNone};
    ChoreographyIntensity intensity{ChoreographyIntensity::kStandard};
    ChoreographyTempo tempo{ChoreographyTempo::kStandard};
    bool adapter_available{};
    bool logical_center_accepted{};
    bool emergency_stop_latched{};
    bool faulted{};
    bool servo_output_enabled{};
    bool operation_terminal{};
    bool display_lease_active{};
};

}  // namespace deskmate::xiaozhi
