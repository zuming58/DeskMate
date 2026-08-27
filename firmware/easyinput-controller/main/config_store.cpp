#include "config_store.h"
#include "nvs.h"
#include "nvs_flash.h"
#include <cstring>
#include <algorithm>
namespace deskmate::easyinput {
namespace { constexpr char kNamespace[]="deskmate"; constexpr char kLegacyNamespace[]="ai_keyboard"; constexpr char kLegacyKey[]="config_v2"; const char* slot_key(ConfigSlot s){return s==ConfigSlot::A?"cfg_a":"cfg_b";} }
esp_err_t ConfigNvsStore::begin(){
  esp_err_t err=nvs_flash_init(); if(err!=ESP_OK){ writable_=false; return ESP_OK; } nvs_handle_t h=0; err=nvs_open(kNamespace,NVS_READWRITE,&h); if(err==ESP_OK){handle_=reinterpret_cast<void*>(h); writable_=true;} return ESP_OK;
}
bool ConfigNvsStore::read_slot(ConfigSlot s,ConfigSlotRecord&r){if(!handle_||s==ConfigSlot::Invalid)return false;size_t n=sizeof(r);auto e=nvs_get_blob(reinterpret_cast<nvs_handle_t>(handle_),slot_key(s),&r,&n);return e==ESP_OK&&n==sizeof(r);}
bool ConfigNvsStore::write_slot(ConfigSlot s,const ConfigSlotRecord&r){if(!handle_||s==ConfigSlot::Invalid)return false;return nvs_set_blob(reinterpret_cast<nvs_handle_t>(handle_),slot_key(s),&r,sizeof(r))==ESP_OK;}
bool ConfigNvsStore::commit(){return handle_&&nvs_commit(reinterpret_cast<nvs_handle_t>(handle_))==ESP_OK;}
bool ConfigNvsStore::write_marker(ConfigSlot s){if(!handle_)return false;marker_=s;const uint8_t v=static_cast<uint8_t>(s);return nvs_set_u8(reinterpret_cast<nvs_handle_t>(handle_),"cfg_active",v)==ESP_OK;}
ConfigLoadResult ConfigNvsStore::load(){ConfigSlotRecord a{},b{};ConfigSlot marker=ConfigSlot::Invalid;uint8_t m=0;if(handle_&&nvs_get_u8(reinterpret_cast<nvs_handle_t>(handle_),"cfg_active",&m)==ESP_OK&&m<=1)marker=static_cast<ConfigSlot>(m);auto selected=select_config_record(read_slot(ConfigSlot::A,a)?&a:nullptr,read_slot(ConfigSlot::B,b)?&b:nullptr,marker);if(selected.slot!=ConfigSlot::Invalid)return selected;ConfigLoadResult legacy{};if(handle_){nvs_handle_t h=0;if(nvs_open(kLegacyNamespace,NVS_READONLY,&h)==ESP_OK){size_t n=0;if(nvs_get_str(h,kLegacyKey,nullptr,&n)==ESP_OK&&n>1&&n<=kConfigMaxJsonBytes+1){std::array<char,kConfigMaxJsonBytes+1> buf{};if(nvs_get_str(h,kLegacyKey,buf.data(),&n)==ESP_OK){ConfigProjection p{};if(parse_config_projection({buf.data(),n-1},p)){legacy.document.length=static_cast<uint16_t>(n-1);std::copy_n(reinterpret_cast<uint8_t*>(buf.data()),n-1,legacy.document.bytes.begin());legacy.document.crc16=config_crc16_ccitt(legacy.document.bytes.data(),legacy.document.length);legacy.document.source=ConfigSource::Legacy;legacy.slot=ConfigSlot::Invalid;return legacy;}}}nvs_close(h);}}const char* safe=compiled_safe_config_json();legacy.document.length=static_cast<uint16_t>(std::strlen(safe));std::copy_n(reinterpret_cast<const uint8_t*>(safe),legacy.document.length,legacy.document.bytes.begin());legacy.document.crc16=config_crc16_ccitt(legacy.document.bytes.data(),legacy.document.length);legacy.document.source=ConfigSource::Default;return legacy;}
ConfigSaveStatus ConfigNvsStore::save(const ConfigDocument&d,ConfigSlot a,uint32_t g){if(!writable_)return ConfigSaveStatus::WriteFailed;return save_config_transaction(*this,d,a,g);}
}
