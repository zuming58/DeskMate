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
};

// Single-producer (TinyUSB callback task), single-consumer (input owner) queue.
class UsbLifecycleEventQueue {
public:
    bool publish(UsbLifecycleEvent event);
    bool consume(UsbLifecycleEvent& event);
    size_t queued() const;

private:
    std::array<UsbLifecycleEvent, kUsbLifecycleQueueCapacity> events_{};
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};
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

class UsbInputRuntime {
public:
    void on_mount();
    void on_unmount();
    void on_resume();
    void on_input(const InputEvent& event);
    void on_raw_edge_drops(uint32_t count);
    void on_encoder_resync();
    void on_input_event_drops(uint32_t count);
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
    static void saturating_add(uint32_t& value, uint32_t amount);
    void clear_queue();
    bool enqueue(const QueuedHidReport& report);
    void enqueue_keyboard(const KeyboardSnapshot& snapshot);
    void enqueue_wheel(const MouseWheelSnapshot& snapshot);
    bool any_held() const;
    void recover_release();
};

extern const uint8_t kHidReportDescriptor[];
extern const size_t kHidReportDescriptorSize;

}  // namespace deskmate::easyinput
