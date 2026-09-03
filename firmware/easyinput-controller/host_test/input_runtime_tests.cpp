#include "input_runtime.h"
#include "motion_preset_bridge_core.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <vector>

using namespace deskmate::easyinput;

namespace {
int failures = 0;
constexpr std::array<uint8_t, 8> kZeroKeyboardPayload{};
#define CHECK(value) check((value), #value, __FILE__, __LINE__)
void check(bool value, const char* expression, const char* file, int line) {
    if (value) return;
    std::cerr << file << ':' << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

InputEvent key(uint8_t index, bool pressed) {
    return {pressed ? InputEventType::KeyPressed : InputEventType::KeyReleased, index, 0};
}

void consume_mount_release(UsbInputRuntime& runtime) {
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero_report{};
    CHECK(runtime.queued_reports() >= 1);
    while (runtime.queued_reports() != 0) {
        CHECK(runtime.front_report(report));
        CHECK(report.kind == HidReportKind::Keyboard);
        CHECK(report.payload == zero_report);
        runtime.complete_report();
    }
    runtime.service_release_reassertion(0);
    runtime.service_release_reassertion(kUsbReleaseReassertWindowMs);
}

std::array<uint8_t, 9> wire_keyboard_report(
    const QueuedHidReport& report) {
    std::array<uint8_t, 9> wire{};
    wire[0] = report.report_id;
    std::copy_n(report.payload.begin(), report.length, wire.begin() + 1);
    return wire;
}

UsbLifecycleEvent transfer_event(UsbLifecycleEventKind kind, uint32_t epoch,
                                 const QueuedHidReport& report) {
    const auto wire = wire_keyboard_report(report);
    return make_usb_transfer_event(kind, epoch, wire.data(),
                                   static_cast<uint16_t>(report.length + 1u));
}

struct ParsedReportLengths {
    std::array<uint16_t, 256> input_bits{};
    std::array<uint16_t, 256> output_bits{};
    std::array<uint16_t, 256> feature_bits{};
};

ParsedReportLengths parse_report_descriptor() {
    ParsedReportLengths parsed{};
    uint32_t report_size = 0;
    uint32_t report_count = 0;
    uint8_t report_id = 0;
    for (size_t offset = 0; offset < kHidReportDescriptorSize;) {
        const uint8_t prefix = kHidReportDescriptor[offset++];
        CHECK(prefix != 0xfe);
        if (prefix == 0xfe) break;
        const size_t byte_count = (prefix & 0x03u) == 3 ? 4 : (prefix & 0x03u);
        uint32_t value = 0;
        for (size_t index = 0; index < byte_count; ++index) {
            CHECK(offset < kHidReportDescriptorSize);
            if (offset >= kHidReportDescriptorSize) return parsed;
            value |= static_cast<uint32_t>(kHidReportDescriptor[offset++]) << (8u * index);
        }
        const uint8_t type = static_cast<uint8_t>((prefix >> 2u) & 0x03u);
        const uint8_t tag = static_cast<uint8_t>((prefix >> 4u) & 0x0fu);
        if (type == 1 && tag == 7) report_size = value;
        if (type == 1 && tag == 8) report_id = static_cast<uint8_t>(value);
        if (type == 1 && tag == 9) report_count = value;
        if (type == 0 && (tag == 8 || tag == 9 || tag == 11)) {
            const uint32_t bits = report_size * report_count;
            CHECK(bits <= UINT16_MAX);
            if (tag == 8) parsed.input_bits[report_id] += static_cast<uint16_t>(bits);
            if (tag == 9) parsed.output_bits[report_id] += static_cast<uint16_t>(bits);
            if (tag == 11) parsed.feature_bits[report_id] += static_cast<uint16_t>(bits);
        }
    }
    return parsed;
}

void drain_input_events(InputCore& input, UsbInputRuntime& runtime) {
    InputEvent event{};
    while (input.pop_event(event)) runtime.on_input(event);
}

void scan_owner_inputs(InputCore& input, UsbInputRuntime& runtime,
                       uint8_t raw_key_mask, uint32_t now_ms) {
    input.scan_keys(raw_key_mask, now_ms);
    runtime.observe_physical_key_mask(input.stable_key_mask());
    drain_input_events(input, runtime);
    runtime.service_release_reassertion(now_ms);
}

void add_encoder_detent(InputCore& input, uint32_t& now) {
    for (const uint8_t phase : std::array<uint8_t, 4>{1, 3, 2, 0}) {
        input.scan_encoder_phase(phase, now++);
    }
}

void default_action_vectors() {
    constexpr std::array<uint8_t, 8> usages{0x2c, 0x28, 0x08, 0x2a, 0x04, 0x06, 0x19, 0x1d};
    constexpr std::array<uint8_t, 8> modifiers{3, 0, 3, 0, 1, 1, 1, 1};
    constexpr std::array<bool, 8> tap{false, true, false, true,
                                      true, true, true, true};
    for (uint8_t index = 0; index < 8; ++index) {
        InputActionRouter router;
        const auto pressed = router.apply(key(index, true));
        CHECK(pressed.keyboard_changed);
        CHECK(pressed.keyboard.modifier == modifiers[index]);
        CHECK(pressed.keyboard.usages[0] == usages[index]);
        CHECK(pressed.keyboard_restore_pending == tap[index]);
        if (tap[index]) CHECK(pressed.keyboard_restore == KeyboardSnapshot{});
        const auto duplicate = router.apply(key(index, true));
        CHECK(!duplicate.keyboard_changed);
        const auto released = router.apply(key(index, false));
        CHECK(released.keyboard_changed == !tap[index]);
        if (!tap[index]) CHECK(released.keyboard == KeyboardSnapshot{});
        CHECK(!router.apply(key(index, false)).keyboard_changed);
    }
}

void configuration_replacement_releases_host_and_applies_cursor() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);
    runtime.on_input(key(0, true));
    ConfigProjection projection{};
    projection.encoder_cursor = true;
    projection.encoder_speed = 4;
    projection.keys[0] = {ConfigActionKind::VoiceInput, 3, 0x2c};
    runtime.set_configuration(projection);
    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    CHECK(report.kind == HidReportKind::Keyboard);
    CHECK(report.payload == kZeroKeyboardPayload);
    runtime.complete_report();
    runtime.on_input(key(0, false));
    while (runtime.front_report(report)) runtime.complete_report();
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.front_report(report));
    CHECK(report.kind == HidReportKind::Keyboard);
    CHECK(report.payload[2] == 0x51 || report.payload[2] == 0x52);
}

