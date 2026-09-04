import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { completeConfigWrite, verifyConfigReadback } = require("../electron/config-readback.cjs");
const { pasteIntoCapturedWindow } = require("../electron/active-window-output.cjs");

const expectedConfig = { schema: "ai_keyboard.v1", profiles: [{ keys: { KEY6: { press: "select_all" } } }] };
const fingerprint = (value) => JSON.stringify(value);

test("configuration commit retries a transient readback failure after the saved ACK", async () => {
  const reads = [
    { ok: false, reason: "config-read-timeout" },
    { ok: true, json: JSON.stringify(expectedConfig), source: 0 },
  ];
  const waits = [];
  const result = await verifyConfigReadback({
    readConfig: async () => reads.shift(),
    expectedConfig,
    fingerprint,
    retryDelaysMs: [0, 25, 50],
    wait: async (milliseconds) => { waits.push(milliseconds); },
  });

  assert.equal(result.ok, true);
  assert.equal(result.saved, true);
  assert.equal(result.attempts, 2);
  assert.deepEqual(waits, [25]);
  assert.deepEqual(result.config, expectedConfig);
});

test("configuration commit fails closed immediately on a readback fingerprint mismatch", async () => {
  let reads = 0;
  const result = await verifyConfigReadback({
    readConfig: async () => { reads += 1; return { ok: true, json: JSON.stringify({ ...expectedConfig, changed: true }), source: 0 }; },
    expectedConfig,
    fingerprint,
    wait: async () => assert.fail("a mismatch must not be retried"),
  });

  assert.equal(result.ok, false);
  assert.equal(result.saved, true);
  assert.equal(result.reason, "config-readback-mismatch");
  assert.equal(reads, 1);
});

test("configuration commit reports saved-but-unverified after bounded readback failures", async () => {
  let reads = 0;
  const result = await verifyConfigReadback({
    readConfig: async () => { reads += 1; return { ok: false, reason: "config-read-timeout" }; },
    expectedConfig,
    fingerprint,
    retryDelaysMs: [0, 1, 1],
    wait: async () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.saved, true);
  assert.equal(result.reason, "config-readback-failed");
  assert.equal(result.readbackReason, "config-read-timeout");
  assert.equal(reads, 3);
});

test("configuration commit accepts an ACK timeout only after exact readback verification", async () => {
  let reads = 0;
  const result = await completeConfigWrite({
    syncConfig: async () => ({ ok: false, reason: "config-ack-timeout" }),
    readConfig: async () => { reads += 1; return { ok: true, json: JSON.stringify(expectedConfig), source: 0 }; },
    expectedConfig,
    fingerprint,
    retryDelaysMs: [0],
    wait: async () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.saved, true);
  assert.equal(result.acknowledgement, "readback");
  assert.equal(reads, 1);
});

test("configuration commit does not mask an ACK timeout when readback differs", async () => {
  const result = await completeConfigWrite({
    syncConfig: async () => ({ ok: false, reason: "config-ack-timeout" }),
    readConfig: async () => ({ ok: true, json: JSON.stringify({ ...expectedConfig, changed: true }), source: 0 }),
    expectedConfig,
    fingerprint,
    retryDelaysMs: [0],
    wait: async () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.saved, false);
  assert.equal(result.reason, "config-readback-mismatch");
});

test("active-window output validates the target and pastes through one OS helper call", async () => {
  const calls = [];
  let clipboardText = "";
  const result = await pasteIntoCapturedWindow({
    text: "voice result",
    targetWindow: "12345",
    writeClipboard: (value) => { clipboardText = value; },
    runPaste: async (targetWindow) => { calls.push(targetWindow); return { ok: true }; },
  });

  assert.deepEqual(result, { ok: true, mode: "active-window" });
  assert.equal(clipboardText, "voice result");
  assert.deepEqual(calls, ["12345"]);
});

test("active-window output preserves fail-closed target changes and helper failures", async () => {
  for (const failure of ["target-window-changed", "powershell-timeout"]) {
    let calls = 0;
    const result = await pasteIntoCapturedWindow({
      text: "fallback text",
      targetWindow: "67890",
      writeClipboard: () => {},
      runPaste: async () => { calls += 1; return { ok: false, reason: failure }; },
    });
    assert.deepEqual(result, { ok: false, reason: failure });
    assert.equal(calls, 1);
  }
});

test("desktop main restores the known PowerShell target capture and atomic target-check-and-paste path", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const output = await readFile(new URL("../electron/active-window-output.cjs", import.meta.url), "utf8");
  const body = source.match(/async function pasteIntoCapturedWindow\(text\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(source, /voiceTargetCapturePromise = getForegroundWindowId\(\)/);
  assert.match(body, /runPowershell\(PASTE_CAPTURED_WINDOW_SCRIPT/);
  assert.doesNotMatch(body, /pasteActiveWindow/);
  assert.match(output, /do \{ \$current = .*?if \(\$current -eq \$expected\).*?SendKeys\]::SendWait\('\^v'\).*?target-window-changed/s);
  assert.match(source, /AddMilliseconds\(250\).*?\$current -eq \$previous/s);
});

test("voice target capture keeps the known PowerShell path and the overlay stays compact", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(source, /const FOREGROUND_SCRIPT/);
  assert.match(source, /spawn\("powershell\.exe"/);
  assert.doesNotMatch(source, /inputBridge\?\.captureActiveWindow/);
  assert.match(source, /width: 320/);
  assert.match(source, /\.wave\{width:48px/);
  assert.match(page, /processed\.output\.reason === "target-window-changed"/);
  assert.match(page, /未能稳定捕获输入目标，文字已复制到剪贴板/);
});

test("keyboard configuration UI separates board-read state from saved readback verification", async () => {
  const main = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(main, /completeConfigWrite\(/);
  assert.match(page, /readStatus/);
  assert.match(page, /result\?\.saved/);
  assert.match(page, /已保存，回读待确认/);
  assert.match(page, /已保存并回读确认/);
});
