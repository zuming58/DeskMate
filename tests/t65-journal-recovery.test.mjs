import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { CompanionMemoryPolicyStore } = require('../electron/companion-memory-policy.cjs');
const { MemoryJournalService, chunksOfTurns } = require('../electron/memory-journal-service.cjs');
const { parseJsonContent, requestTextModelJson } = require('../electron/text-model-json.cjs');

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t65-'));
  let now = new Date(2026, 8, 19, 22, 30).getTime();
  const store = new CompanionMemoryStore({ userDataPath: root, now: () => now });
  const policyStore = new CompanionMemoryPolicyStore({ userDataPath: root });
  const policy = { ...policyStore.snapshot() }; delete policy.lastResults;
  policyStore.save({ ...policy, dailyTime: '23:00' });
  const inputs = [], sent = [];
  let failSynthesis = false;
  const options = { store, policyStore, now: () => now, loadSecret: () => ({}), knowledgeBaseProjection: () => ({ ok: true }), knowledgeOsSettings: { status: () => ({ configured: true, syncEnabled: true }) }, knowledgeOsClient: { callTool: async (name, payload) => { if (name === 'submission.get_status') return { ok: true, data: { status: 'completed', stage: 'raw_sealed' } }; sent.push(payload); return { ok: true, data: { submission_id: `receipt-${sent.length}` } }; } }, requestJson: async request => {
    assert.equal(request.nonThinking, true); assert.equal(request.timeoutMs, 120000);
    const input = JSON.parse(request.messages.at(-1).content); inputs.push(input);
    if (input.workday) return { summary: '小时摘要' };
    if (input.records) return { workItems: ['完成测试'], personalItems: [], candidates: [] };
    if (failSynthesis) throw new Error('text-model-request-timeout');
    return { workMarkdown: '- 完成测试', personalMarkdown: '- 没有明确个人事实', candidates: [] };
  } };
  const add = (id, text = '测试工作', at = now) => store.commitConversationTurn({ eventId: id, sessionId: 't65', role: 'user', source: 'dictation', content: text, createdAt: new Date(at).toISOString() });
  try { await run({ store, options, inputs, sent, add, setNow: value => { now = value; }, fail: value => { failSynthesis = value; } }); }
  finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

test('failed manual close resumes checkpoint after service recreation, syncs once, and never closes tomorrow twice', () => fixture(async h => {
  h.add('a', '测试'.repeat(2000)); h.add('b', '另一个事项'.repeat(800));
  h.fail(true);
  const first = new MemoryJournalService(h.options);
  assert.equal((await first.closeCurrentWorkday({ manual: true })).reason, 'text-model-request-timeout');
  assert.equal(h.sent.length, 0);
  const reviews = h.inputs.filter(i => i.records).length;
  assert.equal(reviews, 2);
  assert.equal(h.store.workdayStatus().jobs[0].stage, 'synthesis');
  h.fail(false);
  const resumed = new MemoryJournalService(h.options);
  assert.equal((await resumed.closeCurrentWorkday({ manual: true })).sync.accepted, 2);
  assert.equal(h.inputs.filter(i => i.records).length, reviews);
  assert.equal(h.store.listUnprocessedTurns({ sources: ['dictation'] }).length, 0);
  h.setNow(new Date(2026, 8, 19, 23, 1).getTime());
  await resumed.tick();
  assert.equal(h.sent.length, 2);
  assert.equal(h.store.dailyJournal('2026-09-20'), null);
}));

test('daily retries back off, survive service restart, stop after three attempts, and allow explicit recovery', () => fixture(async h => {
  h.add('a'); h.fail(true);
  let service = new MemoryJournalService(h.options);
  await service.closeCurrentWorkday({ manual: true });
  const calls = h.inputs.length;
  service = new MemoryJournalService(h.options);
  await service.tick(); assert.equal(h.inputs.length, calls);
  h.setNow(new Date(2026, 8, 19, 22, 36).getTime()); await service.tick();
  h.setNow(new Date(2026, 8, 19, 22, 52).getTime()); await service.tick();
  assert.equal(h.store.journalJob('2026-09-19').attempts, 3);
  const capped = h.inputs.length;
  h.setNow(new Date(2026, 8, 19, 23, 40).getTime()); await service.tick();
  assert.equal(h.inputs.length, capped);
  h.fail(false);
  assert.equal((await service.retryPending()).sync.accepted, 2);
  assert.equal(h.store.dailyJournal('2026-09-19').status, 'completed');
}));

