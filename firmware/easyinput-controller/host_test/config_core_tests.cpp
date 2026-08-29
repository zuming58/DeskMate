#include "config_core.h"

#include <algorithm>
#include <array>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <string>
#include <vector>

using namespace deskmate::easyinput;

namespace {
[[noreturn]] void fail_check(const char* expression, int line) {
  std::fprintf(stderr, "config_core_tests:%d: check failed: %s\n", line, expression);
  std::exit(1);
}
}
#define CHECK(expression) ((expression) ? static_cast<void>(0) : fail_check(#expression, __LINE__))

static const char* kJson=R"({"schema":"ai_keyboard.v1","target_platform":"windows","profiles":[{"id":"default","keys":{"KEY1":{"press":"voice_ptt_hold"},"KEY2":{"press":{"hotkey":"Return"}},"KEY3":{"press":"edit_ptt_hold"},"KEY4":{"press":{"hotkey":"Backspace"}},"KEY5":{"press":"select_all"},"KEY6":{"press":"copy"},"KEY7":{"press":"paste"},"KEY8":{"press":"undo"}},"encoder":{"press":"scroll_axis_toggle","scroll":{"enabled":true,"mode":"scroll","axis":"vertical","speed":3}}}],"unknown":{"keep":true}})";

static ConfigDocument doc(){ConfigDocument d{};d.length=std::strlen(kJson);std::memcpy(d.bytes.data(),kJson,d.length);d.crc16=config_crc16_ccitt(d.bytes.data(),d.length);return d;}

static ConfigDocument document_from(const std::string& json){ConfigDocument d{};CHECK(!json.empty()&&json.size()<=kConfigMaxJsonBytes);d.length=static_cast<uint16_t>(json.size());std::memcpy(d.bytes.data(),json.data(),d.length);d.crc16=config_crc16_ccitt(d.bytes.data(),d.length);return d;}

static std::string large_host_action_config(){
  std::string json=R"({"schema":"ai_keyboard.v1","target_platform":"windows","profiles":[{"id":"default","keys":{"KEY1":{"press":"voice_ptt_hold"},"KEY2":{"press":{"hotkey":"Return"}},"KEY3":{"press":"edit_ptt_hold"},"KEY4":{"press":{"hotkey":"Backspace"}},"KEY5":{"press":"select_all"},"KEY6":{"press":"copy"},"KEY7":{"press":"paste"},"KEY8":{"press":"host_action:12345678-1234-1234-1234-123456789abc"}},"encoder":{"press":"scroll_axis_toggle","scroll":{"enabled":true,"mode":"scroll","axis":"vertical","speed":3,"windows_reverse_vertical":false,"windows_reverse_horizontal":false}}},{"id":"preserved-profile","keys":{},"encoder":{}}],"network":{"ssid":"preserve-me","secret":"not-a-real-secret"},"audio":{"source":"computer","gain":7},"unknown":{"padding":")";
  const std::string suffix=R"(","nested":{"keep":true,"list":[1,2,3]}}})";
  CHECK(json.size()+suffix.size()<kConfigMaxJsonBytes-32);
  json.append(kConfigMaxJsonBytes-16-json.size()-suffix.size(),'x');
  json+=suffix;
  CHECK(json.size()==kConfigMaxJsonBytes-16);
  return json;
}

static std::vector<uint8_t> write_chunk(const ConfigDocument& d,uint8_t index,uint8_t total){
  std::vector<uint8_t> p(kConfigWriteFeaturePayloadBytes,0);const size_t off=static_cast<size_t>(index)*kConfigWriteChunkBytes;const auto n=std::min(kConfigWriteChunkBytes,static_cast<size_t>(d.length)-off);
  p[0]='S';p[1]='3';p[2]='C';p[3]=1;p[4]=index;p[5]=total;p[6]=d.length;p[7]=d.length>>8;p[8]=static_cast<uint8_t>(n);p[9]=d.crc16;p[10]=d.crc16>>8;std::memcpy(p.data()+11,d.bytes.data()+off,n);return p;
}

