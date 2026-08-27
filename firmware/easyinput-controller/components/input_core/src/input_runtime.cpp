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

UsbDeviceConnectionAction UsbDeviceConnectionGate::next_action(
    bool driver_ready, bool physical_present) {
    if (!driver_ready) {
        driver_ready_observed_ = false;
        return UsbDeviceConnectionAction::None;
    }
    if (!driver_ready_observed_) {
        // tinyusb_driver_install() leaves the DCD connected by default.
        driver_ready_observed_ = true;
        connected_ = true;
    }
    if (connected_ == physical_present) {
        return UsbDeviceConnectionAction::None;
    }
    return physical_present ? UsbDeviceConnectionAction::Connect
                            : UsbDeviceConnectionAction::Disconnect;
}

void UsbDeviceConnectionGate::mark_applied(
    UsbDeviceConnectionAction action) {
    if (action == UsbDeviceConnectionAction::Connect) {
        connected_ = true;
    } else if (action == UsbDeviceConnectionAction::Disconnect) {
        connected_ = false;
    }
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
    mount_release_sequence_active_ = true;
    suppress_until_all_released_ = true;
    mount_release_repeat_pending_ = any_held();
    raw_disconnect_release_armed_ = false;
    begin_release_reassertion();
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
    mount_release_sequence_active_ = false;
    mount_release_repeat_pending_ = false;
    release_reassert_active_ = false;
    release_reassert_started_ = false;
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
    if (release_barrier_pending_ && had_snapshot && was_held && !now_held) {
        begin_release_reassertion();
    }
    if (!had_snapshot && now_held && mount_release_completed_) {
        release_barrier_pending_ = true;
        release_confirmation_enqueued_ = false;
        suppress_until_all_released_ = true;
        // The first mount report may have completed before the owner task
        // observed a key that was already held at enumeration. Reassert one
        // release report for that newly discovered physical state.
        enqueue_keyboard({});
    } else if (mount_release_sequence_active_ && now_held &&
               !mount_release_completed_) {
        // A cold-boot key can become visible after the mount callback but
        // before its first release report completes.
        mount_release_repeat_pending_ = true;
    }
    maybe_enqueue_release_report(had_snapshot, was_held, now_held);
    if (release_barrier_pending_) suppress_until_all_released_ = true;
}

void UsbInputRuntime::observe_raw_physical_presence(bool present) {
    if (present) {
        raw_disconnect_release_armed_ = false;
        return;
    }
    if (!mounted_ || raw_disconnect_release_armed_) return;
    raw_disconnect_release_armed_ = true;
    recover_release();
}

void UsbInputRuntime::observe_physical_presence(bool present) {
    if (present || !mounted_) return;
    on_unmount();
}

void UsbInputRuntime::begin_release_reassertion() {
    release_reassert_active_ = true;
    release_reassert_started_ = false;
}

