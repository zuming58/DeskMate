import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createDiagnosticReport } from "../src/services/diagnostics.js";

const require = createRequire(import.meta.url);
const { CompanionSpeechSegmenter } = require("../electron/companion-speech-segmenter.cjs");
const { OpenAiStreamingCompanionModelAdapter, visibleDelta } = require("../electron/companion-model-adapter.cjs");
const { BailianStreamingAsrAdapter } = require("../electron/streaming-asr-adapter.cjs");
const { DoubaoStreamingTtsAdapter } = require("../electron/streaming-tts-adapter.cjs");
const { ThreeStageCompanionProvider, classifyRecognizedBargeIn } = require("../electron/three-stage-companion-provider.cjs");

const tick = () => new Promise((resolve) => setImmediate(resolve));

function streamResponse(frames) {
  return {
    ok: true,
    body: {
      async *[Symbol.asyncIterator]() {
        for (const frame of frames) yield Buffer.from(frame);
      },
    },
  };
}

test("T21 speech segmenter emits stable sentences and fails closed on a mismatched final", () => {
  const segmenter = new CompanionSpeechSegmenter();
  assert.deepEqual(segmenter.push("祖名，早"), []);
  assert.deepEqual(segmenter.push("安。今天继续工作。"), ["祖名，早安。", "今天继续工作。"]);
  assert.deepEqual(segmenter.finish("祖名，早安。今天继续工作。"), []);

  const mismatch = new CompanionSpeechSegmenter();
  mismatch.push("真实答案。 ");
  assert.throws(() => mismatch.finish("另一个答案。"), /three-stage-stream-invalid/);
});

test("T21 companion model streams only visible content and keeps bounded multi-turn context", async () => {
  const requests = [];
  const replies = [
    ["data: {\"choices\":[{\"delta\":{\"content\":\"第一句。\"}}]}\n\n", "data: {\"choices\":[{\"delta\":{\"content\":\"第二句。\"}}]}\n\ndata: [DONE]\n\n"],
    ["data: {\"choices\":[{\"delta\":{\"content\":\"记得上一轮。\"}}]}\n\n"],
  ];
  const adapter = new OpenAiStreamingCompanionModelAdapter({
    config: { provider: "custom", endpoint: "https://model.example/v1/chat/completions", apiKey: "secret-value", model: "companion-model" },
    name: "小言",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return streamResponse(replies.shift());
    },
  });
  const deltas = [];
  const first = await adapter.streamTurn({ text: "你好", onDelta: (delta) => deltas.push(delta) });
  assert.equal(first.text, "第一句。第二句。");
  assert.deepEqual(deltas, ["第一句。", "第二句。"]);
  await adapter.streamTurn({ text: "还记得吗", onDelta: () => {} });
  assert.deepEqual(requests[1].messages.slice(-3).map(({ role, content }) => [role, content]), [
    ["user", "你好"], ["assistant", "第一句。第二句。"], ["user", "还记得吗"],
  ]);
  assert.equal(requests[0].enable_thinking, undefined);
  assert.equal(requests[0].max_tokens, 360);
  assert.match(requests[0].messages[0].content, /不超过 6 句或 300 个汉字/);
  assert.match(requests[0].messages[0].content, /用户的话已经通过麦克风成功送达/);
  assert.match(requests[0].messages[0].content, /不得声称没有麦克风、只能文字聊天/);
});

test("T21 companion model rejects tool-call drafts instead of speaking them", () => {
  assert.throws(() => visibleDelta({ choices: [{ delta: { tool_calls: [{ function: { name: "shell" } }] } }] }), /three-stage-tool-call-rejected/);
});

test("T21 ASR adapter applies bounded endpointing and de-duplicates one provider item", async () => {
  let sessionOptions;
  const events = [];
  const appended = [];
  const adapter = new BailianStreamingAsrAdapter({
    config: { apiKey: "sk-valid-test-key" },
    silenceDurationMs: 4000,
    onEvent: (event) => events.push(event),
    sessionFactory: (options) => {
      sessionOptions = options;
      return { start: async () => ({ ok: true }), append: (audio) => { appended.push(audio); return true; }, cancel: () => {} };
    },
  });
  await adapter.connect();
  assert.equal(sessionOptions.silenceDurationMs, 4000);
  sessionOptions.onEvent({ kind: "speech-started", itemId: "item-one", audioStartMs: 100 });
  sessionOptions.onEvent({ kind: "preview", itemId: "item-one", confirmedText: "正在", currentText: "正在识别", preview: "上一轮历史文字，正在识别" });
  sessionOptions.onEvent({ kind: "speech-stopped", itemId: "item-one", audioEndMs: 900 });
  sessionOptions.onEvent({ kind: "completed", itemId: "item-one", text: "识别完成" });
  sessionOptions.onEvent({ kind: "completed", itemId: "item-one", text: "识别完成" });
  assert.equal(adapter.sendAudio(Buffer.from([1, 2])), true);
  assert.equal(appended.length, 1);
  assert.deepEqual(events, [
    { type: "speech.started", itemId: "item-one", audioStartMs: 100 },
    { type: "partial", text: "正在识别", confirmedText: "正在", itemId: "item-one" },
    { type: "speech.stopped", itemId: "item-one", audioEndMs: 900 },
    { type: "final", text: "识别完成", itemId: "item-one" },
  ]);
});

