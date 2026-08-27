#include "config_core.h"
#include <cassert>
#include <cstring>
#include <string>
#include <vector>
using namespace deskmate::easyinput;
static const char* kJson=R"({"schema":"ai_keyboard.v1","target_platform":"windows","profiles":[{"id":"default","keys":{"KEY1":{"press":"voice_ptt_hold"},"KEY2":{"press":{"hotkey":"Return"}},"KEY3":{"press":"edit_ptt_hold"},"KEY4":{"press":{"hotkey":"Backspace"}},"KEY5":{"press":"select_all"},"KEY6":{"press":"copy"},"KEY7":{"press":"paste"},"KEY8":{"press":"undo"}},"encoder":{"press":"disabled","scroll":{"mode":"scroll","axis":"vertical","speed":3}}}],"unknown":{"keep":true}})";
static ConfigDocument doc(){ConfigDocument d{};d.length=std::strlen(kJson);std::memcpy(d.bytes.data(),kJson,d.length);d.crc16=config_crc16_ccitt(d.bytes.data(),d.length);return d;}
void write_roundtrip(){auto d=doc();ConfigWriteAssembler a;std::vector<uint8_t> p(63);size_t off=0;uint8_t total=(d.length+51)/52;for(uint8_t i=0;i<total;i++){p.assign(63,0);p[0]='S';p[1]='3';p[2]='C';p[3]=1;p[4]=i;p[5]=total;p[6]=d.length;p[7]=d.length>>8;auto n=std::min<size_t>(52,d.length-off);p[8]=n;p[9]=d.crc16;p[10]=d.crc16>>8;std::memcpy(p.data()+11,d.bytes.data()+off,n);auto s=a.accept(p.data(),p.size(),7);assert(i+1==total?s==ConfigReceiveStatus::Complete:s==ConfigReceiveStatus::Accepted);off+=n;}assert(a.document().view()==d.view());}
void read_roundtrip(){auto d=doc();ConfigReadStream s;assert(s.replace(9,d,4));std::array<uint8_t,63> p{};size_t off=0;while(s.pending()){assert(s.encode_next(p));assert(p[0]==6);auto n=p[3]-10;assert(std::memcmp(p.data()+14,d.bytes.data()+off,n)==0);off+=n;s.mark_sent();}assert(off==d.length);}
struct B:ConfigStorageBackend{ConfigSlotRecord a{},b{};ConfigSlot marker{ConfigSlot::A};bool fail_write=false,fail_commit=false;bool write_slot(ConfigSlot s,const ConfigSlotRecord&r)override{if(fail_write)return false;(s==ConfigSlot::A?a:b)=r;return true;}bool commit()override{return !fail_commit;}bool read_slot(ConfigSlot s,ConfigSlotRecord&r)override{r=s==ConfigSlot::A?a:b;return true;}bool write_marker(ConfigSlot s)override{marker=s;return true;}};
void storage(){auto d=doc();B b;assert(save_config_transaction(b,d,ConfigSlot::A,3)==ConfigSaveStatus::Saved);assert(b.marker==ConfigSlot::B);auto r=select_config_record(&b.a,&b.b,b.marker);assert(r.slot==ConfigSlot::B&&r.generation==4);b.b.bytes[0]='x';r=select_config_record(&b.a,&b.b,b.marker);assert(r.slot==ConfigSlot::A||r.slot==ConfigSlot::Invalid);}
int main(){ConfigProjection p{};assert(parse_config_projection(kJson,p));write_roundtrip();read_roundtrip();storage();return 0;}
