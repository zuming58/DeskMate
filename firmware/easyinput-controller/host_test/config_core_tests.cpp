#include "config_core.h"
#include <cassert>
#include <cstring>
#include <string>
#include <vector>
using namespace deskmate::easyinput;
static const char* kJson=R"({"schema":"ai_keyboard.v1","target_platform":"windows","profiles":[{"id":"default","keys":{"KEY1":{"press":"voice_ptt_hold"},"KEY2":{"press":{"hotkey":"Return"}},"KEY3":{"press":"edit_ptt_hold"},"KEY4":{"press":{"hotkey":"Backspace"}},"KEY5":{"press":"select_all"},"KEY6":{"press":"copy"},"KEY7":{"press":"paste"},"KEY8":{"press":"undo"}},"encoder":{"press":"disabled","scroll":{"mode":"scroll","axis":"vertical","speed":3}}}],"unknown":{"keep":true}})";
static ConfigDocument doc(){ConfigDocument d{};d.length=std::strlen(kJson);std::memcpy(d.bytes.data(),kJson,d.length);d.crc16=config_crc16_ccitt(d.bytes.data(),d.length);return d;}
void write_roundtrip(){auto d=doc();ConfigWriteAssembler a;std::vector<uint8_t> p(63);size_t off=0;uint8_t total=(d.length+51)/52;for(uint8_t i=0;i<total;i++){p.assign(63,0);p[0]='S';p[1]='3';p[2]='C';p[3]=1;p[4]=i;p[5]=total;p[6]=d.length;p[7]=d.length>>8;auto n=std::min<size_t>(52,d.length-off);p[8]=n;p[9]=d.crc16;p[10]=d.crc16>>8;std::memcpy(p.data()+11,d.bytes.data()+off,n);auto s=a.accept(p.data(),p.size(),7);assert(i+1==total?s==ConfigReceiveStatus::Complete:s==ConfigReceiveStatus::Accepted);off+=n;}assert(a.document().view()==d.view());}
void rejects_duplicate_write_chunk(){auto d=doc();ConfigWriteAssembler a;std::vector<uint8_t> p(63,0);p[0]='S';p[1]='3';p[2]='C';p[3]=1;p[4]=0;p[5]=2;p[6]=d.length;p[7]=d.length>>8;p[8]=52;p[9]=d.crc16;p[10]=d.crc16>>8;std::memcpy(p.data()+11,d.bytes.data(),52);assert(a.accept(p.data(),p.size(),7)==ConfigReceiveStatus::Accepted);assert(a.accept(p.data(),p.size(),7)==ConfigReceiveStatus::Rejected);}
void read_roundtrip(){auto d=doc();ConfigReadStream s;assert(s.replace(9,d,4));std::array<uint8_t,63> p{};size_t off=0;while(s.pending()){assert(s.encode_next(p));assert(p[0]==6);auto n=p[3]-10;assert(std::memcmp(p.data()+14,d.bytes.data()+off,n)==0);off+=n;s.mark_sent();}assert(off==d.length);}
struct B:ConfigStorageBackend{ConfigSlotRecord a{},b{};ConfigSlot marker{ConfigSlot::A};bool fail_write=false,fail_commit=false;bool write_slot(ConfigSlot s,const ConfigSlotRecord&r)override{if(fail_write)return false;(s==ConfigSlot::A?a:b)=r;return true;}bool commit()override{return !fail_commit;}bool read_slot(ConfigSlot s,ConfigSlotRecord&r)override{r=s==ConfigSlot::A?a:b;return true;}bool write_marker(ConfigSlot s)override{marker=s;return true;}};
void storage(){auto d=doc();B b;assert(save_config_transaction(b,d,ConfigSlot::A,3)==ConfigSaveStatus::Saved);assert(b.marker==ConfigSlot::B);auto r=select_config_record(&b.a,&b.b,b.marker);assert(r.slot==ConfigSlot::B&&r.generation==4);b.b.bytes[0]='x';r=select_config_record(&b.a,&b.b,b.marker);assert(r.slot==ConfigSlot::A||r.slot==ConfigSlot::Invalid);}
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
}
void accepts_legal_read_flags_and_rejects_reserved(){
  std::array<uint8_t,16> request{}; request[0]='S'; request[1]='3'; request[2]='R'; request[3]=1; request[4]=7;
  ConfigReadRequest decoded{};
  assert(decode_config_read_request(request.data(), request.size(), decoded));
  request[8]=1; assert(decode_config_read_request(request.data(), request.size(), decoded));
  request[8]=3; assert(!decode_config_read_request(request.data(), request.size(), decoded));
  request[8]=2; request[15]=1; assert(!decode_config_read_request(request.data(), request.size(), decoded));
}
int main(){ConfigProjection p{};assert(parse_config_projection(kJson,p));write_roundtrip();rejects_duplicate_write_chunk();read_roundtrip();storage();rejects_malformed_projection_without_throwing();accepts_legal_read_flags_and_rejects_reserved();return 0;}