void loaded_safe_configuration_preserves_voice_shortcuts() {
    ConfigProjection projection{};
    CHECK(parse_config_projection(compiled_safe_config_json(), projection));
    InputActionRouter router;
    router.set_configuration(projection);

    const auto voice = router.apply(key(0, true));
    CHECK(voice.keyboard_changed);
    CHECK(voice.keyboard.modifier == 0x03);
    CHECK(voice.keyboard.usages[0] == 0x2c);
    CHECK(!voice.keyboard_restore_pending);
    CHECK(router.apply(key(0, false)).keyboard_changed);

    const auto edit = router.apply(key(2, true));
    CHECK(edit.keyboard_changed);
    CHECK(edit.keyboard.modifier == 0x03);
    CHECK(edit.keyboard.usages[0] == 0x08);
    CHECK(!edit.keyboard_restore_pending);
    CHECK(router.apply(key(2, false)).keyboard_changed);
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

    for (size_t i = 0; i < 6; ++i) {
        CHECK(router.apply_key_source(static_cast<InputSourceId>(i), true,
                                      {usages[i], 0}).keyboard_changed);
    }
    const auto held_full = router.keyboard();
    const auto rejected_tap = router.apply_tap_source(
        InputSourceId::S7, true, {usages[6], 0x01});
    CHECK(!rejected_tap.keyboard_changed);
    CHECK(router.keyboard() == held_full);
    CHECK(!router.apply_tap_source(InputSourceId::S7, false,
                                   {usages[6], 0x01}).keyboard_changed);
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

void configured_encoder_actions_follow_maker_semantics() {
    InputActionRouter router;
    ConfigProjection projection{};
    projection.encoder_press.kind = ConfigActionKind::Disabled;
    projection.encoder_enabled = false;
    router.set_configuration(projection);
    CHECK(!router.apply({InputEventType::EncoderStep, 0, 1}).wheel_changed);
    router.apply({InputEventType::EncoderPressed, 0, 0});
    CHECK(router.axis() == ScrollAxis::Vertical);

    projection.encoder_enabled = true;
    projection.encoder_press.kind = ConfigActionKind::EncoderAxisToggle;
    router.set_configuration(projection);
    router.apply({InputEventType::EncoderPressed, 0, 0});
    CHECK(router.axis() == ScrollAxis::Horizontal);

    projection.encoder_cursor = true;
    projection.encoder_horizontal = true;
    projection.encoder_press.kind = ConfigActionKind::TextCaretSelect;
    router.set_configuration(projection);
    auto plain = router.apply({InputEventType::EncoderStep, 0, 1});
    CHECK(plain.keyboard_changed && plain.keyboard.modifier == 0);
    router.apply({InputEventType::EncoderPressed, 0, 0});
    auto selected = router.apply({InputEventType::EncoderStep, 0, 1});
    CHECK(selected.keyboard_changed && selected.keyboard.modifier == 2);
    router.apply({InputEventType::EncoderPressed, 0, 0});
    CHECK(router.apply({InputEventType::EncoderStep, 0, 1}).keyboard.modifier == 0);
}

void tap_actions_restore_without_waiting_for_physical_release() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);

    runtime.on_input(key(5, true));
    CHECK(runtime.queued_reports() == 2);
    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    CHECK(report.kind == HidReportKind::Keyboard);
    CHECK(report.payload[0] == 0x01);
    CHECK(report.payload[2] == 0x06);
    runtime.complete_report();
    CHECK(runtime.front_report(report));
    CHECK(report.payload == kZeroKeyboardPayload);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);

    // The physical key is still held. A duplicate edge cannot create another
    // tap, and physical release is a local source-state conclusion only.
    runtime.on_input(key(5, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input(key(5, false));
    CHECK(runtime.queued_reports() == 0);

    runtime.on_input(key(5, true));
    CHECK(runtime.queued_reports() == 2);
    runtime.complete_report();
    runtime.complete_report();
}

void tap_actions_restore_concurrent_held_voice_snapshot() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);

    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 1);
    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 0x03);
    CHECK(report.payload[2] == 0x2c);
    runtime.complete_report();

    runtime.on_input(key(5, true));
    CHECK(runtime.queued_reports() == 2);
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 0x03);
    CHECK(report.payload[2] == 0x2c);
    CHECK(report.payload[3] == 0x06);
    runtime.complete_report();
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 0x03);
    CHECK(report.payload[2] == 0x2c);
    CHECK(report.payload[3] == 0);
    runtime.complete_report();

    runtime.on_input(key(5, false));
    runtime.on_input(key(0, false));
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == kZeroKeyboardPayload);
    runtime.complete_report();
}

void tap_pair_admission_and_transfer_fail_closed() {
    UsbInputRuntime exact_fit;
    exact_fit.on_mount();
    consume_mount_release(exact_fit);
    for (int index = 0; index < 14; ++index) {
        exact_fit.on_input({InputEventType::EncoderStep, 0,
                            static_cast<int8_t>(index % 2 == 0 ? 1 : -1)});
    }
    exact_fit.on_input(key(5, true));
    CHECK(exact_fit.queued_reports() == kHidReportQueueCapacity);
    QueuedHidReport report{};
    for (int index = 0; index < 14; ++index) exact_fit.complete_report();
    CHECK(exact_fit.front_report(report));
    CHECK(report.payload[0] == 0x01);
    CHECK(report.payload[2] == 0x06);
    exact_fit.complete_report();
    CHECK(exact_fit.front_report(report));
    CHECK(report.payload == kZeroKeyboardPayload);

    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);

    // Fifteen alternating wheel reports leave only one slot. A tap requires
    // two consecutive slots, so neither Ctrl+C report is admitted.
    for (int index = 0; index < 15; ++index) {
        runtime.on_input({InputEventType::EncoderStep, 0,
                          static_cast<int8_t>(index % 2 == 0 ? 1 : -1)});
    }
    CHECK(runtime.queued_reports() == 15);
    runtime.on_input(key(5, true));
    CHECK(runtime.diagnostics().hid_report_drops == 2);
    CHECK(runtime.queued_reports() == 1);
    report = {};
    CHECK(runtime.front_report(report));
    CHECK(report.payload == kZeroKeyboardPayload);
    runtime.complete_report();
    runtime.on_input(key(5, false));

    // Delayed readiness leaves both reports intact. A failed accepted press
    // clears its pending restore and replaces the sequence with all-released.
    runtime.on_unmount();
    runtime.on_mount();
    consume_mount_release(runtime);
    runtime.on_input(key(5, true));
    HidReportTransferState transfer{};
    CHECK(!prepare_hid_report(runtime, false, transfer, report));
    CHECK(runtime.queued_reports() == 2);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(transfer.active);
    runtime.on_transfer_failed();
    transfer.clear();
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == kZeroKeyboardPayload);
}

void completed_tap_precedes_disconnect_while_key_remains_held() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);
    runtime.on_input(key(5, true));
    CHECK(runtime.queued_reports() == 2);

    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 0x01);
    runtime.complete_report();
    CHECK(runtime.front_report(report));
    CHECK(report.payload == kZeroKeyboardPayload);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);

    // At unplug time the last report accepted by the old endpoint is already
    // all-released even though S6 is physically still down.
    runtime.on_unmount();
    runtime.on_mount();
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == kZeroKeyboardPayload);
    while (runtime.queued_reports() != 0) runtime.complete_report();
    runtime.on_input(key(5, false));
    while (runtime.queued_reports() != 0) runtime.complete_report();
    runtime.service_release_reassertion(0);
    runtime.service_release_reassertion(kUsbReleaseReassertWindowMs);
    runtime.on_input(key(5, true));
    CHECK(runtime.queued_reports() == 2);
}

void lifetime_and_disconnect_safety() {
    UsbInputRuntime runtime;
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_mount();
    CHECK(runtime.diagnostics().usb_mount_epoch == 1);
    consume_mount_release(runtime);
    runtime.on_input(key(0, false));
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 1);
    runtime.on_unmount();
    CHECK(runtime.queued_reports() == 0);
    runtime.on_mount();
    CHECK(runtime.diagnostics().usb_mount_epoch == 2);
    consume_mount_release(runtime);
    runtime.on_resume();
    CHECK(runtime.diagnostics().usb_mount_epoch == 2);
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input(key(0, false));
    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 1);
}

