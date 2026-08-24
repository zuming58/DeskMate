#include "input_runtime.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>

using namespace deskmate::easyinput;

namespace {
int failures = 0;
#define CHECK(value) check((value), #value, __FILE__, __LINE__)
void check(bool value, const char* expression, const char* file, int line) {
    if (value) return;
    std::cerr << file << ':' << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

InputEvent key(uint8_t index, bool pressed) {
    return {pressed ? InputEventType::KeyPressed : InputEventType::KeyReleased, index, 0};
}

void default_action_vectors() {
    constexpr std::array<uint8_t, 8> usages{0x2c, 0x28, 0x08, 0x2a, 0x04, 0x06, 0x19, 0x1d};
    constexpr std::array<uint8_t, 8> modifiers{3, 0, 3, 0, 1, 1, 1, 1};
    for (uint8_t index = 0; index < 8; ++index) {
        InputActionRouter router;
        const auto pressed = router.apply(key(index, true));
        CHECK(pressed.keyboard_changed);
        CHECK(pressed.keyboard.modifier == modifiers[index]);
        CHECK(pressed.keyboard.usages[0] == usages[index]);
        const auto duplicate = router.apply(key(index, true));
        CHECK(!duplicate.keyboard_changed);
        const auto released = router.apply(key(index, false));
        CHECK(released.keyboard_changed);
        CHECK(released.keyboard == KeyboardSnapshot{});
        CHECK(!router.apply(key(index, false)).keyboard_changed);
    }
}

void physical_source_ownership_and_overflow() {
    InputActionRouter router;
    const InputActionRouter::Chord same{HidUsage::A, 1};
    CHECK(router.apply_key_source(InputSourceId::S1, true, same).keyboard_changed);
    CHECK(!router.apply_key_source(InputSourceId::S2, true, same).keyboard_changed);
    CHECK(!router.apply_key_source(InputSourceId::S1, false, same).keyboard_changed);
    CHECK(router.keyboard().usages[0] == 0x04);
    CHECK(router.apply_key_source(InputSourceId::S2, false, same).keyboard_changed);
    CHECK(router.keyboard() == KeyboardSnapshot{});

    constexpr std::array<HidUsage, 7> usages{
        HidUsage::A, HidUsage::B, HidUsage::C, HidUsage::D,
        HidUsage::E, HidUsage::F, HidUsage::G};
    for (size_t i = 0; i < 6; ++i) {
        CHECK(router.apply_key_source(static_cast<InputSourceId>(i), true, {usages[i], 0}).keyboard_changed);
    }
    const auto full = router.keyboard();
    CHECK(!router.apply_key_source(InputSourceId::S7, true, {usages[6], 0}).keyboard_changed);
    CHECK(router.keyboard() == full);
    router.release_all();
    CHECK(router.keyboard() == KeyboardSnapshot{});
}

void encoder_axis_vectors() {
    InputActionRouter router;
    auto cw = router.apply({InputEventType::EncoderStep, 0, 1});
    CHECK(cw.wheel.vertical == -3 && cw.wheel.horizontal == 0);
    auto ccw = router.apply({InputEventType::EncoderStep, 0, -1});
    CHECK(ccw.wheel.vertical == 3 && ccw.wheel.horizontal == 0);
    router.apply({InputEventType::EncoderPressed, 0, 0});
    CHECK(router.axis() == ScrollAxis::Horizontal);
    cw = router.apply({InputEventType::EncoderStep, 0, 1});
    CHECK(cw.wheel.vertical == 0 && cw.wheel.horizontal == 3);
    router.apply({InputEventType::EncoderReleased, 0, 0});
    CHECK(router.axis() == ScrollAxis::Horizontal);
    router.apply({InputEventType::EncoderPressed, 0, 0});
    CHECK(router.axis() == ScrollAxis::Vertical);
}

void lifetime_and_disconnect_safety() {
    UsbInputRuntime runtime;
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_mount();
    CHECK(runtime.diagnostics().usb_mount_epoch == 1);
    runtime.on_input(key(0, false));
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 1);
    runtime.on_unmount();
    CHECK(runtime.queued_reports() == 0);
    runtime.on_mount();
    CHECK(runtime.diagnostics().usb_mount_epoch == 2);
    runtime.on_resume();
    CHECK(runtime.diagnostics().usb_mount_epoch == 2);
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input(key(0, false));
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 1);
}