void write_roundtrip(){auto d=doc();ConfigWriteAssembler a;const uint8_t total=static_cast<uint8_t>((d.length+51)/52);for(uint8_t i=0;i<total;i++){auto p=write_chunk(d,i,total);auto s=a.accept(p.data(),p.size(),7);CHECK(i+1==total?s==ConfigReceiveStatus::Complete:s==ConfigReceiveStatus::Accepted);}CHECK(a.document().view()==d.view());}

void chunk_zero_replaces_incomplete_write(){auto d=doc();ConfigWriteAssembler a;const uint8_t total=static_cast<uint8_t>((d.length+51)/52);auto p=write_chunk(d,0,total);CHECK(a.accept(p.data(),p.size(),7)==ConfigReceiveStatus::Accepted);CHECK(a.accept(p.data(),p.size(),7)==ConfigReceiveStatus::Accepted);for(uint8_t i=1;i<total;i++){p=write_chunk(d,i,total);CHECK(a.accept(p.data(),p.size(),7)==(i+1==total?ConfigReceiveStatus::Complete:ConfigReceiveStatus::Accepted));}}

void read_roundtrip(){auto d=doc();ConfigReadStream s;CHECK(s.replace(9,d,4));std::array<uint8_t,kConfigFeaturePayloadBytes> p{};size_t off=0;while(s.pending()){CHECK(s.encode_next(p));CHECK(p[0]==6);auto n=p[3]-10;CHECK(std::memcmp(p.data()+14,d.bytes.data()+off,n)==0);CHECK(std::all_of(p.begin()+14+n,p.end(),[](uint8_t v){return v==0;}));off+=n;s.mark_sent();}CHECK(off==d.length);}

void status_roundtrip(){ConfigStatusStream s;CHECK(s.replace(0x12345678,4));std::array<uint8_t,kConfigFeaturePayloadBytes> p{};std::string json;uint16_t length=0,crc=0;uint8_t expected=0,total=0;while(s.pending()){CHECK(s.encode_next(p));CHECK(p[0]==4&&p[1]==expected++);total=p[2];length=static_cast<uint16_t>(p[9]|(p[10]<<8));crc=static_cast<uint16_t>(p[11]|(p[12]<<8));const auto count=p[3]-9;json.append(reinterpret_cast<const char*>(p.data()+13),count);CHECK(std::all_of(p.begin()+13+count,p.end(),[](uint8_t v){return v==0;}));s.mark_sent();}CHECK(expected==total);CHECK(json.size()==length);CHECK(config_crc16_ccitt(reinterpret_cast<const uint8_t*>(json.data()),json.size())==crc);CHECK(json.find("\"config_read_v1\":true")!=std::string::npos);CHECK(json.find("\"config_write_v1\":true")!=std::string::npos);CHECK(json.find("\"host_action_v1\":true")!=std::string::npos);CHECK(json.find("\"fixed_text_v1\":true")!=std::string::npos);}

struct B:ConfigStorageBackend{
  ConfigSlotRecord a{},b{};ConfigSlot marker{ConfigSlot::A};int commit_count=0;bool fail_write=false,fail_read=false,fail_marker=false;int fail_commit_at=0;
  bool write_slot(ConfigSlot s,const ConfigSlotRecord&r)override{if(fail_write)return false;(s==ConfigSlot::A?a:b)=r;return true;}
  bool commit()override{return ++commit_count!=fail_commit_at;}
  bool read_slot(ConfigSlot s,ConfigSlotRecord&r)override{if(fail_read)return false;r=s==ConfigSlot::A?a:b;return true;}
  bool write_marker(ConfigSlot s)override{if(fail_marker)return false;marker=s;return true;}
};

static ConfigSlotRecord record(uint32_t generation){auto d=doc();ConfigSlotRecord r{};r.length=d.length;r.generation=generation;r.crc16=d.crc16;std::copy_n(d.bytes.begin(),d.length,r.bytes.begin());return r;}

