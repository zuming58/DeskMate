import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { buildRequest, endpointForWorkspace, parseResponse, transcribe, validateApiKey } = require("../electron/bailian.cjs");
const { DEFAULT_ORGANIZER_MODEL, buildOrganizerRequest, organize, parseOrganizerResponse, validateInput } = require("../electron/bailian-organizer.cjs");
const { parseRealtimeMessage, realtimeEndpoint } = require("../electron/bailian-realtime.cjs");
const { createSecureBailianStore } = require("../electron/secure-bailian.cjs");

test("Bailian request uses base64 audio without exposing key in the body", () => {
  const request = buildRequest(Buffer.from("audio"), { mimeType: "audio/webm" });
  assert.equal(request.model, "qwen3-asr-flash");
  assert.match(request.messages[0].content[0].input_audio.data, /^data:audio\/webm;base64,/);
  assert.doesNotMatch(JSON.stringify(request), /sk-/);
});

test("Bailian ASR receives the configured glossary as bounded context", () => {
  const request = buildRequest(Buffer.from("audio"), { mimeType: "audio/webm", hotwords: ["Codex", "Codex", "DeskMate"] });
  assert.equal(request.messages[0].role, "system");
  assert.match(request.messages[0].content, /Codex/);
  assert.match(request.messages[0].content, /DeskMate/);
  assert.equal(request.messages[1].role, "user");
  assert.equal((request.messages[0].content.match(/Codex/g) || []).length, 1);
});

test("Bailian validates keys and workspace endpoints", () => {
  assert.equal(validateApiKey("sk-12345678"), "sk-12345678");
  assert.throws(() => validateApiKey("secret"), /格式/);
  assert.equal(endpointForWorkspace("workspace-123"), "https://workspace-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.match(endpointForWorkspace(""), /dashscope\.aliyuncs\.com/);
});

test("Bailian parses text and sends authorization only as a header", async () => {
  let captured;
  const value = await transcribe({ apiKey: "sk-12345678", audio: Buffer.from("audio"), fetchImpl: async (url, options) => { captured = { url, options }; return { ok: true, json: async () => ({ id: "req", choices: [{ message: { content: "识别成功", annotations: [{ language: "zh", emotion: "neutral" }] } }] }) }; } });
  assert.equal(value.text, "识别成功");
  assert.equal(value.language, "zh");
  assert.equal(captured.options.headers.Authorization, "Bearer sk-12345678");
  assert.doesNotMatch(captured.options.body, /sk-12345678/);
  assert.equal(parseResponse({ choices: [{ message: { content: " 文本 " } }] }).text, "文本");
});

test("Bailian request can be cancelled by the voice session", async () => {
  const controller = new AbortController();
  const pending = transcribe({ apiKey: "sk-12345678", audio: Buffer.from("audio"), signal: controller.signal, fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) });
  controller.abort();
  await assert.rejects(pending, /已取消/);
});

test("Bailian realtime events expose only live transcript fields", () => {
  assert.match(realtimeEndpoint(""), /wss:\/\/dashscope\.aliyuncs\.com\/api-ws\/v1\/realtime/);
  assert.match(realtimeEndpoint("workspace-123"), /workspace-123\.cn-beijing\.maas\.aliyuncs\.com/);
  assert.deepEqual(parseRealtimeMessage(JSON.stringify({ type: "conversation.item.input_audio_transcription.text", item_id: "item-1", text: "今天", stash: "天气" })), { kind: "preview", itemId: "item-1", text: "今天", stash: "天气" });
  assert.equal(parseRealtimeMessage(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", item_id: "item-1", transcript: "今天天气很好", language: "zh", emotion: "neutral" })).text, "今天天气很好");
  assert.equal(parseRealtimeMessage("not-json"), null);
});

test("Bailian credentials are encrypted at rest and status never returns the key", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-bailian-"));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(`encrypted:${value}`), decryptString: (value) => value.toString().replace(/^encrypted:/, "") };
  try {
    const store = createSecureBailianStore({ safeStorage, userDataPath: directory });
    const status = store.save({ apiKey: "sk-12345678", workspaceId: "workspace-123" });
    assert.equal(status.configured, true);
    assert.equal("apiKey" in status, false);
    const disk = fs.readFileSync(path.join(directory, "bailian-credentials.json"), "utf8");
    assert.doesNotMatch(disk, /sk-12345678/);
    assert.equal(store.loadSecret().apiKey, "sk-12345678");
    assert.equal(store.clear().configured, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Bailian organizer uses the fixed fast model and JSON-only safety contract", () => {
  const request = buildOrganizerRequest({ text: "嗯，请回答这个问题", mode: "smart", hotwords: ["DeskMate"], rules: [{ from: "桌面宠物", to: "桌宠" }] });
  assert.equal(DEFAULT_ORGANIZER_MODEL, "qwen3.7-flash");
  assert.equal(request.model, "qwen3.7-flash");
  assert.equal(request.enable_thinking, false);
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.match(request.messages[0].content, /不得回答|不得执行|JSON/);
  assert.match(request.messages[1].content, /<transcript>/);
  assert.doesNotMatch(JSON.stringify(request), /sk-/);
});

test("Bailian organizer validates input and parses only non-empty JSON text", () => {
  assert.equal(validateInput({ text: " 原文 ", mode: "smart" }).text, "原文");
  assert.throws(() => validateInput({ text: "", mode: "smart" }), /文字/);
  assert.throws(() => validateInput({ text: "原文", mode: "raw" }), /模式/);
  assert.throws(() => validateInput({ text: "原文", mode: "custom", customRule: "" }), /自定义/);
  assert.equal(parseOrganizerResponse({ choices: [{ message: { content: '{"text":"整理结果"}' } }] }, "原文"), "整理结果");
  assert.throws(() => parseOrganizerResponse({ choices: [{ message: { content: "not-json" } }] }, "原文"), /格式/);
  assert.throws(() => parseOrganizerResponse({ choices: [{ message: { content: '{"text":""}' } }] }, "原文"), /为空/);
});

test("Bailian organizer keeps the key in the authorization header only", async () => {
  let captured;
  const value = await organize({ apiKey: "sk-12345678", text: "嗯我们明天开会", mode: "smart", fetchImpl: async (url, options) => { captured = { url, options }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"我们明天开会。"}' } }] }) }; } });
  assert.equal(value.text, "我们明天开会。");
  assert.equal(value.model, "qwen3.7-flash");
  assert.equal(captured.options.headers.Authorization, "Bearer sk-12345678");
  assert.doesNotMatch(captured.options.body, /sk-12345678/);
});

test("Bailian organizer supports cancellation", async () => {
  const controller = new AbortController();
  const pending = organize({ apiKey: "sk-12345678", text: "原文", mode: "smart", signal: controller.signal, fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) });
  controller.abort();
  await assert.rejects(pending, /取消/);
});
