import test from "node:test";
import assert from "node:assert/strict";
import { DeviceEventBus, createDeviceEvent, validateDeviceEvent } from "../src/domain/deviceEvents.js";
import { DeviceSimulator } from "../src/adapters/deviceSimulator.js";
import { ConfigurableTextOrganizer, HttpSttAdapter, MockSttAdapter, validateSttEndpoint } from "../src/adapters/sttAdapters.js";
import { SttAdapter } from "../src/adapters/voiceAdapters.js";
import { createDiagnosticReport } from "../src/services/diagnostics.js";
import { describeTranscriptionFailure, processVoiceRecording } from "../src/services/voicePipeline.js";
import { defaultState, serializeConfig } from "../src/store/appStore.js";

test("versioned events reject malformed input and duplicate simulator events", () => {
  assert.throws(() => validateDeviceEvent({ version: 2 }), /版本/);
  assert.equal(createDeviceEvent("key-diagnostic", "desktop-input").source, "desktop-input");
  const bus = new DeviceEventBus(); const received = []; bus.subscribe((event) => received.push(event));
  const event = createDeviceEvent("voice-toggle", "simulator", { sequence: 1 });
  assert.equal(bus.publish(event), true); assert.equal(bus.publish(event), false); assert.equal(received.length, 1);
});

test("simulator debounces rapid presses and reports disconnect/reconnect", () => {
  let now = 1000; const bus = new DeviceEventBus(); const events = []; bus.subscribe((event) => events.push(event)); const simulator = new DeviceSimulator(bus, { now: () => now });
  assert.equal(simulator.toggle(), true); now += 20; assert.equal(simulator.toggle(), false); simulator.disconnect(); assert.equal(simulator.toggle(), false); simulator.reconnect(); now += 400; assert.equal(simulator.toggle(), true);
  assert.deepEqual(events.map((event) => event.type), ["voice-toggle", "connection-change", "connection-change", "voice-toggle"]);
});

test("mock STT succeeds while unconfigured real adapter stays pending", async () => {
  assert.equal((await new MockSttAdapter("确定文本").transcribe(new Blob())).text, "确定文本");
  assert.equal((await new SttAdapter().transcribe(new Blob())).status, "pending");
  assert.equal((await new SttAdapter({ maxBytes: 1 }).transcribe(new Blob(["xx"]))).status, "error");
});

test("HTTP STT enforces size, cancellation, timeout, and one retry", async () => {
  const tooLarge = await new HttpSttAdapter({ endpoint: "https://example.invalid", maxBytes: 1 }).transcribe(new Blob(["xx"])); assert.match(tooLarge.message, /超过/);
  assert.match((await new MockSttAdapter("text", { maxBytes: 1 }).transcribe(new Blob(["xx"]))).message, /超过/);
  const cancelled = new AbortController(); cancelled.abort(); assert.equal((await new HttpSttAdapter({ endpoint: "https://example.invalid" }).transcribe(new Blob(), { signal: cancelled.signal })).status, "cancelled");
  let calls = 0; const retried = await new HttpSttAdapter({ endpoint: "https://example.invalid", fetchImpl: async () => { calls += 1; if (calls === 1) throw new Error("temporary"); return { ok: true, json: async () => ({ text: "成功" }) }; } }).transcribe(new Blob()); assert.equal(retried.status, "success"); assert.equal(calls, 2);
  let clientErrorCalls = 0; const clientError = await new HttpSttAdapter({ endpoint: "https://example.invalid", fetchImpl: async () => { clientErrorCalls += 1; return { ok: false, status: 400 }; } }).transcribe(new Blob()); assert.equal(clientError.status, "error"); assert.equal(clientErrorCalls, 1);
  const timeout = await new HttpSttAdapter({ endpoint: "https://example.invalid", timeoutMs: 5, fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))) }).transcribe(new Blob()); assert.match(timeout.message, /超时/);
});

test("HTTP STT requires encryption except for loopback development services", async () => {
  assert.equal(validateSttEndpoint("https://stt.example.com/v1").protocol, "https:");
  assert.equal(validateSttEndpoint("http://localhost:8000/stt").hostname, "localhost");
  assert.throws(() => validateSttEndpoint("http://192.168.1.9/stt"), /HTTPS/);
  assert.throws(() => validateSttEndpoint("https://user:pass@stt.example.com/v1"), /用户名/);
  assert.throws(() => validateSttEndpoint("https://stt.example.com/v1?api_key=secret"), /Token/);
  let called = false;
  const rejected = await new HttpSttAdapter({ endpoint: "http://stt.example.com", fetchImpl: async () => { called = true; } }).transcribe(new Blob(["audio"]));
  assert.equal(rejected.status, "error");
  assert.equal(called, false);
});

