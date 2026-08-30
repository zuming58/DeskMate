#pragma once

#include <array>
#include <cstdint>

namespace deskmate::xiaozhi {

enum class MotionAxis : std::uint8_t {
    kHorizontal,
    kVertical,
};

enum class MotionSource : std::uint8_t {
    kIdleAnimation = 0,
    kFaceTracking = 1,
    kDialogueAction = 2,
    kRecovery = 3,
};

enum class MotionIntentKind : std::uint8_t {
    kTarget,
    kRecenter,
};

enum class MotionRuntimeState : std::uint8_t {
    kCalibrationRequired,
    kRecenterRequired,
    kReady,
    kMoving,
    kHolding,
    kEmergencyStopped,
    kFaulted,
};

enum class MotionResult : std::uint8_t {
    kAccepted,
    kReplaced,
    kDuplicate,
    kCalibrationRequired,
    kRecenterRequired,
    kEmergencyStopped,
    kFaulted,
    kInvalidCalibration,
    kInvalidIntent,
    kWrongSession,
    kStaleSequence,
    kExpired,
};

struct AxisCalibration {
    std::int16_t minimum_units{0};
    std::int16_t center_units{0};
    std::int16_t maximum_units{0};
    std::uint16_t maximum_step_units{0};
    bool center_verified{false};
    bool direction_verified{false};
    bool limits_verified{false};
};

struct MotionCalibration {
    bool power_path_verified{false};
    bool common_ground_verified{false};
    AxisCalibration horizontal{};
    AxisCalibration vertical{};
};

struct MotionTarget {
    std::int16_t horizontal_units{0};
    std::int16_t vertical_units{0};
};

struct MotionIntent {
    MotionIntentKind kind{MotionIntentKind::kTarget};
    MotionSource source{MotionSource::kIdleAnimation};
    std::uint32_t session_epoch{0};
    std::uint32_t sequence{0};
    MotionTarget target{};
    std::uint64_t expires_at_ms{0};
};

struct MotionStep {
    bool emit{false};
    MotionTarget target{};
    MotionSource source{MotionSource::kIdleAnimation};
    std::uint32_t sequence{0};
};

struct MotionDiagnostics {
    std::uint32_t accepted{0};
    std::uint32_t replaced{0};
    std::uint32_t duplicates{0};
    std::uint32_t rejected{0};
    std::uint32_t expired{0};
    std::uint32_t emergency_stops{0};
    std::uint32_t faults{0};
    std::uint32_t session_resets{0};
};

struct MotionSnapshot {
    MotionRuntimeState state{MotionRuntimeState::kCalibrationRequired};
    bool calibration_ready{false};
    bool recenter_required{true};
    bool emergency_stop_latched{false};
    std::uint32_t session_epoch{0};
    MotionTarget current{};
    std::uint8_t pending_sources{0};
    MotionDiagnostics diagnostics{};
};

class MotionSafetyCore {
public:
    MotionResult Configure(const MotionCalibration& calibration) noexcept;
    void ResetSession(std::uint32_t session_epoch) noexcept;
    MotionResult Submit(const MotionIntent& intent,
                        std::uint64_t now_ms) noexcept;
    MotionStep Tick(std::uint64_t now_ms) noexcept;

    void EmergencyStop() noexcept;
    MotionResult ClearEmergencyStop(std::uint32_t session_epoch) noexcept;
    void LatchFault() noexcept;
    MotionSnapshot snapshot() const noexcept;

private:
    static constexpr std::size_t kSourceCount = 4;

    struct Slot {
        bool occupied{false};
        bool output_started{false};
        MotionIntent intent{};
    };

    static bool CalibrationIsValid(
        const MotionCalibration& calibration) noexcept;
    static std::size_t SourceIndex(MotionSource source) noexcept;
    static bool SourceIsValid(MotionSource source) noexcept;
    static int Priority(MotionSource source) noexcept;
    bool TargetIsWithinLimits(const MotionTarget& target) const noexcept;
    void ClearPending() noexcept;
    void ExpireSlots(std::uint64_t now_ms) noexcept;
    Slot* SelectHighestPriority() noexcept;
    std::uint8_t CountPending() const noexcept;
    static std::int16_t StepAxis(std::int16_t current,
                                 std::int16_t target,
                                 std::uint16_t maximum_step) noexcept;

    MotionCalibration calibration_{};
    bool calibration_ready_{false};
    bool recenter_required_{true};
    bool emergency_stop_latched_{false};
    bool faulted_{false};
    std::uint32_t session_epoch_{0};
    std::uint32_t last_sequence_{0};
    MotionTarget current_{};
    std::array<Slot, kSourceCount> slots_{};
    MotionDiagnostics diagnostics_{};
    MotionRuntimeState state_{MotionRuntimeState::kCalibrationRequired};
};

}  // namespace deskmate::xiaozhi
