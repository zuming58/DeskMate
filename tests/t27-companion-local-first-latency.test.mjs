import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { createDiagnosticReport } from '../src/services/diagnostics.js';
const require = createRequire(import.meta.url);
const { OpenAiStreamingCompanionModelAdapter } = require('../electron/companion-model-adapter.cjs');
const { CompanionSpeechSegmenter } = require('../electron/companion-speech-segmenter.cjs');
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');
const { memoryQueryPlan, boundedRecall } = require('../electron/companion-retrieval-policy.cjs');
const now = new Date(2026, 8, 11, 21).getTime();
const config = { provider: 'custom', endpoint: 'https://model.example/v1/chat/completions', apiKey: 'synthetic-test', model: 'test' };
const response = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '有证据再回答。' } }] }) });
const make = options => new OpenAiStreamingCompanionModelAdapter({ config, now: () => now, fetchImpl: async () => response(), ...options });

test('T27 disables thinking for official DeepSeek V4 companion requests, not custom gateways or reasoner', async () => {
  for (const [provider, endpoint, modelName, expected] of [['deepseek', 'https://api.deepseek.com/chat/completions', 'deepseek-v4-flash', true], ['deepseek', 'https://api.deepseek.com/chat/completions', 'deepseek-reasoner', false], ['custom', 'https://gateway.example/chat/completions', 'deepseek-v4-flash', false]]) {
    let body;
    const model = make({ config: { ...config, provider, endpoint, model: modelName }, fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return response(); } });
    await model.streamTurn({ text: '你好' });
    assert.equal(body.thinking?.type === 'disabled', expected);
  }
});

test('T27 greetings, general chat and current-dialogue continuations never await KnowledgeOS', async () => {
  let calls = 0;
  const model = make({ readKnowledgeContext: async () => { calls++; throw Error('offline'); } });
  for (const text of ['你好', '给我讲一个故事', '我有点累了', '请解释递归', '继续刚才的故事', '你还记得我们刚才说什么吗']) await model.streamTurn({ text });
  assert.equal(calls, 0);
  assert.equal(model.diagnostics().retrieval.status, 'skipped');
  assert.equal(model.diagnostics().retainedMessages, 12);
});

test('T27 local relevant memory prevents remote lookup, unrelated recent accepted memory does not', async () => {
  let calls = 0, rows = [{ day: '2026-09-10', summary: '测试项目结论', score: 0.7 }];
  const model = make({ readMemoryContext: () => rows, readKnowledgeContext: async () => { calls++; return [{ title: 'source', snippet: '有来源的历史' }]; } });
  await model.streamTurn({ text: '以前测试项目的结论是什么' });
  assert.equal(calls, 0);
  rows = [{ day: '2026-09-10', summary: '无关早餐', score: 0 }];
  await model.streamTurn({ text: '以前测试项目的结论是什么' });
  assert.equal(calls, 1);
  assert.equal(model.diagnostics().retrieval.route, 'history-local-miss');
});

test('T27 explicit KnowledgeOS request still retrieves and local-only request never does', async () => {
  let calls = 0;
  const model = make({ readMemoryContext: () => [{ score: 0.9 }], readKnowledgeContext: async () => { calls++; return []; } });
  await model.streamTurn({ text: '请查 KnowledgeOS 备份恢复的资料' });
  assert.equal(calls, 1);
  await model.streamTurn({ text: '不要查 KnowledgeOS，只看本地以前的记录' });
  assert.equal(calls, 1);
});

test('T27 date-constrained recall cannot substitute a different day even with a high score', async () => {
  let calls = 0;
  const model = make({ readMemoryContext: () => [{ day: '2026-09-09', score: 0.99 }], readKnowledgeContext: async () => { calls++; return []; } });
  await model.streamTurn({ text: '昨天的项目进展呢' });
  assert.equal(calls, 1);
  const yesterday = memoryQueryPlan('昨天', { now });
  assert.equal(new Date(yesterday.since).getDate(), 10);
  const priorMonth = memoryQueryPlan('上个月', { now });
  assert.equal(new Date(priorMonth.since).getMonth(), 7);
  assert.equal(memoryQueryPlan('2026-02-30 做了什么', { now }).since, null);
});

test('T27 cancel while retrieving kills optional work and never sends a model request or adds a turn', async () => {
  const abort = new AbortController();
  let requestSignal, fetches = 0, started;
  const entered = new Promise(resolve => { started = resolve; });
  const model = make({ fetchImpl: async () => { fetches++; return response(); }, readKnowledgeContext: (_text, options) => { requestSignal = options.signal; started(); return new Promise(() => {}); } });
  const promise = model.streamTurn({ text: '查询知识库资料', signal: abort.signal });
  await entered;
  abort.abort();
  await assert.rejects(promise, /three-stage-model-cancelled/);
  assert.equal(requestSignal.aborted, true);
  assert.equal(fetches, 0);
  assert.equal(model.diagnostics().retainedMessages, 0);
});

