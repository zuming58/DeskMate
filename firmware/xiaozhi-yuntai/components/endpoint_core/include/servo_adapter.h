#pragma once

#include <cstdint>

namespace deskmate::xiaozhi {

enum class ServoAxis : std::uint8_t {
    kYaw = 0,
    kPitch = 1,
};

enum class ServoAdapterOperation : std::uint8_t {
    kProvisionalCenter,
    kRelativeStep,
    kRecenter,
};

struct ServoAdapterCommand {
    ServoAdapterOperation operation{ServoAdapterOperation::kProvisionalCenter};
    ServoAxis axis{ServoAxis::kYaw};
    std::int16_t value_tenths_degree{};
};

struct ServoBoardEvidence {
    static constexpr int kYawGpio = 11;
    static constexpr int kPitchGpio = 12;
    static constexpr std::uint16_t kFrequencyHz = 50;
    static constexpr bool kReferenceBoardMapDocumented = true;
    static constexpr bool kInstalledMappingVerified = false;
    static constexpr bool kInstallationAllowed = false;
};

class ServoAdapter {
public:
    virtual ~ServoAdapter() = default;
    virtual bool IsAvailable() const noexcept = 0;
    virtual bool Apply(const ServoAdapterCommand& command) noexcept = 0;
    virtual void DisableOutputs() noexcept = 0;
};

class DisabledServoAdapter final : public ServoAdapter {
public:
    bool IsAvailable() const noexcept override;
    bool Apply(const ServoAdapterCommand& command) noexcept override;
    void DisableOutputs() noexcept override;
};

}  // namespace deskmate::xiaozhi
