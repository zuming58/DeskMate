import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDiagnosticReport } from "../src/services/diagnostics.js";

const require = createRequire(import.meta.url);
const { CompanionDialogueContext, CONTEXT_AGE_MS } = require("../electron/companion-dialogue-context.cjs");
const { OpenAiStreamingCompanionModelAdapter } = require("../electron/companion-model-adapter.cjs");
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");
const { CompanionMemoryPipeline } = require("../electron/companion-memory-pipeline.cjs");
const { CompanionMemoryGenerationCoordinator } = require("../electron/companion-memory-generation.cjs");
const { createKnowledgeBaseSettings } = require("../electron/knowledge-base-settings.cjs");
const { KnowledgeBaseProjection } = require("../electron/knowledge-base-projection.cjs");
const { wakeGreeting } = require("../electron/companion-call.cjs");
const { CompanionConversationController } = require("../electron/companion-conversation.cjs");
const { SimulatedCompanionAudioSource, SimulatedCompanionAudioSink } = require("../electron/companion-audio.cjs");
const { ThreeStageCompanionProvider } = require("../electron/three-stage-companion-provider.cjs");

const config = { provider: "custom", endpoint: "https://model.example/v1/chat/completions", apiKey: "synthetic-secret", model: "test" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const response = (text) => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) });
async function temporary(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t21j-"));
  try { return await run(directory); }
  finally { fs.rmSync(directory, { force: true, recursive: true }); }
}

test("T21J model context survives provider replacement, hours idle and more than six topic changes", async () => {
  let at = Date.now();
  const context = new CompanionDialogueContext({ now: () => at });
  const requests = [];
  const makeModel = () => new OpenAiStreamingCompanionModelAdapter({ config, dialogueContext: context, fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return response("森林里的狐狸正在找月亮。");
  } });
  const first = makeModel();
  await first.streamTurn({ text: "讲一个狐狸找月亮的故事" });
  first.close();
  at += 5 * 60 * 60 * 1000;
  const second = makeModel();
  for (let index = 0; index < 8; index++) await second.streamTurn({ text: `换个话题${index}` });
  await second.streamTurn({ text: "继续刚才的故事" });
  const last = requests.at(-1).messages;
  assert.ok(last.some((message) => message.role === "user" && message.content === "讲一个狐狸找月亮的故事"));
  assert.equal(last.filter((message) => message.content === "继续刚才的故事").length, 1);
  assert.match(last[0].content, /不是豆包端到端实时对话/);
  assert.match(last[0].content, /不能声称实时语音天然没有上下文/);
  assert.equal(context.status().appliedMessages, 18);
});

test("T21J aborted streaming keeps topic and partial context but ignores late deltas", async () => {
  const context = new CompanionDialogueContext();
  const abort = new AbortController();
  let release;
  const adapter = new OpenAiStreamingCompanionModelAdapter({ config, dialogueContext: context, fetchImpl: async () => ({ ok: true, body: {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('data: {"choices":[{"delta":{"content":"狐狸走进森林。"}}]}\n\n');
      await new Promise((resolve) => { release = resolve; });
      yield Buffer.from('data: {"choices":[{"delta":{"content":"不应保留的迟到结尾"}}]}\n\n');
    },
  } }) });
  const pending = adapter.streamTurn({ text: "给我讲狐狸的故事", signal: abort.signal });
  const rejected = assert.rejects(pending, /three-stage-model-cancelled/);
  await tick();
  abort.abort();
  assert.match(JSON.stringify(context.messages()), /狐狸走进森林/);
  assert.match(JSON.stringify(context.messages()), /被打断/);
  const replacement = new OpenAiStreamingCompanionModelAdapter({ config, dialogueContext: context, fetchImpl: async () => response("换成小鹿的故事。") });
  await replacement.streamTurn({ text: "换成小鹿" });
  release();
  await rejected;
  assert.doesNotMatch(JSON.stringify(context.messages()), /迟到结尾/);
  assert.equal(context.messages().at(-1).content, "换成小鹿的故事。");
  adapter.close();
  assert.equal(context.messages().length, 4);
});

