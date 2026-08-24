#include "board_pins.h"
#include "hid_report.h"
#include "input_core.h"

#include <array>
#include <cstdint>
#include <iostream>
#include <limits>

using namespace deskmate::easyinput;

namespace {
int failures = 0;

#define CHECK(expression) check((expression), #expression, __FILE__, __LINE__)

void check(bool passed, const char* expression, const char* file, int line) {
    if (passed) return;
    std::cerr << file << ':' << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

bool take(InputCore& core, InputEvent& event) {
    const bool available = core.pop_event(event);
    CHECK(available);
    return available;
}

void expect_no_event(InputCore& core) {
    InputEvent event{};
    CHECK(!core.pop_event(event));
}

void test_board_contract() {
    CHECK((kKeyGpios == std::array<int, 8>{2, 47, 38, 41, 1, 6, 7, 48}));
    CHECK(kEncoderAGpio == 17);
    CHECK(kEncoderBGpio == 16);
    CHECK(kEncoderPressGpio == 18);
    CHECK(kUsbDmGpio == 19);
    CHECK(kUsbDpGpio == 20);
}

void test_monotonic_time_boundaries() {
    CHECK(monotonic_milliseconds(0) == 0);
    CHECK(monotonic_milliseconds(999) == 0);
    CHECK(monotonic_milliseconds(1000) == 1);
    CHECK(monotonic_milliseconds(20'999) == 20);
    CHECK(monotonic_milliseconds(21'000) == 21);

    const uint32_t before_wrap = std::numeric_limits<uint32_t>::max() - 10u;
    const uint32_t after_wrap = 9u;
    CHECK(after_wrap - before_wrap == kDebounceMs);
}

void test_keys_press_hold_and_release_bounce() {
    InputCore core;
    InputEvent event{};
    core.scan_keys(0, 0);
    expect_no_event(core);

    core.scan_keys(0x01, 1);
    core.scan_keys(0x00, 5);
    core.scan_keys(0x01, 10);
    core.scan_keys(0x01, 29);
    expect_no_event(core);
    core.scan_keys(0x01, 30);
    if (take(core, event)) {
        CHECK(event.type == InputEventType::KeyPressed);
        CHECK(event.index == 0);
    }

    core.scan_keys(0x01, 500);
    core.scan_keys(0x01, 1000);
    expect_no_event(core);

    core.scan_keys(0x00, 1001);
    core.scan_keys(0x01, 1005);
    core.scan_keys(0x00, 1010);
    core.scan_keys(0x00, 1029);
    expect_no_event(core);
    core.scan_keys(0x00, 1030);
    if (take(core, event)) {
        CHECK(event.type == InputEventType::KeyReleased);
        CHECK(event.index == 0);
    }
    expect_no_event(core);
}

void test_keys_multi_key_and_reset() {
    InputCore core;
    InputEvent event{};
    core.scan_keys(0, 0);
    core.scan_keys(0xff, 1);
    core.scan_keys(0xff, 21);
    for (uint8_t i = 0; i < 8; ++i) {
        if (take(core, event)) {
            CHECK(event.type == InputEventType::KeyPressed);
            CHECK(event.index == i);
        }
    }
    expect_no_event(core);

    core.reset();
    core.scan_keys(0x01, 100);
    expect_no_event(core);
    core.scan_keys(0, 101);
    core.scan_keys(0, 121);
    if (take(core, event)) {
        CHECK(event.type == InputEventType::KeyReleased);
        CHECK(event.index == 0);
    }
}

void test_key_debounce_across_clock_wrap() {
    InputCore core;
    InputEvent event{};
    const uint32_t start = std::numeric_limits<uint32_t>::max() - 10u;
    core.scan_keys(0, start - 1u);
    core.scan_keys(0x01, start);
    core.scan_keys(0x01, 8u);
    expect_no_event(core);
    core.scan_keys(0x01, 9u);
    if (take(core, event)) CHECK(event.type == InputEventType::KeyPressed);
}

void rotate(InputCore& core, const std::array<uint8_t, 4>& phases, uint32_t& now) {
    for (uint8_t phase : phases) core.scan_encoder(phase, false, now++);
}

void test_encoder_directions_and_bounce() {
    InputCore core;
    InputEvent event{};
    core.scan_encoder(0, false, 0);
    uint32_t now = 1;
    rotate(core, {1, 3, 2, 0}, now);
    if (take(core, event)) {
        CHECK(event.type == InputEventType::EncoderStep);
        CHECK(event.value == 1);
    }
    rotate(core, {2, 3, 1, 0}, now);
    if (take(core, event)) CHECK(event.value == -1);

    core.scan_encoder(1, false, now++);
    core.scan_encoder(0, false, now++);
    rotate(core, {1, 3, 2, 0}, now);
    if (take(core, event)) CHECK(event.value == 1);
    expect_no_event(core);
}

void test_encoder_illegal_jump_and_reset_interrupt() {
    InputCore core;
    InputEvent event{};
    core.scan_encoder(0, false, 0);
    core.scan_encoder(1, false, 1);
    core.scan_encoder(3, false, 2);
    core.scan_encoder(0, false, 3);
    expect_no_event(core);

    uint32_t now = 4;
    rotate(core, {1, 3, 2, 0}, now);
    if (take(core, event)) CHECK(event.value == 1);

    core.scan_encoder(1, false, now++);
    core.scan_encoder(3, false, now++);
    core.reset();
    core.scan_encoder(0, false, now++);
    expect_no_event(core);
    rotate(core, {1, 3, 2, 0}, now);
    if (take(core, event)) CHECK(event.value == 1);
}

void test_encoder_press_bounce_and_hold() {
    InputCore core;
    InputEvent event{};
    core.scan_encoder(0, false, 0);
    core.scan_encoder(0, true, 1);
    core.scan_encoder(0, false, 5);
    core.scan_encoder(0, true, 10);
    core.scan_encoder(0, true, 30);
    if (take(core, event)) CHECK(event.type == InputEventType::EncoderPressed);
    core.scan_encoder(0, true, 500);
    expect_no_event(core);
    core.scan_encoder(0, false, 501);
    core.scan_encoder(0, true, 505);
    core.scan_encoder(0, false, 510);
    core.scan_encoder(0, false, 530);
    if (take(core, event)) CHECK(event.type == InputEventType::EncoderReleased);
}

void test_hid_release_and_modifier_only() {
    HeldKeyboardState state;
    CHECK(state.apply({HidUsage::A, 0x03, true}));
    auto report = state.report();
    CHECK(report[0] == 0x03);
    CHECK(report[2] == static_cast<uint8_t>(HidUsage::A));
    CHECK(state.apply({HidUsage::A, 0x03, false}));
    CHECK(state.report() == BootKeyboardReport{});

    CHECK(state.apply({HidUsage::None, 0x01, true}));
    CHECK(state.apply({HidUsage::None, 0x02, true}));
    CHECK(state.report()[0] == 0x03);
    CHECK(state.apply({HidUsage::None, 0x01, false}));
    CHECK(state.report()[0] == 0x02);
    CHECK(state.apply({HidUsage::None, 0x02, false}));
    CHECK(state.report() == BootKeyboardReport{});
}

void test_hid_concurrency_idempotence_and_release_all() {
    HeldKeyboardState state;
    CHECK(state.apply({HidUsage::A, 0x01, true}));
    CHECK(state.apply({HidUsage::B, 0x02, true}));
    const auto two_keys = state.report();
    CHECK(two_keys[0] == 0x03);
    CHECK(two_keys[2] == static_cast<uint8_t>(HidUsage::A));
    CHECK(two_keys[3] == static_cast<uint8_t>(HidUsage::B));
    CHECK(state.apply({HidUsage::A, 0x01, true}));
    CHECK(state.report() == two_keys);
    CHECK(state.apply({HidUsage::C, 0, false}));
    CHECK(state.report() == two_keys);
    CHECK(state.apply({HidUsage::A, 0, false}));
    auto one_key = state.report();
    CHECK(one_key[0] == 0x02);
    CHECK(one_key[2] == static_cast<uint8_t>(HidUsage::B));
    state.release_all();
    CHECK(state.report() == BootKeyboardReport{});
}

void test_hid_fail_closed_overflow() {
    HeldKeyboardState state;
    const std::array<HidUsage, 6> six = {
        HidUsage::A, HidUsage::B, HidUsage::C, HidUsage::D, HidUsage::E, HidUsage::F};
    for (HidUsage usage : six) CHECK(state.apply({usage, 0, true}));
    const auto full = state.report();
    CHECK(!state.apply({HidUsage::G, 0x02, true}));
    CHECK(state.report() == full);
    CHECK(state.apply({HidUsage::C, 0, false}));
    CHECK(state.apply({HidUsage::G, 0x02, true}));
    const auto replaced = state.report();
    CHECK(replaced[0] == 0x02);
    CHECK(replaced[4] == static_cast<uint8_t>(HidUsage::G));
}
}  // namespace

int main() {
    test_board_contract();
    test_monotonic_time_boundaries();
    test_keys_press_hold_and_release_bounce();
    test_keys_multi_key_and_reset();
    test_key_debounce_across_clock_wrap();
    test_encoder_directions_and_bounce();
    test_encoder_illegal_jump_and_reset_interrupt();
    test_encoder_press_bounce_and_hold();
    test_hid_release_and_modifier_only();
    test_hid_concurrency_idempotence_and_release_all();
    test_hid_fail_closed_overflow();
    if (failures != 0) {
        std::cerr << "input_core_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "input_core_tests: PASS\n";
    return 0;
}
