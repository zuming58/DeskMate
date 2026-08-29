#include "endpoint_model.h"

#include "esp_log.h"

namespace {

constexpr const char* kTag = "deskmate_xiaozhi";

}  // namespace

extern "C" void app_main() {
    const auto& capabilities = deskmate::xiaozhi::GetEndpointCapabilities();
    const auto& status = deskmate::xiaozhi::GetEndpointStatus();

    ESP_LOGI(kTag,
             "Phase A scaffold: contract=%s runtime=%s transport=%s display=%s motion=%s",
             deskmate::xiaozhi::ToString(status.contract),
             deskmate::xiaozhi::ToString(status.runtime),
             deskmate::xiaozhi::ToString(capabilities.link_transport),
             deskmate::xiaozhi::ToString(capabilities.display),
             deskmate::xiaozhi::ToString(capabilities.motion));
    ESP_LOGI(kTag,
             "Initialization flags: link=%d display=%d motion=%d microphone=%d amplifier=%d speaker=%d",
             status.transport_configured,
             status.display_initialized,
             status.motion_initialized,
             status.microphone_initialized,
             status.amplifier_initialized,
             status.speaker_initialized);
}
