import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createKeyboardConfig, DEFAULT_ENCODER, DEFAULT_KEYMAP, firmwareAction, normalizeEncoder } from "../src/domain/keymap.js";

const require = createRequire(import.meta.url);
const { crc16Ccitt, encodeKeyboardConfig, parseAppCommandReport, parseConfigSnapshot } = require("../electron/easyinput-config.cjs");
const { configFingerprint, mergeKeyboardPatch, sanitizeKeyboardConfig } = require("../electron/config-merge.cjs");
const { AppActionStore } = require("../electron/app-actions.cjs");

test("DeskMate key bindings produce the frozen Maker ai_keyboard.v1 payload", () => {
  const hostActionId = "01234567-89ab-cdef-0123-456789abcdef";
  const keymap = structuredClone(DEFAULT_KEYMAP);
  keymap[0] = { action: "open-app", appActionId: hostActionId, appName: "Codex" };
  const encoder = normalizeEncoder({ ...DEFAULT_ENCODER, mode: "cursor", axis: "horizontal", press: { action: "text-caret-select" } });
  const payload = createKeyboardConfig({ keymap, encoder, voiceShortcut: "Ctrl+Alt+K" });
  assert.equal(payload.schema, "ai_keyboard.v1");
  assert.equal(payload.ptt_hotkey_source, "custom");
  assert.equal(payload.profiles[0].keys.KEY1.press, `host_action:${hostActionId}`);
  assert.equal(payload.profiles[0].encoder.scroll.mode, "cursor");
  assert.equal(payload.profiles[0].encoder.press, "text_caret_select");
  assert.throws(() => firmwareAction({ action: "open-app" }), /缺少/);
});

test("Maker config codec emits ordered 64-byte report 0x10 chunks with CRC16-CCITT", () => {
  const payload = createKeyboardConfig({ keymap: DEFAULT_KEYMAP, encoder: DEFAULT_ENCODER });
  const encoded = encodeKeyboardConfig(payload);
  const jsonBytes = Buffer.from(encoded.json, "utf8");
  assert.equal(encoded.crc16, crc16Ccitt(jsonBytes));
  assert.ok(encoded.reports.length > 1);
  assert.equal(encoded.reports.every((report) => report.length === 64 && report[0] === 0x10), true);
  assert.equal(encoded.reports[0].subarray(1, 4).toString("ascii"), "S3C");
  assert.equal(encoded.reports[0].readUInt16LE(7), jsonBytes.length);
  assert.equal(encoded.reports.at(-1)[5], encoded.reports.length - 1);
});

test("App Command 0x11 accepts canonical Host Action and matching config acknowledgements only", () => {
  const id = "01234567-89ab-cdef-0123-456789abcdef";
  const hostReport = Buffer.alloc(64); hostReport[0] = 0x11; hostReport[1] = 0x05; hostReport[3] = 1; hostReport[4] = 36; hostReport.write(id, 5, "ascii");
  assert.deepEqual(parseAppCommandReport(hostReport), { kind: "host-action", hostActionId: id });
  hostReport.write("01234567-89AB-cdef-0123-456789abcdef", 5, "ascii");
  assert.equal(parseAppCommandReport(hostReport), null);
  const ack = Buffer.alloc(64); ack[0] = 0x11; ack[1] = 0x03; ack[3] = 1; ack[4] = 7; ack[5] = 2; ack[6] = 1; ack.writeUInt16LE(512, 7); ack.writeUInt16LE(0xabcd, 9); ack[11] = 1;
  assert.deepEqual(parseAppCommandReport(ack), { kind: "config-ack", phase: 2, ok: true, bytes: 512, crc16: 0xabcd, saved: true });
});

test("application actions persist only in the Electron-side registry and open by UUID", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "deskmate-app-actions-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "Demo.exe");
  await writeFile(target, "");
  const opened = [];
  const store = new AppActionStore({ userDataPath: root, dialog: {}, shell: { openPath: async (value) => { opened.push(value); return ""; } } });
  const action = store.registerTarget(target, "Demo");
  assert.match(action.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await store.execute(action.id), { ok: true, label: "Demo" });
  assert.deepEqual(opened, [target]);
  const reloaded = new AppActionStore({ userDataPath: root, dialog: {}, shell: { openPath: async () => "" } });
  assert.deepEqual(await reloaded.execute(action.id), { ok: true, label: "Demo" });
});

test("configuration merge changes only approved pure-HID paths and preserves unknown data", () => {
  const raw = createKeyboardConfig({ keymap: DEFAULT_KEYMAP, encoder: DEFAULT_ENCODER });
  raw.wifi = { ssid: "preserve", password: "secret" };
  raw.profiles.push({ id: "secondary", keys: { KEY1: { press: "fixed-text" } } });
  const before = structuredClone(raw);
  const merged = mergeKeyboardPatch(raw, { keymap: Array(8).fill(null).map(() => ({ action: "copy" })), encoder: { speed: 5 } });
  assert.equal(merged.wifi.password, before.wifi.password);
  assert.deepEqual(merged.profiles.slice(1), before.profiles.slice(1));
  assert.equal(merged.profiles[0].encoder.scroll.speed, 5);
  assert.notEqual(configFingerprint(merged), configFingerprint(raw));
  assert.deepEqual(sanitizeKeyboardConfig(merged).keymap[0], { action: "copy" });
  assert.throws(() => mergeKeyboardPatch(raw, { wifi: { ssid: "no" } }), /未批准/);
  assert.throws(() => mergeKeyboardPatch(raw, { keymap: [] }), /八项/);
});

test("configuration snapshot parser enforces UTF-8, source and CRC boundaries", () => {
  const data = Buffer.from('{"schema":"ai_keyboard.v1"}', "utf8");
  const base = { type: "config-snapshot", jsonBase64: data.toString("base64"), bytes: data.length, crc16: crc16Ccitt(data), sourceId: 0, requestId: "read-12345678" };
  assert.equal(parseConfigSnapshot(base).json, data.toString("utf8"));
  assert.equal(parseConfigSnapshot({ ...base, sourceId: 4 }), null);
  assert.equal(parseConfigSnapshot({ ...base, jsonBase64: "!!!" }), null);
  const invalid = Buffer.from([0xc3, 0x28]);
  assert.equal(parseConfigSnapshot({ ...base, jsonBase64: invalid.toString("base64"), bytes: invalid.length, crc16: crc16Ccitt(invalid) }), null);
});
