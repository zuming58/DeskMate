#include "board_pins.h"
#include "hid_report.h"
#include "input_core.h"

#include <cassert>
#include <cstdint>
#include <iostream>

using namespace deskmate::easyinput;

static InputEvent next(InputCore& core) {
    InputEvent event{};
    assert(core.pop_event(event));
    return event;
}

static void test_pins() {
    assert((kKeyGpios == std::array<int, 8>{2, 47, 38, 41, 1, 6, 7, 48}));
    assert(kEncoderAGpio == 17 && kEncoderBGpio == 16 && kEncoderPressGpio == 18);
    assert(kUsbDmGpio == 19 && kUsbDpGpio == 20);
}

static void test_keys_and_debounce() {
    InputCore core;
    core.scan_keys(0, 0); // startup state is quiet
    InputEvent event{};
    assert(!core.pop_event(event));
    core.scan_keys(0x01, 1);
    core.scan_keys(0x00, 5); // bounce back
    core.scan_keys(0x01, 10);
    core.scan_keys(0x01, 29);
    assert(!core.pop_event(event));
    core.scan_keys(0x01, 30);
    event = next(core);
    assert(event.type == InputEventType::KeyPressed && event.index == 0);
    core.scan_keys(0xff, 31); // simultaneous transitions start together
    core.scan_keys(0xff, 51);
    for (uint8_t i = 1; i < 8; ++i) {
        event = next(core);
        assert(event.type == InputEventType::KeyPressed && event.index == i);
    }
    core.scan_keys(0, 52);
    core.scan_keys(0, 72);
    for (uint8_t i = 0; i < 8; ++i) {
        event = next(core);
        assert(event.type == InputEventType::KeyReleased && event.index == i);
    }
    assert(!core.pop_event(event));
    core.reset();
    core.scan_keys(0x01, 100); // reboot samples its initial physical state quietly
    assert(!core.pop_event(event));
}

static void test_encoder() {
    InputCore core;
    core.scan_encoder(3, false, 0); // non-zero startup phase must be quiet
    InputEvent event{};
    assert(!core.pop_event(event));
    core.scan_encoder(0, false, 1); // a two-bit reset-like jump is discarded
    assert(!core.pop_event(event));
    const uint8_t clockwise[] = {1, 3, 2, 0};
    uint32_t now = 2;
    for (auto phase : clockwise) core.scan_encoder(phase, false, now++);
    event = next(core);
    assert(event.type == InputEventType::EncoderStep && event.value == 1);
    const uint8_t counterclockwise[] = {2, 3, 1, 0};
    for (auto phase : counterclockwise) core.scan_encoder(phase, false, now++);
    event = next(core);
    assert(event.type == InputEventType::EncoderStep && event.value == -1);
    core.scan_encoder(3, false, now++); // illegal 00 -> 11 jump is ignored
    assert(!core.pop_event(event));
    core.scan_encoder(0, true, 100);
    core.scan_encoder(0, true, 121);
    event = next(core);
    assert(event.type == InputEventType::EncoderPressed);
    core.scan_encoder(0, true, 200); // held and repeated samples do not repeat
    assert(!core.pop_event(event));
    core.scan_encoder(0, false, 201);
    core.scan_encoder(0, false, 222);
    event = next(core);
    assert(event.type == InputEventType::EncoderReleased);
}

static void test_hid_boundary() {
    const HidAction down{HidUsage::A, 0x02, true};
    const auto report = encode_boot_keyboard(down);
    assert(report[0] == 0x02 && report[2] == 0x04);
    const auto up = encode_boot_keyboard({HidUsage::A, 0x02, false});
    assert(up[0] == 0x02 && up[2] == 0);
}

int main() {
    test_pins();
    test_keys_and_debounce();
    test_encoder();
    test_hid_boundary();
    std::cout << "input_core_tests: PASS\n";
}
