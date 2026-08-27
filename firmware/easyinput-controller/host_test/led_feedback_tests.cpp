#include <array>
#include <cstdint>
#include <iostream>

#include "input_runtime.h"
#include "led_feedback.h"

using namespace deskmate::easyinput;

namespace {
int failures = 0;
void check(bool passed, const char* expression, const char* file, int line) {
    if (passed) return;
    std::cerr << file << ':' << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}
#define CHECK(...) check((__VA_ARGS__), #__VA_ARGS__, __FILE__, __LINE__)

InputEvent key(uint8_t index, bool pressed) {
    return {pressed ? InputEventType::KeyPressed : InputEventType::KeyReleased, index, 0};
}

void eight_key_vectors_and_release_silence() {
    constexpr std::array<Rgb, 8> colors{{
        {28, 0, 0}, {28, 10, 0}, {26, 20, 0}, {0, 28, 0},
        {0, 22, 22}, {0, 0, 28}, {18, 0, 28}, {22, 22, 22},
    }};
    for (uint8_t index = 0; index < colors.size(); ++index) {
        const auto feedback = feedback_for_input_event(key(index, true));
        CHECK(feedback.active);
        CHECK(feedback.effect == LedEffectKind::Ripple);
        CHECK(feedback.direction == LedDirection::None);
        CHECK(feedback.color == colors[index]);
        CHECK(feedback.duration_ms == 140);
        CHECK(feedback.frame_interval_ms == 35);
        CHECK(!feedback_for_input_event(key(index, false)).active);
    }
    CHECK(!feedback_for_input_event(key(8, true)).active);
}

void encoder_vectors_and_invalid_events() {
    const auto left = feedback_for_input_event({InputEventType::EncoderStep, 0, -1});
    const auto right = feedback_for_input_event({InputEventType::EncoderStep, 0, 1});
    const auto pressed = feedback_for_input_event({InputEventType::EncoderPressed, 0, 0});
    CHECK(left.active && left.effect == LedEffectKind::DirectionalFlow);
    CHECK(left.direction == LedDirection::Left && left.color == Rgb{0, 0, 28});
    CHECK(left.duration_ms == 160 && left.frame_interval_ms == 40);
    CHECK(right.active && right.direction == LedDirection::Right);
    CHECK(right.color == Rgb{0, 22, 22});
    CHECK(pressed.active && pressed.effect == LedEffectKind::ConfirmPulse);
    CHECK(pressed.color == Rgb{22, 18, 10});
    CHECK(pressed.duration_ms == 300 && pressed.frame_interval_ms == 60);
    CHECK(!feedback_for_input_event({InputEventType::EncoderStep, 0, 0}).active);
    CHECK(!feedback_for_input_event({InputEventType::EncoderReleased, 0, 0}).active);
}

void ripple_frames_and_final_black() {
    LedFeedbackAnimator animator;
    LedFrame frame{};
    animator.start(feedback_for_input_event(key(0, true)), 100);
    CHECK(animator.update(100, frame));
    const LedFrame ripple0{{{}, {5, 0, 0}, {28, 0, 0}, {5, 0, 0}, {}}};
    CHECK(frame == ripple0);
    CHECK(!animator.update(134, frame));
    CHECK(animator.update(135, frame));
    const LedFrame ripple1{{{7, 0, 0}, {28, 0, 0}, {14, 0, 0}, {28, 0, 0}, {7, 0, 0}}};
    CHECK(frame == ripple1);
    CHECK(animator.update(170, frame));
    const LedFrame ripple2{{{28, 0, 0}, {7, 0, 0}, {}, {7, 0, 0}, {28, 0, 0}}};
    CHECK(frame == ripple2);
    CHECK(animator.update(205, frame));
    const LedFrame ripple3{{{7, 0, 0}, {4, 0, 0}, {3, 0, 0}, {4, 0, 0}, {7, 0, 0}}};
    CHECK(frame == ripple3);
    CHECK(animator.update(240, frame));
    const LedFrame black{};
    CHECK(frame == black);
    CHECK(!animator.active());
    CHECK(!animator.update(241, frame));
}

void direction_pulse_grb_and_replacement() {
    LedFeedbackAnimator animator;
    LedFrame frame{};
    animator.start(feedback_for_input_event({InputEventType::EncoderStep, 0, 1}), 0);
    CHECK(animator.update(0, frame));
    CHECK(frame[0] == Rgb{0, 22, 22});
    CHECK(frame[1] == Rgb{0, 1, 1});
    CHECK(animator.update(40, frame));
    CHECK(frame[1] == Rgb{0, 22, 22});

    animator.start(feedback_for_input_event({InputEventType::EncoderStep, 0, -1}), 50);
    CHECK(animator.update(50, frame));
    CHECK(frame[4] == Rgb{0, 0, 28});
    CHECK(frame[3] == Rgb{0, 0, 2});

    animator.start(feedback_for_input_event({InputEventType::EncoderPressed, 0, 0}), 70);
    CHECK(animator.update(70, frame));
    CHECK(frame[2] == Rgb{9, 7, 4});
    CHECK(frame[0] == Rgb{5, 4, 2});
    CHECK(animator.update(130, frame));
    CHECK(frame[2] == Rgb{22, 18, 10});

    const LedGrbBytes grb = serialize_led_frame_grb(
        LedFrame{{{1, 2, 3}, {4, 5, 6}, {}, {}, {7, 8, 9}}});
    const LedGrbBytes expected{{2, 1, 3, 5, 4, 6, 0, 0, 0, 0, 0, 0, 8, 7, 9}};
    CHECK(grb == expected);
}

void mailbox_overwrite_diagnostics_and_time_wrap() {
    LedFeedbackMailbox mailbox;
    LedFeedbackDiagnostics diagnostics;
    const auto s1 = feedback_for_input_event(key(0, true));
    const auto s8 = feedback_for_input_event(key(7, true));
    CHECK(mailbox.publish(s1, diagnostics));
    CHECK(mailbox.publish(s8, diagnostics));
    CHECK(diagnostics.snapshot().led_feedback_dropped == 1);
    LedFeedbackEvent consumed{};
    CHECK(mailbox.consume(consumed));
    CHECK(consumed.color == s8.color);
    CHECK(!mailbox.consume(consumed));
    CHECK(!mailbox.publish({}, diagnostics));

    diagnostics.record_init_failure();
    diagnostics.record_tx_failure();
    CHECK(diagnostics.snapshot().led_init_failures == 1);
    CHECK(diagnostics.snapshot().led_tx_failures == 1);
    for (uint64_t index = 1; index < static_cast<uint64_t>(UINT32_MAX); index <<= 1) {
        diagnostics.record_tx_failure();
    }
    CHECK(diagnostics.snapshot().led_tx_failures > 1);

    LedFeedbackAnimator animator;
    LedFrame frame{};
    animator.start(s1, UINT32_MAX - 20);
    CHECK(animator.update(UINT32_MAX - 20, frame));
    CHECK(animator.update(14, frame));
    CHECK(animator.active());
    CHECK(animator.update(119, frame));
    const LedFrame black{};
    CHECK(frame == black);
}

void confirmed_input_only_and_latest_event_wins() {
    InputCore input;
    LedFeedbackMailbox mailbox;
    LedFeedbackDiagnostics diagnostics;
    InputEvent event{};

    input.scan_keys(0, 0);
    input.scan_keys(0x03, 1);
    input.scan_keys(0x03, 20);
    CHECK(!input.pop_event(event));
    input.scan_keys(0x03, 21);
    CHECK(input.pop_event(event));
    CHECK(event.type == InputEventType::KeyPressed && event.index == 0);
    CHECK(mailbox.publish(feedback_for_input_event(event), diagnostics));
    CHECK(input.pop_event(event));
    CHECK(event.type == InputEventType::KeyPressed && event.index == 1);
    CHECK(mailbox.publish(feedback_for_input_event(event), diagnostics));
    CHECK(diagnostics.snapshot().led_feedback_dropped == 1);

    LedFeedbackEvent latest{};
    CHECK(mailbox.consume(latest));
    CHECK(latest.color == Rgb{28, 10, 0});

    input.scan_keys(0x03, 1000);
    CHECK(!input.pop_event(event));
    input.scan_keys(0, 1001);
    input.scan_keys(0, 1021);
    CHECK(input.pop_event(event));
    CHECK(event.type == InputEventType::KeyReleased);
    CHECK(!feedback_for_input_event(event).active);
    CHECK(input.pop_event(event));
    CHECK(event.type == InputEventType::KeyReleased);
    CHECK(!feedback_for_input_event(event).active);
    CHECK(!input.pop_event(event));

    input.scan_encoder_phase(0, 1100);
    input.scan_encoder_phase(1, 1101);
    input.scan_encoder_phase(0, 1102);
    CHECK(!input.pop_event(event));
}

void led_failures_do_not_change_t03_runtime() {
    UsbInputRuntime baseline;
    UsbInputRuntime observed;
    baseline.on_mount();
    observed.on_mount();
    baseline.complete_report();
    observed.complete_report();

    LedFeedbackDiagnostics diagnostics;
    diagnostics.record_init_failure();
    diagnostics.record_tx_failure();
    const InputEvent event = key(5, true);
    baseline.on_input(event);
    observed.on_input(event);
    CHECK(baseline.queued_reports() == observed.queued_reports());
    QueuedHidReport expected{};
    QueuedHidReport actual{};
    CHECK(baseline.front_report(expected));
    CHECK(observed.front_report(actual));
    CHECK(expected.report_id == actual.report_id);
    CHECK(expected.length == actual.length);
    CHECK(expected.payload == actual.payload);
    CHECK(diagnostics.snapshot().led_init_failures == 1);
    CHECK(diagnostics.snapshot().led_tx_failures == 1);
}
}  // namespace

int main() {
    eight_key_vectors_and_release_silence();
    encoder_vectors_and_invalid_events();
    ripple_frames_and_final_black();
    direction_pulse_grb_and_replacement();
    mailbox_overwrite_diagnostics_and_time_wrap();
    confirmed_input_only_and_latest_event_wins();
    led_failures_do_not_change_t03_runtime();
    if (failures != 0) {
        std::cerr << "led_feedback_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "led_feedback_tests: PASS\n";
    return 0;
}
