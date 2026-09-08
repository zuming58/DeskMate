import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeMotionState, MOTION_REPEAT_DEFAULTS } from "../src/domain/motionPresets.js";

const require = createRequire(import.meta.url);
const { CodexTaskBriefServer, CodexTaskBriefStore, decodeCodexTaskBrief, encodeCodexTaskBrief, sendCodexTaskBrief } = require("../electron/codex-task-brief.cjs");
const { CompanionIntentBridge, isCodexStatusQuery, isContextualCodexStatusFollowUp, motionPresetFromUtterance, shouldClassifyWithModel } = require("../electron/companion-intent-bridge.cjs");
const { parseArguments, reportCodexTaskBrief, reserveCodexTaskBrief, stateFileFor } = require("../scripts/report-codex-task-brief.cjs");

const task = (overrides = {}) => ({ version: "codex-task-brief-v1", provider: "codex", taskKey: "opaque_01", taskLabel: "DeskMate 软件", state: "working", milestone: "正在补齐测试", sequence: 1, ...overrides });

test("codex-task-brief-v1 accepts only the exact privacy-safe schema", () => {
  const encoded = encodeCodexTaskBrief(task());
  assert.deepEqual(decodeCodexTaskBrief(encoded.trim()), task());
  assert.equal(decodeCodexTaskBrief(JSON.stringify({ ...task(), prompt: "secret" })), null);
  assert.equal(decodeCodexTaskBrief(JSON.stringify(task({ milestone: "x".repeat(81) }))), null);
  assert.equal(decodeCodexTaskBrief(JSON.stringify(task({ taskKey: "short" }))), null);
  assert.equal(decodeCodexTaskBrief(JSON.stringify(task({ taskLabel: "https://example.com" }))), null);
  assert.equal(decodeCodexTaskBrief(JSON.stringify(task({ milestone: "password=secret" }))), null);
  const withoutMilestone = task(); delete withoutMilestone.milestone;
  assert.equal(decodeCodexTaskBrief(JSON.stringify(withoutMilestone)).milestone, "");
});

test("automatic task briefs use the three-stage TTS path and never browser speech synthesis", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const mainSource = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.match(mainSource, /announceCodexTaskBrief/);
  assert.match(mainSource, /initialAnnouncement/);
  assert.match(mainSource, /voice: "three-stage-tts"/);
});