test("T21 TTS adapter sends confirmed text through Doubao direct speech and relays one PCM stream", async () => {
  let sessionOptions;
  const spoken = [];
  const adapter = new DoubaoStreamingTtsAdapter({
    config: { voice: "configured-voice" },
    sessionFactory: (options) => {
      sessionOptions = options;
      return { connect: async () => ({ ok: true }), sayHello: (text) => { spoken.push(text); return true; }, interrupt: () => {}, close: () => {} };
    },
  });
  await adapter.connect();
  const audio = [];
  const synthesis = adapter.synthesize("只朗读这句话。", { onAudio: (chunk) => audio.push([...chunk]) });
  await tick();
  sessionOptions.onEvent({ type: "audio", audio: Buffer.from([7, 8]) });
  sessionOptions.onEvent({ type: "tts.end" });
  assert.equal((await synthesis).ok, true);
  assert.deepEqual(spoken, ["只朗读这句话。"]);
  assert.deepEqual(audio, [[7, 8]]);
});

test("T21 TTS adapter reconnects lazily after an idle transport close", async () => {
  const sessions = [];
  const adapter = new DoubaoStreamingTtsAdapter({
    config: { voice: "configured-voice" },
    sessionFactory: (options) => {
      const session = { options, spoken: [], connect: async () => ({ ok: true }), sayHello(text) { this.spoken.push(text); return true; }, close: () => {} };
      sessions.push(session);
      return session;
    },
  });
  await adapter.connect();
  sessions[0].options.onEvent({ type: "connection.closed" });
  const synthesis = adapter.synthesize("重新连接后朗读。", { onAudio: () => {} });
  await tick();
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions[1].spoken, ["重新连接后朗读。"]);
  sessions[1].options.onEvent({ type: "tts.end" });
  assert.equal((await synthesis).ok, true);
});

function fakePipeline({ bypass = false, modelRun, now = Date.now } = {}) {
  let asrEvent;
  const events = [];
  const spoken = [];
  let modelCalls = 0;
  const provider = new ThreeStageCompanionProvider({
    onEvent: (event) => events.push(event),
    now,
    shouldBypassModel: () => bypass,
    asrFactory: ({ onEvent }) => {
      asrEvent = onEvent;
      return { connect: async () => ({ ok: true }), sendAudio: () => true, close: () => {} };
    },
    modelFactory: () => ({
      streamTurn: async (options) => {
        modelCalls += 1;
        return modelRun ? modelRun(options) : (() => { options.onDelta("收到。", "收到。"); return { ok: true, text: "收到。" }; })();
      },
      close: () => {},
    }),
    ttsFactory: () => ({
      connect: async () => ({ ok: true }),
      synthesize: async (text, { onAudio }) => { spoken.push(text); onAudio(Buffer.from([1, 2])); return { ok: true }; },
      interrupt: () => true,
      close: () => {},
    }),
  });
  return { provider, events, spoken, emitAsr: (event) => asrEvent(event), modelCalls: () => modelCalls };
}

test("T21 partial text never reaches the model and duplicate final submits once", async () => {
  const fixture = fakePipeline();
  await fixture.provider.connect();
  fixture.emitAsr({ type: "partial", text: "你" });
  assert.equal(fixture.modelCalls(), 0);
  fixture.emitAsr({ type: "final", text: "你好", itemId: "one" });
  fixture.emitAsr({ type: "final", text: "你好", itemId: "one" });
  await tick();
  await tick();
  assert.equal(fixture.modelCalls(), 1);
  assert.deepEqual(fixture.spoken, ["收到。"]);
  assert.deepEqual(fixture.events.filter((event) => event.type === "tts.start").length, 1);
  assert.deepEqual(fixture.events.filter((event) => event.type === "tts.end").length, 1);
});

