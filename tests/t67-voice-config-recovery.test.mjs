import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { repairCredentialBackedSttConfiguration } from "../src/domain/sttConfiguration.js";

test("T67 restores Bailian STT when an older build reset only the renderer mode", () => {
  const settings = { sttMode: "unconfigured", sttEndpoint: "https://stale.invalid", microphoneId: "selected-device" };
  const diagnostics = { stt: { status: "unconfigured", provider: "unconfigured", error: "old" }, organizer: { status: "success" } };
  const repaired = repairCredentialBackedSttConfiguration({ settings, diagnostics, bailianStatus: { configured: true } });
  assert.equal(repaired.settings.sttMode, "bailian");
  assert.equal(repaired.settings.sttEndpoint, "");
  assert.equal(repaired.settings.microphoneId, "selected-device");
  assert.equal(repaired.diagnostics.stt.status, "pending");
  assert.equal(repaired.diagnostics.stt.provider, "qwen3-asr-flash-realtime");
  assert.equal(repaired.diagnostics.stt.error, "");
  assert.deepEqual(repaired.diagnostics.organizer, diagnostics.organizer);
});

test("T67 never invents credentials or overrides an explicit STT provider", () => {
  assert.equal(repairCredentialBackedSttConfiguration({ settings: { sttMode: "unconfigured" }, bailianStatus: { configured: false } }), null);
  for (const sttMode of ["bailian", "http", "mock"]) {
    assert.equal(repairCredentialBackedSttConfiguration({ settings: { sttMode }, bailianStatus: { configured: true } }), null);
  }
});

test("T67 production window removes the native application menu without changing the tray menu", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /Menu\.setApplicationMenu\(null\)/);
  assert.match(main, /autoHideMenuBar:\s*true/);
  assert.match(main, /mainWindow\.setMenu\(null\)/);
  assert.match(main, /tray\.setContextMenu\(Menu\.buildFromTemplate/);
});

test("T67 wires secure credential status into renderer startup recovery", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /desktopBridge\?\.getBailianStatus/);
  assert.match(app, /repairCredentialBackedSttConfiguration\(\{ settings: current\.settings, diagnostics: current\.diagnostics, bailianStatus \}\)/);
  assert.match(app, /if \(repaired\) patch\(repaired\)/);
});
