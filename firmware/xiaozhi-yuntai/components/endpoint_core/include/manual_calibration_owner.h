#pragma once

#include "choreography.h"
#include "display_owner.h"
#include "motion_preset.h"
#include "motion_safety_core.h"
#include "servo_adapter.h"

#include <array>
#include <cstdint>

namespace deskmate::xiaozhi {

inline constexpr std::uint8_t kManualCalibrationNoAxis = 0xff;
inline constexpr std::uint8_t kManualCalibrationRequiredSafetyFlags = 0x0f;
inline constexpr std::int16_t kManualCalibrationMaximumStepTenthsDegree = 10;
inline constexpr std::uint16_t kManualCalibrationMinimumArmTtlMs = 1000;
inline constexpr std::uint16_t kManualCalibrationMaximumArmTtlMs = 5000;

enum class ManualCalibrationOperation : std::uint8_t {
    kArm = 0,
    kSelectAxis = 1,
    kProvisionalCenter = 2,
    kRelativeStep = 3,
    kRecenter = 4,
    kEmergencyStop = 5,
    kClearEmergencyStop = 6,
};

enum class ManualCalibrationResult : std::uint8_t {
    kAccepted = 0,
    kDuplicate = 1,
    kNotReady = 2,
    kBadPayload = 3,
    kWrongSession = 4,
    kStaleAction = 5,
    kArmRequired = 6,
    kArmExpired = 7,
    kWrongAxis = 8,
    kStepOutOfRange = 9,
    kCenterRequired = 10,
    kEmergencyStopped = 11,
    kFaulted = 12,
    kAdapterUnavailable = 13,
    kAdapterFailure = 14,
    kSequenceConflict = 15,
    kSafetyNotConfirmed = 16,
};

enum class ManualCalibrationState : std::uint8_t {
    kLocked = 0,
    kAxisSelected = 1,
    kArmed = 2,
    kCenterProvisional = 3,
    kEmergencyStopped = 4,
    kFaulted = 5,
};

struct ManualCalibrationCommand {
    std::uint32_t session_id{};
    std::uint32_t action_id{};
    std::uint32_t arm_nonce{};
    ManualCalibrationOperation operation{ManualCalibrationOperation::kArm};
    std::uint8_t axis{kManualCalibrationNoAxis};
    std::int8_t step_direction{};
    std::uint16_t arm_ttl_ms{};
    std::uint8_t safety_flags{};
};

struct ManualCalibrationSnapshot {
    std::uint32_t session_id{};
    std::uint32_t last_action_id{};
    std::uint32_t output_count{};
    ManualCalibrationState state{ManualCalibrationState::kLocked};
    std::uint8_t selected_axis{kManualCalibrationNoAxis};
    bool armed{};
    bool center_provisional{};
    bool recenter_required{true};
    bool emergency_stop_latched{};
    bool faulted{};
    bool adapter_available{};
    ManualCalibrationResult last_error{ManualCalibrationResult::kAccepted};
};

class MotionCoordinator {
public:
    explicit MotionCoordinator(ServoAdapter& adapter,
                               DisplayOwner* display_owner = nullptr) noexcept;

    void StartSession(std::uint32_t session_id) noexcept;
    void OnLinkDisconnected() noexcept;
    void Tick(std::uint32_t now_ms) noexcept;
    ManualCalibrationResult Execute(const ManualCalibrationCommand& command,
                                    std::uint32_t now_ms) noexcept;
    MotionResult SubmitNormalMotion(const MotionIntent& intent,
                                    std::uint64_t now_ms) noexcept;
    MotionPresetResult ExecuteMotionPreset(
        const MotionPresetCommand& command, std::uint32_t now_ms) noexcept;
    MotionPresetResult ExecuteChoreography(
        const ChoreographyCommand& command, std::uint32_t now_ms) noexcept;
    bool RuntimeMotionAvailable() const noexcept;
    bool RuntimeMotionReady() const noexcept;
    ManualCalibrationSnapshot snapshot() const noexcept;
    MotionPresetSnapshot motion_preset_snapshot() const noexcept;
    ChoreographySnapshot choreography_snapshot() const noexcept;

private:
    enum class RuntimeAction : std::uint8_t {
        kNone,
        kRun,
        kRecenter,
        kChoreography,
    };

    struct PresetActionRecord {
        MotionPresetCommand command{};
        bool valid{};
    };

    struct ChoreographyActionRecord {
        ChoreographyCommand command{};
        bool valid{};
    };