test("configuration exports never include the locally configured STT endpoint", () => {
  const state = structuredClone(defaultState); state.settings.sttEndpoint = "https://private.example/stt"; state.settings.sttMode = "http"; state.history = [{ id: 1, time: "10:00", rawText: "secret raw", text: "secret final" }]; state.diagnostics = { organizer: { status: "success" } };
  const exported = serializeConfig(state);
  assert.doesNotMatch(exported, /private\.example|secret raw|secret final/);
  assert.equal(JSON.parse(exported).settings.sttEndpoint, "");
  assert.equal(JSON.parse(exported).runtime, undefined);
  assert.deepEqual(JSON.parse(exported).history, []);
  assert.equal(JSON.parse(exported).diagnostics, undefined);
});

test("raw smart custom organizers degrade without losing transcription", async () => {
  const organizer = new ConfigurableTextOrganizer(); const rules = [{ from: "桌面宠物", to: "桌宠" }];
  assert.equal((await organizer.organize("桌面宠物", { mode: "raw", rules })).text, "桌宠");
  const smart = await organizer.organize("原文", { mode: "smart" }); assert.equal(smart.text, "原文"); assert.equal(smart.fallback, true);
  const custom = await organizer.organize("原文", { mode: "custom", customRule: "" }); assert.equal(custom.text, "原文"); assert.equal(custom.fallback, true);
});

test("diagnostics export removes secrets and content", () => {
  const report = createDiagnosticReport({ schemaVersion: 99, generatedAt: "forged", token: "secret", wifiPassword: "secret", transcript: "spoken", localPath: "private", serialNumber: "serial-secret", windowTitle: "private-window", ipAddress: "192.168.1.4", runtime: "web", nested: { apiKey: "secret", status: "ok" }, lanAudio: { status: "streaming", configured: true, networkReady: true, heartbeat: true, micTest: true, audioHost: "192.168.1.4", counters: { audioFrames: 12, sequenceGaps: 2 } }, conversation: { state: "speaking", serviceConfigured: true, connected: true, input: "easyinput", fallback: true, error: "safe-error", transcript: "private transcript", responseText: "private response", counters: { sourceChunks: 8, sinkChunks: 9, queueDrops: 1 } } });
  const serialized = JSON.stringify(report); assert.doesNotMatch(serialized, /secret|spoken|private|192\.168/); assert.equal(report.nested.status, "ok"); assert.equal(report.lanAudio.status, "streaming"); assert.equal(report.lanAudio.counters.audioFrames, 12); assert.equal(report.lanAudio.counters.sequenceGaps, 2);
  assert.equal(report.schemaVersion, 1); assert.notEqual(report.generatedAt, "forged");
  assert.deepEqual(report.conversation, { state: "speaking", serviceConfigured: true, connected: true, input: "easyinput", output: "computer", fallback: true, error: "safe-error", counters: { sourceChunks: 8, sinkChunks: 9, rejectedEvents: 0, interruptions: 0, queueDrops: 1 } });
});

test("smart organizer returns structured metadata and uses pre-applied rules", async () => {
  let received;
  const organizer = new ConfigurableTextOrganizer({ smartOrganizer: { organize: async (text, options) => { received = { text, options }; return { text: "整理结果", model: "qwen3.7-flash", durationMs: 321, status: "success" }; } } });
  const value = await organizer.organize("桌面宠物", { mode: "smart", hotwords: ["DeskMate"], rules: [{ from: "桌面宠物", to: "桌宠" }] });
  assert.equal(received.text, "桌宠");
  assert.equal(received.options.hotwords[0], "DeskMate");
  assert.deepEqual(value, { text: "整理结果", model: "qwen3.7-flash", durationMs: 321, status: "success", mode: "smart", fallback: false });
});

