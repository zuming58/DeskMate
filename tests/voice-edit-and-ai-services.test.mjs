import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { processVoiceRecording } from "../src/services/voicePipeline.js";

const require = createRequire(import.meta.url);
const { organize } = require("../electron/bailian-organizer.cjs");
const { buildVoiceEditRequest, editSelectedText, parseVoiceEditResponse } = require("../electron/voice-edit.cjs");
const { captureSelectedText } = require("../electron/selection-capture.cjs");
const { createSecureAiServiceStore, validateEndpoint } = require("../electron/secure-ai-services.cjs");
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");

test("voice edit keeps the selected text in the main process and uses a JSON-only edit contract", async () => {
  const request = buildVoiceEditRequest({ selectedText: "原始文字", instruction: "翻译成英文" });
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.match(request.messages[0].content, /不得回答|JSON/);
  assert.match(request.messages[1].content, /<selected_text>/);
  assert.equal(parseVoiceEditResponse({ choices: [{ message: { content: '{"text":"Original text"}' } }] }, "原始文字"), "Original text");

  const pages = await readFile(new URL("../src/pages.jsx", import.meta.url), "utf8");
  const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  assert.doesNotMatch(pages, /selectedText:/);
  assert.match(preload, /editSelectedText: \(value\) => ipcRenderer\.invoke\("bailian:edit-selected-text", value\)/);
});

test("voice edit and smart organizer can use one OpenAI-compatible text model", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"处理结果"}' } }] }) };
  };
  const service = { provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions", apiKey: "deepseek-test-key", model: "deepseek-v4-flash", fetchImpl };
  assert.equal((await organize({ ...service, text: "嗯原文", mode: "smart" })).text, "处理结果");
  assert.equal((await editSelectedText({ ...service, selectedText: "原文", instruction: "总结" })).text, "处理结果");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url === service.endpoint));
  assert.ok(calls.every((call) => call.options.headers.Authorization === "Bearer deepseek-test-key"));
  assert.ok(calls.every((call) => !Object.hasOwn(JSON.parse(call.options.body), "enable_thinking")));
  assert.ok(calls.every((call) => !call.options.body.includes("deepseek-test-key")));
});

test("AI service settings validate endpoints and encrypt every credential at rest", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-ai-services-"));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(`encrypted:${value}`), decryptString: (value) => value.toString().replace(/^encrypted:/, "") };
  try {
    const store = createSecureAiServiceStore({ safeStorage, userDataPath: directory });
    let status = store.saveText({ provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash", apiKey: "deepseek-test-key" });
    assert.equal(status.text.configured, true);
    assert.equal("apiKey" in status.text, false);
    status = store.saveRealtime({ provider: "doubao", endpoint: "wss://openspeech.bytedance.com/api/v3/realtime/dialogue", appId: "app-123", accessKey: "access-key-123", appKey: "app-key-123", resourceId: "volc.speech.dialog", model: "1.2.1.1", voice: "female-voice" });
    assert.equal(status.realtime.configured, true);
    assert.equal("accessKey" in status.realtime, false);
    const disk = fs.readFileSync(path.join(directory, "ai-service-credentials.json"), "utf8");
    for (const secret of ["deepseek-test-key", "app-123", "access-key-123", "app-key-123"]) assert.doesNotMatch(disk, new RegExp(secret));
    assert.equal(store.loadTextSecret().apiKey, "deepseek-test-key");
    assert.equal(store.loadRealtimeSecret().appId, "app-123");
    assert.equal(store.loadRealtimeSecret().accessKey, "access-key-123");
    assert.equal(store.clearText().text.configured, false);
    assert.equal(store.clearRealtime().realtime.configured, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  assert.throws(() => validateEndpoint("http://example.com/chat/completions"), /HTTPS/);
  assert.throws(() => validateEndpoint("https://example.com/v1/models"), /chat\/completions/);
});

test("selection capture restores the clipboard and fails closed without a selection", async () => {
  let clipboard = "用户原剪贴板";
  const snapshot = { text: clipboard };
  const success = await captureSelectedText({ targetWindow: "123", readClipboardText: () => clipboard, writeClipboardText: (value) => { clipboard = value; }, snapshotClipboard: () => snapshot, restoreClipboard: (value) => { clipboard = value.text; }, runCopy: async () => { clipboard = "选中的文字"; return { ok: true }; }, wait: async () => {} });
  assert.deepEqual(success, { ok: true, text: "选中的文字" });
  assert.equal(clipboard, "用户原剪贴板");

  const failure = await captureSelectedText({ targetWindow: "123", readClipboardText: () => clipboard, writeClipboardText: (value) => { clipboard = value; }, snapshotClipboard: () => snapshot, restoreClipboard: (value) => { clipboard = value.text; }, runCopy: async () => ({ ok: false, reason: "target-window-changed" }), wait: async () => {} });
  assert.equal(failure.reason, "target-window-changed");
  assert.equal(clipboard, "用户原剪贴板");
});

test("voice editing reuses the voice pipeline and never outputs when the model fails", async () => {
  const output = [];
  const base = { blob: new Blob(["audio"]), stt: { transcribe: async () => ({ status: "success", text: "总结一下", provider: "test", durationMs: 1 }) }, organizer: { organize: async () => ({ text: "unused" }) }, operation: "edit", saveHistory: async (item) => item, output: { output: async (text, mode) => { output.push({ text, mode }); return { ok: true, mode }; } }, outputMode: "active-window" };
  const success = await processVoiceRecording({ ...base, editor: { edit: async () => ({ text: "编辑后的文字", status: "success", model: "test-model" }) } });
  assert.equal(success.text, "编辑后的文字");
  assert.deepEqual(output, [{ text: "编辑后的文字", mode: "active-window" }]);
  output.length = 0;
  const failure = await processVoiceRecording({ ...base, editor: { edit: async () => { throw new Error("model unavailable"); } } });
  assert.equal(failure.organized.status, "error");
  assert.equal(output.length, 0);
});

test("companion memory commits every turn before summaries and keeps candidates reviewable", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-memory-"));
  let now = 1000;
  try {
    const store = new CompanionMemoryStore({ userDataPath: directory, now: () => now++ });
    const first = store.appendTurn({ sessionId: "session-1", role: "user", content: "我喜欢深色主题" });
    store.appendTurn({ sessionId: "session-1", role: "assistant", content: "记住啦" });
    store.upsertDailySummary({ day: "2026-08-29", summary: "用户明确偏好深色主题。", sourceTurnCount: 2 });
    const candidate = store.addCandidate({ day: "2026-08-29", kind: "preference", summary: "用户偏好深色主题", sourceTurnIds: [first.id] });
    assert.deepEqual(store.status(), { ready: true, storage: "sqlite-wal", turns: 2, dailySummaries: 1, pendingCandidates: 1, longTermMemories: 0, embeddings: 0 });
    assert.equal(store.list({ filter: "candidates" })[0].content, "用户偏好深色主题");
    assert.equal(store.setCandidateState(candidate.id, "accepted").ok, true);
    assert.equal(store.status().longTermMemories, 1);
    assert.equal(store.list({ filter: "long-term", query: "深色" }).length, 1);
    store.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
