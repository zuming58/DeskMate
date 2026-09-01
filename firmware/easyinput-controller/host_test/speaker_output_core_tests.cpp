#include "speaker_output_core.h"

#include <cstdlib>
#include <iostream>
#include <string>

using namespace deskmate::easyinput;
#define CHECK(x) do { if (!(x)) { std::cerr << "check failed: " #x << '\n'; std::exit(1); } } while (0)

int main() {
    static_assert(kSpeakerSampleRate == 48000);
    static_assert(kSpeakerFrameSamples == 480);
    static_assert(kSpeakerNormalDrainZeroFrames == 6);
    static_assert(kSpeakerFirstPcmQueueUpperBoundUs == 30000);

    CHECK(std::string(speaker_output_state_name(SpeakerOutputState::Disabled)) ==
          "disabled");
    CHECK(std::string(speaker_output_state_name(SpeakerOutputState::Ready)) ==
          "ready");
    CHECK(std::string(speaker_output_state_name(SpeakerOutputState::Starting)) ==
          "starting");
    CHECK(std::string(speaker_output_state_name(SpeakerOutputState::Playing)) ==
          "playing");
    CHECK(std::string(speaker_output_state_name(SpeakerOutputState::Faulted)) ==
          "faulted");
    std::cout << "speaker output core tests passed\n";
}