void cold_boot_held_s6_release_barrier() {
    constexpr uint8_t s6_mask = 1u << 5;
    InputCore input;
    UsbInputRuntime runtime;
    UsbLifecycleEventQueue events;
    UsbCallbackLifecycleState callback;
    HidReportTransferState transfer;
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero_report{};

    // The key is already held before this fresh runtime sees its first scan.
    scan_owner_inputs(input, runtime, s6_mask, 0);
    CHECK(runtime.queued_reports() == 0);
    const auto mount = callback.on_mount();
    CHECK(events.publish(mount));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(runtime.mounted());
    CHECK(runtime.diagnostics().usb_mount_epoch == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero_report);

    // HID not ready leaves the release barrier queued; readiness may be delayed.
    CHECK(!prepare_hid_report(runtime, false, transfer, report));
    CHECK(runtime.queued_reports() == 1);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(transfer.active);

    // Every mount callback starts a new endpoint lifetime, including a BUS
    // reset that did not deliver an unmount first.
    CHECK(events.publish(callback.on_mount()));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(runtime.diagnostics().usb_mount_epoch == 2);
    CHECK(!transfer.active);

    // Every input remains suppressed while the boot-time key is held.
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.queued_reports() == 1);

    // A completion from the old endpoint is ignored; the new mount release
    // still needs its own completion.
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete, 1, report)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 1);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, report)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 1);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, report)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 0);
    CHECK(runtime.mounted());

    // Debounced physical release has no Press owner in this fresh runtime,
    // but must enqueue a new all-released report after the first one completed.
    scan_owner_inputs(input, runtime, 0, 10);
    scan_owner_inputs(input, runtime, 0, 30);
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero_report);

    // Exercise both local send rejection and callback failure; each retains a
    // retryable release report and never replays the old wheel event.
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, false, transfer);
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 1);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferFailed,
        callback.snapshot().epoch, report)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 1);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, report)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 0);

    // Only a new physical press after the completed release barrier can emit
    // the atomic Ctrl+C then all-released tap pair.
    scan_owner_inputs(input, runtime, s6_mask, 40);
    scan_owner_inputs(input, runtime, s6_mask, 60);
    CHECK(runtime.queued_reports() == 2);
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 1);
    CHECK(report.payload[2] == 0x06);
}

void cold_boot_release_before_mount_report_complete() {
    constexpr uint8_t s6_mask = 1u << 5;
    InputCore input;
    UsbInputRuntime runtime;
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero_report{};

    scan_owner_inputs(input, runtime, s6_mask, 0);
    runtime.on_mount(1);
    CHECK(runtime.queued_reports() == 1);

    // The held key is released while the mount-time zero report is still at
    // the queue head. The release must append a distinct confirmation report.
    scan_owner_inputs(input, runtime, 0, 10);
    scan_owner_inputs(input, runtime, 0, 30);
    CHECK(runtime.queued_reports() == 2);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero_report);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 1);

    // Completing the old mount report cannot unlock input.
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero_report);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);

    runtime.on_input(key(5, true));
    CHECK(runtime.queued_reports() == 2);
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 1);
    CHECK(report.payload[2] == 0x06);
}

void mount_before_first_cold_boot_scan() {
    constexpr uint8_t s6_mask = 1u << 5;
    InputCore input;
    UsbInputRuntime runtime;
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero_report{};

    runtime.on_mount(1);
    CHECK(runtime.queued_reports() == 1);

    // The owner observes the already-held S6 before the queued mount report
    // can complete. That report cannot unlock the release barrier.
    scan_owner_inputs(input, runtime, s6_mask, 0);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero_report);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero_report);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.queued_reports() == 0);

    scan_owner_inputs(input, runtime, 0, 10);
    scan_owner_inputs(input, runtime, 0, 30);
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero_report);
    runtime.complete_report();

    runtime.on_input(key(5, true));
    CHECK(runtime.queued_reports() == 2);
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 1);
    CHECK(report.payload[2] == 0x06);
}

void mount_release_repeat_requires_held_state() {
    constexpr uint8_t s6_mask = 1u << 5;
    UsbInputRuntime runtime;
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero{};

    // A normal empty mount has exactly one release report.
    runtime.on_mount(1);
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);

    // If the first scan discovers a key only after that report completed,
    // one additional zero report re-establishes the new physical baseline.
    runtime.observe_physical_key_mask(s6_mask);
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);
    runtime.observe_physical_key_mask(0);
    runtime.on_input(key(5, false));
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    runtime.complete_report();

    // A reconnect with S6 held requires the post-completion reassertion.
    runtime.on_input(key(5, true));
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 1);
    CHECK(report.payload[2] == 0x06);
    runtime.complete_report();
    runtime.on_unmount();
    runtime.on_mount(2);
    CHECK(runtime.queued_reports() == 1);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);
}

void timed_release_reassertion_and_raw_loss() {
    UsbInputRuntime runtime;
    HidReportTransferState transfer;
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero{};

    runtime.observe_physical_key_mask(0);
    runtime.on_mount(1);
    constexpr uint32_t start = UINT32_MAX - 200;
    runtime.service_release_reassertion(start);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);

    // Delayed HID readiness cannot consume or age out the required release.
    CHECK(!prepare_hid_report(runtime, false, transfer, report));
    runtime.service_release_reassertion(start + kUsbReleaseReassertWindowMs);
    CHECK(runtime.queued_reports() == 1);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    runtime.complete_report();
    transfer.clear();

    // The 500 ms window starts only after delayed delivery completes. Exercise
    // its exact interval and end boundaries across uint32_t wraparound.
    constexpr uint32_t delivered_at =
        start + kUsbReleaseReassertWindowMs;
    runtime.service_release_reassertion(delivered_at);
    runtime.service_release_reassertion(delivered_at + 24);
    CHECK(runtime.queued_reports() == 0);
    runtime.service_release_reassertion(delivered_at + 25);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    runtime.complete_report();
    runtime.service_release_reassertion(delivered_at + 499);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    runtime.complete_report();
    runtime.service_release_reassertion(delivered_at + 500);
    CHECK(runtime.queued_reports() == 0);

    // A raw GPIO40 loss edge clears queued wheel/key state immediately but is
    // idempotent until physical presence returns. Debounced unmount is separate.
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.front_report(report));
    CHECK(report.kind == HidReportKind::Mouse);
    runtime.observe_raw_physical_presence(false);
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.kind == HidReportKind::Keyboard);
    CHECK(report.payload == zero);
    runtime.observe_raw_physical_presence(false);
    CHECK(runtime.queued_reports() == 1);
    runtime.observe_physical_presence(false);
    CHECK(!runtime.mounted());
    CHECK(runtime.queued_reports() == 0);
}

void ordered_lifetime_events_and_stale_completion() {
    UsbLifecycleEventQueue events;
    UsbInputRuntime runtime;
    HidReportTransferState transfer;

    CHECK(events.publish({UsbLifecycleEventKind::Mount, 1}));
    CHECK(events.publish({UsbLifecycleEventKind::Unmount, 1}));
    process_usb_lifecycle_events(events, runtime, transfer, {false, 1});
    CHECK(!runtime.mounted());
    CHECK(runtime.diagnostics().usb_mount_epoch == 0);
    CHECK(runtime.queued_reports() == 0);

    CHECK(events.publish({UsbLifecycleEventKind::Mount, 2}));
    CHECK(events.publish({UsbLifecycleEventKind::Mount, 2}));
    CHECK(events.publish({UsbLifecycleEventKind::TransferComplete, 1}));
    CHECK(events.publish({UsbLifecycleEventKind::TransferFailed, 1}));
    process_usb_lifecycle_events(events, runtime, transfer, {true, 2});
    CHECK(runtime.mounted());
    CHECK(runtime.diagnostics().usb_mount_epoch == 2);
    consume_mount_release(runtime);

    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 1);
    QueuedHidReport in_flight{};
    CHECK(runtime.front_report(in_flight));
    transfer.active = true;
    transfer.report = in_flight;
    CHECK(events.publish({UsbLifecycleEventKind::Unmount, 2}));
    CHECK(events.publish({UsbLifecycleEventKind::Mount, 3}));
    CHECK(events.publish({UsbLifecycleEventKind::TransferComplete, 2}));
    CHECK(events.publish({UsbLifecycleEventKind::TransferFailed, 2}));
    process_usb_lifecycle_events(events, runtime, transfer, {true, 3});
    CHECK(runtime.mounted());
    CHECK(runtime.diagnostics().usb_mount_epoch == 3);
    consume_mount_release(runtime);
    CHECK(!transfer.active);

    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input(key(0, false));
    runtime.on_input(key(1, true));
    CHECK(runtime.queued_reports() == 1);
}

