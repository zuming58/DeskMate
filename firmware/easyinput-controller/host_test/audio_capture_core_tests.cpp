#include "audio_capture_core.h"

#include <algorithm>
#include <array>
#include <cstdio>
#include <cstdlib>
#include <cstdint>

using namespace deskmate::easyinput;

namespace {
[[noreturn]] void fail_check(const char* expression, int line) {
    std::fprintf(stderr, "audio_capture_core_tests:%d: check failed: %s\n",
                 line, expression);
    std::exit(1);
}
}
#define CHECK(expression) ((expression) ? static_cast<void>(0) : fail_check(#expression, __LINE__))

void wire_golden_vectors() {
    std::array<std::uint8_t, kAudioHeartbeatBytes> heartbeat{};
    encode_audio_heartbeat(heartbeat.data(), true, true,
                           0x0102030405060708ULL, 0x11223344U);
    const std::array<std::uint8_t, kAudioHeartbeatBytes> expected_heartbeat{
        'E','I','H','B',1,3,0,0,8,7,6,5,4,3,2,1,0x44,0x33,0x22,0x11};
    CHECK(heartbeat == expected_heartbeat);

    std::array<std::uint8_t, kAudioAckBytes> ack{};
    encode_audio_ack(ack.data(), AudioControlAction::Start,
                     AudioControlStatus::Ok, 0x0102030405060708ULL,
                     0x11223344U);
    const std::array<std::uint8_t, kAudioAckBytes> expected_ack{
        'E','I','C','A',1,1,0,0,8,7,6,5,4,3,2,1,0x44,0x33,0x22,0x11};
    CHECK(ack == expected_ack);

    std::array<std::uint8_t, kAudioPacketHeaderBytes> header{};
    encode_audio_packet_header(header.data(), 0x0102030405060708ULL,
                               0x11223344U, 0x55667788U);
    const std::array<std::uint8_t, kAudioPacketHeaderBytes> expected_header{
        'E','I','A','U',2,32,1,1,8,7,6,5,4,3,2,1,
        0x44,0x33,0x22,0x11,0x80,0x3e,0,0,0x88,0x77,0x66,0x55,
        0x40,0x01,0x80,0x02};
    CHECK(header == expected_header);
}

std::array<std::uint8_t, kAudioControlBytes> control(
    AudioControlAction action, std::uint64_t session, std::uint32_t sequence) {
    std::array<std::uint8_t, kAudioControlBytes> value{};
    value[0]='E';value[1]='I';value[2]='C';value[3]='C';value[4]=1;
    value[5]=static_cast<std::uint8_t>(action);
    for(unsigned i=0;i<8;++i)value[8+i]=static_cast<std::uint8_t>(session>>(8*i));
    for(unsigned i=0;i<4;++i)value[16+i]=static_cast<std::uint8_t>(sequence>>(8*i));
    for(unsigned i=0;i<16;++i)value[20+i]=static_cast<std::uint8_t>(0xa0+i);
    return value;
}

void decode_and_reject_bad_packets() {
    auto packet=control(AudioControlAction::Start,7,9);AudioControlCommand decoded{};
    CHECK(decode_audio_control(packet.data(),packet.size(),decoded));
    CHECK(decoded.action==AudioControlAction::Start&&decoded.session_id==7&&decoded.sequence==9);
    CHECK(!decode_audio_control(packet.data(),packet.size()-1,decoded));
    packet[0]='X';CHECK(!decode_audio_control(packet.data(),packet.size(),decoded));packet[0]='E';
    packet[4]=2;CHECK(!decode_audio_control(packet.data(),packet.size(),decoded));packet[4]=1;
    packet[5]=4;CHECK(!decode_audio_control(packet.data(),packet.size(),decoded));packet[5]=1;
    packet[6]=1;CHECK(!decode_audio_control(packet.data(),packet.size(),decoded));packet[6]=0;
    std::fill(packet.begin()+8,packet.begin()+16,0);CHECK(!decode_audio_control(packet.data(),packet.size(),decoded));
}

