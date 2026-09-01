#include "audio_io_arbiter.h"

#include <cstdlib>
#include <iostream>

using namespace deskmate::easyinput;
#define CHECK(x) do { if (!(x)) { std::cerr << "check failed: " #x << '\n'; std::exit(1); } } while (0)

int main() {
    AudioIoArbiter arbiter;
    CHECK(!arbiter.try_begin_speaker(0));
    CHECK(arbiter.try_begin_speaker(10));
    CHECK(!arbiter.try_begin_speaker(11));
    CHECK(arbiter.request_microphone(20));
    CHECK(arbiter.microphone_requested());
    CHECK(arbiter.microphone_generation() == 20);
    CHECK(!arbiter.request_microphone(21));
    CHECK(arbiter.microphone_generation() == 20);
    CHECK(!arbiter.mark_microphone_ready(20));
    CHECK(!arbiter.mark_microphone_ready(21));
    CHECK(!arbiter.finish_speaker(9));
    CHECK(arbiter.finish_speaker(10));
    CHECK(arbiter.mark_microphone_ready(20));
    CHECK(arbiter.microphone_ready(20));
    CHECK(!arbiter.try_begin_speaker(12));
    CHECK(!arbiter.finish_microphone(19));
    CHECK(arbiter.microphone_generation() == 20);
    CHECK(arbiter.finish_microphone(20));
    CHECK(!arbiter.microphone_requested());
    CHECK(arbiter.try_begin_speaker(12));
    CHECK(arbiter.finish_speaker(12));
    std::cout << "audio io arbiter tests passed\n";
}