void storage(){
  auto d=doc();B b;ConfigTransactionWorkspace workspace{};CHECK(save_config_transaction(b,d,ConfigSlot::A,3,workspace)==ConfigSaveStatus::Saved);CHECK(b.marker==ConfigSlot::B);ConfigLoadResult r{};select_config_record(&b.a,&b.b,b.marker,r);CHECK(r.slot==ConfigSlot::B&&r.generation==4&&!r.recovered_marker);
  auto a=record(4), newer=record(5);select_config_record(&a,&newer,ConfigSlot::A,r);CHECK(r.slot==ConfigSlot::A&&r.generation==4&&!r.recovered_marker);
  select_config_record(&a,&newer,ConfigSlot::Invalid,r);CHECK(r.slot==ConfigSlot::B&&r.generation==5&&r.recovered_marker&&r.document.source==ConfigSource::Recovery);
  newer.bytes[0]='x';select_config_record(&a,&newer,ConfigSlot::B,r);CHECK(r.slot==ConfigSlot::A&&r.recovered_marker&&r.document.source==ConfigSource::Recovery);
  for(int failure=1;failure<=5;++failure){B f;if(failure==1)f.fail_write=true;if(failure==2)f.fail_commit_at=1;if(failure==3)f.fail_read=true;if(failure==4)f.fail_marker=true;if(failure==5)f.fail_commit_at=2;CHECK(save_config_transaction(f,d,ConfigSlot::A,3,workspace)!=ConfigSaveStatus::Saved);}
  B overflow;CHECK(save_config_transaction(overflow,d,ConfigSlot::A,std::numeric_limits<uint32_t>::max(),workspace)==ConfigSaveStatus::WriteFailed);
}

void large_config_save_read_and_restart_roundtrip(){
  const std::string raw=large_host_action_config();
  const ConfigDocument incoming=document_from(raw);
  ConfigWriteAssembler assembler;
  const uint8_t total=static_cast<uint8_t>((incoming.length+kConfigWriteChunkBytes-1)/kConfigWriteChunkBytes);
  for(uint8_t index=0;index<total;++index){const auto chunk=write_chunk(incoming,index,total);const auto status=assembler.accept(chunk.data(),chunk.size(),19);CHECK(status==(index+1==total?ConfigReceiveStatus::Complete:ConfigReceiveStatus::Accepted));}
  CHECK(assembler.document().view()==raw);

  B storage; ConfigTransactionWorkspace workspace{};
  CHECK(save_config_transaction(storage,assembler.document(),ConfigSlot::A,9,workspace)==ConfigSaveStatus::Saved);
  ConfigLoadResult loaded{}; select_config_record(&storage.a,&storage.b,storage.marker,loaded);
  CHECK(loaded.slot==ConfigSlot::B&&loaded.generation==10&&loaded.document.view()==raw);
  ConfigProjection projection{}; CHECK(parse_config_projection(loaded.document.view(),projection));
  CHECK(projection.keys[7].kind==ConfigActionKind::HostAction);
  CHECK(projection.keys[7].value=="12345678-1234-1234-1234-123456789abc");

  ConfigReadStream stream; CHECK(stream.replace(0x10203040,loaded.document,19));
  std::string readback; std::array<uint8_t,kConfigFeaturePayloadBytes> payload{};
  while(stream.pending()){CHECK(stream.encode_next(payload));const size_t count=payload[3]-10;readback.append(reinterpret_cast<const char*>(payload.data()+14),count);CHECK(stream.mark_sent()||stream.pending());}
  CHECK(readback==raw);

  ConfigLoadResult after_restart{}; select_config_record(&storage.a,&storage.b,storage.marker,after_restart);
  ConfigProjection restarted{}; CHECK(after_restart.document.view()==raw);CHECK(parse_config_projection(after_restart.document.view(),restarted));
  CHECK(restarted.keys[7].kind==ConfigActionKind::HostAction&&restarted.keys[7].value==projection.keys[7].value);
}

