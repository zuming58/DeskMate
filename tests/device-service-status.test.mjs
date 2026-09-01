import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deviceServiceStatus } from "../src/domain/deviceServiceStatus.js";

test("companion and diagnostics share every bounded Link state", () => {
  const expected = { connected: "已连接", waiting: "等待连接", faulted: "故障", disabled: "未启用" };
  for (const [state, label] of Object.entries(expected)) {
    const status = deviceServiceStatus({ inputBridge: { boardConnected: true, linkDiagnostics: { state } } });
    assert.equal(status.xiaozhi.state, state);
    assert.equal(status.xiaozhi.label, label);
  }
  assert.equal(deviceServiceStatus({ inputBridge: { boardConnected: true } }).xiaozhi.label, "不可读取");
});

test("accepted EasyInput microphone remains integrated when computer is selected", () => {
  const notSelected = deviceServiceStatus({
    audioStatus: { kind: "easyinput-lan", configured: true, available: true, state: "ready", setup: { configured: true } },
    preferredMicrophoneSource: "computer",
  });
  assert.deepEqual({ label: notSelected.microphone.label, selected: notSelected.microphone.selected, available: notSelected.microphone.available }, { label: "已接入 · 当前未选用", selected: false, available: true });

  const selected = deviceServiceStatus({ audioStatus: { configured: true, available: true, state: "ready" }, preferredMicrophoneSource: "easyinput" });
  assert.equal(selected.microphone.label, "已接入 · 已选择");
  const active = deviceServiceStatus({ audioStatus: { configured: true, available: true, state: "streaming" }, preferredMicrophoneSource: "easyinput" });
  assert.equal(active.microphone.label, "已接入 · 当前使用中");
});

test("unavailable board audio never falls back to a pending integration claim", () => {
  assert.equal(deviceServiceStatus({ audioStatus: { configured: true, available: false, state: "waiting-heartbeat" }, preferredMicrophoneSource: "computer" }).microphone.label, "不可用 · 等待心跳");
  assert.equal(deviceServiceStatus({ audioStatus: { configured: false, available: false, state: "not-configured" }, preferredMicrophoneSource: "computer" }).microphone.label, "已接入 · 待配置");
});

test("companion, connections and diagnostics consume the same runtime status model", async () => {
  const [pages, app] = await Promise.all([
    readFile(new URL("../src/pages.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /easyInputAudio/);
  assert.match(app, /onEasyInputAudioEvent/);
  const companion = pages.slice(pages.indexOf("export function CompanionPage"), pages.indexOf("function MemoryManagementPage"));
  const connections = pages.slice(pages.indexOf("export function ConnectionsPage"), pages.indexOf("export function AgentsPage"));
  const settings = pages.slice(pages.indexOf("export function SettingsPage"));
  for (const surface of [companion, connections, settings]) assert.match(surface, /deviceServiceStatus/);
  assert.doesNotMatch(companion, /小智云台<\/span><StatusBadge tone="warning">待接入/);
  assert.doesNotMatch(companion, /T10E 待接入/);
});
