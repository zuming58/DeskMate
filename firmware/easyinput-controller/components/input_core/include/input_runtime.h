#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>

#include "hid_report.h"
#include "input_core.h"

namespace deskmate::easyinput {

inline constexpr size_t kRawEdgeQueueCapacity = 64;
inline constexpr size_t kInputEventQueueCapacity = 32;
inline constexpr size_t kHidReportQueueCapacity = 16;
inline constexpr uint16_t kUsbVid = 0x303a;
inline constexpr uint16_t kUsbPid = 0x1006;
inline constexpr uint8_t kKeyboardReportId = 0x01;
inline constexpr uint8_t kMouseReportId = 0x02;
inline constexpr uint8_t kUsbInterfaceStringIndex = 0;
inline constexpr size_t kUsbDeviceDescriptorLength = 18;
inline constexpr size_t kUsbConfigurationDescriptorLength = 34;
inline constexpr size_t kUsbLifecycleQueueCapacity = 16;
inline constexpr uint32_t kUsbDisconnectConfirmMs = 25;

extern const std::array<uint8_t, kUsbDeviceDescriptorLength> kUsbDeviceDescriptor;
extern const std::array<uint8_t, kUsbConfigurationDescriptorLength> kUsbConfigurationDescriptor;
extern const char kUsbLanguageDescriptor[];
extern std::array<const char*, 3> kUsbStringDescriptors;

enum class UsbLifecycleEventKind : uint8_t {
    Mount,
    Unmount,
    Resume,
    TransferComplete,
    TransferFailed,
};

struct UsbLifecycleEvent {
    UsbLifecycleEventKind kind{UsbLifecycleEventKind::Resume};
    uint32_t epoch{0};
    uint8_t report_id{0};
    uint8_t length{0};
    std::array<uint8_t, 8> payload{};
    bool report_identity_valid{false};
};

// Single-producer (TinyUSB callback task), single-consumer (input owner) queue.
class UsbLifecycleEventQueue {
public:
    bool publish(UsbLifecycleEvent event);
    bool consume(UsbLifecycleEvent& event);
    size_t queued() const;
    uint32_t take_drops();
    void discard_pending();

private:
    // One slot distinguishes full from empty, so storage is capacity + 1.
    std::array<UsbLifecycleEvent, kUsbLifecycleQueueCapacity + 1> events_{};
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};
    std::atomic<uint32_t> drops_{0};
};

enum class InputSourceId : uint8_t { S1, S2, S3, S4, S5, S6, S7, S8, EncoderPress, Count };
enum class ScrollAxis : uint8_t { Vertical, Horizontal };

struct MouseWheelSnapshot {
    int8_t vertical{0};
    int8_t horizontal{0};
};

std::array<uint8_t, 8> serialize_keyboard_report(const KeyboardSnapshot& snapshot);
std::array<uint8_t, 5> serialize_mouse_report(const MouseWheelSnapshot& snapshot);

struct RuntimeDiagnosticsSnapshot {
    uint32_t raw_edge_drops{0};
    uint32_t input_event_drops{0};
    uint32_t hid_report_drops{0};
    uint32_t encoder_resyncs{0};
    uint32_t usb_mount_epoch{0};
    uint32_t usb_lifecycle_drops{0};
};

struct UsbCallbackSnapshot {
    bool mounted{false};
    uint32_t epoch{0};
};

class UsbPhysicalPresenceMonitor {
public:
    explicit UsbPhysicalPresenceMonitor(
        uint32_t disconnect_confirm_ms = kUsbDisconnectConfirmMs)
        : disconnect_confirm_ms_(disconnect_confirm_ms) {}
    void reset(bool present, uint32_t now_ms);
    bool update(bool raw_present, uint32_t now_ms);
    bool present() const { return present_; }
    bool disconnect_pending() const { return disconnect_pending_; }

private:
    uint32_t disconnect_confirm_ms_{25};
    uint32_t candidate_since_ms_{0};
    bool initialized_{false};
    bool present_{false};
    bool disconnect_pending_{false};
};

class UsbCallbackLifecycleState {
public:
    UsbLifecycleEvent on_mount();
    bool try_mount(bool physical_present, UsbLifecycleEvent& event);
    void on_physical_disconnect();
    UsbLifecycleEvent on_unmount();
    UsbLifecycleEvent current_event(UsbLifecycleEventKind kind) const;
    UsbCallbackSnapshot snapshot() const;

private:
    std::atomic<uint32_t> epoch_{0};
    std::atomic<bool> mounted_{false};
    uint32_t next_epoch();
};