void lifecycle_duplicate_mount_and_overflow_recovery() {
    UsbLifecycleEventQueue events;
    UsbCallbackLifecycleState callback;
    UsbInputRuntime runtime;
    HidReportTransferState transfer;

    const auto mount = callback.on_mount();
    const auto duplicate_mount = callback.on_mount();
    CHECK(mount.epoch == 1);
    CHECK(duplicate_mount.epoch == 2);
    CHECK(callback.snapshot().mounted);
    CHECK(events.publish(mount));
    CHECK(events.publish(duplicate_mount));
    process_usb_lifecycle_events(
        events, runtime, transfer, callback.snapshot());
    CHECK(runtime.mounted());
    CHECK(runtime.diagnostics().usb_mount_epoch == 2);
    consume_mount_release(runtime);

    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 1);
    QueuedHidReport in_flight{};
    CHECK(runtime.front_report(in_flight));
    transfer.active = true;
    transfer.report = in_flight;
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete, 2, in_flight)));
    process_usb_lifecycle_events(
        events, runtime, transfer, callback.snapshot());
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 0);

    for (size_t index = 0; index < kUsbLifecycleQueueCapacity; ++index) {
        CHECK(events.publish({UsbLifecycleEventKind::Resume, 2}));
    }
    CHECK(events.queued() == kUsbLifecycleQueueCapacity);
    const auto unmount = callback.on_unmount();
    CHECK(!callback.snapshot().mounted);
    CHECK(!events.publish(unmount));
    const auto recovered = process_usb_lifecycle_events(
        events, runtime, transfer, callback.snapshot());
    CHECK(recovered.dropped_events == 1);
    CHECK(!runtime.mounted());
    CHECK(runtime.queued_reports() == 0);
    CHECK(runtime.diagnostics().usb_lifecycle_drops == 1);

    const auto remount = callback.on_mount();
    CHECK(remount.epoch == 3);
}

void physical_presence_filters_loss_and_real_mount_is_authoritative() {
    UsbPhysicalPresenceMonitor monitor{25};
    monitor.reset(true, 100);
    CHECK(monitor.present());
    CHECK(!monitor.update(false, 101));
    CHECK(monitor.disconnect_pending());
    CHECK(!monitor.update(false, 125));
    CHECK(monitor.present());
    CHECK(monitor.update(false, 126));
    CHECK(!monitor.present());
    CHECK(!monitor.disconnect_pending());
    CHECK(monitor.update(true, 127));
    CHECK(monitor.present());

    // Unsigned elapsed-time arithmetic preserves the same 25 ms boundary
    // across the 32-bit millisecond counter wrap.
    monitor.reset(true, UINT32_MAX - 10);
    CHECK(!monitor.update(false, UINT32_MAX - 5));
    CHECK(!monitor.update(false, 18));
    CHECK(monitor.update(false, 19));
    CHECK(!monitor.present());

    UsbDeviceConnectionGate connection;
    CHECK(connection.next_action(false, false) ==
          UsbDeviceConnectionAction::None);
    CHECK(connection.next_action(true, true) ==
          UsbDeviceConnectionAction::None);
    CHECK(connection.next_action(true, false) ==
          UsbDeviceConnectionAction::Disconnect);
    // Failed platform actions remain pending for an owner-task retry.
    CHECK(connection.next_action(true, false) ==
          UsbDeviceConnectionAction::Disconnect);
    connection.mark_applied(UsbDeviceConnectionAction::Disconnect);
    CHECK(connection.next_action(true, false) ==
          UsbDeviceConnectionAction::None);
    CHECK(connection.next_action(true, true) ==
          UsbDeviceConnectionAction::Connect);
    connection.mark_applied(UsbDeviceConnectionAction::Connect);
    CHECK(connection.next_action(true, true) ==
          UsbDeviceConnectionAction::None);

    UsbCallbackLifecycleState callback;
    const auto event = callback.on_mount();
    CHECK(event.kind == UsbLifecycleEventKind::Mount);
    CHECK(event.epoch == 1);
    CHECK(callback.snapshot().mounted);

    // GPIO40 may still read absent when TinyUSB reports a real mount. That
    // callback is authoritative and must not be discarded: production gets
    // only this one mount notification, so the release report must remain
    // deliverable without a synthetic retry after the sense input recovers.
    UsbLifecycleEventQueue transient_events;
    UsbInputRuntime transient_runtime;
    HidReportTransferState transient_transfer;
    QueuedHidReport report{};
    transient_runtime.observe_physical_presence(false);
    CHECK(transient_events.publish(event));
    process_usb_lifecycle_events(transient_events, transient_runtime,
                                 transient_transfer, callback.snapshot());
    CHECK(transient_runtime.mounted());
    CHECK(transient_runtime.diagnostics().usb_mount_epoch == 1);
    CHECK(transient_runtime.front_report(report));
    const std::array<uint8_t, 8> zero{};
    CHECK(report.payload == zero);
    CHECK(!prepare_hid_report(transient_runtime, false, transient_transfer,
                              report));
    transient_runtime.observe_physical_presence(true);
    CHECK(callback.snapshot().epoch == 1);
    CHECK(prepare_hid_report(transient_runtime, true, transient_transfer,
                             report));
    finish_hid_send_attempt(transient_runtime, report, true,
                            transient_transfer);
    CHECK(transient_transfer.active);

    UsbLifecycleEventQueue events;
    UsbInputRuntime runtime;
    HidReportTransferState transfer;
    CHECK(events.publish(callback.on_mount()));
    callback.on_physical_disconnect();
    runtime.observe_physical_presence(false);
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(!runtime.mounted());
    CHECK(runtime.queued_reports() == 0);
}

