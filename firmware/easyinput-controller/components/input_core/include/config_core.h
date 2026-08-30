#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include "agent_state_core.h"
#include "deskmate_link_core.h"
namespace deskmate::easyinput {
inline constexpr size_t kConfigMaxJsonBytes = 2048;
inline constexpr size_t kConfigWriteChunkBytes = 52;
inline constexpr size_t kConfigReadChunkBytes = 49;
inline constexpr size_t kConfigFeaturePayloadBytes = 63;
inline constexpr size_t kConfigWriteFeaturePayloadBytes = 63;
inline constexpr size_t kConfigReadRequestPayloadBytes = 16;
inline constexpr size_t kConfigStatusMaxJsonBytes = 1024;
uint16_t config_crc16_ccitt(const uint8_t*, size_t);
enum class ConfigSource : uint8_t { DeskMate=0, Legacy=1, Default=2, Recovery=3 };
enum class ConfigReceiveStatus : uint8_t { Accepted, Complete, Rejected };
struct ConfigDocument { std::array<uint8_t,kConfigMaxJsonBytes> bytes{}; uint16_t length{}; uint16_t crc16{}; ConfigSource source{ConfigSource::Default}; std::string_view view() const { return {reinterpret_cast<const char*>(bytes.data()), length}; } };
class ConfigWriteAssembler {
 public: ConfigReceiveStatus accept(const uint8_t*,size_t,uint32_t); void abort(); const ConfigDocument& document() const{return document_;} bool active() const{return active_;}
 private: ConfigDocument document_{}; uint32_t epoch_{}; uint8_t expected_chunk_{},total_chunks_{}; uint16_t declared_length_{},declared_crc_{}; bool active_{};
};
enum class ConfigReadFlag : uint8_t { CachedStatus=0, FreshStatus=1, CompleteConfig=2 };
struct ConfigReadRequest { uint32_t request_id{}; ConfigReadFlag flag{ConfigReadFlag::CachedStatus}; };
bool decode_config_read_request(const uint8_t*,size_t,ConfigReadRequest&);
struct ConfigFeatureReportView { uint8_t report_id{}; const uint8_t* payload{}; size_t length{}; };
bool normalize_config_feature_report(uint8_t,const uint8_t*,size_t,ConfigFeatureReportView&);
class ConfigReadStream {
 public: bool replace(uint32_t,const ConfigDocument&,uint32_t); bool encode_next(std::array<uint8_t,kConfigFeaturePayloadBytes>&) const; bool mark_sent(); void abort(); bool pending() const{return pending_;} uint32_t epoch() const{return epoch_;}
 private: ConfigDocument document_{}; uint32_t request_id_{},epoch_{}; uint8_t next_chunk_{},total_chunks_{}; bool pending_{};
};
class ConfigStatusStream {
 public: bool replace(uint32_t,uint32_t,const LinkStatusSnapshot&,const AgentStateDiagnostics& = {}); bool encode_next(std::array<uint8_t,kConfigFeaturePayloadBytes>&) const; bool mark_sent(); void abort(); bool pending() const{return pending_;} uint32_t epoch() const{return epoch_;}
 private: std::array<char,kConfigStatusMaxJsonBytes> json_{}; uint32_t request_id_{},epoch_{}; uint8_t next_chunk_{},total_chunks_{}; uint16_t length_{},crc16_{}; bool pending_{};
};
enum class ConfigActionKind:uint8_t { Disabled,VoiceInput,VoiceEdit,Enter,Backspace,SelectAll,Copy,Paste,Undo,Hotkey,EncoderAxisToggle,TextCaretSelect,FixedText,HostAction,Unsupported };
struct ConfigAction { ConfigActionKind kind{ConfigActionKind::Disabled}; uint8_t modifiers{},usage{}; std::string value{}; };
struct ConfigProjection { std::array<ConfigAction,8> keys{}; ConfigAction encoder_press{}; bool encoder_enabled{true},encoder_cursor{},encoder_horizontal{},reverse_vertical{},reverse_horizontal{}; uint8_t encoder_speed{3}; };
bool parse_config_projection(std::string_view,ConfigProjection&); const char* compiled_safe_config_json();
inline constexpr uint32_t kConfigRecordMagic=0x31474643; inline constexpr uint16_t kConfigRecordVersion=1;
struct ConfigSlotRecord { uint32_t magic{kConfigRecordMagic}; uint16_t version{kConfigRecordVersion}; uint16_t length{}; uint32_t generation{}; uint16_t crc16{}; std::array<uint8_t,kConfigMaxJsonBytes> bytes{}; };
bool validate_config_record(const ConfigSlotRecord&);
enum class ConfigSlot:uint8_t { A=0,B=1,Invalid=0xff };
struct ConfigLoadResult { ConfigDocument document{}; ConfigSlot slot{ConfigSlot::Invalid}; uint32_t generation{}; bool recovered_marker{}; };
void select_config_record(const ConfigSlotRecord*,const ConfigSlotRecord*,ConfigSlot,ConfigLoadResult&);
class ConfigStorageBackend { public: virtual ~ConfigStorageBackend()=default; virtual bool write_slot(ConfigSlot,const ConfigSlotRecord&)=0; virtual bool commit()=0; virtual bool read_slot(ConfigSlot,ConfigSlotRecord&)=0; virtual bool write_marker(ConfigSlot)=0; };
enum class ConfigSaveStatus:uint8_t { Saved,WriteFailed,CommitFailed,ReadbackFailed,MarkerFailed };
struct ConfigTransactionWorkspace { ConfigSlotRecord record{}; ConfigSlotRecord readback{}; };
ConfigSaveStatus save_config_transaction(ConfigStorageBackend&,const ConfigDocument&,ConfigSlot,uint32_t,ConfigTransactionWorkspace&);
}
