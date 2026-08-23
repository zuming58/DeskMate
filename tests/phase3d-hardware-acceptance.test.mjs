import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceEvent, DeviceEventBus } from "../src/domain/deviceEvents.js";
import { MockSttAdapter } from "../src/adapters/sttAdapters.js";
import { ConfigurableTextOrganizer } from "../src/adapters/sttAdapters.js";
import { processVoiceRecording } from "../src/services/voicePipeline.js";

test("global shortcut and F22 compatibility events use the same versioned voice contract", () => {
  const bus = new DeviceEventBus();
  const received = [];
  bus.subscribe((event) => received.push(event));
  assert.equal(bus.publish(createDeviceEvent("voice-toggle", "fallback-shortcut", { shortcut: "Ctrl+Shift+Space", phase: "start" })), true);
  assert.equal(bus.publish(createDeviceEvent("voice-toggle", "f22-fallback", { shortcut: "F22", phase: "stop" })), true);
  assert.deepEqual(received.map((event) => [event.source, event.payload.phase]), [["fallback-shortcut", "start"], ["f22-fallback", "stop"]]);
});

test("STT failure saves a redacted history fallback before any output attempt", async () => {
  const saved = [];
  let outputCalls = 0;
  const result = await processVoiceRecording({
    blob: new Blob(["audio"]),
    stt: { transcribe: async () => ({ status: "error", text: "", provider: "bailian", durationMs: 12, message: "timeout" }) },
    organizer: new ConfigurableTextOrganizer(),
    saveHistory: async (entry) => { saved.push(entry); return entry; },
    output: { output: async () => { outputCalls += 1; return { ok: true }; } },
  });
  assert.equal(result.text, "录音完成，等待转写服务");
  assert.equal(saved.length, 1);
  assert.equal(outputCalls, 0);
  assert.equal(saved[0].transcript.message, "timeout");
});

test("cancelled processing keeps history and never writes output", async () => {
  const controller = new AbortController();
  const saved = [];
  let outputCalls = 0;
  const result = await processVoiceRecording({
    blob: new Blob(["audio"]),
    stt: new MockSttAdapter("保留原文"),
    organizer: { organize: async () => { controller.abort(); return { status: "cancelled", text: "保留原文", fallback: true }; } },
    organizerOptions: { mode: "smart" },
    signal: controller.signal,
    saveHistory: async (entry) => { saved.push(entry); return entry; },
    output: { output: async () => { outputCalls += 1; return { ok: true }; } },
  });
  assert.equal(saved.length, 1);
  assert.equal(result.output.cancelled, true);
  assert.equal(outputCalls, 0);
});
