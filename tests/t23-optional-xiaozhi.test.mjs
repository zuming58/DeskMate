import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("T23 keeps the renderer behind narrow Xiaozhi policy IPC", () => {
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");
  const adapter = fs.readFileSync(path.join(root, "src/adapters/voiceAdapters.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  assert.match(preload, /getXiaozhiHardwarePolicy/);
  assert.match(preload, /setXiaozhiHardwarePolicy/);
  assert.match(adapter, /getXiaozhiHardwarePolicy/);
  assert.match(adapter, /setXiaozhiHardwarePolicy/);
  assert.match(main, /desktop:get-xiaozhi-hardware-policy/);
  assert.match(main, /desktop:set-xiaozhi-hardware-policy/);
  assert.match(main, /xiaozhiHardwareEnabled\(\)/);
  assert.doesNotMatch(preload, /require\(["']fs["']\)/);
});

test("T23 blocks physical Xiaozhi command families while leaving software voice outside the gate", () => {
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  for (const channel of [
    "desktop:start-manual-control",
    "desktop:manual-control-press",
    "desktop:run-motion-preset",
    "desktop:stop-motion-and-center",
    "desktop:emergency-stop-motion",
    "desktop:set-manual-agent-state",
  ]) assert.match(main, new RegExp(`${channel.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[\\s\\S]{0,500}xiaozhiHardwareEnabled`));
  assert.doesNotMatch(main, /desktop:start-companion-conversation[\s\S]{0,300}xiaozhiHardwareEnabled/);
  assert.doesNotMatch(main, /desktop:toggle-voice-input[\s\S]{0,300}xiaozhiHardwareEnabled/);
});

test("T24 advertises a dedicated local Codex LED capability and source", () => {
  const desktop = fs.readFileSync(path.join(root, "electron/agent-state-hid.cjs"), "utf8");
  const protocol = fs.readFileSync(path.join(root, "electron/input-bridge-protocol.cjs"), "utf8");
  const firmware = fs.readFileSync(path.join(root, "firmware/easyinput-controller/components/input_core/include/codex_led_status.h"), "utf8");
  const router = fs.readFileSync(path.join(root, "firmware/easyinput-controller/main/main.cpp"), "utf8");
  assert.match(desktop, /0x4c584443/);
  assert.match(firmware, /0x4c584443U/);
  assert.match(protocol, /codexLedStatusV1/);
  assert.match(router, /CodexLedRouteResult::NotForCodexLed/);
  assert.match(router, /publish_led_status/);
  assert.match(fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8"), /provider !== "codex" && activeAgentProvider === provider/);
});