test('T27 hung optional recall is bounded; failure remains distinct from empty success', async () => {
  let signal;
  const result = await boundedRecall((_query, options) => { signal = options.signal; return new Promise(() => {}); }, 'test', { timeoutMs: 15 });
  assert.equal(result.status, 'timeout');
  assert.equal(signal.aborted, true);
  assert.equal((await boundedRecall(async () => { throw Error('offline'); }, 'x', { timeoutMs: 50 })).status, 'unavailable');
  assert.equal((await boundedRecall(async () => [], 'x', { timeoutMs: 50 })).status, 'empty');
});

test('T27 MCP abort terminates child and handles a subsequent broken input pipe', async () => {
  const child = new EventEmitter(); let killed = 0;
  child.stdin = new EventEmitter(); child.stdin.write = () => {}; child.stdin.end = () => {};
  child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
  child.stderr = { resume() {} }; child.kill = () => { killed++; };
  const client = new KnowledgeOsMcpClient({ settings: { status: () => ({ readEnabled: true, syncEnabled: true }), loadConnection: () => ({ command: 'test-adapter', credentialId: 'test' }) }, spawnProcess: () => child });
  const abort = new AbortController();
  const pending = client.callTool('knowledge.search', {}, { signal: abort.signal });
  abort.abort();
  assert.equal((await pending).reason, 'knowledgeos-cancelled');
  child.stdin.emit('error', Error('EPIPE'));
  assert.equal(killed, 1);
});

test('T27 historical retrieval reads retained companion and dated notes, not raw dictation or pending profile', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t27-memory-'));
  const store = new CompanionMemoryStore({ userDataPath: folder, now: () => now });
  try {
    for (const [id, source, content] of [['own', 'companion', '蓝鲸项目已经完成恢复演练，数据库和文件都恢复成功。'], ['other', 'dictation', '蓝鲸项目原始听写保密材料']]) store.commitConversationTurn({ eventId: id, sessionId: 't27', role: 'user', source, content, createdAt: new Date(now - 3 * 86400000).toISOString() });
    store.db.prepare('INSERT INTO daily_summaries(day,source,summary,source_turn_count,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('2026-08-01', 'companion', '蓝鲸项目的恢复演练经验：一定要实际验证数据可读。', 1, now, now);
    const results = store.localHistoryForQuery('以前蓝鲸项目恢复演练的经验');
    assert.ok(results.some(row => row.kind === 'raw-companion'));
    assert.ok(results.some(row => row.day === '2026-08-01' && row.kind === 'daily-summary'));
    assert.doesNotMatch(JSON.stringify(results), /原始听写保密材料/);
    const dated = store.localHistoryForQuery('蓝鲸项目', memoryQueryPlan('2026-08-01 蓝鲸项目', { now }));
    assert.ok(dated.length > 0);
    assert.ok(dated.every(row => row.day === '2026-08-01'));
    store.db.prepare("DELETE FROM daily_summaries WHERE day='2026-08-01'").run();
    assert.equal(store.localHistoryForQuery('蓝鲸项目', memoryQueryPlan('2026-08-01 蓝鲸项目', { now })).length, 0);
  } finally { store.close(); fs.rmSync(folder, { recursive: true, force: true }); }
});

test('T27 first clause starts before full sentence without duplication for arbitrary stream boundaries', () => {
  const text = '我们先把今天最重要的一件事做完，然后检查结果，再安排下一步。第二句正常播报。';
  for (let size = 1; size <= text.length; size++) {
    const segmenter = new CompanionSpeechSegmenter(); const parts = [];
    for (let i = 0; i < text.length; i += size) parts.push(...segmenter.push(text.slice(i, i + size)));
    parts.push(...segmenter.finish(text));
    assert.equal(parts.join(''), text);
    assert.equal(parts[0], '我们先把今天最重要的一件事做完，');
  }
  const numeric = new CompanionSpeechSegmenter();
  assert.deepEqual(numeric.push('本次计划的预算总金额是12,'), []);
  assert.deepEqual(numeric.push('345元。'), ['本次计划的预算总金额是12,345元。']);
});

test('T27 diagnostic latency fields retain numbers only, never queries, sources or secrets', () => {
  const report = createDiagnosticReport({ conversation: { pipeline: { provider: 'three-stage', context: { retrieval: { route: 'history-local-miss', status: 'found', localHits: 2, remoteHits: 3, query: 'SECRET_QUERY' }, timings: { localRecallMs: 6, remoteRecallMs: 340, modelFirstDeltaMs: 500, contents: 'SECRET_CONTENT' } }, lastTiming: { playbackQueuedMs: 920, speechStopToFinalMs: 80, playbackStartedMs: null } } } });
  assert.equal(report.conversation.pipeline.context.retrieval.route, 'history-local-miss');
  assert.equal(report.conversation.pipeline.context.timings.remoteRecallMs, 340);
  assert.doesNotMatch(JSON.stringify(report), /SECRET/);
});