void UsbInputRuntime::service_release_reassertion(uint32_t now_ms) {
    if (!mounted_ || !release_reassert_active_) return;
    if (!release_reassert_started_) {
        // Do not consume the recovery window while the endpoint is not ready
        // or the first all-released report is still in flight.
        if (queue_size_ != 0) return;
        release_reassert_started_ = true;
        release_reassert_started_ms_ = now_ms;
        release_reassert_last_ms_ = now_ms;
        return;
    }

    const uint32_t elapsed = now_ms - release_reassert_started_ms_;
    if (elapsed >= kUsbReleaseReassertWindowMs) {
        if (queue_size_ != 0) return;
        release_reassert_active_ = false;
        release_reassert_started_ = false;
        if (!any_held()) {
            release_barrier_pending_ = false;
            release_confirmation_enqueued_ = false;
            suppress_until_all_released_ = false;
        }
        return;
    }

    if (queue_size_ == 0 &&
        static_cast<uint32_t>(now_ms - release_reassert_last_ms_) >=
            kUsbReleaseReassertIntervalMs) {
        enqueue_keyboard({});
        release_reassert_last_ms_ = now_ms;
    }
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
    mount_release_sequence_active_ = false;
    mount_release_repeat_pending_ = false;
    begin_release_reassertion();
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
    if (release_reassert_active_ &&
        (event.type == InputEventType::KeyPressed ||
         event.type == InputEventType::EncoderPressed ||
         event.type == InputEventType::EncoderStep)) {
        release_reassert_active_ = false;
        release_reassert_started_ = false;
    }
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
    mount_release_sequence_active_ = true;
    mount_release_repeat_pending_ = any_held();
    begin_release_reassertion();
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
        completed.payload == serialize_keyboard_report({})) {
        if (mount_release_sequence_active_) {
            const bool repeat = mount_release_repeat_pending_;
            mount_release_repeat_pending_ = false;
            mount_release_sequence_active_ = false;
            if (repeat && queue_size_ == 0) {
                // Keep a held reconnect closed across at least one additional
                // all-released transfer before the timed reassertion window.
                mount_release_sequence_active_ = true;
                enqueue_keyboard({});
                return;
            }
        }
        if (queue_size_ != 0) return;
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
    HidReportTransferState& transfer,
    UsbCallbackSnapshot callback) {
    UsbLifecycleProcessResult result{};
    result.dropped_events = events.take_drops();
    if (result.dropped_events != 0) {
        events.discard_pending();
        transfer.clear();
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
                    transfer.clear();
                }
                break;
            case UsbLifecycleEventKind::Unmount:
                if (runtime.mounted() &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch) {
                    runtime.on_unmount();
                    transfer.clear();
                }
                break;
            case UsbLifecycleEventKind::Resume:
                if (runtime.mounted() &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch) {
                    runtime.on_resume();
                }
                break;
            case UsbLifecycleEventKind::TransferComplete:
                if (transfer.active && event.report_identity_valid &&
                    event.epoch == transfer.report.epoch &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch &&
                    event.report_id == transfer.report.report_id &&
                    event.length == transfer.report.length &&
                    std::equal(event.payload.begin(),
                               event.payload.begin() + event.length,
                               transfer.report.payload.begin())) {
                    runtime.complete_report();
                    transfer.clear();
                }
                break;
            case UsbLifecycleEventKind::TransferFailed:
                if (transfer.active && event.report_identity_valid &&
                    event.epoch == transfer.report.epoch &&
                    event.epoch == runtime.diagnostics().usb_mount_epoch &&
                    event.report_id == transfer.report.report_id &&
                    event.length == transfer.report.length &&
                    std::equal(event.payload.begin(),
                               event.payload.begin() + event.length,
                               transfer.report.payload.begin())) {
                    runtime.on_transfer_failed();
                    transfer.clear();
                }
                break;
        }
    }
    return result;
}

bool prepare_hid_report(UsbInputRuntime& runtime, bool endpoint_ready,
                        const HidReportTransferState& transfer,
                        QueuedHidReport& report) {
    return endpoint_ready && !transfer.active && runtime.front_report(report);
}

void finish_hid_send_attempt(UsbInputRuntime& runtime,
                             const QueuedHidReport& report, bool accepted,
                             HidReportTransferState& transfer) {
    if (accepted) {
        transfer.active = true;
        transfer.report = report;
        return;
    }
    runtime.on_transfer_failed();
    transfer.clear();
}

uint16_t usb_wire_report_length(uint8_t report_id) {
    switch (report_id) {
        case kKeyboardReportId:
            return 1u + 8u;
        case kMouseReportId:
            return 1u + 5u;
        default:
            return 0;
    }
}

UsbLifecycleEvent make_usb_transfer_event(
    UsbLifecycleEventKind kind, uint32_t epoch,
    const uint8_t* wire_report, uint16_t wire_length) {
    UsbLifecycleEvent event{kind, epoch};
    if (wire_report == nullptr || wire_length == 0) return event;
    const uint16_t expected_length = usb_wire_report_length(wire_report[0]);
    if (expected_length == 0 || wire_length != expected_length) return event;
    event.report_id = wire_report[0];
    event.length = static_cast<uint8_t>(wire_length - 1u);
    std::copy_n(wire_report + 1, event.length, event.payload.begin());
    event.report_identity_valid = true;
    return event;
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