void two_physical_reconnect_cycles_without_tinyusb_unmount() {
    constexpr uint8_t s6_mask = 1u << 5;
    UsbPhysicalPresenceMonitor monitor{25};
    UsbCallbackLifecycleState callback;
    UsbLifecycleEventQueue events;
    UsbInputRuntime runtime;
    HidReportTransferState transfer;
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero{};
    monitor.reset(true, 0);

    CHECK(events.publish(callback.on_mount()));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(runtime.diagnostics().usb_mount_epoch == 1);
    runtime.observe_physical_key_mask(0);
    consume_mount_release(runtime);

    for (uint32_t cycle = 0; cycle < 2; ++cycle) {
        runtime.observe_physical_key_mask(s6_mask);
        runtime.on_input(key(5, true));
        CHECK(runtime.front_report(report));
        CHECK(report.payload[0] == 1);
        CHECK(report.payload[2] == 0x06);
        runtime.complete_report();

        // GPIO40 loss is confirmed although tud_umount_cb is absent. Any old
        // wheel and keyboard state is discarded with the endpoint lifetime.
        runtime.on_input({InputEventType::EncoderStep, 0, 1});
        const uint32_t base = 100 + cycle * 100;
        CHECK(!monitor.update(false, base));
        CHECK(monitor.update(false, base + 25));
        callback.on_physical_disconnect();
        runtime.observe_physical_presence(false);
        CHECK(!callback.snapshot().mounted);
        CHECK(!runtime.mounted());
        CHECK(runtime.queued_reports() == 0);

        // Physical recovery does not mount and cannot replay held Ctrl or the
        // old relative wheel displacement.
        CHECK(monitor.update(true, base + 26));
        runtime.observe_physical_presence(true);
        runtime.on_input({InputEventType::EncoderStep, 0, 1});
        CHECK(!runtime.mounted());
        CHECK(runtime.queued_reports() == 0);

        // A real TinyUSB mount creates a fresh epoch even if a BUS reset omitted
        // the unmount callback. Held input remains suppressed behind zero.
        CHECK(events.publish(callback.on_mount()));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(runtime.diagnostics().usb_mount_epoch == cycle + 2);
        CHECK(runtime.front_report(report));
        CHECK(report.payload == zero);
        runtime.complete_report();
        CHECK(runtime.queued_reports() == 1);
        CHECK(runtime.front_report(report));
        CHECK(report.payload == zero);
        runtime.complete_report();
        runtime.on_input({InputEventType::EncoderStep, 0, 1});
        CHECK(runtime.queued_reports() == 0);

        // Release has no owner in this fresh lifetime, so it must produce and
        // complete a second zero before a new Ctrl+C press can be admitted.
        runtime.observe_physical_key_mask(0);
        runtime.on_input(key(5, false));
        CHECK(runtime.front_report(report));
        CHECK(report.payload == zero);
        runtime.complete_report();
        CHECK(runtime.queued_reports() == 0);

        runtime.on_input(key(5, true));
        CHECK(runtime.front_report(report));
        CHECK(report.payload[0] == 1);
        CHECK(report.payload[2] == 0x06);
        runtime.complete_report();
        runtime.on_input(key(5, false));
        CHECK(runtime.front_report(report));
        CHECK(report.payload == zero);
        runtime.complete_report();
        CHECK(runtime.queued_reports() == 0);
    }

    runtime.observe_physical_key_mask(s6_mask);
    runtime.on_input(key(5, true));
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 1);
    CHECK(report.payload[2] == 0x06);
}

void stale_ctrl_completion_cannot_retire_reconnect_release() {
    constexpr uint8_t s6_mask = 1u << 5;
    UsbCallbackLifecycleState callback;
    UsbLifecycleEventQueue events;
    UsbInputRuntime runtime;
    HidReportTransferState transfer;
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero{};

    CHECK(events.publish(callback.on_mount()));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    runtime.observe_physical_key_mask(0);
    CHECK(runtime.front_report(report));
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete, 1, report)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());

    for (uint32_t cycle = 0; cycle < 2; ++cycle) {
        runtime.observe_physical_key_mask(s6_mask);
        runtime.on_input(key(5, true));
        CHECK(runtime.front_report(report));
        CHECK(report.payload[0] == 1);
        CHECK(report.payload[2] == 0x06);
        CHECK(prepare_hid_report(runtime, true, transfer, report));
        finish_hid_send_attempt(runtime, report, true, transfer);
        const QueuedHidReport stale_ctrl = transfer.report;

        callback.on_physical_disconnect();
        runtime.observe_physical_presence(false);
        CHECK(!runtime.mounted());
        transfer.clear();

        CHECK(events.publish(callback.on_mount()));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(runtime.front_report(report));
        CHECK(report.payload == zero);
        CHECK(prepare_hid_report(runtime, true, transfer, report));
        finish_hid_send_attempt(runtime, report, true, transfer);
        const auto reconnect_release = transfer.report;

        // The callback samples the current epoch, but its wire bytes still
        // identify the old Ctrl+C transfer. It must not retire the new zero.
        CHECK(events.publish(transfer_event(
            UsbLifecycleEventKind::TransferComplete,
            callback.snapshot().epoch, stale_ctrl)));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(transfer.active);
        CHECK(runtime.queued_reports() == 1);
        CHECK(runtime.front_report(report));
        CHECK(report.payload == zero);

        // Wrong length and wrong Report ID also fail closed.
        const auto zero_wire = wire_keyboard_report(reconnect_release);
        CHECK(events.publish(make_usb_transfer_event(
            UsbLifecycleEventKind::TransferComplete,
            callback.snapshot().epoch, zero_wire.data(), 8)));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(transfer.active);
        std::array<uint8_t, 6> mouse_wire{};
        mouse_wire[0] = kMouseReportId;
        CHECK(events.publish(make_usb_transfer_event(
            UsbLifecycleEventKind::TransferComplete,
            callback.snapshot().epoch, mouse_wire.data(), mouse_wire.size())));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(transfer.active);

        CHECK(events.publish(transfer_event(
            UsbLifecycleEventKind::TransferComplete,
            callback.snapshot().epoch, reconnect_release)));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(!transfer.active);
        CHECK(runtime.queued_reports() == 1);
        CHECK(prepare_hid_report(runtime, true, transfer, report));
        finish_hid_send_attempt(runtime, report, true, transfer);
        CHECK(events.publish(transfer_event(
            UsbLifecycleEventKind::TransferComplete,
            callback.snapshot().epoch, transfer.report)));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(!transfer.active);
        CHECK(runtime.queued_reports() == 0);

        runtime.observe_physical_key_mask(0);
        runtime.on_input(key(5, false));
        CHECK(runtime.front_report(report));
        CHECK(report.payload == zero);
        CHECK(prepare_hid_report(runtime, true, transfer, report));
        finish_hid_send_attempt(runtime, report, true, transfer);

        // A late failure for the old Ctrl report cannot replace or consume
        // the physical-release confirmation.
        CHECK(events.publish(transfer_event(
            UsbLifecycleEventKind::TransferFailed,
            callback.snapshot().epoch, stale_ctrl)));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(transfer.active);
        CHECK(runtime.queued_reports() == 1);
        CHECK(events.publish(transfer_event(
            UsbLifecycleEventKind::TransferComplete,
            callback.snapshot().epoch, transfer.report)));
        process_usb_lifecycle_events(events, runtime, transfer,
                                     callback.snapshot());
        CHECK(!transfer.active);
        CHECK(runtime.queued_reports() == 0);

        runtime.on_input(key(5, true));
        CHECK(runtime.front_report(report));
        CHECK(report.payload[0] == 1);
        CHECK(report.payload[2] == 0x06);
        runtime.complete_report();
        runtime.on_input(key(5, false));
        CHECK(runtime.front_report(report));
        CHECK(report.payload == zero);
        runtime.complete_report();
    }
}

