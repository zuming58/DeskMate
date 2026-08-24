#include "input_runtime.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <vector>

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

void apply_lifecycle_events(UsbLifecycleEventQueue& events, UsbInputRuntime& runtime,
                            bool& report_in_flight, uint32_t& report_epoch) {
    UsbLifecycleEvent event{};
    while (events.consume(event)) {
        switch (event.kind) {
            case UsbLifecycleEventKind::Mount:
                if (!runtime.mounted()) {
                    runtime.on_mount();
                    report_in_flight = false;
                }
                break;
            case UsbLifecycleEventKind::Unmount:
                if (runtime.mounted()) {
                    runtime.on_unmount();
                    report_in_flight = false;
                }
                break;
            case UsbLifecycleEventKind::Resume:
                if (runtime.mounted()) runtime.on_resume();
                break;
            case UsbLifecycleEventKind::TransferComplete:
                if (report_in_flight && event.epoch == report_epoch &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch) {
                    runtime.complete_report();
                    report_in_flight = false;
                }
                break;
            case UsbLifecycleEventKind::TransferFailed:
                if (report_in_flight && event.epoch == report_epoch &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch) {
                    runtime.on_transfer_failed();
                    report_in_flight = false;
                }
                break;
        }
    }
}

void add_encoder_detent(InputCore& input, uint32_t& now) {
    for (const uint8_t phase : std::array<uint8_t, 4>{1, 3, 2, 0}) {
        input.scan_encoder_phase(phase, now++);
    }
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

void ordered_lifetime_events_and_stale_completion() {
    UsbLifecycleEventQueue events;
    UsbInputRuntime runtime;
    bool report_in_flight = false;
    uint32_t report_epoch = 0;

    CHECK(events.publish({UsbLifecycleEventKind::Mount, 1}));
    CHECK(events.publish({UsbLifecycleEventKind::Unmount, 1}));
    apply_lifecycle_events(events, runtime, report_in_flight, report_epoch);
    CHECK(!runtime.mounted());
    CHECK(runtime.diagnostics().usb_mount_epoch == 1);
    CHECK(runtime.queued_reports() == 0);

    CHECK(events.publish({UsbLifecycleEventKind::Mount, 2}));
    CHECK(events.publish({UsbLifecycleEventKind::Mount, 2}));
    CHECK(events.publish({UsbLifecycleEventKind::TransferComplete, 1}));
    CHECK(events.publish({UsbLifecycleEventKind::TransferFailed, 1}));
    apply_lifecycle_events(events, runtime, report_in_flight, report_epoch);
    CHECK(runtime.mounted());
    CHECK(runtime.diagnostics().usb_mount_epoch == 2);
    CHECK(runtime.queued_reports() == 0);

    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 1);
    report_in_flight = true;
    report_epoch = runtime.diagnostics().usb_mount_epoch;
    CHECK(events.publish({UsbLifecycleEventKind::Unmount, 2}));
    CHECK(events.publish({UsbLifecycleEventKind::Mount, 3}));
    CHECK(events.publish({UsbLifecycleEventKind::TransferComplete, 2}));
    CHECK(events.publish({UsbLifecycleEventKind::TransferFailed, 2}));
    apply_lifecycle_events(events, runtime, report_in_flight, report_epoch);
    CHECK(runtime.mounted());
    CHECK(runtime.diagnostics().usb_mount_epoch == 3);
    CHECK(runtime.queued_reports() == 0);
    CHECK(!report_in_flight);

    runtime.on_input(key(0, true));
    CHECK(runtime.queued_reports() == 0);
    runtime.on_input(key(0, false));
    runtime.on_input(key(1, true));
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

void wheel_coalescing_boundaries_and_no_replay() {
    UsbInputRuntime runtime;
    runtime.on_mount();
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
    CHECK(runtime.queued_reports() == 0);
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
        0xea, 0x00,
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
    for (uint16_t id = 0; id < 256; ++id) {
        const bool expected = id == 0x01 || id == 0x02 ||
                              (id >= 0x10 && id <= 0x15);
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

void event_ring_overflow_discards_stale_key_down() {
    InputCore input;
    UsbInputRuntime runtime;
    runtime.on_mount();
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
}

int main() {
    default_action_vectors();
    physical_source_ownership_and_overflow();
    encoder_axis_vectors();
    lifetime_and_disconnect_safety();
    ordered_lifetime_events_and_stale_completion();
    queue_failure_release_and_wheel_boundaries();
    wheel_coalescing_boundaries_and_no_replay();
    descriptor_and_vendor_fail_closed();
    diagnostics_are_saturating_and_redacted();
    input_drop_recovery_waits_for_release();
    event_ring_overflow_discards_stale_key_down();
    event_ring_overflow_held_key_waits_for_release();
    if (failures) {
        std::cerr << "input_runtime_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "input_runtime_tests: PASS\n";
    return 0;
}
