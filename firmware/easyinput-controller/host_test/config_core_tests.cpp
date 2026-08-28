#include "config_core.h"

#include <algorithm>
#include <array>
#include <cassert>
#include <cstring>
#include <limits>
#include <string>
#include <vector>

using namespace deskmate::easyinput;

static const char* kJson=R"({"schema":"ai_keyboard.v1","target_platform":"windows","profiles":[{"id":"default","keys":{"KEY1":{"press":"voice_ptt_hold"},"KEY2":{"press":{"hotkey":"Return"}},"KEY3":{"press":"edit_ptt_hold"},"KEY4":{"press":{"hotkey":"Backspace"}},"KEY5":{"press":"select_all"},"KEY6":{"press":"copy"},"KEY7":{"press":"paste"},"KEY8":{"press":"undo"}},"encoder":{"press":"scroll_axis_toggle","scroll":{"enabled":true,"mode":"scroll","axis":"vertical","speed":3}}}],"unknown":{"keep":true}})";

static ConfigDocument doc(){ConfigDocument d{};d.length=std::strlen(kJson);std::memcpy(d.bytes.data(),kJson,d.length);d.crc16=config_crc16_ccitt(d.bytes.data(),d.length);return d;}

static std::vector<uint8_t> write_chunk(const ConfigDocument& d,uint8_t index,uint8_t total){
  std::vector<uint8_t> p(kConfigWriteFeaturePayloadBytes,0);const size_t off=static_cast<size_t>(index)*kConfigWriteChunkBytes;const auto n=std::min(kConfigWriteChunkBytes,static_cast<size_t>(d.length)-off);
  p[0]='S';p[1]='3';p[2]='C';p[3]=1;p[4]=index;p[5]=total;p[6]=d.length;p[7]=d.length>>8;p[8]=static_cast<uint8_t>(n);p[9]=d.crc16;p[10]=d.crc16>>8;std::memcpy(p.data()+11,d.bytes.data()+off,n);return p;
}

void write_roundtrip(){auto d=doc();ConfigWriteAssembler a;const uint8_t total=static_cast<uint8_t>((d.length+51)/52);for(uint8_t i=0;i<total;i++){auto p=write_chunk(d,i,total);auto s=a.accept(p.data(),p.size(),7);assert(i+1==total?s==ConfigReceiveStatus::Complete:s==ConfigReceiveStatus::Accepted);}assert(a.document().view()==d.view());}

void chunk_zero_replaces_incomplete_write(){auto d=doc();ConfigWriteAssembler a;const uint8_t total=static_cast<uint8_t>((d.length+51)/52);auto p=write_chunk(d,0,total);assert(a.accept(p.data(),p.size(),7)==ConfigReceiveStatus::Accepted);assert(a.accept(p.data(),p.size(),7)==ConfigReceiveStatus::Accepted);for(uint8_t i=1;i<total;i++){p=write_chunk(d,i,total);assert(a.accept(p.data(),p.size(),7)==(i+1==total?ConfigReceiveStatus::Complete:ConfigReceiveStatus::Accepted));}}

void read_roundtrip(){auto d=doc();ConfigReadStream s;assert(s.replace(9,d,4));std::array<uint8_t,kConfigFeaturePayloadBytes> p{};size_t off=0;while(s.pending()){assert(s.encode_next(p));assert(p[0]==6);auto n=p[3]-10;assert(std::memcmp(p.data()+14,d.bytes.data()+off,n)==0);assert(std::all_of(p.begin()+14+n,p.end(),[](uint8_t v){return v==0;}));off+=n;s.mark_sent();}assert(off==d.length);}

void status_roundtrip(){ConfigStatusStream s;assert(s.replace(0x12345678,4));std::array<uint8_t,kConfigFeaturePayloadBytes> p{};std::string json;uint16_t length=0,crc=0;uint8_t expected=0,total=0;while(s.pending()){assert(s.encode_next(p));assert(p[0]==4&&p[1]==expected++);total=p[2];length=static_cast<uint16_t>(p[9]|(p[10]<<8));crc=static_cast<uint16_t>(p[11]|(p[12]<<8));const auto count=p[3]-9;json.append(reinterpret_cast<const char*>(p.data()+13),count);assert(std::all_of(p.begin()+13+count,p.end(),[](uint8_t v){return v==0;}));s.mark_sent();}assert(expected==total);assert(json.size()==length);assert(config_crc16_ccitt(reinterpret_cast<const uint8_t*>(json.data()),json.size())==crc);assert(json.find("\"config_read_v1\":true")!=std::string::npos);assert(json.find("\"config_write_v1\":true")!=std::string::npos);}