    static bool IsValidAxis(std::uint8_t axis) noexcept;
    static bool SameCommand(const ManualCalibrationCommand& left,
                            const ManualCalibrationCommand& right) noexcept;
    static bool SamePresetCommand(const MotionPresetCommand& left,
                                  const MotionPresetCommand& right) noexcept;
    static bool SameChoreographyCommand(
        const ChoreographyCommand& left,
        const ChoreographyCommand& right) noexcept;
    ManualCalibrationResult CheckAction(
        const ManualCalibrationCommand& command) const noexcept;
    MotionPresetResult CheckPresetAction(
        const MotionPresetCommand& command) const noexcept;
    MotionPresetResult CheckChoreographyAction(
        const ChoreographyCommand& command) const noexcept;
    void RecordAction(const ManualCalibrationCommand& command) noexcept;
    void RecordPresetAction(const MotionPresetCommand& command) noexcept;
    void RecordChoreographyAction(
        const ChoreographyCommand& command) noexcept;
    void ConsumeArm() noexcept;
    void RefreshState() noexcept;
    void RefreshPresetState() noexcept;
    bool ConfigureNormalMotion() noexcept;
    void ResetNormalMotion() noexcept;
    void ResetPresetSession() noexcept;
    void CancelRuntimeForManual() noexcept;
    void BeginRuntimeRecenter(const MotionPresetCommand& command,
                              std::uint32_t now_ms) noexcept;
    void BeginRuntimePreset(const MotionPresetCommand& command,
                            std::uint32_t now_ms) noexcept;
    bool BeginRuntimeChoreography(const ChoreographyCommand& command,
                                  std::uint32_t now_ms) noexcept;
    void AdvanceRuntimeAction(std::uint32_t now_ms) noexcept;
    void CompleteRuntimeAction() noexcept;
    void CancelChoreography(MotionPresetResult result) noexcept;
    void RefreshChoreographyState() noexcept;
    void LatchRuntimeFault(MotionPresetResult result) noexcept;
    ServoAdapterResult ApplyRuntimeTarget(
        const MotionTarget& target) noexcept;
    MotionPresetResult RejectPreset(MotionPresetResult result) noexcept;
    ManualCalibrationResult Reject(ManualCalibrationResult result) noexcept;
    ManualCalibrationResult ApplyOutput(
        const ManualCalibrationCommand& command,
        ServoAdapterOperation operation) noexcept;

    ServoAdapter& adapter_;
    DisplayOwner* display_owner_{};
    MotionSafetyCore normal_motion_{};
    ManualCalibrationCommand last_command_{};
    std::uint32_t session_id_{};
    std::uint32_t last_action_id_{};
    std::uint32_t output_count_{};
    std::uint32_t arm_nonce_{};
    std::uint32_t arm_expires_at_ms_{};
    std::uint8_t selected_axis_{kManualCalibrationNoAxis};
    std::array<bool, 2> center_provisional_{};
    ManualCalibrationState state_{ManualCalibrationState::kLocked};
    ManualCalibrationResult last_error_{ManualCalibrationResult::kAccepted};
    bool armed_{};
    bool recenter_required_{true};
    bool emergency_stop_latched_{};
    bool faulted_{};

    static constexpr std::size_t kPresetActionHistorySize = 8;
    std::array<PresetActionRecord, kPresetActionHistorySize>
        preset_action_history_{};
    std::size_t preset_action_history_cursor_{};
    MotionPresetResult preset_result_{MotionPresetResult::kNotReady};
    MotionPresetState preset_state_{MotionPresetState::kNotReady};
    MotionPresetOperation preset_operation_{MotionPresetOperation::kNone};
    MotionPreset active_or_last_preset_{MotionPreset::kNone};
    MotionPresetSource preset_source_{MotionPresetSource::kNone};
    RuntimeAction runtime_action_{RuntimeAction::kNone};
    MotionTarget runtime_target_{};
    MotionTarget runtime_last_applied_target_{};
    std::array<bool, 2> runtime_axis_initialized_{};
    std::uint32_t preset_action_id_{};
    std::uint32_t last_normal_preset_action_id_{};
    std::uint32_t completed_preset_count_{};
    std::uint32_t preset_watchdog_deadline_ms_{};
    std::uint32_t next_runtime_tick_ms_{};
    std::uint32_t waypoint_hold_deadline_ms_{};
    std::uint32_t normal_motion_sequence_{};
    std::uint8_t requested_repeats_{};
    std::uint8_t completed_repeats_{};
    std::uint8_t waypoint_index_{};
    bool normal_motion_configured_{};
    bool runtime_target_submitted_{};
    bool waypoint_arrived_{};
    bool runtime_centered_{};
    bool runtime_servo_output_enabled_{};
    bool preset_operation_terminal_{};

    static constexpr std::size_t kChoreographyActionHistorySize = 8;
    std::array<ChoreographyActionRecord, kChoreographyActionHistorySize>
        choreography_action_history_{};
    std::size_t choreography_action_history_cursor_{};
    ChoreographyCommand choreography_command_{};
    MotionTarget choreography_target_{};
    MotionPresetResult choreography_result_{MotionPresetResult::kNotReady};
    MotionPresetState choreography_state_{MotionPresetState::kNotReady};
    std::uint32_t last_choreography_action_id_{};
    std::uint32_t completed_choreography_count_{};
    std::uint8_t choreography_beat_index_{};
    std::uint8_t choreography_completed_repeats_{};
    bool choreography_returning_center_{};
    bool choreography_operation_terminal_{};
    bool choreography_display_lease_active_{};
};

using ManualCalibrationOwner = MotionCoordinator;

}  // namespace deskmate::xiaozhi