test("T21 recognized-speech barge-in rejects weak noise and spoken-answer echo", () => {
  assert.deepEqual(classifyRecognizedBargeIn("嗯", "这里是回答"), { accepted: false, reason: "weak" });
  assert.deepEqual(classifyRecognizedBargeIn("掌声", "这里是回答"), { accepted: false, reason: "weak" });
  assert.deepEqual(classifyRecognizedBargeIn("这里是回答", "祖名，这里是回答。后面还有一句。"), { accepted: false, reason: "echo" });
  assert.deepEqual(classifyRecognizedBargeIn("等一下，我想换个问题", "祖名，这里是回答。"), { accepted: true, reason: "recognized-speech" });
});

test("T21 recognized partial interrupts current speech and its final opens exactly one replacement turn", async () => {
  let asrEvent;
  let modelCalls = 0;
  let synthesisCalls = 0;
  const events = [];
  const provider = new ThreeStageCompanionProvider({
    onEvent: (event) => events.push(event),
    asrFactory: ({ onEvent }) => {
      asrEvent = onEvent;
      return { connect: async () => ({ ok: true }), sendAudio: () => true, close: () => {} };
    },
    modelFactory: () => ({
      streamTurn: async ({ onDelta }) => {
        modelCalls += 1;
        const text = modelCalls === 1 ? "这是正在播报的原回答。" : "这是打断后的新回答。";
        onDelta(text, text);
        return { ok: true, text };
      },
      close: () => {},
    }),
    ttsFactory: () => ({
      connect: async () => ({ ok: true }),
      synthesize: async (_text, { onAudio, signal }) => {
        synthesisCalls += 1;
        onAudio(Buffer.from([1, 2]));
        if (synthesisCalls !== 1) return { ok: true };
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("three-stage-tts-cancelled")), { once: true }));
      },
      interrupt: () => true,
      close: () => {},
    }),
  });
  await provider.connect();
  asrEvent({ type: "final", text: "请给我一个很长的回答" });
  await tick();
  await tick();
  const beforeBarge = events.length;
  asrEvent({ type: "partial", text: "这是正在播报" });
  assert.equal(events.slice(beforeBarge).some((event) => event.type === "barge.start"), false);
  asrEvent({ type: "speech.started", itemId: "barge-one", audioStartMs: 1000 });
  asrEvent({ type: "partial", text: "等一下我想换个问题", itemId: "barge-one" });
  asrEvent({ type: "final", text: "等一下我想换个问题", itemId: "barge-one" });
  await tick();
  await tick();
  const after = events.slice(beforeBarge).map((event) => event.type);
  assert.ok(after.indexOf("barge.start") >= 0);
  assert.ok(after.indexOf("tts.end") > after.indexOf("barge.start"));
  assert.ok(after.indexOf("asr.final") > after.indexOf("tts.end"));
  assert.equal(modelCalls, 2);
  assert.equal(provider.diagnostics().counters.bargeInsAccepted, 1);
  assert.ok(provider.diagnostics().counters.bargeInsRejectedEcho >= 1);
});

test("T21 recognized speech can interrupt after cloud TTS ended while local playback is still draining", async () => {
  const fixture = fakePipeline();
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "请先给我一个回答" });
  await tick();
  await tick();
  assert.equal(fixture.provider.diagnostics().active, false);
  assert.equal(fixture.provider.diagnostics().playbackTailActive, true);
  const beforeBarge = fixture.events.length;
  fixture.emitAsr({ type: "partial", text: "收到" });
  assert.equal(fixture.events.slice(beforeBarge).some((event) => event.type === "barge.start"), false);
  fixture.emitAsr({ type: "speech.started", itemId: "tail-barge", audioStartMs: 1000 });
  fixture.emitAsr({ type: "partial", text: "等一下我换个问题", itemId: "tail-barge" });
  fixture.emitAsr({ type: "final", text: "等一下我换个问题", itemId: "tail-barge" });
  await tick();
  await tick();
  assert.equal(fixture.events.slice(beforeBarge).some((event) => event.type === "barge.start"), true);
  assert.equal(fixture.modelCalls(), 2);
  assert.equal(fixture.provider.diagnostics().playbackTailActive, true);
  assert.equal(fixture.provider.playbackDrained(), true);
  assert.equal(fixture.provider.diagnostics().playbackTailActive, false);
});

