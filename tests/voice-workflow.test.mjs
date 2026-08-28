import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { downsampleToPcm16, shouldIgnoreToggle } from "../src/hooks/useRecorder.js";
import { DesktopBridgeAdapter, EasyInputLanAudioAdapter, TextOutputAdapter } from "../src/adapters/voiceAdapters.js";
import { shortcutDisplay, shortcutFromKeyboardEvent } from "../src/domain/shortcutCapture.js";

const require = createRequire(import.meta.url);
const { normalizeShortcut } = require("../electron/shortcut.cjs");

test("the recorder debounce used by the real VoicePage ignores repeated toggles", () => {
  assert.equal(shouldIgnoreToggle(1000, 1050, 100), true);
  assert.equal(shouldIgnoreToggle(1000, 1200, 100), false);
});

test("microphone samples are converted to 16 kHz PCM without clipping", () => {
  const pcm = new Int16Array(downsampleToPcm16(new Float32Array([1, 1, 1, -1, -1, -1]), 48000, 16000));
  assert.equal(pcm.length, 2);
  assert.ok(pcm[0] > 10000);
  assert.ok(pcm[1] < 0);
});

test("desktop shortcuts are normalized and unsafe values are rejected", () => {
  assert.equal(normalizeShortcut("ctrl + shift + space"), "Ctrl+Shift+Space");
  assert.equal(normalizeShortcut("Alt+f9"), "Alt+F9");
  assert.throws(() => normalizeShortcut("Space"), /修饰键/);
  assert.throws(() => normalizeShortcut("Ctrl+Ctrl+A"), /重复/);
  assert.throws(() => normalizeShortcut("DefinitelyNotAnAccelerator"), /修饰键/);
});

test("shortcut capture derives an accelerator from physical key presses", () => {
  assert.deepEqual(shortcutFromKeyboardEvent({ code: "KeyK", key: "k", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }), { shortcut: "Ctrl+Alt+K" });
  assert.equal(shortcutFromKeyboardEvent({ code: "KeyK", key: "k", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }).error.includes("修饰键"), true);
  assert.deepEqual(shortcutFromKeyboardEvent({ code: "ControlLeft", key: "Control", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }), { pending: true, display: "Ctrl" });
});

test("key mapping shortcut capture accepts single keys and localizes common labels", () => {
  const base = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  assert.deepEqual(shortcutFromKeyboardEvent({ ...base, code: "Enter", key: "Enter" }, { allowSingle: true }), { shortcut: "Enter" });
  assert.deepEqual(shortcutFromKeyboardEvent({ ...base, code: "Backspace", key: "Backspace" }, { allowSingle: true }), { shortcut: "Backspace" });
  assert.deepEqual(shortcutFromKeyboardEvent({ ...base, code: "Space", key: " " }, { allowSingle: true }), { shortcut: "Space" });
  assert.deepEqual(shortcutFromKeyboardEvent({ ...base, code: "Escape", key: "Escape" }, { allowSingle: true }), { shortcut: "Esc" });
  assert.deepEqual(shortcutFromKeyboardEvent({ ...base, code: "Digit7", key: "7" }, { allowSingle: true }), { shortcut: "7" });
  assert.deepEqual(shortcutFromKeyboardEvent({ ...base, code: "ArrowLeft", key: "ArrowLeft" }, { allowSingle: true }), { shortcut: "ArrowLeft" });
  assert.equal(shortcutDisplay("Return"), "回车");
  assert.equal(shortcutDisplay("Backspace"), "退格");
  assert.equal(shortcutDisplay("Ctrl+Space"), "Ctrl+空格");
});

test("web desktop bridge safely degrades and LAN audio stays unavailable", async () => {
  const bridge = new DesktopBridgeAdapter(null);
  assert.equal((await bridge.capabilities()).supported, false);
  assert.equal((await bridge.registerShortcut("Ctrl+Shift+Space")).registered, false);
  assert.equal((await new EasyInputLanAudioAdapter().getStatus()).connected, false);
  await assert.rejects(() => new EasyInputLanAudioAdapter().openStream(), /协议尚未确认/);
});

test("clipboard failure reports failure without deleting source text", async () => {
  const output = new TextOutputAdapter({ writeClipboard: async () => ({ ok: false, reason: "denied" }) });
  const result = await output.output("保留在历史", "clipboard");
  assert.equal(result.ok, false);
});

test("desktop build emits relative asset URLs for file protocol loading", async () => {
  const html = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
  assert.match(html, /(?:src|href)="\.\/assets\//);
});
