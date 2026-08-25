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

bool UsbLifecycleEventQueue::publish(UsbLifecycleEvent event) {
    const size_t head = head_.load(std::memory_order_relaxed);
    const size_t next = (head + 1u) % events_.size();
    if (next == tail_.load(std::memory_order_acquire)) {
        uint32_t current = drops_.load(std::memory_order_relaxed);
        while (current != UINT32_MAX &&
               !drops_.compare_exchange_weak(
                   current, current + 1, std::memory_order_relaxed)) {}
        return false;
    }
    events_[head] = event;
    head_.store(next, std::memory_order_release);
    return true;
}

bool UsbLifecycleEventQueue::consume(UsbLifecycleEvent& event) {
    const size_t tail = tail_.load(std::memory_order_relaxed);
    if (tail == head_.load(std::memory_order_acquire)) return false;
    event = events_[tail];
    tail_.store((tail + 1u) % events_.size(), std::memory_order_release);
    return true;
}

size_t UsbLifecycleEventQueue::queued() const {
    const size_t head = head_.load(std::memory_order_acquire);
    const size_t tail = tail_.load(std::memory_order_acquire);
    return (head + events_.size() - tail) % events_.size();
}

uint32_t UsbLifecycleEventQueue::take_drops() {
    return drops_.exchange(0, std::memory_order_acq_rel);
}

void UsbLifecycleEventQueue::discard_pending() {
    tail_.store(head_.load(std::memory_order_acquire), std::memory_order_release);
}

void UsbPhysicalPresenceMonitor::reset(bool present, uint32_t now_ms) {
    initialized_ = true;
    present_ = present;
    disconnect_pending_ = false;
    candidate_since_ms_ = now_ms;
}

bool UsbPhysicalPresenceMonitor::update(bool raw_present, uint32_t now_ms) {
    if (!initialized_) {
        reset(raw_present, now_ms);
        return false;
    }
    if (raw_present) {
        disconnect_pending_ = false;
        if (present_) return false;
        present_ = true;
        return true;
    }
    if (!present_) {
        disconnect_pending_ = false;
        return false;
    }
    if (!disconnect_pending_) {
        disconnect_pending_ = true;
        candidate_since_ms_ = now_ms;
    }
    if (static_cast<uint32_t>(now_ms - candidate_since_ms_) < disconnect_confirm_ms_) {
        return false;
    }
    present_ = false;
    disconnect_pending_ = false;
    return true;
}

uint32_t UsbCallbackLifecycleState::next_epoch() {
    uint32_t current = epoch_.load(std::memory_order_acquire);
    while (current != UINT32_MAX &&
           !epoch_.compare_exchange_weak(
               current, current + 1, std::memory_order_acq_rel)) {}
    return current == UINT32_MAX ? UINT32_MAX : current + 1;
}

UsbLifecycleEvent UsbCallbackLifecycleState::on_mount() {
    mounted_.store(true, std::memory_order_release);
    return {UsbLifecycleEventKind::Mount, next_epoch()};
}

bool UsbCallbackLifecycleState::try_mount(
    bool physical_present, UsbLifecycleEvent& event) {
    if (!physical_present) {
        on_physical_disconnect();
        return false;
    }
    event = on_mount();
    return true;
}

void UsbCallbackLifecycleState::on_physical_disconnect() {
    mounted_.store(false, std::memory_order_release);
}

UsbLifecycleEvent UsbCallbackLifecycleState::on_unmount() {
    mounted_.store(false, std::memory_order_release);
    return current_event(UsbLifecycleEventKind::Unmount);
}

UsbLifecycleEvent UsbCallbackLifecycleState::current_event(
    UsbLifecycleEventKind kind) const {
    return {kind, epoch_.load(std::memory_order_acquire)};
}

UsbCallbackSnapshot UsbCallbackLifecycleState::snapshot() const {
    return {
        mounted_.load(std::memory_order_acquire),
        epoch_.load(std::memory_order_acquire),
    };
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
    uint32_t next = diagnostics_.usb_mount_epoch;
    if (next != UINT32_MAX) ++next;
    if (next == 0) next = 1;
    on_mount(next);
}

void UsbInputRuntime::on_mount(uint32_t epoch) {
    mounted_ = true;
    diagnostics_.usb_mount_epoch = epoch == 0 ? 1 : epoch;
    clear_queue();
    router_.release_all();
    release_barrier_pending_ = true;
    release_confirmation_enqueued_ = false;
    mount_release_completed_ = false;
    suppress_until_all_released_ = true;
    // Windows can retain a modifier from the previous HID lifetime when the
    // cable is removed while a chord is held. Every new mount starts with an
    // explicit all-released report before accepting new input.
    enqueue_keyboard({});
}

void UsbInputRuntime::on_unmount() {
    mounted_ = false;
    clear_queue();
    suppress_until_all_released_ = any_held();
    release_barrier_pending_ = false;
    release_confirmation_enqueued_ = false;
    mount_release_completed_ = false;
    router_.release_all();
}

void UsbInputRuntime::on_resume() {}

void UsbInputRuntime::observe_physical_key_mask(uint8_t active_key_mask) {
    const bool had_snapshot = physical_snapshot_observed_;
    const bool was_held = any_held();
    for (size_t index = 0; index < physically_held_.size(); ++index) {
        physically_held_[index] = (active_key_mask & (1u << index)) != 0;
    }
    physical_snapshot_observed_ = true;
    const bool now_held = any_held();
    if (!had_snapshot && now_held && mount_release_completed_) {
        release_barrier_pending_ = true;
        release_confirmation_enqueued_ = false;
        suppress_until_all_released_ = true;
    }
    maybe_enqueue_release_report(had_snapshot, was_held, now_held);
    if (release_barrier_pending_) suppress_until_all_released_ = true;
}