void stale_zero_completion_cannot_unlock_held_reconnect() {
    constexpr uint8_t s6_mask = 1u << 5;
    UsbCallbackLifecycleState callback;
    UsbLifecycleEventQueue events;
    UsbInputRuntime runtime;
    HidReportTransferState transfer;
    QueuedHidReport report{};
    const std::array<uint8_t, 8> zero{};

    // Leave the old lifetime's mount release in flight, then disconnect. Its
    // wire bytes are indistinguishable from the next lifetime's mount release.
    CHECK(events.publish(callback.on_mount()));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    runtime.observe_physical_key_mask(0);
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    const QueuedHidReport stale_zero = transfer.report;

    callback.on_physical_disconnect();
    runtime.observe_physical_presence(false);
    transfer.clear();
    runtime.observe_physical_key_mask(s6_mask);

    CHECK(events.publish(callback.on_mount()));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    const QueuedHidReport reconnect_mount_release = transfer.report;

    // At most one completion can remain from the old single in-flight HID
    // endpoint. Even if it is sampled with the current epoch and consumes the
    // identical mount release, a held physical key keeps the barrier closed.
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, stale_zero)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 1);
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.queued_reports() == 1);

    // The stale completion only retires the first zero. The fresh endpoint
    // still needs to send and complete the reasserted zero.
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, reconnect_mount_release)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(!transfer.active);
    CHECK(runtime.queued_reports() == 0);

    // Physical release has no Press owner in this lifetime and therefore must
    // create a second zero report. Only its own completion opens the barrier.
    runtime.observe_physical_key_mask(0);
    runtime.on_input(key(5, false));
    CHECK(runtime.front_report(report));
    CHECK(report.payload == zero);
    CHECK(prepare_hid_report(runtime, true, transfer, report));
    finish_hid_send_attempt(runtime, report, true, transfer);
    CHECK(events.publish(transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, transfer.report)));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot());
    CHECK(runtime.queued_reports() == 0);

    runtime.on_input(key(5, true));
    CHECK(runtime.front_report(report));
    CHECK(report.payload[0] == 1);
    CHECK(report.payload[2] == 0x06);
}

void queue_failure_release_and_wheel_boundaries() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);
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

void wheel_coalescing_boundaries_and_no_replay() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.queued_reports() == 1);
    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    CHECK(report.report_id == kMouseReportId);
    CHECK(report.length == 5);
    CHECK(static_cast<int8_t>(report.payload[3]) == -6);
    runtime.complete_report();

    for (int index = 0; index < 42; ++index) {
        runtime.on_input({InputEventType::EncoderStep, 0, -1});
    }
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(static_cast<int8_t>(report.payload[3]) == 126);
    runtime.on_input({InputEventType::EncoderStep, 0, -1});
    CHECK(runtime.queued_reports() == 2);
    runtime.complete_report();
    CHECK(runtime.front_report(report));
    CHECK(static_cast<int8_t>(report.payload[3]) == 3);
    runtime.complete_report();

    for (int index = 0; index < 42; ++index) {
        runtime.on_input({InputEventType::EncoderStep, 0, 1});
    }
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(static_cast<int8_t>(report.payload[3]) == -126);
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.queued_reports() == 2);
    runtime.complete_report();
    CHECK(runtime.front_report(report));
    CHECK(static_cast<int8_t>(report.payload[3]) == -3);
    runtime.complete_report();

    for (int index = 0; index < 16; ++index) {
        runtime.on_input({InputEventType::EncoderStep, 0,
                          static_cast<int8_t>(index % 2 == 0 ? 1 : -1)});
    }
    CHECK(runtime.queued_reports() == kHidReportQueueCapacity);
    runtime.on_input({InputEventType::EncoderStep, 0, 1});
    CHECK(runtime.diagnostics().hid_report_drops == 1);
    CHECK(runtime.queued_reports() == 1);
    CHECK(runtime.front_report(report));
    CHECK(report.kind == HidReportKind::Keyboard);
    const std::array<uint8_t, 8> zero_report{};
    CHECK(report.payload == zero_report);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);
    runtime.on_unmount();
    runtime.on_mount();
    consume_mount_release(runtime);
}

