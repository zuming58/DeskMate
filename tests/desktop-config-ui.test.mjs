import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isTransientKeyboardConfigReadFailure,
  keyboardConfigReadMessage,
  readKeyboardConfigWithRetry,
} from "../src/domain/keyboardConfigRead.js";

test("keyboard config read retries only transient bridge failures", async () => {
  const reads = [
    { ok: false, reason: "input-bridge-unavailable" },
    { ok: false, reason: "config-read-timeout" },
    { ok: true, config: { keymap: [] }, source: 0 },
  ];
  const waits = [];
  const result = await readKeyboardConfigWithRetry({
    read: async () => reads.shift(),
    retryDelaysMs: [0, 20, 50],
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
  assert.deepEqual(waits, [20, 50]);
});

test("keyboard config read fails closed without retrying permanent errors", async () => {
  let reads = 0;
  const result = await readKeyboardConfigWithRetry({
    read: async () => { reads += 1; return { ok: false, reason: "config-schema-invalid" }; },
    retryDelaysMs: [0, 1, 1],
    wait: async () => assert.fail("permanent errors must not be retried"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 1);
  assert.equal(reads, 1);
  assert.equal(isTransientKeyboardConfigReadFailure("config-read-timeout"), true);
  assert.equal(isTransientKeyboardConfigReadFailure("config-schema-invalid"), false);
  assert.equal(keyboardConfigReadMessage("config-read-timeout"), "设备已连接，配置通道暂未响应");
});

test("keymap UI exposes reconnect-aware read status and a compact accessible app picker", async () => {
  const [pages, styles] = await Promise.all([
    readFile(new URL("../src/pages.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(pages, /boardConnected/);
  assert.match(pages, /readKeyboardConfigWithRetry/);
  assert.match(pages, /重新读取/);
  assert.match(pages, /role="listbox"/);
  assert.match(pages, /role="option"/);
  assert.match(pages, /没有匹配的应用/);
  assert.match(styles, /\.application-picker__list > button[^}]*font-size: 11px/);
  assert.match(styles, /\.application-picker__list > button span[^}]*text-overflow: ellipsis/);
});
