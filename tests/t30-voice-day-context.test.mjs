import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createDiagnosticReport } from '../src/services/diagnostics.js';
const require = createRequire(import.meta.url);
const { CompanionDialogueContext } = require('../electron/companion-dialogue-context.cjs');
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { OpenAiStreamingCompanionModelAdapter } = require('../electron/companion-model-adapter.cjs');
const { memoryQueryPlan } = require('../electron/companion-retrieval-policy.cjs');
const { CompanionConversationController } = require('../electron/companion-conversation.cjs');
const { SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = require('../electron/companion-audio.cjs');
const config = { provider: 'custom', endpoint: 'https://test.invalid/chat', apiKey: 'synthetic', model: 'test' };

test('T30 same-day context survives hours; midnight and cold seed exclude yesterday without deleting records', () => {
  let now = new Date(2026, 8, 11, 8).getTime();
  const context = new CompanionDialogueContext({ now: () => now });
  context.append('user', '早上讨论项目');
  now = new Date(2026, 8, 11, 22).getTime();
  assert.equal(context.messages()[0].content, '早上讨论项目');
  context.append('user', '昨晚讲个笑话');
  now = new Date(2026, 8, 12, 0, 1).getTime();
  assert.deepEqual(context.messages(), []);
  assert.ok(context.entries.some(row => row.content === '昨晚讲个笑话'));
  const seed = [{ role: 'user', content: '旧笑话', createdAt: now - 120000 }];
  assert.deepEqual(new CompanionDialogueContext({ now: () => now, seed }).messages(), []);
  context.append('user', '今天好');
  assert.equal(context.messages()[0].content, '今天好');
});

test('T30 model request keeps time and approved preferences but ordinary greeting never retrieves old chatter', async () => {
  const now = new Date(2026, 8, 12, 8).getTime();
  const context = new CompanionDialogueContext({ now: () => now, seed: [{ role: 'user', content: '昨天笑话主题', createdAt: now - 12 * 3600000 }] });
  let lookups = 0;
  const model = new OpenAiStreamingCompanionModelAdapter({ config, now: () => now, dialogueContext: context, readEarlierContext: () => { lookups++; return []; }, readLocalHistory: () => { lookups++; return []; }, readKnowledgeContext: () => { lookups++; return []; }, readMemoryContext: () => [] });
  const messages = await model.messages('早上好');
  assert.equal(lookups, 0);
  assert.doesNotMatch(JSON.stringify(messages), /昨天笑话主题/);
  assert.match(JSON.stringify(messages), /当前本地时间/);
  assert.equal(messages.at(-1).content, '早上好');
});

test('T30 explicit yesterday work review retrieves both sources with original date and kind; casual recall excludes raw dictation', () => {
  const now = new Date(2026, 8, 12, 8).getTime();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t30-memory-'));
  const store = new CompanionMemoryStore({ userDataPath: folder, now: () => now });
  try {
    for (const [id, source, content, at] of [
      ['chat', 'companion', '做完蓝鲸项目验证', now - 12 * 3600000],
      ['input', 'dictation', '请为公众号写一篇文章', now - 10 * 3600000],
      ['new', 'dictation', '今天内容不应混入昨天', now - 1000],
    ]) store.commitConversationTurn({ eventId: id, sessionId: 'test', role: 'user', source, content, createdAt: new Date(at).toISOString() });
    const plan = memoryQueryPlan('昨天我们干了哪些活啊', { now });
    assert.equal(plan.includeDictation, true); assert.equal(plan.dayReview, true);
    const hits = store.localHistoryForQuery(plan.query, plan);
    assert.ok(hits.some(row => row.kind === 'raw-companion'));
    assert.ok(hits.some(row => row.kind === 'raw-dictation'));
    assert.ok(hits.every(row => row.day === '2026-09-11'));
    assert.ok(!store.localHistoryForQuery('以前公众号文章').some(row => row.source === 'dictation'));
    assert.equal(memoryQueryPlan('早上好', { now }).includeDictation, false);
  } finally { store.close(); fs.rmSync(folder, { recursive: true, force: true }); }
});

test('T30 speech arriving near idle deadline extends recognition wait before queued event processing', async () => {
  let now = 0, id = 0, provider;
  const timers = new Map(), events = [];
  const tick = async ms => { now += ms; for (const [key, timer] of [...timers]) if (timer.at <= now && timers.delete(key)) timer.fn(); for (let i = 0; i < 40; i++) await Promise.resolve(); };
  const controller = new CompanionConversationController({
    now: () => now, setTimer: (fn, ms) => { const key = ++id; timers.set(key, { fn, at: now + ms }); return key; }, clearTimer: key => timers.delete(key), wait: async () => {},
    providerFactory: ({ onEvent }) => (provider = { connect: async () => ({ ok: true }), close() {}, sendAudio: () => true, emit: onEvent }),
    audioSource: new SimulatedCompanionAudioSource(), audioSink: new SimulatedCompanionAudioSink(), onEvent: event => events.push(event),
  });
  await controller.start({ sessionId: 'speech', generation: 1 });
  await tick(9500);
  provider.emit({ type: 'asr.speech-started' });
  await tick(600);
  await controller.eventChain;
  assert.equal(controller.snapshot().active, true);
  provider.emit({ type: 'asr.partial', text: '还在说的合成测试' });
  await controller.eventChain;
  await tick(11000);
  assert.equal(controller.snapshot().active, true);
  await tick(19000);
  assert.equal(controller.snapshot().active, true);
  assert.ok(events.some(row => row.reason === 'speech-final-timeout' && row.error));
  provider.emit({ type: 'asr.final', text: '最终识别完成' });
  await controller.eventChain;
  await tick(11000);
  assert.equal(controller.snapshot().active, true);
  await controller.stop('test-complete');
  const previous = provider;
  await controller.start({ sessionId: 'next-speech', generation: 2 });
  await tick(9500);
  previous.emit({ type: 'asr.speech-started' });
  await controller.eventChain;
  await tick(501);
  assert.equal(controller.snapshot().active, false, 'stale speech must not extend another session');
});

test('T30 private candidate cannot cross midnight and adopts only within its original day', () => {
  let now = new Date(2026, 8, 11, 23, 59, 59).getTime();
  const model = new OpenAiStreamingCompanionModelAdapter({ config, now: () => now });
  const draft = model.prepareDraft('你好');
  now += 2000;
  assert.equal(draft.commit(), false);
  assert.equal(model.dialogueContext.messages().length, 0);
});

test('T30 output diagnostic distinguishes clipboard fallback and redacts arbitrary failure strings', () => {
  const input = { voiceOutput: { destination: 'clipboard', requestedMode: 'active-window', fallback: true, reason: 'desktop-output-send-input-incomplete', ok: true } };
  assert.equal(createDiagnosticReport(input).voiceOutput.reason, 'desktop-output-send-input-incomplete');
  input.voiceOutput.reason = 'SECRET user text/path';
  const result = createDiagnosticReport(input).voiceOutput;
  assert.equal(result.fallback, true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});