test("organizer cancellation keeps the raw transcript and suppresses output", async () => {
  const saved = []; let outputCalls = 0; const controller = new AbortController();
  const response = await processVoiceRecording({ blob: new Blob(["audio"]), stt: new MockSttAdapter("原始转写"), organizer: { organize: async () => { controller.abort(); return { text: "原始转写", status: "cancelled", fallback: true }; } }, organizerOptions: { mode: "smart" }, signal: controller.signal, saveHistory: async (item) => { saved.push(item); return item; }, output: { output: async () => { outputCalls += 1; return { ok: true }; } } });
  assert.equal(saved[0].text, "原始转写");
  assert.equal(response.output.cancelled, true);
  assert.equal(outputCalls, 0);
});

test("mock transcription is saved before clipboard failure", async () => {
  const saved = [];
  const response = await processVoiceRecording({ blob: new Blob(["audio"]), stt: new MockSttAdapter("模拟转写"), organizer: new ConfigurableTextOrganizer(), organizerOptions: { mode: "raw" }, saveHistory: async (item) => { saved.push(item); return item; }, output: { output: async () => { throw new Error("clipboard denied"); } }, outputMode: "clipboard" });
  assert.equal(saved[0].text, "模拟转写"); assert.equal(response.output.ok, false);
});

test("STT error keeps recording history fallback", async () => {
  const saved = [];
  await processVoiceRecording({ blob: new Blob(["audio"]), stt: { transcribe: async () => ({ status: "error", text: "", provider: "test", durationMs: 1, message: "failed" }) }, organizer: new ConfigurableTextOrganizer(), saveHistory: async (item) => { saved.push(item); return item; }, output: { output: async () => ({ ok: true }) } });
  assert.equal(saved[0].text, "录音已保存，语音识别请求失败");
  assert.equal(saved[0].failure.code, "request-failed");
});

test("STT failures use distinct redacted user messages", () => {
  assert.equal(describeTranscriptionFailure({ status: "pending", message: "转写服务未配置" }).code, "configuration");
  assert.equal(describeTranscriptionFailure({ status: "error", message: "request timeout" }).code, "timeout");
  assert.equal(describeTranscriptionFailure({ status: "error", message: "响应中没有识别文字" }).code, "empty-result");
  assert.equal(describeTranscriptionFailure({ status: "error", message: "录音数据无效" }).code, "invalid-audio");
  const remote = describeTranscriptionFailure({ status: "error", message: "remote secret detail" });
  assert.equal(remote.code, "request-failed");
  assert.doesNotMatch(JSON.stringify(remote), /remote secret detail/);
});

test("empty successful transcription is downgraded without output", async () => {
  const saved = []; let outputCalls = 0;
  const result = await processVoiceRecording({ blob: new Blob(["audio"]), stt: { transcribe: async () => ({ status: "success", text: "", provider: "test", durationMs: 1 }) }, organizer: new ConfigurableTextOrganizer(), saveHistory: async (item) => { saved.push(item); return item; }, output: { output: async () => { outputCalls += 1; return { ok: true }; } } });
  assert.equal(result.failure.code, "empty-result");
  assert.equal(saved[0].text, "录音已保存，但未识别到有效文字");
  assert.equal(outputCalls, 0);
});

test("organizer exception safely falls back to raw transcription", async () => {
  const saved = [];
  const response = await processVoiceRecording({ blob: new Blob(["audio"]), stt: new MockSttAdapter("原始转写"), organizer: { organize: async () => { throw new Error("organizer failed"); } }, saveHistory: async (item) => { saved.push(item); return item; }, output: { output: async () => ({ ok: true }) } });
  assert.equal(response.text, "原始转写"); assert.equal(saved[0].text, "原始转写"); assert.equal(response.organized.fallback, true);
});

test("active-window output failure falls back to clipboard after history is saved", async () => {
  const sequence = [];
  const response = await processVoiceRecording({ blob: new Blob(["audio"]), stt: new MockSttAdapter("回退文本"), organizer: new ConfigurableTextOrganizer(), organizerOptions: { mode: "raw" }, saveHistory: async (item) => { sequence.push("history"); return item; }, outputMode: "active-window", output: { output: async (_text, mode) => { sequence.push(mode); return mode === "active-window" ? { ok: false, reason: "target-window-changed" } : { ok: true, mode }; } } });
  assert.deepEqual(sequence, ["history", "active-window", "clipboard"]);
  assert.equal(response.output.ok, true);
  assert.equal(response.output.fallbackFrom, "active-window");
});