void descriptor_and_vendor_fail_closed() {
    const std::array<uint8_t, kUsbDeviceDescriptorLength> expected_device{
        18, 0x01, 0x00, 0x02, 0, 0, 0, 64,
        0x3a, 0x30, 0x06, 0x10, 0x00, 0x01, 1, 2, 0, 1};
    CHECK(kUsbDeviceDescriptor == expected_device);
    CHECK(kUsbDeviceDescriptor[8] == static_cast<uint8_t>(kUsbVid));
    CHECK(kUsbDeviceDescriptor[9] == static_cast<uint8_t>(kUsbVid >> 8));
    CHECK(kUsbDeviceDescriptor[10] == static_cast<uint8_t>(kUsbPid));
    CHECK(kUsbDeviceDescriptor[11] == static_cast<uint8_t>(kUsbPid >> 8));
    CHECK(kUsbDeviceDescriptor[14] == 1);
    CHECK(kUsbDeviceDescriptor[15] == 2);
    CHECK(kUsbDeviceDescriptor[16] == 0);
    const std::array<uint8_t, kUsbConfigurationDescriptorLength> expected_configuration{
        9, 0x02, 34, 0, 1, 1, 0, 0xa0, 50,
        9, 0x04, 0, 0, 1, 0x03, 0, 0, 0,
        9, 0x21, 0x11, 0x01, 0, 1, 0x22,
        0x54, 0x01,
        7, 0x05, 0x81, 0x03, 64, 0, 10};
    CHECK(kUsbConfigurationDescriptor == expected_configuration);
    const std::array<uint8_t, 2> expected_language{0x09, 0x04};
    CHECK(std::equal(expected_language.begin(), expected_language.end(),
                     reinterpret_cast<const uint8_t*>(kUsbLanguageDescriptor)));
    constexpr std::array<uint8_t, 8> expected_manufacturer{'D', 'e', 's', 'k', 'M', 'a', 't', 'e'};
    constexpr std::array<uint8_t, 12> expected_product{'E', 'a', 's', 'y', 'I', 'n', 'p', 'u', 't', ' ', 'A', 'I'};
    CHECK(std::equal(expected_manufacturer.begin(), expected_manufacturer.end(),
                     reinterpret_cast<const uint8_t*>(kUsbStringDescriptors[1])));
    CHECK(kUsbStringDescriptors[1][expected_manufacturer.size()] == '\0');
    CHECK(std::equal(expected_product.begin(), expected_product.end(),
                     reinterpret_cast<const uint8_t*>(kUsbStringDescriptors[2])));
    CHECK(kUsbStringDescriptors[2][expected_product.size()] == '\0');

    const std::vector<uint8_t> expected_report{
        0x05,0x01,0x09,0x06,0xa1,0x01,0x85,0x01,
        0x05,0x07,0x19,0xe0,0x29,0xe7,0x15,0x00,0x25,0x01,0x75,0x01,0x95,0x08,0x81,0x02,
        0x05,0xff,0x09,0x03,0x15,0x00,0x25,0x01,0x95,0x01,0x75,0x08,0x81,0x02,
        0x05,0x07,0x19,0x00,0x29,0x65,0x15,0x00,0x25,0x65,0x95,0x06,0x75,0x08,0x81,0x00,
        0x05,0x08,0x19,0x01,0x29,0x05,0x95,0x05,0x75,0x01,0x91,0x02,0x95,0x01,0x75,0x03,0x91,0x03,0xc0,
        0x05,0x01,0x09,0x02,0xa1,0x01,0x85,0x02,0x09,0x01,0xa1,0x00,
        0x05,0x09,0x19,0x01,0x29,0x05,0x15,0x00,0x25,0x01,0x95,0x05,0x75,0x01,0x81,0x02,
        0x95,0x01,0x75,0x03,0x81,0x01,0x05,0x01,0x09,0x30,0x09,0x31,0x09,0x38,
        0x15,0x81,0x25,0x7f,0x75,0x08,0x95,0x03,0x81,0x06,
        0x05,0x0c,0x0a,0x38,0x02,0x95,0x01,0x81,0x06,0xc0,0xc0,
        0x06,0x00,0xff,0x09,0x02,0xa1,0x01,
        0x85,0x10,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x02,0xb1,0x02,
        0x85,0x11,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x02,0x81,0x02,
        0x85,0x12,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x10,0x09,0x03,0xb1,0x02,
        0x85,0x13,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x10,0x09,0x04,0xb1,0x02,
        0x85,0x14,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x05,0xb1,0x02,
        0x85,0x15,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x06,0x81,0x02,0xc0,
        0x06,0x00,0xff,0x09,0x07,0xa1,0x01,
        0x85,0x16,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x07,0xb1,0x02,
        0x85,0x17,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x08,0x81,0x02,0xc0,
        0x06,0x00,0xff,0x09,0x09,0xa1,0x01,
        0x85,0x18,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x09,0xb1,0x02,
        0x85,0x19,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x0a,0x81,0x02,
        0x85,0x1a,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x0b,0xb1,0x02,
        0x85,0x1b,0x15,0x00,0x26,0xff,0x00,0x75,0x08,0x95,0x3f,0x09,0x0c,0x81,0x02,0xc0,
    };
    CHECK(expected_report.size() == kHidReportDescriptorSize);
    CHECK(std::equal(expected_report.begin(), expected_report.end(), kHidReportDescriptor));

    const ParsedReportLengths reports = parse_report_descriptor();
    CHECK(reports.input_bits[0x01] == 8 * 8);
    CHECK(reports.output_bits[0x01] == 8);
    CHECK(reports.input_bits[0x02] == 5 * 8);
    CHECK(reports.feature_bits[0x10] == 63 * 8);
    CHECK(reports.input_bits[0x11] == 63 * 8);
    CHECK(reports.feature_bits[0x12] == 16 * 8);
    CHECK(reports.feature_bits[0x13] == 16 * 8);
    CHECK(reports.feature_bits[0x14] == 63 * 8);
    CHECK(reports.input_bits[0x15] == 63 * 8);
    CHECK(reports.feature_bits[0x16] == 63 * 8);
    CHECK(reports.input_bits[0x17] == 63 * 8);
    CHECK(reports.feature_bits[0x18] == 63 * 8);
    CHECK(reports.input_bits[0x19] == 63 * 8);
    CHECK(reports.feature_bits[0x1a] == 63 * 8);
    CHECK(reports.input_bits[0x1b] == 63 * 8);
    for (uint16_t id = 0; id < 256; ++id) {
        const bool expected = id == 0x01 || id == 0x02 ||
                              (id >= 0x10 && id <= 0x1b);
        if (!expected) {
            CHECK(reports.input_bits[id] == 0);
            CHECK(reports.output_bits[id] == 0);
            CHECK(reports.feature_bits[id] == 0);
        }
    }

    InputActionRouter router;
    const std::array<std::array<uint8_t, 8>, 8> expected_keys{{
        {{3, 0, 0x2c, 0, 0, 0, 0, 0}}, {{0, 0, 0x28, 0, 0, 0, 0, 0}},
        {{3, 0, 0x08, 0, 0, 0, 0, 0}}, {{0, 0, 0x2a, 0, 0, 0, 0, 0}},
        {{1, 0, 0x04, 0, 0, 0, 0, 0}}, {{1, 0, 0x06, 0, 0, 0, 0, 0}},
        {{1, 0, 0x19, 0, 0, 0, 0, 0}}, {{1, 0, 0x1d, 0, 0, 0, 0, 0}},
    }};
    for (uint8_t index = 0; index < 8; ++index) {
        InputActionRouter single;
        CHECK(serialize_keyboard_report(single.apply(key(index, true)).keyboard) ==
              expected_keys[index]);
    }
    const std::array<uint8_t, 5> vertical_cw{0, 0, 0, 0xfd, 0};
    const std::array<uint8_t, 5> vertical_ccw{0, 0, 0, 3, 0};
    const std::array<uint8_t, 5> horizontal_cw{0, 0, 0, 0, 3};
    const std::array<uint8_t, 5> horizontal_ccw{0, 0, 0, 0, 0xfd};
    CHECK(serialize_mouse_report(router.apply({InputEventType::EncoderStep, 0, 1}).wheel) ==
          vertical_cw);
    CHECK(serialize_mouse_report(router.apply({InputEventType::EncoderStep, 0, -1}).wheel) ==
          vertical_ccw);
    router.apply({InputEventType::EncoderPressed, 0, 0});
    CHECK(serialize_mouse_report(router.apply({InputEventType::EncoderStep, 0, 1}).wheel) ==
          horizontal_cw);
    CHECK(serialize_mouse_report(router.apply({InputEventType::EncoderStep, 0, -1}).wheel) ==
          horizontal_ccw);
    UsbInputRuntime runtime;
    const auto before = runtime.diagnostics();
    const uint8_t payload[2]{1, 2};
    for (uint8_t id = 0x10; id <= 0x1b; ++id) CHECK(!runtime.reject_vendor_feature(id, payload, 2));
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
    CHECK(sizeof(RuntimeDiagnosticsSnapshot) == 7 * sizeof(uint32_t));
}

void input_drop_recovery_waits_for_release() {
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);
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

void event_ring_overflow_discards_stale_key_down() {
    InputCore input;
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);
    input.scan_keys(0, 0);
    input.scan_keys(0x01, 1);
    input.scan_keys(0x01, 21);
    input.scan_encoder_phase(0, 22);
    uint32_t now = 23;
    for (int index = 0; index < 31; ++index) add_encoder_detent(input, now);
    input.scan_keys(0, now++);
    input.scan_keys(0, now + kDebounceMs);
    const uint32_t drops = input.take_event_drops();
    CHECK(drops == 1);
    input.discard_pending_events();
    runtime.on_input_event_drops(drops);
    runtime.recover_after_input_drop(0);
    drain_input_events(input, runtime);

    CHECK(runtime.queued_reports() == 1);
    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    CHECK(report.kind == HidReportKind::Keyboard);
    const std::array<uint8_t, 8> zero_report{};
    CHECK(report.payload == zero_report);
    runtime.complete_report();
    CHECK(runtime.queued_reports() == 0);
    CHECK(!runtime.front_report(report));
}

void event_ring_overflow_held_key_waits_for_release() {
    InputCore input;
    UsbInputRuntime runtime;
    runtime.on_mount();
    consume_mount_release(runtime);
    input.scan_keys(0, 0);
    input.scan_keys(0x01, 1);
    input.scan_keys(0x01, 21);
    input.scan_encoder_phase(0, 22);
    uint32_t now = 23;
    for (int index = 0; index < 32; ++index) add_encoder_detent(input, now);
    const uint32_t drops = input.take_event_drops();
    CHECK(drops == 1);
    input.discard_pending_events();
    runtime.on_input_event_drops(drops);
    runtime.recover_after_input_drop(0x01);
    drain_input_events(input, runtime);

    QueuedHidReport report{};
    CHECK(runtime.front_report(report));
    const std::array<uint8_t, 8> zero_report{};
    CHECK(report.payload == zero_report);
    runtime.complete_report();
    runtime.on_input(key(0, true));
    runtime.on_input(key(1, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input(key(0, false));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input(key(1, false));
    runtime.on_input(key(1, true));
    CHECK(runtime.queued_reports() == 1);
}

void config_status_transfer_completion_advances() {
    UsbCallbackLifecycleState callback;
    UsbLifecycleEventQueue events;
    UsbInputRuntime runtime;
    HidReportTransferState transfer;
    ConfigTransferState config_transfer;

    CHECK(events.publish(callback.on_mount()));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot(), &config_transfer);

    config_transfer.active = true;
    config_transfer.advances_status_stream = true;
    config_transfer.report.report_id = 0x11;
    config_transfer.report.length = 63;
    config_transfer.report.epoch = callback.snapshot().epoch;
    config_transfer.report.payload.fill(0);
    config_transfer.report.payload[0] = 0x04;

    std::array<uint8_t, 64> wire{};
    wire[0] = 0x11;
    std::copy(config_transfer.report.payload.begin(),
              config_transfer.report.payload.end(), wire.begin() + 1);
    const auto completion = make_usb_transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, wire.data(), wire.size());
    CHECK(completion.report_identity_valid);
    CHECK(events.publish(completion));
    process_usb_lifecycle_events(events, runtime, transfer,
                                 callback.snapshot(), &config_transfer);
    CHECK(!config_transfer.active);
    CHECK(config_transfer.completed_status);

    wire[1] = 0x05;
    CHECK(make_usb_transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, wire.data(), wire.size())
        .report_identity_valid);
}