struct B:ConfigStorageBackend{
  ConfigSlotRecord a{},b{};ConfigSlot marker{ConfigSlot::A};int commit_count=0;bool fail_write=false,fail_read=false,fail_marker=false;int fail_commit_at=0;
  bool write_slot(ConfigSlot s,const ConfigSlotRecord&r)override{if(fail_write)return false;(s==ConfigSlot::A?a:b)=r;return true;}
  bool commit()override{return ++commit_count!=fail_commit_at;}
  bool read_slot(ConfigSlot s,ConfigSlotRecord&r)override{if(fail_read)return false;r=s==ConfigSlot::A?a:b;return true;}
  bool write_marker(ConfigSlot s)override{if(fail_marker)return false;marker=s;return true;}
};

static ConfigSlotRecord record(uint32_t generation){auto d=doc();ConfigSlotRecord r{};r.length=d.length;r.generation=generation;r.crc16=d.crc16;std::copy_n(d.bytes.begin(),d.length,r.bytes.begin());return r;}

void storage(){
  auto d=doc();B b;assert(save_config_transaction(b,d,ConfigSlot::A,3)==ConfigSaveStatus::Saved);assert(b.marker==ConfigSlot::B);auto r=select_config_record(&b.a,&b.b,b.marker);assert(r.slot==ConfigSlot::B&&r.generation==4&&!r.recovered_marker);
  auto a=record(4), newer=record(5);r=select_config_record(&a,&newer,ConfigSlot::A);assert(r.slot==ConfigSlot::A&&r.generation==4&&!r.recovered_marker);
  r=select_config_record(&a,&newer,ConfigSlot::Invalid);assert(r.slot==ConfigSlot::B&&r.generation==5&&r.recovered_marker&&r.document.source==ConfigSource::Recovery);
  newer.bytes[0]='x';r=select_config_record(&a,&newer,ConfigSlot::B);assert(r.slot==ConfigSlot::A&&r.recovered_marker&&r.document.source==ConfigSource::Recovery);
  for(int failure=1;failure<=5;++failure){B f;if(failure==1)f.fail_write=true;if(failure==2)f.fail_commit_at=1;if(failure==3)f.fail_read=true;if(failure==4)f.fail_marker=true;if(failure==5)f.fail_commit_at=2;assert(save_config_transaction(f,d,ConfigSlot::A,3)!=ConfigSaveStatus::Saved);}
  B overflow;assert(save_config_transaction(overflow,d,ConfigSlot::A,std::numeric_limits<uint32_t>::max())==ConfigSaveStatus::WriteFailed);
}

void rejects_malformed_projection_without_throwing(){
  ConfigProjection p{};
  assert(!parse_config_projection("not-json", p));
  assert(!parse_config_projection(R"({"schema":"ai_keyboard.v1","profiles":[]})", p));
  assert(!parse_config_projection(R"({"schema":"ai_keyboard.v1","schema":"ai_keyboard.v1","profiles":[]})", p));
  assert(!parse_config_projection(R"({"schema":"ai_keyboard.v1","profiles":[{"keys":{"KEY1":{"press":{"hotkey":"Ctrl+999999999999999999999999"}}}}]})", p));
  const std::string bad_escape = std::string("{\"schema\":\"ai_keyboard.v1\",\"profiles\":[{\"keys\":{\"KEY1\":{\"press\":{\"hotkey\":\"Ctrl") + "\\uD800" + "\"}}}}]}";
  assert(!parse_config_projection(bad_escape, p));
  std::string invalid = R"JSON({"schema":"ai_keyboard.v1","profiles":[{"keys":{"KEY1":{"press":"disabled"},"KEY2":{"press":"disabled"},"KEY3":{"press":"disabled"},"KEY4":{"press":"disabled"},"KEY5":{"press":"disabled"},"KEY6":{"press":"disabled"},"KEY7":{"press":"disabled"},"KEY8":{"press":"disabled"}},"encoder":{"press":"disabled","scroll":{"mode":"scroll","speed":3}}}]}) trailing)JSON";
  assert(!parse_config_projection(invalid, p));
  std::string bad_axis=compiled_safe_config_json();const auto position=bad_axis.find("\"vertical\"");bad_axis.replace(position,10,"\"toggle\"");assert(!parse_config_projection(bad_axis,p));
}

void accepts_legal_read_flags_and_rejects_reserved(){
  std::array<uint8_t,kConfigReadRequestPayloadBytes> request{};request[0]='S';request[1]='3';request[2]='R';request[3]=1;request[4]=7;ConfigReadRequest decoded{};
  for(uint8_t flag=0;flag<=2;++flag){request[8]=flag;assert(decode_config_read_request(request.data(),request.size(),decoded));assert(decoded.flag==static_cast<ConfigReadFlag>(flag));}
  request[8]=3;assert(!decode_config_read_request(request.data(),request.size(),decoded));request[8]=2;request[15]=1;assert(!decode_config_read_request(request.data(),request.size(),decoded));assert(!decode_config_read_request(request.data(),63,decoded));
}

int main(){ConfigProjection p{};assert(parse_config_projection(kJson,p));write_roundtrip();chunk_zero_replaces_incomplete_write();read_roundtrip();status_roundtrip();storage();rejects_malformed_projection_without_throwing();accepts_legal_read_flags_and_rejects_reserved();return 0;}