test("T21J real controller trusted-provider replacement and foreground restart keep one dialogue", async () => {
  const context = new CompanionDialogueContext();
  const requests = [];
  const sessions = [];
  const controller = new CompanionConversationController({
    providerLabel: "three-stage", audioSource: new SimulatedCompanionAudioSource(), audioSink: new SimulatedCompanionAudioSink(), wait: async () => {},
    claimsTrustedTurn: (text) => text.includes("Codex"),
    resolveTrustedTurn: async () => ({ checked: true, text: "测试项目正在运行。" }),
    commitTurn: async (turn) => { if (turn.intentHandled || turn.trusted) context.append(turn.role, turn.content); },
    providerFactory: ({ onEvent }) => new ThreeStageCompanionProvider({ onEvent, shouldBypassModel: (text) => text.includes("Codex"),
      asrFactory: ({ onEvent: emit }) => { sessions.push(emit); return { connect: async () => ({ ok: true }), sendAudio: () => true, close() {} }; },
      modelFactory: () => new OpenAiStreamingCompanionModelAdapter({ config, dialogueContext: context, fetchImpl: async (_url, options) => { requests.push(JSON.parse(options.body)); return response("故事里的小鹿找到一座桥。"); } }),
      ttsFactory: () => ({ connect: async () => ({ ok: true }), synthesize: async (_text, { onAudio }) => { onAudio(Buffer.from([1, 2])); return { ok: true }; }, close() {} }),
    }),
  });
  const emitTurn = async (text, itemId) => {
    sessions.at(-1)({ type: "final", text, itemId });
    await tick(); await controller.eventChain; await tick(); await controller.eventChain;
  };
  try {
    await controller.start();
    await emitTurn("讲小鹿的故事", "story");
    await emitTurn("Codex怎么样", "status");
    assert.equal(sessions.length, 2);
    await emitTurn("继续刚才的故事", "resume");
    assert.match(JSON.stringify(requests.at(-1).messages), /小鹿找到一座桥/);
    assert.match(JSON.stringify(requests.at(-1).messages), /测试项目正在运行/);
    assert.equal(requests.length, 2, "trusted status must never be submitted to model as a new request");
    await controller.stop("listening-idle-timeout");
    await controller.start();
    await emitTurn("我回来了，接着讲", "rewake");
    assert.match(JSON.stringify(requests.at(-1).messages), /讲小鹿的故事/);
    assert.equal(controller.snapshot().state, "listening");
  } finally { await controller.stop(); }
});

test("T21J playback interruption marks generated answer without pretending it was all heard", async () => {
  let asr;
  const context = new CompanionDialogueContext();
  const model = new OpenAiStreamingCompanionModelAdapter({ config, dialogueContext: context, fetchImpl: async () => response("小熊在桥边等朋友。") });
  const provider = new ThreeStageCompanionProvider({ asrFactory: ({ onEvent }) => { asr = onEvent; return { connect: async () => ({ ok: true }), close() {} }; }, modelFactory: () => model,
    ttsFactory: () => ({ connect: async () => ({ ok: true }), synthesize: async () => ({ ok: true }), interrupt() {}, close() {} }),
  });
  await provider.connect();
  asr({ type: "final", text: "讲小熊的故事", itemId: "first" });
  await tick();
  assert.ok(provider.playbackTail);
  provider.interrupt();
  assert.match(context.messages().at(-1).content, /可能尚未全部播出/);
  provider.close();
  assert.equal(context.messages().length, 2);
});

test("T21J cold restart seeds only recent companion finals, never dictation or old sessions", () => temporary(async (directory) => {
  const now = Date.now();
  const store = new CompanionMemoryStore({ userDataPath: directory, now: () => now });
  try {
    for (const [index, source, age, text] of [[1, "companion", 6 * 3600000, "上午决定校对发布说明"], [2, "dictation", 1000, "不可作为陪伴上下文的听写"], [3, "companion", CONTEXT_AGE_MS + 1, "过期的对话"]]) {
      store.commitConversationTurn({ eventId: `seed-event-${index}`, sessionId: `seed-session-${index}`, role: "user", source, content: text, createdAt: new Date(now - age).toISOString() });
    }
    const context = new CompanionDialogueContext({ now: () => now, seed: store.recentCompanionContext() });
    assert.deepEqual(context.messages(), [{ role: "user", content: "上午决定校对发布说明" }]);
    assert.match(JSON.stringify(store.earlierCompanionContextForQuery("上午发布说明做什么")), /校对发布说明/);
    assert.doesNotMatch(JSON.stringify(store.earlierCompanionContextForQuery("听写过期对话")), /不可作为|过期的对话/);
  } finally { store.close(); }
}));

test("T21J context limits and forget invalidate active entries without repopulation", () => {
  let now = Date.now();
  const context = new CompanionDialogueContext({ now: () => now });
  for (let index = 0; index < 100; index++) { const entry = context.begin(`问题${index}`); context.update(entry, "回答".repeat(500), { finished: true }); }
  assert.ok(context.messages().length <= 80);
  assert.ok(context.messages().reduce((sum, row) => sum + row.content.length, 0) <= 32000);
  const entry = context.begin("刚才的事情");
  context.clear();
  context.update(entry, "已经删除，禁止迟到恢复");
  assert.deepEqual(context.messages(), []);
  context.begin("新消息");
  now += CONTEXT_AGE_MS + 1;
  assert.deepEqual(context.messages(), []);
});