void queue_failure_release_and_wheel_boundaries() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    for (int i = 0; i < 16; ++i) {
        runtime.on_input({InputEventType::EncoderStep, 0, static_cast<int8_t>(i % 2 == 0 ? 1 : -1)});
    }
    CHECK(runtime.queued_reports() == 16);
    runtime.on_input(key(0, true));
    CHECK(runtime.diagnostics().hid_report_drops == 1);
    CHECK(runtime.queued_reports() == 1);
    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    CHECK(report.kind == HidReportKind::Keyboard);
    const std::array<uint8_t, 8> zero_report{};
    CHECK(report.payload == zero_report);
    runtime.complete_report();
    runtime.on_input(key(0, false));
    runtime.on_input(key(1, true));
    runtime.on_transfer_failed();
    CHECK(runtime.diagnostics().hid_report_drops >= 2);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero_report);
}

void descriptor_and_vendor_fail_closed() {
    CHECK(kUsbVid == 0x303a && kUsbPid == 0x1006);
    CHECK(kKeyboardReportId == 1 && kMouseReportId == 2);
    const auto has = [](std::initializer_list<uint8_t> pattern) {
        return std::search(kHidReportDescriptor, kHidReportDescriptor + kHidReportDescriptorSize,
                           pattern.begin(), pattern.end()) != kHidReportDescriptor + kHidReportDescriptorSize;
    };
    CHECK(has({0x85, 0x01})); CHECK(has({0x85, 0x02}));
    CHECK(has({0x85, 0x10, 0x15, 0x00})); CHECK(has({0x95, 0x3f}));
    CHECK(has({0x85, 0x12})); CHECK(has({0x95, 0x10}));
    CHECK(has({0x85, 0x15}));
    UsbInputRuntime runtime;
    const auto before = runtime.diagnostics();
    const uint8_t payload[2]{1, 2};
    for (uint8_t id = 0x10; id <= 0x15; ++id) CHECK(!runtime.reject_vendor_feature(id, payload, 2));
    const auto after = runtime.diagnostics();
    CHECK(before.raw_edge_drops == after.raw_edge_drops);
    CHECK(before.hid_report_drops == after.hid_report_drops);
}

void diagnostics_are_saturating_and_redacted() {
    UsbInputRuntime runtime;
    runtime.on_raw_edge_drops(UINT32_MAX);
    runtime.on_raw_edge_drops(1);
    runtime.on_input_event_drops(7);
    runtime.on_encoder_resync();
    const auto snapshot = runtime.diagnostics();
    CHECK(snapshot.raw_edge_drops == UINT32_MAX);
    CHECK(snapshot.input_event_drops == 7);
    CHECK(snapshot.encoder_resyncs == 1);
    CHECK(sizeof(RuntimeDiagnosticsSnapshot) == 5 * sizeof(uint32_t));
}

void input_drop_recovery_waits_for_release() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    runtime.on_input(key(0, true));
    runtime.recover_after_input_drop(0x01);
    CHECK(runtime.queued_reports() == 1);
    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    const std::array<uint8_t, 8> zero{};
    CHECK(report.payload == zero);
    runtime.complete_report();
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input(key(0, false));
    runtime.on_input(key(1, true));
    CHECK(runtime.queued_reports() == 1);
}
}

int main() {
    default_action_vectors();
    physical_source_ownership_and_overflow();
    encoder_axis_vectors();
    lifetime_and_disconnect_safety();
    queue_failure_release_and_wheel_boundaries();
    descriptor_and_vendor_fail_closed();
    diagnostics_are_saturating_and_redacted();
    input_drop_recovery_waits_for_release();
    if (failures) {
        std::cerr << "input_runtime_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "input_runtime_tests: PASS\n";
    return 0;
}