test("T21 drops a delayed ASR item that began in loudspeaker playback after the sink has drained", async () => {
  const fixture = fakePipeline();
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "为什么现在没有声音" });
  await tick();
  await tick();
  assert.equal(fixture.modelCalls(), 1);
  assert.equal(fixture.provider.diagnostics().playbackTailActive, true);

  fixture.emitAsr({ type: "speech.started", itemId: "speaker-echo-tail", audioStartMs: 1000 });
  assert.equal(fixture.provider.playbackDrained(), true);
  assert.equal(fixture.provider.diagnostics().postPlaybackEchoTailActive, true);
  const afterDrain = fixture.events.length;
  fixture.emitAsr({ type: "partial", text: "听到我声音了没有", itemId: "speaker-echo-tail" });
  fixture.emitAsr({ type: "speech.stopped", itemId: "speaker-echo-tail", audioEndMs: 2400 });
  fixture.emitAsr({ type: "final", text: "听到我声音了没有？", itemId: "speaker-echo-tail" });
  await tick();

  assert.equal(fixture.modelCalls(), 1);
  assert.equal(fixture.events.slice(afterDrain).some((event) => ["asr.partial", "asr.final"].includes(event.type)), false);
  assert.equal(fixture.provider.diagnostics().counters.postPlaybackEchoDrops, 2);
  assert.equal(fixture.provider.diagnostics().postPlaybackEchoTailActive, false);
});

test("T21 accepts a new microphone utterance that starts after loudspeaker playback drains", async () => {
  const fixture = fakePipeline();
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "先回答第一个问题" });
  await tick();
  await tick();
  assert.equal(fixture.provider.playbackDrained(), true);

  fixture.emitAsr({ type: "speech.started", itemId: "new-human-turn", audioStartMs: 3000 });
  fixture.emitAsr({ type: "partial", text: "我还有另外一个问题", itemId: "new-human-turn" });
  fixture.emitAsr({ type: "speech.stopped", itemId: "new-human-turn", audioEndMs: 3900 });
  fixture.emitAsr({ type: "final", text: "我还有另外一个问题", itemId: "new-human-turn" });
  await tick();
  await tick();

  assert.equal(fixture.modelCalls(), 2);
  assert.equal(fixture.provider.diagnostics().counters.postPlaybackEchoDrops, 0);
  assert.ok(fixture.events.some((event) => event.type === "asr.final" && event.text === "我还有另外一个问题"));
});

test("T21 ignores one short noise item but accepts two meaningful human hypotheses even when ASR revises text", async () => {
  let now = 0;
  const fixture = fakePipeline({ now: () => now });
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "请先给我一个回答" });
  await tick();
  await tick();
  assert.equal(fixture.provider.diagnostics().playbackTailActive, true);

  const beforeNoise = fixture.events.length;
  fixture.emitAsr({ type: "speech.started", itemId: "noise", audioStartMs: 1000 });
  fixture.emitAsr({ type: "partial", text: "刚才的问题", itemId: "noise" });
  fixture.emitAsr({ type: "speech.stopped", itemId: "noise", audioEndMs: 1180 });
  fixture.emitAsr({ type: "final", text: "刚才的问题", itemId: "noise" });
  assert.equal(fixture.events.slice(beforeNoise).some((event) => event.type === "barge.start"), false);
  assert.equal(fixture.modelCalls(), 1);

  fixture.emitAsr({ type: "speech.started", itemId: "human", audioStartMs: 2000 });
  now = 200;
  fixture.emitAsr({ type: "partial", text: "我想问另外", itemId: "human" });
  assert.equal(fixture.events.slice(beforeNoise).some((event) => event.type === "barge.start"), false);
  now = 600;
  fixture.emitAsr({ type: "partial", text: "换一个完全不同的问题", itemId: "human" });
  fixture.emitAsr({ type: "final", text: "我想问另外一个问题", itemId: "human" });
  await tick();
  await tick();
  assert.equal(fixture.events.slice(beforeNoise).some((event) => event.type === "barge.start"), true);
  assert.equal(fixture.modelCalls(), 2);
  assert.ok(fixture.provider.diagnostics().counters.bargeInsRejectedUnstable >= 2);
});

test("T21 provider-confirmed partial interrupts without waiting for a second hypothesis", async () => {
  let now = 0;
  const fixture = fakePipeline({ now: () => now });
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "请先给我一个回答" });
  await tick();
  await tick();
  const before = fixture.events.length;
  fixture.emitAsr({ type: "speech.started", itemId: "confirmed-human", audioStartMs: 1000 });
  now = 550;
  fixture.emitAsr({ type: "partial", text: "我想换一个问题", confirmedText: "我想换一个", itemId: "confirmed-human" });
  assert.equal(fixture.events.slice(before).some((event) => event.type === "barge.start"), true);
});