test("T21J every model question retrieves current reviewed vectors; pending, correction and delete are respected", () => temporary(async (directory) => {
  const store = new CompanionMemoryStore({ userDataPath: directory });
  try {
    const target = store.addCandidate({ day: "2026-08-08", summary: "灯塔项目发布前要完成字幕校对", source: "dictation" });
    store.setCandidateState(target.id, "accepted");
    store.addCandidate({ day: "2026-09-08", summary: "未审核的秘密决定" });
    for (let index = 0; index < 15; index++) { const item = store.addCandidate({ day: "2026-09-07", summary: `午饭菜单第${index}项` }); store.setCandidateState(item.id, "accepted"); }
    const requests = [];
    const adapter = new OpenAiStreamingCompanionModelAdapter({ config, readMemoryContext: (query) => store.reviewedContextForQuery(query), fetchImpl: async (_url, options) => { requests.push(JSON.parse(options.body)); return response("收到。"); } });
    await adapter.streamTurn({ text: "灯塔项目发布前要完成什么" });
    assert.match(requests[0].messages[0].content, /字幕校对/);
    assert.doesNotMatch(requests[0].messages[0].content, /未审核的秘密/);
    assert.ok(store.status().indexedChunks >= 16);
    store.updateCandidate({ id: target.id, summary: "灯塔项目发布前要做音频验收" });
    await adapter.streamTurn({ text: "灯塔项目发布前要完成什么" });
    assert.match(requests[1].messages[0].content, /音频验收/);
    assert.doesNotMatch(requests[1].messages[0].content, /字幕校对/);
    store.deleteItem({ type: "candidate", id: target.id });
    await adapter.streamTurn({ text: "灯塔项目发布前要完成什么" });
    assert.doesNotMatch(requests[2].messages[0].content, /字幕校对|音频验收/);
  } finally { store.close(); }
}));

test("T21J wake greets once through direct TTS, then listens at normal conversation volume", async () => {
  assert.equal(wakeGreeting({ ownerName: "祖名" }), "在呢，祖名。");
  const spoken = [];
  let emit;
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const controller = new CompanionConversationController({ providerLabel: "three-stage", audioSource: source, audioSink: sink, wait: async () => {},
    providerFactory: ({ onEvent }) => { emit = onEvent; return { connect: async () => ({ ok: true }), sayHello: (text) => { spoken.push(text); return true; }, sendAudio: () => true, close() {} }; },
  });
  try {
    assert.equal((await controller.start({ initialAnnouncement: wakeGreeting({ ownerName: "祖名" }), closeAfterAnnouncement: false })).ok, true);
    emit({ type: "tts.start" }); emit({ type: "audio", audio: Buffer.from([1, 2]) }); emit({ type: "tts.end" });
    await controller.eventChain;
    assert.deepEqual(spoken, ["在呢，祖名。"]);
    assert.equal(controller.snapshot().state, "listening");
    assert.equal(controller.snapshot().active, true);
  } finally { await controller.stop(); }
});

test("T21J manual backlog processes more than 120 turns and multiple days/sources into dated Markdown", () => temporary(async (directory) => {
  const store = new CompanionMemoryStore({ userDataPath: directory });
  const settings = createKnowledgeBaseSettings({ userDataPath: directory });
  let requests = 0;
  const pipeline = new CompanionMemoryPipeline({ store, loadSecret: () => ({}), requestJson: async ({ messages }) => {
    requests++;
    const input = JSON.parse(messages[1].content);
    assert.match(messages[0].content, /过滤口误、重复/);
    if (requests === 2) assert.equal(input.previousSummary, "## 主要事项\n已整理发布准备");
    return { summary: "## 主要事项\n已整理发布准备", candidates: [] };
  } });
  const coordinator = new CompanionMemoryGenerationCoordinator({ pipeline, store, knowledgeBaseSettings: settings });
  try {
    for (let index = 0; index < 123; index++) store.commitConversationTurn({ eventId: `backlog-event-${index}`, sessionId: "backlog-session", role: "user", content: `原始口误不要抄进摘要${index}`, source: index === 122 ? "dictation" : "companion", createdAt: new Date(2026, 8, index < 121 ? 6 : 7, 9, 0, index).toISOString() });
    const otherDay = store.listUnprocessedTurns({ sources: ["companion"], day: "2026-09-07" });
    assert.equal(otherDay.length, 1, "day filter must run before LIMIT");
    const result = await coordinator.processBacklog();
    assert.equal(result.ok, true);
    assert.equal(result.turns, 123);
    assert.equal(result.days, 2);
    assert.equal(result.remainingDays, 0);
    assert.equal(requests, 4);
    for (const file of ["companion/2026-09-06.md", "companion/2026-09-07.md", "dictation/2026-09-07.md"]) {
      const content = fs.readFileSync(path.join(settings.loadRoot(), "DeskMate/daily", file), "utf8");
      assert.match(content, /已整理发布准备/);
      assert.doesNotMatch(content, /原始口误/);
    }
    assert.equal(store.status().turns, 123);
    const repeat = await coordinator.processBacklog();
    assert.equal(repeat.turns, 0);
    assert.equal(requests, 4);
  } finally { store.close(); }
}));