void rejects_malformed_projection_without_throwing(){
  ConfigProjection p{};
  CHECK(!parse_config_projection("not-json", p));
  CHECK(!parse_config_projection(R"({"schema":"ai_keyboard.v1","profiles":[]})", p));
  CHECK(!parse_config_projection(R"({"schema":"ai_keyboard.v1","schema":"ai_keyboard.v1","profiles":[]})", p));
  CHECK(!parse_config_projection(R"({"schema":"ai_keyboard.v1","profiles":[{"keys":{"KEY1":{"press":{"hotkey":"Ctrl+999999999999999999999999"}}}}]})", p));
  const std::string bad_escape = std::string("{\"schema\":\"ai_keyboard.v1\",\"profiles\":[{\"keys\":{\"KEY1\":{\"press\":{\"hotkey\":\"Ctrl") + "\\uD800" + "\"}}}}]}";
  CHECK(!parse_config_projection(bad_escape, p));
  std::string invalid = R"JSON({"schema":"ai_keyboard.v1","profiles":[{"keys":{"KEY1":{"press":"disabled"},"KEY2":{"press":"disabled"},"KEY3":{"press":"disabled"},"KEY4":{"press":"disabled"},"KEY5":{"press":"disabled"},"KEY6":{"press":"disabled"},"KEY7":{"press":"disabled"},"KEY8":{"press":"disabled"}},"encoder":{"press":"disabled","scroll":{"mode":"scroll","speed":3}}}]}) trailing)JSON";
  CHECK(!parse_config_projection(invalid, p));
  std::string bad_axis=compiled_safe_config_json();const auto position=bad_axis.find("\"vertical\"");bad_axis.replace(position,10,"\"toggle\"");CHECK(!parse_config_projection(bad_axis,p));
}

void accepts_legal_read_flags_and_rejects_reserved(){
  std::array<uint8_t,kConfigReadRequestPayloadBytes> request{};request[0]='S';request[1]='3';request[2]='R';request[3]=1;request[4]=7;ConfigReadRequest decoded{};
  for(uint8_t flag=0;flag<=2;++flag){request[8]=flag;CHECK(decode_config_read_request(request.data(),request.size(),decoded));CHECK(decoded.flag==static_cast<ConfigReadFlag>(flag));}
  request[8]=3;CHECK(!decode_config_read_request(request.data(),request.size(),decoded));request[8]=2;request[15]=1;CHECK(!decode_config_read_request(request.data(),request.size(),decoded));CHECK(!decode_config_read_request(request.data(),63,decoded));
}

void normalizes_windows_feature_report_shapes(){
  std::array<uint8_t,kConfigFeaturePayloadBytes+1> wire{};
  wire[0]=0x13;wire[1]='S';wire[2]='3';wire[3]='R';wire[4]=1;wire[5]=7;
  ConfigFeatureReportView view{};
  CHECK(normalize_config_feature_report(0,wire.data(),17,view));
  CHECK(view.report_id==0x13&&view.payload==wire.data()+1&&view.length==16);
  CHECK(normalize_config_feature_report(0x13,wire.data(),wire.size(),view));
  CHECK(view.report_id==0x13&&view.length==kConfigFeaturePayloadBytes);
  CHECK(!normalize_config_feature_report(0x10,wire.data(),17,view));
  wire[17]=1;CHECK(!normalize_config_feature_report(0,wire.data(),wire.size(),view));wire[17]=0;
  wire.fill(0);wire[0]=0x10;wire[1]='S';
  CHECK(normalize_config_feature_report(0,wire.data(),wire.size(),view));
  CHECK(view.report_id==0x10&&view.payload==wire.data()+1&&view.length==kConfigWriteFeaturePayloadBytes);
  CHECK(!normalize_config_feature_report(0x12,wire.data()+1,kConfigWriteFeaturePayloadBytes,view));
}

int main(){ConfigProjection p{};CHECK(parse_config_projection(kJson,p));CHECK(p.keys[0].kind==ConfigActionKind::VoiceInput&&p.keys[0].modifiers==3&&p.keys[0].usage==0x2c);CHECK(p.keys[2].kind==ConfigActionKind::VoiceEdit&&p.keys[2].modifiers==3&&p.keys[2].usage==0x08);CHECK(p.keys[1].kind==ConfigActionKind::Hotkey&&p.keys[1].modifiers==0&&p.keys[1].usage==0x28);CHECK(p.keys[3].kind==ConfigActionKind::Hotkey&&p.keys[3].modifiers==0&&p.keys[3].usage==0x2a);write_roundtrip();chunk_zero_replaces_incomplete_write();read_roundtrip();status_roundtrip();storage();large_config_save_read_and_restart_roundtrip();rejects_malformed_projection_without_throwing();accepts_legal_read_flags_and_rejects_reserved();normalizes_windows_feature_report_shapes();return 0;}