test("T21 completed human utterance can interrupt even when the provider emitted no partial", async () => {
  const fixture = fakePipeline();
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "请先给我一个回答" });
  await tick();
  await tick();
  const before = fixture.events.length;
  fixture.emitAsr({ type: "speech.started", itemId: "sparse-human", audioStartMs: 1000 });
  fixture.emitAsr({ type: "speech.stopped", itemId: "sparse-human", audioEndMs: 1700 });
  fixture.emitAsr({ type: "final", text: "我来问另外一个问题", itemId: "sparse-human" });
  await tick();
  await tick();
  assert.equal(fixture.events.slice(before).some((event) => event.type === "barge.start"), true);
  assert.equal(fixture.modelCalls(), 2);
});

test("T21 overlong model speech is closed gracefully instead of failing the conversation", async () => {
  const fixture = fakePipeline({
    modelRun: async ({ onDelta }) => {
      let fullText = "";
      for (let index = 1; index <= 20; index += 1) {
        const delta = `这是第${index}句。`;
        fullText += delta;
        onDelta(delta, fullText);
      }
      return { ok: true, text: fullText };
    },
  });
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "请详细回答" });
  for (let index = 0; index < 5; index += 1) await tick();
  assert.equal(fixture.spoken.length, 12);
  assert.equal(fixture.spoken.at(-1), "回答有点长，我先说到这里。");
  assert.equal(fixture.events.some((event) => event.type === "error"), false);
  assert.match(fixture.events.find((event) => event.type === "chat.final")?.text || "", /我先说到这里/);
  assert.equal(fixture.provider.diagnostics().counters.turnsCompleted, 1);
});

test("T21 begins TTS on a stable sentence before the model final arrives", async () => {
  let releaseModel;
  const modelGate = new Promise((resolve) => { releaseModel = resolve; });
  const fixture = fakePipeline({
    modelRun: async ({ onDelta }) => {
      onDelta("先告诉你结论。", "先告诉你结论。");
      await modelGate;
      onDelta("后面是补充。", "先告诉你结论。后面是补充。");
      return { ok: true, text: "先告诉你结论。后面是补充。" };
    },
  });
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "请回答" });
  await tick();
  assert.deepEqual(fixture.spoken, ["先告诉你结论。"]);
  assert.equal(fixture.events.some((event) => event.type === "chat.final"), false);
  releaseModel();
  await tick();
  await tick();
  assert.deepEqual(fixture.spoken, ["先告诉你结论。", "后面是补充。"]);
  assert.equal(fixture.events.filter((event) => event.type === "tts.end").length, 1);
});

test("T21 trusted status/action text bypasses the conversational model", async () => {
  const fixture = fakePipeline({ bypass: true });
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "Codex 进行到哪一步" });
  await tick();
  assert.equal(fixture.modelCalls(), 0);
  assert.equal(fixture.events.some((event) => event.type === "asr.final"), true);
  assert.equal(fixture.provider.diagnostics().counters.trustedBypasses, 1);
});

test("T21 interrupt cancels queued response and diagnostics contain no user content", async () => {
  let releaseModel;
  const modelGate = new Promise((resolve) => { releaseModel = resolve; });
  const fixture = fakePipeline({
    modelRun: async ({ onDelta, signal }) => {
      onDelta("不要泄露这句话。", "不要泄露这句话。");
      await modelGate;
      if (signal.aborted) throw new Error("three-stage-model-cancelled");
      return { ok: true, text: "不要泄露这句话。" };
    },
  });
  await fixture.provider.connect();
  fixture.emitAsr({ type: "final", text: "我的私人问题" });
  await tick();
  fixture.provider.interrupt();
  releaseModel();
  await tick();
  const serialized = JSON.stringify(fixture.provider.diagnostics());
  assert.doesNotMatch(serialized, /私人|泄露/);
  assert.equal(fixture.provider.diagnostics().counters.cancellations, 1);
});

test("T21 diagnostic export keeps pipeline metrics and strips all content fields", () => {
  const report = createDiagnosticReport({ conversation: { pipeline: {
    version: 1,
    provider: "three-stage",
    ready: true,
    active: false,
    counters: { asrFinals: 2, modelRequests: 1, ttsRequests: 2, turnsCompleted: 1, transcript: "私人问题", assistantText: "私人回答" },
    lastTiming: { firstAssistantDeltaMs: 240, firstTtsAudioMs: 510, turnCompletedMs: 1400, text: "不要导出" },
  } } });
  assert.equal(report.conversation.pipeline.provider, "three-stage");
  assert.equal(report.conversation.pipeline.counters.modelRequests, 1);
  assert.equal(report.conversation.pipeline.timing.firstTtsAudioMs, 510);
  assert.doesNotMatch(JSON.stringify(report), /私人|不要导出/);
});
