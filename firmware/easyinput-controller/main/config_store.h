#pragma once
#include "config_core.h"
#include "esp_err.h"
#include <array>
namespace deskmate::easyinput {
class ConfigNvsStore final : public ConfigStorageBackend {
 public:
  esp_err_t begin();
  const ConfigLoadResult& load();
  ConfigSaveStatus save(const ConfigDocument& document, ConfigSlot active, uint32_t generation);
  bool write_slot(ConfigSlot, const ConfigSlotRecord&) override;
  bool commit() override;
  bool read_slot(ConfigSlot, ConfigSlotRecord&) override;
  bool write_marker(ConfigSlot) override;
 private:
   void* handle_{nullptr};
   ConfigSlot marker_{ConfigSlot::Invalid};
   bool writable_{false};
   bool storage_failed_{false};
   // Keep the bounded NVS snapshots out of the ESP-IDF main-task stack.
   ConfigSlotRecord slot_a_{};
   ConfigSlotRecord slot_b_{};
   ConfigLoadResult loaded_{};
   ConfigTransactionWorkspace transaction_workspace_{};
   std::array<char, kConfigMaxJsonBytes + 1> legacy_buffer_{};
};
}
