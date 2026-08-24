#include "input_runtime.h"

#include <algorithm>
#include <limits>

namespace deskmate::easyinput {
namespace {
constexpr uint8_t kLeftCtrl = 0x01;
constexpr uint8_t kLeftShift = 0x02;
constexpr std::array<InputActionRouter::Chord, 8> kDefaultChords{{
    {HidUsage::Space, kLeftCtrl | kLeftShift}, {HidUsage::Enter, 0},
    {HidUsage::E, kLeftCtrl | kLeftShift}, {HidUsage::Backspace, 0},
    {HidUsage::A, kLeftCtrl}, {HidUsage::C, kLeftCtrl},
    {HidUsage::V, kLeftCtrl}, {HidUsage::Z, kLeftCtrl},
}};
}

KeyboardSnapshot InputActionRouter::compose() const {
    KeyboardSnapshot result{};
    size_t usage_index = 0;
    for (const auto& owner : owned_) {
        if (!owner.held) continue;
        result.modifier = static_cast<uint8_t>(result.modifier | owner.chord.modifiers);
        const uint8_t usage = static_cast<uint8_t>(owner.chord.usage);
        if (usage == 0 || std::find(result.usages.begin(), result.usages.begin() + usage_index, usage) != result.usages.begin() + usage_index) continue;
        if (usage_index >= result.usages.size()) return {};
        result.usages[usage_index++] = usage;
    }
    return result;
}

RoutedAction InputActionRouter::apply(const InputEvent& event) {
    RoutedAction result{};
    if ((event.type == InputEventType::KeyPressed || event.type == InputEventType::KeyReleased) && event.index < owned_.size()) {
        return apply_key_source(static_cast<InputSourceId>(event.index),
                                event.type == InputEventType::KeyPressed,
                                kDefaultChords[event.index]);
    } else if (event.type == InputEventType::EncoderStep) {
        result.wheel_changed = event.value != 0;
        if (axis_ == ScrollAxis::Vertical) result.wheel.vertical = event.value > 0 ? -3 : 3;
        else result.wheel.horizontal = event.value > 0 ? 3 : -3;
    } else if (event.type == InputEventType::EncoderPressed) {
        axis_ = axis_ == ScrollAxis::Vertical ? ScrollAxis::Horizontal : ScrollAxis::Vertical;
    }
    return result;
}

RoutedAction InputActionRouter::apply_key_source(InputSourceId source, bool pressed, Chord chord) {
    RoutedAction result{};
    const size_t index = static_cast<size_t>(source);
    if (index >= owned_.size()) return result;
    auto& owner = owned_[index];
    if (owner.held == pressed) return result;
    const KeyboardSnapshot before = compose();
    owner = {pressed, chord};
    const KeyboardSnapshot after = compose();
    if (pressed && after == KeyboardSnapshot{} && !(before == KeyboardSnapshot{})) {
        owner = {false, chord};
        return result;
    }
    result.keyboard_changed = !(before == after);
    result.keyboard = after;
    return result;
}

void InputActionRouter::release_all() { owned_ = {}; }
KeyboardSnapshot InputActionRouter::keyboard() const { return compose(); }

std::array<uint8_t, 8> serialize_keyboard_report(const KeyboardSnapshot& snapshot) {
    std::array<uint8_t, 8> bytes{};
    bytes[0] = snapshot.modifier;
    bytes[1] = snapshot.apple_fn;
    std::copy(snapshot.usages.begin(), snapshot.usages.end(), bytes.begin() + 2);
    return bytes;
}

std::array<uint8_t, 5> serialize_mouse_report(const MouseWheelSnapshot& snapshot) {
    return {0, 0, 0, static_cast<uint8_t>(snapshot.vertical), static_cast<uint8_t>(snapshot.horizontal)};
}

void UsbInputRuntime::saturating_add(uint32_t& value, uint32_t amount) {
    const uint32_t max = std::numeric_limits<uint32_t>::max();
    value = amount > max - value ? max : value + amount;
}

void UsbInputRuntime::clear_queue() { queue_head_ = 0; queue_size_ = 0; }
bool UsbInputRuntime::any_held() const { return std::any_of(physically_held_.begin(), physically_held_.end(), [](bool v) { return v; }); }

void UsbInputRuntime::on_mount() {
    mounted_ = true;
    if (diagnostics_.usb_mount_epoch != UINT32_MAX) ++diagnostics_.usb_mount_epoch;
    if (diagnostics_.usb_mount_epoch == 0) diagnostics_.usb_mount_epoch = 1;
    clear_queue();
    if (any_held()) suppress_until_all_released_ = true;
}

void UsbInputRuntime::on_unmount() {
    mounted_ = false;
    clear_queue();
    suppress_until_all_released_ = any_held();
    router_.release_all();
}

void UsbInputRuntime::on_resume() {}

bool UsbInputRuntime::enqueue(const QueuedHidReport& report) {
    if (!mounted_) return false;
    if (queue_size_ == queue_.size()) {
        saturating_add(diagnostics_.hid_report_drops, 1);
        recover_release();
        return false;
    }
    queue_[(queue_head_ + queue_size_) % queue_.size()] = report;
    ++queue_size_;
    return true;
}

void UsbInputRuntime::enqueue_keyboard(const KeyboardSnapshot& snapshot) {
    QueuedHidReport report{};
    report.kind = HidReportKind::Keyboard;
    report.report_id = kKeyboardReportId;
    report.length = 8;
    const auto bytes = serialize_keyboard_report(snapshot);
    std::copy(bytes.begin(), bytes.end(), report.payload.begin());
    report.epoch = diagnostics_.usb_mount_epoch;
    enqueue(report);
}

void UsbInputRuntime::enqueue_wheel(const MouseWheelSnapshot& snapshot) {
    if (queue_size_ != 0) {
        auto& tail = queue_[(queue_head_ + queue_size_ - 1) % queue_.size()];
        if (tail.kind == HidReportKind::Mouse && tail.epoch == diagnostics_.usb_mount_epoch) {
            const int8_t old_v = static_cast<int8_t>(tail.payload[3]);
            const int8_t old_h = static_cast<int8_t>(tail.payload[4]);
            const bool same_direction =
                (snapshot.vertical == 0 || old_v == 0 || (snapshot.vertical > 0) == (old_v > 0)) &&
                (snapshot.horizontal == 0 || old_h == 0 || (snapshot.horizontal > 0) == (old_h > 0));
            if (!same_direction) goto enqueue_new_wheel;
            const int v = static_cast<int8_t>(tail.payload[3]) + snapshot.vertical;
            const int h = static_cast<int8_t>(tail.payload[4]) + snapshot.horizontal;
            if (v >= -127 && v <= 127 && h >= -127 && h <= 127) {
                tail.payload[3] = static_cast<uint8_t>(static_cast<int8_t>(v));
                tail.payload[4] = static_cast<uint8_t>(static_cast<int8_t>(h));
                return;
            }
        }
    }
enqueue_new_wheel:
    QueuedHidReport report{};
    report.kind = HidReportKind::Mouse;
    report.report_id = kMouseReportId;
    report.length = 5;
    const auto bytes = serialize_mouse_report(snapshot);
    std::copy(bytes.begin(), bytes.end(), report.payload.begin());
    report.epoch = diagnostics_.usb_mount_epoch;
    enqueue(report);
}

void UsbInputRuntime::recover_release() {
    clear_queue();
    router_.release_all();
    suppress_until_all_released_ = any_held();
    if (mounted_) enqueue_keyboard({});
}

void UsbInputRuntime::on_input(const InputEvent& event) {
    if ((event.type == InputEventType::KeyPressed || event.type == InputEventType::KeyReleased) && event.index < physically_held_.size()) {
        physically_held_[event.index] = event.type == InputEventType::KeyPressed;
    }
    if (suppress_until_all_released_) {
        if (!any_held()) suppress_until_all_released_ = false;
        return;
    }
    if (!mounted_) return;
    const RoutedAction action = router_.apply(event);
    if (action.keyboard_changed) enqueue_keyboard(action.keyboard);
    if (action.wheel_changed) enqueue_wheel(action.wheel);
}

void UsbInputRuntime::on_raw_edge_drops(uint32_t count) { saturating_add(diagnostics_.raw_edge_drops, count); }
void UsbInputRuntime::on_encoder_resync() { saturating_add(diagnostics_.encoder_resyncs, 1); }
void UsbInputRuntime::on_input_event_drops(uint32_t count) { saturating_add(diagnostics_.input_event_drops, count); }
void UsbInputRuntime::recover_after_input_drop(uint8_t active_key_mask) {
    for (size_t index = 0; index < physically_held_.size(); ++index) {
        physically_held_[index] = (active_key_mask & (1u << index)) != 0;
    }
    recover_release();
}
void UsbInputRuntime::on_transfer_failed() { saturating_add(diagnostics_.hid_report_drops, static_cast<uint32_t>(queue_size_)); recover_release(); }

bool UsbInputRuntime::front_report(QueuedHidReport& report) const {
    if (queue_size_ == 0 || !mounted_) return false;
    report = queue_[queue_head_];
    return report.epoch == diagnostics_.usb_mount_epoch;
}

void UsbInputRuntime::complete_report() {
    if (queue_size_ == 0) return;
    queue_head_ = (queue_head_ + 1) % queue_.size();
    --queue_size_;
}

bool UsbInputRuntime::reject_vendor_feature(uint8_t report_id, const uint8_t* data, size_t length) const {
    (void)report_id; (void)data; (void)length;
    return false;
}

const uint8_t kHidReportDescriptor[] = {
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
const size_t kHidReportDescriptorSize = sizeof(kHidReportDescriptor);

alignas(2) const std::array<uint8_t, kUsbDeviceDescriptorLength> kUsbDeviceDescriptor = {
    18, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 64,
    0x3a, 0x30, 0x06, 0x10, 0x00, 0x01, 0x01, 0x02, 0x00, 0x01};
const std::array<uint8_t, kUsbConfigurationDescriptorLength> kUsbConfigurationDescriptor = {
    9, 0x02, 34, 0, 1, 1, 0, 0xA0, 50,
    9, 0x04, 0, 0, 1, 0x03, 0, 0, 0,
    9, 0x21, 0x11, 0x01, 0, 1, 0x22,
    static_cast<uint8_t>(kHidReportDescriptorSize), static_cast<uint8_t>(kHidReportDescriptorSize >> 8),
    7, 0x05, 0x81, 0x03, 64, 0, 10};
const char kUsbLanguageDescriptor[] = {0x09, 0x04};
std::array<const char*, 3> kUsbStringDescriptors = {
    kUsbLanguageDescriptor, "DeskMate", "EasyInput AI"};

}  // namespace deskmate::easyinput
