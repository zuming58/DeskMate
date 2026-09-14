#include "style_studio_lease_core.h"

#include <array>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>

using namespace deskmate::easyinput;
namespace { int failures=0; }
#define CHECK(x) do { if(!(x)){ std::cerr<<"FAIL "<<__LINE__<<": "#x"\n"; ++failures; } } while(0)

std::uint16_t crc16(const std::uint8_t* data, std::size_t length) {
  std::uint16_t crc=0xffff;
  for(std::size_t i=0;i<length;++i){crc^=static_cast<std::uint16_t>(data[i])<<8u;for(int b=0;b<8;++b)crc=static_cast<std::uint16_t>((crc&0x8000u)?(crc<<1u)^0x1021u:crc<<1u);} return crc;
}

std::array<std::uint8_t,64> report(std::uint8_t operation, std::uint32_t token,
                                   std::uint32_t ttl) {
  std::array<std::uint8_t,64> value{}; value[0]=0x1c;
  value[1]='D';value[2]='M';value[3]='S';value[4]='L';value[5]=1;
  value[6]=operation;value[7]=1;
  for(unsigned i=0;i<4;++i){value[9+i]=static_cast<std::uint8_t>(token>>(i*8u));value[13+i]=static_cast<std::uint8_t>(ttl>>(i*8u));}
  const auto crc=crc16(value.data()+1,16);value[17]=static_cast<std::uint8_t>(crc);value[18]=static_cast<std::uint8_t>(crc>>8u);return value;
}

void normalization_and_lifecycle() {
  auto acquire=report(1,0x12345678,2500); StyleStudioLeaseFeatureReportView view{};
  CHECK(normalize_style_studio_lease_feature_report(0,acquire.data(),acquire.size(),view));
  CHECK(view.length==63&&view.payload==acquire.data()+1);
  CHECK(normalize_style_studio_lease_feature_report(0x1c,acquire.data()+1,63,view));
  CHECK(!normalize_style_studio_lease_feature_report(0x18,acquire.data()+1,63,view));
  StyleStudioLeaseCore lease; CHECK(lease.accept(acquire.data()+1,63,7,100));
  CHECK(lease.active(7,100)); CHECK(lease.active(7,2599)); CHECK(!lease.active(7,2600));
  CHECK(!lease.active(8,101)); lease.clear_for_usb_epoch(8); CHECK(lease.token()==0);
}

void renew_replace_release_and_reject() {
  StyleStudioLeaseCore lease; auto first=report(1,1,2500); auto renew=report(1,1,2500);
  CHECK(lease.accept(first.data()+1,63,2,0)); CHECK(lease.accept(renew.data()+1,63,2,2400)); CHECK(lease.active(2,4899));
  auto replace=report(1,2,1000); CHECK(lease.accept(replace.data()+1,63,2,3000)); CHECK(lease.token()==2);
  auto staleRelease=report(2,1,0); CHECK(!lease.accept(staleRelease.data()+1,63,2,3001)); CHECK(lease.active(2,3001));
  auto release=report(2,2,0); CHECK(lease.accept(release.data()+1,63,2,3002)); CHECK(!lease.active(2,3002));
  auto bad=first; bad[18]^=1; CHECK(!lease.accept(bad.data()+1,63,2,0));
  bad=first;bad[30]=1;CHECK(!lease.accept(bad.data()+1,63,2,0));
  bad=report(1,3,999);CHECK(!lease.accept(bad.data()+1,63,2,0));
}

void golden_vectors_are_frozen() {
  std::ifstream input(STYLE_STUDIO_LEASE_VECTORS_PATH); std::string json((std::istreambuf_iterator<char>(input)),{});
  CHECK(json.find("1c444d534c0101010078563412c409000013b5")!=std::string::npos);
  CHECK(json.find("1c444d534c0102010078563412000000002d2a")!=std::string::npos);
  const auto acquire=report(1,0x12345678,2500); const auto release=report(2,0x12345678,0);
  CHECK(acquire[17]==0x13&&acquire[18]==0xb5); CHECK(release[17]==0x2d&&release[18]==0x2a);
}

int main(){normalization_and_lifecycle();renew_replace_release_and_reject();golden_vectors_are_frozen();return failures?1:0;}
