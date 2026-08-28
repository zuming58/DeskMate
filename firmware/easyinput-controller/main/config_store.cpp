#include "config_store.h"
#include "nvs.h"
#include "nvs_flash.h"
#include <cstring>
#include <algorithm>
namespace deskmate::easyinput {
namespace {
constexpr char kNamespace[]="deskmate";
constexpr char kLegacyNamespace[]="ai_keyboard";
constexpr char kLegacyKey[]="config_v2";
const char* slot_key(ConfigSlot s){return s==ConfigSlot::A?"cfg_a":"cfg_b";}
void reset_document(ConfigDocument& document){document.bytes.fill(0);document.length=0;document.crc16=0;document.source=ConfigSource::Default;}
void reset_record(ConfigSlotRecord& record){record.bytes.fill(0);record.magic=kConfigRecordMagic;record.version=kConfigRecordVersion;record.length=0;record.generation=0;record.crc16=0;}
void reset_load_result(ConfigLoadResult& result){reset_document(result.document);result.slot=ConfigSlot::Invalid;result.generation=0;result.recovered_marker=false;}
}
esp_err_t ConfigNvsStore::begin(){
  esp_err_t err=nvs_flash_init();
  if(err!=ESP_OK){ writable_=false; storage_failed_=true; return ESP_OK; }
  nvs_handle_t h=0; err=nvs_open(kNamespace,NVS_READWRITE,&h);
  if(err==ESP_OK){handle_=reinterpret_cast<void*>(h); writable_=true;}
  else { writable_=false; storage_failed_=true; }
  return ESP_OK;
}
bool ConfigNvsStore::read_slot(ConfigSlot s,ConfigSlotRecord&r){if(!handle_||s==ConfigSlot::Invalid)return false;size_t n=sizeof(r);auto e=nvs_get_blob(reinterpret_cast<nvs_handle_t>(handle_),slot_key(s),&r,&n);return e==ESP_OK&&n==sizeof(r);}
bool ConfigNvsStore::write_slot(ConfigSlot s,const ConfigSlotRecord&r){if(!handle_||s==ConfigSlot::Invalid)return false;return nvs_set_blob(reinterpret_cast<nvs_handle_t>(handle_),slot_key(s),&r,sizeof(r))==ESP_OK;}
bool ConfigNvsStore::commit(){return handle_&&nvs_commit(reinterpret_cast<nvs_handle_t>(handle_))==ESP_OK;}
bool ConfigNvsStore::write_marker(ConfigSlot s){if(!handle_)return false;marker_=s;const uint8_t v=static_cast<uint8_t>(s);return nvs_set_u8(reinterpret_cast<nvs_handle_t>(handle_),"cfg_active",v)==ESP_OK;}
const ConfigLoadResult& ConfigNvsStore::load(){
  reset_load_result(loaded_);
  reset_record(slot_a_);
  reset_record(slot_b_);
  legacy_buffer_.fill(0);
  ConfigSlot marker=ConfigSlot::Invalid; uint8_t m=0; bool marker_present=false;
  if(handle_&&nvs_get_u8(reinterpret_cast<nvs_handle_t>(handle_),"cfg_active",&m)==ESP_OK){marker_present=true;if(m<=1)marker=static_cast<ConfigSlot>(m);}
  const bool have_a=read_slot(ConfigSlot::A,slot_a_), have_b=read_slot(ConfigSlot::B,slot_b_);
  select_config_record(have_a?&slot_a_:nullptr,have_b?&slot_b_:nullptr,marker,loaded_);
  if(loaded_.slot!=ConfigSlot::Invalid)return loaded_;
  // Legacy import is deliberately read-only and remains available even when
  // the new namespace cannot be opened or its slots are corrupt.
  nvs_handle_t h=0; bool legacy_present=false;
  if(nvs_open(kLegacyNamespace,NVS_READONLY,&h)==ESP_OK){
    size_t n=0;
    if(nvs_get_str(h,kLegacyKey,nullptr,&n)==ESP_OK){legacy_present=true;}
    if(legacy_present&&n>1&&n<=kConfigMaxJsonBytes+1){
      if(nvs_get_str(h,kLegacyKey,legacy_buffer_.data(),&n)==ESP_OK){ConfigProjection p{}; if(parse_config_projection({legacy_buffer_.data(),n-1},p)){loaded_.document.length=static_cast<uint16_t>(n-1);std::copy_n(reinterpret_cast<uint8_t*>(legacy_buffer_.data()),n-1,loaded_.document.bytes.begin());loaded_.document.crc16=config_crc16_ccitt(loaded_.document.bytes.data(),loaded_.document.length);loaded_.document.source=ConfigSource::Legacy;nvs_close(h);return loaded_;}}
    }
    nvs_close(h);
  }
  const char* safe=compiled_safe_config_json(); loaded_.document.length=static_cast<uint16_t>(std::strlen(safe)); std::copy_n(reinterpret_cast<const uint8_t*>(safe),loaded_.document.length,loaded_.document.bytes.begin()); loaded_.document.crc16=config_crc16_ccitt(loaded_.document.bytes.data(),loaded_.document.length); loaded_.document.source=(storage_failed_||have_a||have_b||marker_present||legacy_present)?ConfigSource::Recovery:ConfigSource::Default; return loaded_;
}
ConfigSaveStatus ConfigNvsStore::save(const ConfigDocument&d,ConfigSlot a,uint32_t g){if(!writable_)return ConfigSaveStatus::WriteFailed;return save_config_transaction(*this,d,a,g,transaction_workspace_);}
}
