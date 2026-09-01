#pragma once

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

class ManualCalibrationOwner {
public:
    explicit ManualCalibrationOwner(ServoAdapter& adapter) noexcept;

    void StartSession(std::uint32_t session_id) noexcept;
    void OnLinkDisconnected() noexcept;
    void Tick(std::uint32_t now_ms) noexcept;
    ManualCalibrationResult Execute(const ManualCalibrationCommand& command,
                                    std::uint32_t now_ms) noexcept;
    MotionResult SubmitNormalMotion(const MotionIntent& intent,
                                    std::uint64_t now_ms) noexcept;
    ManualCalibrationSnapshot snapshot() const noexcept;

private:
    static bool IsValidAxis(std::uint8_t axis) noexcept;
    static bool SameCommand(const ManualCalibrationCommand& left,
                            const ManualCalibrationCommand& right) noexcept;
    ManualCalibrationResult CheckAction(
        const ManualCalibrationCommand& command) const noexcept;
    void RecordAction(const ManualCalibrationCommand& command) noexcept;
    void ConsumeArm() noexcept;
    void RefreshState() noexcept;
    ManualCalibrationResult Reject(ManualCalibrationResult result) noexcept;
    ManualCalibrationResult ApplyOutput(
        const ManualCalibrationCommand& command,
        ServoAdapterOperation operation) noexcept;

    ServoAdapter& adapter_;
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
};

}  // namespace deskmate::xiaozhi