test('an old failed journal cannot block todays scheduled cutoff and submission', () => fixture(async h => {
  h.add('old', '旧记录', new Date(2026, 8, 18, 20).getTime());
  h.store.db.prepare("UPDATE conversation_turns SET workday_day='2026-09-18' WHERE source_event_id='old'").run();
  h.store.beginHistoricalClose('2026-09-18');
  h.store.saveJournalJob('2026-09-18', { state: 'failed', attempts: 3 });
  h.add('new'); h.setNow(new Date(2026, 8, 19, 23, 1).getTime());
  const service = new MemoryJournalService(h.options);
  const result = await service.tick();
  assert.equal(result.day, '2026-09-19'); assert.equal(result.sync.accepted, 2);
  assert.equal(h.store.dailyJournal('2026-09-18').status, 'closing');
}));

test('historical completion submits immediately and concurrent work cannot duplicate the review', () => fixture(async h => {
  h.add('a', '旧记录', new Date(2026, 8, 18, 20).getTime());
  h.store.db.prepare("UPDATE conversation_turns SET workday_day='2026-09-18'").run();
  const service = new MemoryJournalService(h.options);
  const pending = service.tick();
  assert.equal((await service.tick()).reason, 'memory-generation-active');
  assert.equal((await service.finalizeDay('2026-09-18')).reason, 'memory-generation-active');
  assert.equal((await pending).sync.accepted, 2);
}));

test('long single records are fully split without clipping raw input', () => {
  const source = '测'.repeat(16000);
  const chunks = chunksOfTurns([{ id: 'a', content: source }]);
  assert.equal(chunks.length, 3);
  assert.equal(chunks.flat().map(t => t.content).join(''), source);
  assert(chunks.every(chunk => chunk.reduce((n, t) => n + t.content.length, 0) <= 6000));
});

test('explicit outbox retry bypasses delay without resending accepted classes or changing payloads', () => fixture(async h => {
  h.add('a');
  const original = h.options.knowledgeOsClient.callTool;
  const attempted = [];
  h.options.knowledgeOsClient.callTool = async (name, payload) => {
    attempted.push(payload);
    return payload.memory_class === 'personal' ? { ok: false, retryable: true, reason: 'knowledgeos-request-timeout' } : original(name, payload);
  };
  const service = new MemoryJournalService(h.options);
  const first = await service.closeCurrentWorkday({ manual: true });
  assert.equal(first.sync.accepted, 0); // shared connection failure stops this batch
  assert.equal((await service.syncPending()).skipped, true);
  h.options.knowledgeOsClient.callTool = async (name, payload) => { if (payload.memory_class === 'personal') assert.deepEqual(payload, attempted.find(p => p.memory_class === 'personal')); return original(name, payload); };
  assert.equal((await service.syncPending({ force: true })).accepted, 2);
  assert.equal(h.sent.length, 2);
}));

test('truncated model JSON is never accepted as a complete journal', () => {
  assert.throws(() => parseJsonContent({ choices: [{ finish_reason: 'length', message: { content: '{"summary":"partial"}' } }] }), /text-model-output-truncated/);
});

test('interrupted jobs show a recoverable error rather than endless running', () => fixture(async h => {
  h.add('a'); h.store.beginWorkdayClose({ manual: true });
  h.store.saveJournalJob('2026-09-19', { state: 'running', stage: 'review', attempts: 1 });
  const service = new MemoryJournalService(h.options);
  assert.equal(service.status().jobs[0].reason, 'memory-generation-interrupted');
  assert.equal((await service.retryPending()).ok, true);
}));

test('memory non-thinking uses the same official DeepSeek restriction without changing other providers', async () => {
  let body;
  const args = { secret: { provider: 'deepseek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-flash', apiKey: 'fixture-key' }, messages: [{ role: 'user', content: 'json' }], nonThinking: true, maxTokens: 4096, fetchImpl: async (_url, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => ({ choices: [{ message: { content: '{"summary":"ok"}' } }] }) }; } };
  await requestTextModelJson(args); assert.deepEqual(body.thinking, { type: 'disabled' }); assert.equal(body.max_tokens, 4096);
  await requestTextModelJson({ ...args, nonThinking: false }); assert.equal(body.thinking, undefined);
  await requestTextModelJson({ ...args, secret: { ...args.secret, provider: 'custom' } }); assert.equal(body.thinking, undefined);
});