struct UsbLifecycleProcessResult {
    uint32_t dropped_events{0};
};

struct RoutedAction {
    bool keyboard_changed{false};
    KeyboardSnapshot keyboard{};
    bool wheel_changed{false};
    MouseWheelSnapshot wheel{};
};

class InputActionRouter {
public:
    struct Chord { HidUsage usage; uint8_t modifiers; };
    RoutedAction apply(const InputEvent& event);
    RoutedAction apply_key_source(InputSourceId source, bool pressed, Chord chord);
    void release_all();
    KeyboardSnapshot keyboard() const;
    ScrollAxis axis() const { return axis_; }

private:
    struct OwnedChord { bool held{false}; Chord chord{HidUsage::None, 0}; };
    std::array<OwnedChord, 8> owned_{};
    ScrollAxis axis_{ScrollAxis::Vertical};
    KeyboardSnapshot compose() const;
};

enum class HidReportKind : uint8_t { Keyboard, Mouse };
struct QueuedHidReport {
    HidReportKind kind{HidReportKind::Keyboard};
    uint8_t report_id{0};
    uint8_t length{0};
    std::array<uint8_t, 8> payload{};
    uint32_t epoch{0};
};

struct HidReportTransferState {
    bool active{false};
    QueuedHidReport report{};

    void clear() {
        active = false;
        report = {};
    }
};

class UsbInputRuntime {
public:
    void on_mount();
    void on_mount(uint32_t epoch);
    void on_unmount();
    void on_resume();
    void on_input(const InputEvent& event);
    // Publishes the debounced physical key snapshot, including cold-boot state.
    void observe_physical_key_mask(uint8_t active_key_mask);
    void observe_physical_presence(bool present);
    void on_raw_edge_drops(uint32_t count);
    void on_encoder_resync();
    void on_input_event_drops(uint32_t count);
    void on_usb_lifecycle_drops(uint32_t count);
    void reconcile_usb_lifecycle(UsbCallbackSnapshot callback);
    void recover_after_input_drop(uint8_t active_key_mask);
    void on_transfer_failed();
    bool front_report(QueuedHidReport& report) const;
    void complete_report();
    bool reject_vendor_feature(uint8_t report_id, const uint8_t* data, size_t length) const;
    RuntimeDiagnosticsSnapshot diagnostics() const { return diagnostics_; }
    bool mounted() const { return mounted_; }
    size_t queued_reports() const { return queue_size_; }

private:
    InputActionRouter router_;
    RuntimeDiagnosticsSnapshot diagnostics_{};
    std::array<QueuedHidReport, kHidReportQueueCapacity> queue_{};
    std::array<bool, 8> physically_held_{};
    size_t queue_head_{0};
    size_t queue_size_{0};
    bool mounted_{false};
    bool suppress_until_all_released_{false};
    bool release_barrier_pending_{false};
    bool physical_snapshot_observed_{false};
    bool release_confirmation_enqueued_{false};
    bool mount_release_completed_{false};
    bool mount_release_sequence_active_{false};
    // TinyUSB completion only confirms controller-side acceptance. Reassert
    // the first all-released state once before opening the lifetime barrier.
    bool mount_release_repeat_pending_{false};
    static void saturating_add(uint32_t& value, uint32_t amount);
    void clear_queue();
    bool enqueue(const QueuedHidReport& report);
    void enqueue_keyboard(const KeyboardSnapshot& snapshot);
    void enqueue_wheel(const MouseWheelSnapshot& snapshot);
    bool any_held() const;
    void maybe_enqueue_release_report(bool had_snapshot, bool was_held,
                                      bool now_held);
    void recover_release();
};

UsbLifecycleProcessResult process_usb_lifecycle_events(
    UsbLifecycleEventQueue& events, UsbInputRuntime& runtime,
    HidReportTransferState& transfer,
    UsbCallbackSnapshot callback);

bool prepare_hid_report(UsbInputRuntime& runtime, bool endpoint_ready,
                        const HidReportTransferState& transfer,
                        QueuedHidReport& report);
void finish_hid_send_attempt(UsbInputRuntime& runtime,
                             const QueuedHidReport& report, bool accepted,
                             HidReportTransferState& transfer);
uint16_t usb_wire_report_length(uint8_t report_id);
UsbLifecycleEvent make_usb_transfer_event(
    UsbLifecycleEventKind kind, uint32_t epoch,
    const uint8_t* wire_report, uint16_t wire_length);

extern const uint8_t kHidReportDescriptor[];
extern const size_t kHidReportDescriptorSize;

}  // namespace deskmate::easyinput