void UsbInputRuntime::observe_physical_presence(bool present) {
    if (present || !mounted_) return;
    on_unmount();
}

void UsbInputRuntime::maybe_enqueue_release_report(
    bool had_snapshot, bool was_held, bool now_held) {
    if (!release_barrier_pending_) return;
    if (now_held) {
        release_confirmation_enqueued_ = false;
        return;
    }
    if (!mounted_ || release_confirmation_enqueued_ ||
        (had_snapshot && !was_held)) return;
    if (!had_snapshot) {
        for (size_t offset = 0; offset < queue_size_; ++offset) {
            const auto& pending =
                queue_[(queue_head_ + offset) % queue_.size()];
            if (pending.kind == HidReportKind::Keyboard &&
                pending.payload == serialize_keyboard_report({})) {
                release_confirmation_enqueued_ = true;
                return;
            }
        }
    }
    // A cold-boot key has no Press owner. Force a fresh all-released report
    // after its physical release. It remains queued behind any mount-time
    // zero report so an old transfer-complete cannot satisfy this barrier.
    enqueue_keyboard({});
    release_confirmation_enqueued_ = true;
}

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
    release_barrier_pending_ = true;
    release_confirmation_enqueued_ =
        physical_snapshot_observed_ && !any_held();
    mount_release_completed_ = false;
    if (mounted_) enqueue_keyboard({});
}

void UsbInputRuntime::on_input(const InputEvent& event) {
    const bool had_snapshot = physical_snapshot_observed_;
    const bool was_held = any_held();
    if ((event.type == InputEventType::KeyPressed || event.type == InputEventType::KeyReleased) && event.index < physically_held_.size()) {
        physically_held_[event.index] = event.type == InputEventType::KeyPressed;
        physical_snapshot_observed_ = true;
    }
    maybe_enqueue_release_report(had_snapshot, was_held, any_held());
    if (suppress_until_all_released_) {
        if (!any_held() && !release_barrier_pending_) suppress_until_all_released_ = false;
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
void UsbInputRuntime::on_usb_lifecycle_drops(uint32_t count) { saturating_add(diagnostics_.usb_lifecycle_drops, count); }
void UsbInputRuntime::reconcile_usb_lifecycle(UsbCallbackSnapshot callback) {
    clear_queue();
    router_.release_all();
    mounted_ = callback.mounted;
    if (callback.epoch != 0) diagnostics_.usb_mount_epoch = callback.epoch;
    // A lost lifecycle event makes the prior key state untrustworthy. Swallow
    // input until all observed keys are released before accepting a new press.
    suppress_until_all_released_ = true;
    release_barrier_pending_ = true;
    release_confirmation_enqueued_ = false;
    mount_release_completed_ = false;
    if (mounted_) enqueue_keyboard({});
}
void UsbInputRuntime::recover_after_input_drop(uint8_t active_key_mask) {
    for (size_t index = 0; index < physically_held_.size(); ++index) {
        physically_held_[index] = (active_key_mask & (1u << index)) != 0;
    }
    physical_snapshot_observed_ = true;
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
    const QueuedHidReport completed = queue_[queue_head_];
    queue_head_ = (queue_head_ + 1) % queue_.size();
    --queue_size_;
    if (release_barrier_pending_ && completed.kind == HidReportKind::Keyboard &&
        completed.payload == serialize_keyboard_report({}) &&
        queue_size_ == 0) {
        mount_release_completed_ = true;
        if (release_confirmation_enqueued_ || !physical_snapshot_observed_) {
            release_barrier_pending_ = false;
            release_confirmation_enqueued_ = false;
            suppress_until_all_released_ = false;
        }
    }
}

bool UsbInputRuntime::reject_vendor_feature(uint8_t report_id, const uint8_t* data, size_t length) const {
    (void)report_id; (void)data; (void)length;
    return false;
}

UsbLifecycleProcessResult process_usb_lifecycle_events(
    UsbLifecycleEventQueue& events, UsbInputRuntime& runtime,
    bool& report_in_flight, uint32_t& report_epoch,
    UsbCallbackSnapshot callback) {
    UsbLifecycleProcessResult result{};
    result.dropped_events = events.take_drops();
    if (result.dropped_events != 0) {
        events.discard_pending();
        report_in_flight = false;
        runtime.on_usb_lifecycle_drops(result.dropped_events);
        runtime.reconcile_usb_lifecycle(callback);
        return result;
    }

    UsbLifecycleEvent event{};
    while (events.consume(event)) {
        switch (event.kind) {
            case UsbLifecycleEventKind::Mount:
                if (!callback.mounted || event.epoch != callback.epoch) break;
                if (!runtime.mounted() ||
                    event.epoch != runtime.diagnostics().usb_mount_epoch) {
                    runtime.on_mount(event.epoch);
                    report_in_flight = false;
                }
                break;
            case UsbLifecycleEventKind::Unmount:
                if (runtime.mounted() &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch) {
                    runtime.on_unmount();
                    report_in_flight = false;
                }
                break;
            case UsbLifecycleEventKind::Resume:
                if (runtime.mounted() &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch) {
                    runtime.on_resume();
                }
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
    return result;
}

bool prepare_hid_report(UsbInputRuntime& runtime, bool endpoint_ready,
                        bool report_in_flight, QueuedHidReport& report) {
    return endpoint_ready && !report_in_flight && runtime.front_report(report);
}

void finish_hid_send_attempt(UsbInputRuntime& runtime,
                             const QueuedHidReport& report, bool accepted,
                             bool& report_in_flight, uint32_t& report_epoch) {
    if (accepted) {
        report_in_flight = true;
        report_epoch = report.epoch;
        return;
    }
    runtime.on_transfer_failed();
    report_in_flight = false;
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