test("optional local reporter reaches the bounded receiver without exposing the opaque key", async (context) => {
  const pipePath = `\\\\.\\pipe\\deskmate-t16-test-${process.pid}-${Date.now()}`;
  const received = [];
  const server = new CodexTaskBriefServer({ pipePath, onReport: (value) => received.push(value) });
  context.after(() => server.stop());
  assert.equal((await server.start()).ok, true);
  assert.equal((await sendCodexTaskBrief(task(), { pipePath })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(received.length, 1);
  assert.equal(received[0].taskKey, "opaque_01");
});

test("repository reporter persists only an opaque key, visible label and monotonic sequence", async () => {
  const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-task-reporter-"));
  try {
    const first = reserveCodexTaskBrief(parseArguments(["--task-key", "deskmate_t18", "--task-label", "DeskMate 软件闭环", "--state", "thinking", "--milestone", "开始核对"]), { stateDirectory });
    assert.equal(first.sequence, 1);
    const second = reserveCodexTaskBrief(parseArguments(["--task-key", "deskmate_t18", "--state", "working", "--milestone", "正在执行测试"]), { stateDirectory });
    assert.equal(second.sequence, 2);
    assert.equal(second.taskLabel, "DeskMate 软件闭环");
    const stored = fs.readFileSync(stateFileFor("deskmate_t18", stateDirectory), "utf8");
    assert.doesNotMatch(stored, /prompt|response|tool|command|cwd|window/i);
    const sent = [];
    const result = await reportCodexTaskBrief(["--task-key", "deskmate_t18", "--state", "completed", "--milestone", "测试通过"], { stateDirectory, send: async (report) => { sent.push(report); return { ok: true }; } });
    assert.deepEqual({ ok: result.ok, sequence: result.sequence, state: result.state }, { ok: true, sequence: 3, state: "completed" });
    assert.equal(sent[0].taskLabel, "DeskMate 软件闭环");
  } finally {
    fs.rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("repository reporter fails closed on missing labels, unsafe text and unknown arguments", async () => {
  const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-task-reporter-invalid-"));
  try {
    assert.throws(() => parseArguments(["--task-key", "deskmate_t18", "--unknown", "x", "--state", "working"]), /argument-invalid/);
    assert.throws(() => reserveCodexTaskBrief({ taskKey: "deskmate_t18", state: "working", taskLabel: "", milestone: "" }, { stateDirectory }), /brief-invalid/);
    const result = await reportCodexTaskBrief(["--task-key", "deskmate_t18", "--task-label", "DeskMate", "--state", "working", "--milestone", "password=secret"], { stateDirectory, send: async () => ({ ok: true }) });
    assert.deepEqual(result, { ok: false, reason: "codex-task-brief-invalid" });
  } finally {
    fs.rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("task brief store keeps eight recent tasks, rejects stale sequence and suppresses ordinary progress announcements", () => {
  let now = 1_000;
  const store = new CodexTaskBriefStore({ now: () => now });
  assert.equal(store.ingest(task()).announcement, null);
  now += 1_000;
  assert.equal(store.ingest(task({ sequence: 2, milestone: "继续开发" })).announcement, null);
  assert.equal(store.ingest(task({ sequence: 2 })).reason, "codex-task-brief-stale");
  now += 1;
  assert.equal(store.ingest(task({ sequence: 3, state: "waiting", milestone: "需要选择" })).announcement.text, "DeskMate 软件 需要你回复。");
  for (let index = 2; index <= 10; index += 1) store.ingest(task({ taskKey: `task_${String(index).padStart(4, "0")}`, taskLabel: `任务 ${index}`, sequence: 1 }));
  assert.equal(store.list().length, 8);
});

test("thinking stays silent while waiting, completed and error remain immediate", () => {
  let now = 10_000;
  const store = new CodexTaskBriefStore({ now: () => now });
  assert.equal(store.ingest(task({ state: "thinking" })).announcement, null);
  now += 16_000;
  assert.equal(store.ingest(task({ state: "thinking", sequence: 2 })).announcement, null);
  for (const [sequence, state] of [[3, "waiting"], [4, "completed"], [5, "error"]]) {
    now += 1;
    assert.ok(store.ingest(task({ sequence, state })).announcement);
  }
});

test("aggregate Codex query reports every active task while deterministic templates never invent progress", () => {
  const store = new CodexTaskBriefStore();
  store.ingest(task({ taskKey: "task_one", taskLabel: "桌面软件", state: "working", milestone: "代码门通过" }));
  store.ingest(task({ taskKey: "task_two", taskLabel: "固件审计", state: "waiting", milestone: "等待人工验证" }));
  const aggregate = store.query("Codex 项目情况怎么样");
  assert.equal(aggregate.needsDisambiguation, false);
  assert.equal(aggregate.aggregate, true);
  assert.match(aggregate.answer, /目前有 2 个 Codex 任务正在运行/);
  assert.match(aggregate.answer, /桌面软件 正在执行：代码门通过/);
  assert.match(aggregate.answer, /固件审计 正在等你回复：等待人工验证/);
  const named = store.query("桌面软件做完了吗");
  assert.equal(named.needsDisambiguation, false);
  assert.equal(named.answer, "桌面软件 正在执行：代码门通过");
  assert.doesNotMatch(named.answer, /%/);
  assert.doesNotMatch(aggregate.answer, /%/);
});

test("automatic hook lifecycle creates separate real tasks and can later hydrate their titles", () => {
  const store = new CodexTaskBriefStore();
  const first = store.ingestHook({ event: "UserPromptSubmit", state: "thinking", taskKey: "codex_1234567890123456", taskLabel: "deskmate" });
  assert.equal(first.task.state, "thinking");
  assert.equal(first.announcement, null);
  const waiting = store.ingestHook({ event: "PermissionRequest", state: "waiting", toolName: "Bash", taskKey: "codex_1234567890123456", taskLabel: "deskmate" });
  assert.equal(waiting.task.state, "waiting");
  assert.equal(waiting.announcement.text, "deskmate 需要你回复。");
  assert.equal(store.relabel("codex_1234567890123456", "DeskMate 软件闭环").changed, true);
  assert.equal(store.query("DeskMate 软件闭环怎么样").answer, "DeskMate 软件闭环 正在等你回复：需要你确认");
});

test("automatic terminal announcements require a real active transition and speak once", () => {
  const store = new CodexTaskBriefStore();
  assert.equal(store.ingest(task({ state: "completed" })).announcement, null);
  const freshStop = store.ingestHook({ event: "Stop", state: "completed", taskKey: "codex_fresh_terminal", taskLabel: "无活动任务" });
  assert.equal(freshStop.announcement, null);

  store.ingestHook({ event: "UserPromptSubmit", state: "thinking", taskKey: "codex_active_terminal", taskLabel: "真实任务" });
  const completed = store.ingestHook({ event: "Stop", state: "completed", taskKey: "codex_active_terminal", taskLabel: "真实任务" });
  assert.equal(completed.announcement.text, "真实任务 已结束。");
  const repeated = store.ingestHook({ event: "SessionEnd", state: "completed", taskKey: "codex_active_terminal", taskLabel: "真实任务" });
  assert.equal(repeated.announcement, null);
});

test("task lookup tolerates spoken spacing, matches a unique project term, and keeps similar names ambiguous", () => {
  const store = new CodexTaskBriefStore();
  store.ingest(task({ taskKey: "task_one", taskLabel: "DeskMate 软件闭环", state: "working", milestone: "语音路由修复" }));
  store.ingest(task({ taskKey: "task_two", taskLabel: "EasyInput 固件", state: "waiting", milestone: "等待烧录授权" }));
  assert.equal(store.query("Desk Mate 软件闭环怎么样").answer, "DeskMate 软件闭环 正在执行：语音路由修复");
  assert.equal(store.query("EasyInput 项目到哪一步了").answer, "EasyInput 固件 正在等你回复：等待烧录授权");
  store.ingest(task({ taskKey: "task_three", taskLabel: "DeskMate 安装包", state: "working", milestone: "正在打包" }));
  const similar = store.query("DeskMate 项目怎么样");
  assert.equal(similar.needsDisambiguation, true);
  assert.match(similar.answer, /完整任务名称/);
});

test("Codex status questions and a named follow-up bypass the language model", async () => {
  let now = 5_000;
  let modelCalls = 0;
  const store = new CodexTaskBriefStore({ now: () => now });
  store.ingest(task({ taskKey: "task_one", taskLabel: "DeskMate 软件闭环", state: "working", milestone: "修复确定性回答" }));
  store.ingest(task({ taskKey: "task_two", taskLabel: "EasyInput 固件", state: "waiting", milestone: "等待人工验证" }));
  const bridge = new CompanionIntentBridge({
    loadSecret: () => ({ apiKey: "x" }),
    appActions: { listRegistered: () => [] },
    codexStatus: () => ({ state: "working" }),
    codexTasks: store,
    requestJson: async () => { modelCalls += 1; return { type: "none" }; },
    now: () => now,
  });
  assert.equal(isCodexStatusQuery("Codex 已经进行到哪一步了"), true);
  assert.equal(isCodexStatusQuery("Code S 进行到哪一步了"), true);
  assert.equal(isCodexStatusQuery("我的这个任务跑到哪一步了"), true);
  const aggregate = await bridge.analyze("Codex 已经进行到哪一步了");
  assert.equal(aggregate.result.codex.aggregate, true);
  assert.match(aggregate.result.answer, /目前有 2 个 Codex 任务正在运行/);
  assert.equal(modelCalls, 0);
  now += 1_000;
  const selected = bridge.resolveDeterministic("EasyInput 固件");
  assert.equal(selected.result.answer, "EasyInput 固件 正在等你回复：等待人工验证");
  assert.equal(modelCalls, 0);
});

test("Codex status with no trusted report is claimed and fails closed without invented progress", async () => {
  let modelCalls = 0;
  const bridge = new CompanionIntentBridge({
    loadSecret: () => ({ apiKey: "x" }),
    appActions: { listRegistered: () => [] },
    codexStatus: () => ({ state: "working" }),
    codexTasks: new CodexTaskBriefStore(),
    requestJson: async () => { modelCalls += 1; return { type: "none" }; },
  });
  assert.equal(bridge.claimsTurn("Codex 现在进行到哪一步了"), true);
  const answer = (await bridge.analyze("Codex 现在进行到哪一步了")).result.answer;
  assert.match(answer, /没有收到任何可信的 Codex 任务状态/);
  assert.doesNotMatch(answer, /\d+%|百分之/u);
  assert.equal(modelCalls, 0);
});

test("explicit motion phrases bypass the model and run only a frozen preset", async () => {
  let modelCalls = 0;
  const motions = [];
  const bridge = new CompanionIntentBridge({
    loadSecret: () => ({ apiKey: "x" }),
    appActions: { listRegistered: () => [] },
    codexStatus: () => ({ state: "idle" }),
    codexTasks: new CodexTaskBriefStore(),
    motionAction: async (preset) => { motions.push(preset); return { ok: true }; },
    requestJson: async () => { modelCalls += 1; return { type: "none" }; },
  });
  assert.equal(motionPresetFromUtterance("小智，跳个舞"), "dance");
  assert.equal((await bridge.analyze("小智，跳个舞")).result.ok, true);
  assert.deepEqual(motions, ["dance"]);
  assert.equal(modelCalls, 0);
  assert.equal((await bridge.analyze("小智，不要跳舞")).proposal, null);
  assert.equal(motions.length, 1);
  assert.equal(modelCalls, 0);
});

test("a received Codex report gives the realtime Bridge a bounded conversational follow-up context", async () => {
  let now = 5_000;
  let modelCalls = 0;
  const store = new CodexTaskBriefStore({ now: () => now });
  store.ingest(task({ taskKey: "task_one", taskLabel: "DeskMate 实时 Bridge", state: "waiting", milestone: "等待语音复测" }));
  const bridge = new CompanionIntentBridge({
    loadSecret: () => ({ apiKey: "x" }),
    appActions: { listRegistered: () => [] },
    codexStatus: () => ({ state: "working" }),
    codexTasks: store,
    requestJson: async () => { modelCalls += 1; return { type: "none" }; },
    now: () => now,
  });
  assert.equal(isContextualCodexStatusFollowUp("那现在怎么样了？"), true);
  assert.equal(isContextualCodexStatusFollowUp("今天天气怎么样？"), false);
  bridge.noteCodexReport();
  assert.equal((await bridge.analyze("那现在怎么样了？")).result.answer, "DeskMate 实时 Bridge 正在等你回复：等待语音复测");
  assert.equal(modelCalls, 0);
  now += 60_001;
  assert.equal((await bridge.analyze("那现在怎么样了？")).proposal, null);
  assert.equal(modelCalls, 0);
});

test("only deterministically claimed realtime turns use the trusted Bridge", () => {
  const mainSource = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const controllerSource = fs.readFileSync(new URL("../electron/companion-conversation.cjs", import.meta.url), "utf8");
  assert.match(mainSource, /resolveTrustedTurn:\s*async[\s\S]{0,240}companionIntentBridge\?\.analyze/);
  assert.match(mainSource, /claimsTrustedTurn:[\s\S]{0,160}companionIntentBridge\?\.claimsTurn/);
  assert.match(controllerSource, /if \(trustedClaimed\) \{[\s\S]{0,180}resolveTrustedTurn/);
  assert.doesNotMatch(mainSource, /memoryTurn\?\.role === "user"[\s\S]{0,240}companionIntentBridge\?\.analyze/);
  assert.match(controllerSource, /intentChecked:\s*trusted\?\.checked\s*===\s*true/);
});

test("the realtime Bridge passes ordinary chat immediately and escalates only control-like ambiguity", async () => {
  let modelCalls = 0;
  const bridge = new CompanionIntentBridge({
    loadSecret: () => ({ apiKey: "x" }),
    appActions: { listRegistered: () => [] },
    codexStatus: () => ({ state: "idle" }),
    requestJson: async () => { modelCalls += 1; return { type: "none" }; },
  });
  assert.equal(shouldClassifyWithModel("今天天气怎么样", []), false);
  assert.equal((await bridge.analyze("今天天气怎么样")).proposal, null);
  assert.equal(modelCalls, 0);
  assert.equal(shouldClassifyWithModel("软件项目做到哪一步了", []), true);
  await bridge.analyze("软件项目做到哪一步了");
  assert.equal(modelCalls, 1);
});

test("proactive Codex speech is user-switchable while task status remains available", () => {
  const mainSource = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preloadSource = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const pagesSource = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(mainSource, /result\.announcement\s*&&\s*announcementsEnabled/);
  assert.match(mainSource, /listeningAfterPlayback:\s*false/);
  assert.match(mainSource, /closeAfterAnnouncement:\s*true/);
  assert.match(mainSource, /desktop:set-codex-task-brief-announcements/);
  assert.match(preloadSource, /setCodexTaskBriefAnnouncements/);
  assert.match(pagesSource, /主动语音播报/);
  assert.match(pagesSource, /关闭后仍保留状态，可随时询问/);
  assert.match(pagesSource, /三段式陪伴链/);
  assert.match(pagesSource, /可信动作与状态 Bridge/);
  assert.match(pagesSource, /Codex 真实任务监控/);
});

test("voice intent opens enabled apps, rejects disabled apps, answers Codex deterministically, and reserves motion without wire output", async () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  let enabled = false;
  let opened = 0;
  const appActions = { listRegistered: () => [{ id, label: "Codex", voiceEnabled: enabled }], describe: () => ({ id, label: "Codex", voiceEnabled: enabled }), executeVoice: async () => { opened += 1; return { ok: true, label: "Codex" }; } };
  let classified = { type: "open_application", actionId: id };
  const codexTasks = { query: () => ({ available: true, needsDisambiguation: false, answer: "桌面软件 已完成：测试通过" }) };
  const bridge = new CompanionIntentBridge({ loadSecret: () => ({ apiKey: "x" }), appActions, codexStatus: () => ({ state: "working" }), codexTasks, requestJson: async () => classified });
  assert.equal((await bridge.analyze("打开 Codex")).reason, "application-voice-not-enabled");
  assert.equal(opened, 0);
  enabled = true;
  assert.equal((await bridge.analyze("打开 Codex")).result.ok, true);
  assert.equal(opened, 1);
  classified = { type: "query_codex_status" };
  assert.equal((await bridge.analyze("桌面软件做完了吗")).result.answer, "桌面软件 已完成：测试通过");
  classified = { type: "run_motion_preset", preset: "nod" };
  const motion = await bridge.analyze("点两次头");
  assert.equal(motion.reason, "motion-action-unavailable");
  assert.equal(motion.result.preset, "nod");
});

test("motion repeat count is local-only bounded state with preset defaults", () => {
  assert.deepEqual(MOTION_REPEAT_DEFAULTS, { attention: 1, search: 1, nod: 2, dance: 2 });
  assert.equal(normalizeMotionState({ preset: "nod" }).repeatCount, 2);
  assert.equal(normalizeMotionState({ preset: "attentive", repeatCount: 9 }).repeatCount, 1);
  assert.equal(normalizeMotionState({ preset: "dance", repeatCount: 3 }).repeatCount, 3);
});