void host_commands_are_press_once_bounded_and_epoch_safe() {
    const std::string uuid = "01234567-89ab-cdef-0123-456789abcdef";
    ConfigProjection projection{};
    projection.keys[0].kind = ConfigActionKind::HostAction;
    projection.keys[0].value = uuid;
    projection.keys[1].kind = ConfigActionKind::FixedText;
    projection.keys[1].value = std::string(60, 'x');
    projection.encoder_press.kind = ConfigActionKind::HostAction;
    projection.encoder_press.value = uuid;

    UsbInputRuntime runtime;
    runtime.on_mount(7);
    consume_mount_release(runtime);
    runtime.set_configuration(projection);
    consume_mount_release(runtime);

    std::array<uint8_t, kAppCommandPayloadBytes> payload{};
    runtime.on_input(key(0, true));
    CHECK(runtime.front_host_command(payload));
    CHECK(payload[0] == 0x05 && payload[1] == 0 &&
          payload[2] == 1 && payload[3] == 36);
    CHECK(std::equal(uuid.begin(), uuid.end(), payload.begin() + 4));
    runtime.on_input(key(0, true));
    runtime.on_input(key(1, true));
    CHECK(runtime.diagnostics().host_command_drops == 1);
    runtime.complete_host_command();
    CHECK(!runtime.front_host_command(payload));
    runtime.on_input(key(0, false));
    runtime.on_input(key(0, true));
    CHECK(runtime.front_host_command(payload));
    runtime.fail_host_command();
    CHECK(!runtime.front_host_command(payload));
    CHECK(runtime.diagnostics().host_command_drops == 2);

    runtime.on_input(key(0, false));
    runtime.on_input(key(1, false));
    runtime.on_input(key(1, true));
    CHECK(runtime.front_host_command(payload));
    CHECK(payload[0] == 0x01 && payload[1] == 0 &&
          payload[2] == 2 && payload[3] == 59);
    runtime.complete_host_command();
    CHECK(runtime.front_host_command(payload));
    CHECK(payload[0] == 0x01 && payload[1] == 1 &&
          payload[2] == 2 && payload[3] == 1 && payload[4] == 'x');
    CHECK(std::all_of(payload.begin() + 5, payload.end(),
                      [](uint8_t value) { return value == 0; }));
    runtime.on_unmount();
    runtime.on_mount(8);
    CHECK(!runtime.front_host_command(payload));
}

void host_command_transfer_lifecycle_uses_single_vendor_owner() {
    const std::string uuid = "01234567-89ab-cdef-0123-456789abcdef";
    ConfigProjection projection{};
    projection.keys[0].kind = ConfigActionKind::HostAction;
    projection.keys[0].value = uuid;

    UsbLifecycleEventQueue events;
    UsbCallbackLifecycleState callback;
    UsbInputRuntime runtime;
    HidReportTransferState keyboard_transfer;
    ConfigTransferState vendor_transfer;
    const auto mount = callback.on_mount();
    CHECK(events.publish(mount));
    process_usb_lifecycle_events(events, runtime, keyboard_transfer,
                                 callback.snapshot(), &vendor_transfer);
    consume_mount_release(runtime);
    runtime.set_configuration(projection);
    consume_mount_release(runtime);
    runtime.on_input(key(0, true));

    std::array<uint8_t, kAppCommandPayloadBytes> payload{};
    CHECK(runtime.front_host_command(payload));
    vendor_transfer.active = true;
    vendor_transfer.advances_host_command = true;
    vendor_transfer.report.report_id = kAppCommandReportId;
    vendor_transfer.report.length = kAppCommandPayloadBytes;
    vendor_transfer.report.epoch = callback.snapshot().epoch;
    vendor_transfer.report.payload = payload;
    std::array<uint8_t, kAppCommandPayloadBytes + 1> wire{};
    wire[0] = kAppCommandReportId;
    std::copy(payload.begin(), payload.end(), wire.begin() + 1);
    CHECK(events.publish(make_usb_transfer_event(
        UsbLifecycleEventKind::TransferComplete,
        callback.snapshot().epoch, wire.data(), wire.size())));
    process_usb_lifecycle_events(events, runtime, keyboard_transfer,
                                 callback.snapshot(), &vendor_transfer);
    CHECK(!vendor_transfer.active);
    CHECK(!runtime.front_host_command(payload));

    runtime.on_input(key(0, false));
    runtime.on_input(key(0, true));
    CHECK(runtime.front_host_command(payload));
    vendor_transfer.active = true;
    vendor_transfer.advances_host_command = true;
    vendor_transfer.report.report_id = kAppCommandReportId;
    vendor_transfer.report.length = kAppCommandPayloadBytes;
    vendor_transfer.report.epoch = callback.snapshot().epoch;
    vendor_transfer.report.payload = payload;
    CHECK(events.publish(make_usb_transfer_event(
        UsbLifecycleEventKind::TransferFailed,
        callback.snapshot().epoch, wire.data(), wire.size())));
    process_usb_lifecycle_events(events, runtime, keyboard_transfer,
                                 callback.snapshot(), &vendor_transfer);
    CHECK(!runtime.front_host_command(payload));
    CHECK(runtime.diagnostics().host_command_drops == 1);
}
}

int main() {
    default_action_vectors();
    configuration_replacement_releases_host_and_applies_cursor();
    loaded_safe_configuration_preserves_voice_shortcuts();
    physical_source_ownership_and_overflow();
    encoder_axis_vectors();
    configured_encoder_actions_follow_maker_semantics();
    tap_actions_restore_without_waiting_for_physical_release();
    tap_actions_restore_concurrent_held_voice_snapshot();
    tap_pair_admission_and_transfer_fail_closed();
    completed_tap_precedes_disconnect_while_key_remains_held();
    lifetime_and_disconnect_safety();
    cold_boot_held_s6_release_barrier();
    cold_boot_release_before_mount_report_complete();
    mount_before_first_cold_boot_scan();
    mount_release_repeat_requires_held_state();
    timed_release_reassertion_and_raw_loss();
    ordered_lifetime_events_and_stale_completion();
    lifecycle_duplicate_mount_and_overflow_recovery();
    physical_presence_filters_loss_and_real_mount_is_authoritative();
    two_physical_reconnect_cycles_without_tinyusb_unmount();
    stale_ctrl_completion_cannot_retire_reconnect_release();
    stale_zero_completion_cannot_unlock_held_reconnect();
    queue_failure_release_and_wheel_boundaries();
    wheel_coalescing_boundaries_and_no_replay();
    descriptor_and_vendor_fail_closed();
    diagnostics_are_saturating_and_redacted();
    input_drop_recovery_waits_for_release();
    event_ring_overflow_discards_stale_key_down();
    event_ring_overflow_held_key_waits_for_release();
    config_status_transfer_completion_advances();
    host_commands_are_press_once_bounded_and_epoch_safe();
    host_command_transfer_lifecycle_uses_single_vendor_owner();
    if (failures) {
        std::cerr << "input_runtime_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "input_runtime_tests: PASS\n";
    return 0;
}