test("T21J manual partial failure preserves finished dates and retries only outstanding input", () => temporary(async (directory) => {
  const store = new CompanionMemoryStore({ userDataPath: directory });
  let fail = true;
  const calls = [];
  const pipeline = new CompanionMemoryPipeline({ store, loadSecret: () => ({}), requestJson: async ({ messages }) => {
    const input = JSON.parse(messages[1].content);
    calls.push(input.day);
    if (fail && input.day === "2026-09-07") throw new Error("private-provider-content");
    return { summary: "主要事项：校对发布笔记", candidates: [] };
  } });
  const settings = createKnowledgeBaseSettings({ userDataPath: directory });
  const coordinator = new CompanionMemoryGenerationCoordinator({ pipeline, store, knowledgeBaseSettings: settings });
  try {
    for (const day of [6, 7, 8]) store.commitConversationTurn({ eventId: `retry-event-${day}`, sessionId: "retry-session", role: "user", content: "校对发布笔记", createdAt: new Date(2026, 8, day, 9).toISOString() });
    const first = await coordinator.processBacklog();
    assert.equal(first.ok, false);
    assert.equal(first.turns, 2);
    assert.equal(first.sources.companion.ok, false, "a later success must not hide an earlier failed date");
    assert.equal(first.remainingDays, 1);
    assert.doesNotMatch(JSON.stringify(first), /private-provider-content/);
    assert.ok(fs.existsSync(path.join(settings.loadRoot(), "DeskMate/daily/companion/2026-09-06.md")));
    fail = false;
    assert.equal((await coordinator.processBacklog()).remainingDays, 0);
    assert.deepEqual(calls, ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-07"]);
  } finally { store.close(); }
}));

test("T21J switching to a populated external folder cannot overwrite unmanaged date notes", () => temporary(async (directory) => {
  const base = path.join(directory, "DeskMate", "daily", "companion");
  fs.mkdirSync(base, { recursive: true });
  const target = path.join(base, "2026-09-08.md");
  fs.writeFileSync(target, "用户自己写的资料");
  const projection = new KnowledgeBaseProjection({ root: directory });
  const result = projection.sync({ dailySummaries: [{ day: "2026-09-08", source: "companion", summary: "自动摘要" }] });
  assert.equal(result.conflicts, 1);
  assert.equal(fs.readFileSync(target, "utf8"), "用户自己写的资料");
}));

test("T21J main wires shared context, per-question retrieval and wake greeting without exposing content", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /dialogueContext: companionDialogueContext/);
  assert.match(main, /readMemoryContext: \(text\) => companionMemoryStore.reviewedContextForQuery\(text\)/);
  assert.match(main, /readPersona: \(\) => \(\{ name: companionPreferenceStore\.get\(\)\.name, persona: companionPersonaStore\.snapshot\(\)\.persona \}\)/);
  assert.match(main, /wakeGreeting: reason === "wake-word"/);
  assert.match(main, /companionDialogueContext.clear\(\)/);
  const report = createDiagnosticReport({ conversation: { pipeline: { version: 1, provider: "three-stage", context: { retainedMessages: 20, appliedMessages: 18, appliedReviewedMemories: 3, personaSchemaVersion: 4, ownerProfileConfiguredFields: 3, companionAgeConfigured: true, content: "私密对话" } } } });
  assert.deepEqual(report.conversation.pipeline.context, { retainedMessages: 20, appliedMessages: 18, appliedReviewedMemories: 3, personaSchemaVersion: 4, ownerProfileConfiguredFields: 3, companionAgeConfigured: true });
  assert.doesNotMatch(JSON.stringify(report), /私密对话/);
});