AudioControlCommand command(AudioControlAction action,std::uint64_t session,std::uint32_t sequence){auto packet=control(action,session,sequence);AudioControlCommand result{};CHECK(decode_audio_control(packet.data(),packet.size(),result));return result;}

void session_source_sequence_and_lease() {
    constexpr std::uint32_t host=0x01020304,other=0x05060708;
    AudioSessionController session;session.configure_source(host,true);
    auto start=command(AudioControlAction::Start,11,1);
    auto decision=session.accept(start,other,100);CHECK(decision.status==AudioControlStatus::Unauthorized&&!session.active());
    decision=session.accept(start,host,100);CHECK(decision.status==AudioControlStatus::Ok&&decision.start_capture&&session.active());
    decision=session.accept(start,host,101);CHECK(decision.status==AudioControlStatus::Ok&&decision.duplicate&&!decision.start_capture);
    auto keepalive=command(AudioControlAction::Keepalive,11,2);
    decision=session.accept(keepalive,host,1000);CHECK(decision.status==AudioControlStatus::Ok&&decision.refresh_lease);
    decision=session.accept(keepalive,host,14000);CHECK(decision.duplicate&&decision.refresh_lease);
    auto stale=command(AudioControlAction::Keepalive,11,1);CHECK(session.accept(stale,host,1001).status==AudioControlStatus::BadRequest);
    auto wrong=command(AudioControlAction::Stop,12,3);CHECK(session.accept(wrong,host,1002).status==AudioControlStatus::BadRequest);
    CHECK(session.poll(14000+kAudioControlTimeoutMs-1)==AudioLeaseExpiry::None);
    CHECK(session.poll(14000+kAudioControlTimeoutMs)==AudioLeaseExpiry::ControlTimeout&&!session.active());

    start=command(AudioControlAction::Start,12,4);CHECK(session.accept(start,host,0xffffff00U).start_capture);
    keepalive=command(AudioControlAction::Keepalive,12,5);CHECK(session.accept(keepalive,host,0xffffff00U+kAudioMaximumStreamMs-1).refresh_lease);
    CHECK(session.poll(0xffffff00U+kAudioMaximumStreamMs-1)==AudioLeaseExpiry::None);
    CHECK(session.poll(0xffffff00U+kAudioMaximumStreamMs)==AudioLeaseExpiry::MaximumDuration);

    start=command(AudioControlAction::Start,13,6);CHECK(session.accept(start,host,50).start_capture);
    session.configure_source(other,true);CHECK(!session.active());
    CHECK(session.accept(command(AudioControlAction::Start,14,1),host,60).status==AudioControlStatus::Unauthorized);
}

void conversion_recovery_and_overflow() {
    const std::array<std::int32_t,5> input{0,0x7fff0000,static_cast<std::int32_t>(0x80000000U),0x12345678,-0x12340000};
    std::array<std::int16_t,5> output{};convert_i2s_32_to_pcm16(input.data(),output.data(),output.size());
    CHECK(output[0]==0&&output[1]==32767&&output[2]==-32768&&output[3]==0x1234&&output[4]==-0x1234);
    AudioReadRecoveryPolicy recovery;
    CHECK(recovery.on_failure()==AudioReadRecoveryDecision::Continue);
    CHECK(recovery.on_failure()==AudioReadRecoveryDecision::RestartI2s);
    recovery.on_success();
    for(int cycle=0;cycle<2;++cycle){CHECK(recovery.on_failure()==AudioReadRecoveryDecision::Continue);CHECK(recovery.on_failure()==AudioReadRecoveryDecision::RestartI2s);}
    CHECK(recovery.on_failure()==AudioReadRecoveryDecision::Continue);CHECK(recovery.on_failure()==AudioReadRecoveryDecision::Fault);
    AudioQueueOverflowPolicy overflow;CHECK(!overflow.drop_oldest_before_append(false));CHECK(overflow.drop_oldest_before_append(true));CHECK(overflow.dropped_frames()==1);
}

int main(){wire_golden_vectors();decode_and_reject_bad_packets();session_source_sequence_and_lease();conversion_recovery_and_overflow();return 0;}
