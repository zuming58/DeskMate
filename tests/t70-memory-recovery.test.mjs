import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const require = createRequire(import.meta.url);
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { MemoryJournalService } = require('../electron/memory-journal-service.cjs');
const { MemoryCandidateReviewService, fingerprint, validateClassification } = require('../electron/memory-candidate-review.cjs');
const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');

test('T70 desktop runtime excludes bundled renderer build dependencies', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['@tabler/icons-react', '@vitejs/plugin-react', 'react', 'react-dom', 'vite']) {
    assert.equal(manifest.dependencies[name], undefined, name);
    assert.equal(typeof manifest.devDependencies[name], 'string', name);
  }
  for (const name of ['pinyin-pro', 'sherpa-onnx-node', 'ws']) assert.equal(typeof manifest.dependencies[name], 'string', name);
});

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t70-'));
  let now = new Date(2026, 8, 24, 20).getTime();
  const store = new CompanionMemoryStore({ userDataPath: root, now: () => now });
  const calls = [];
  let responder = async name => ({ ok: true, data: name === 'submission.get_status' ? { status: 'completed', stage: 'raw_sealed' } : { submission_id: `receipt-${calls.length}` } });
  const options = { store, now: () => now, policyStore: { snapshot: () => ({ enabledSources: ['companion'], schedule: 'daily', dailyTime: '23:00' }) }, knowledgeBaseProjection: () => ({}), knowledgeOsSettings: { status: () => ({ configured: true, syncEnabled: true }) }, loadSecret: () => ({}), knowledgeOsClient: { callTool: async (name, args) => { calls.push({ name, args }); return responder(name, args); } } };
  const add = (kind = 'project', summary = '完成桌面项目第一版') => store.addCandidate({ day: '2026-09-23', kind, summary });
  const queue = (day, memoryClass = 'work') => store.queueJournalDelivery({ day, memoryClass, idempotencyKey: `test:${day}:${memoryClass}`, payload: { idempotency_key: `test:${day}:${memoryClass}`, markdown: 'synthetic' } });
  try { await run({ root, store, options, add, queue, calls, responder: fn => { responder = fn; }, advance: ms => { now += ms; } }); }
  finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

test('T70 synthesis candidates are final: no raw extract re-addition; unique cap ten', () => fixture(async h => {
  h.store.commitConversationTurn({ eventId: 'test:event', sessionId: 'test', role: 'user', content: '项目进度', createdAt: new Date(2026, 8, 24, 19).toISOString() });
  const service = new MemoryJournalService({ ...h.options, requestJson: async ({ messages }) => JSON.parse(messages.at(-1).content).records ? { workItems: ['项目进度'], personalItems: [], candidates: [{ kind: 'fact', summary: '不应重新加回的零碎提取' }] } : { workMarkdown: '工作进度', personalMarkdown: '无', candidates: [{ kind: 'project', summary: '条目0' }, ...Array.from({ length: 15 }, (_, i) => ({ kind: 'project', summary: `条目${i}` }))] } });
  const result = await service.closeCurrentWorkday({ manual: true });
  assert.equal(result.ok, true); assert.equal(result.candidates, 10);
  const items = h.store.candidateReview();
  assert.equal(items.total, 10); assert.equal(items.reference, 10);
  assert.equal(items.groups.flatMap(g => g.items).some(item => item.content.includes('零碎')), false);
  assert.equal(h.store.status().longTermMemories, 0);
}));

test('T70 empty synthesis never resurrects extracted observations', () => fixture(async h => {
  h.store.commitConversationTurn({ eventId: 'test:empty', sessionId: 'test', role: 'user', content: '测试', createdAt: new Date(2026, 8, 24, 19).toISOString() });
  const service = new MemoryJournalService({ ...h.options, requestJson: async ({ messages }) => JSON.parse(messages.at(-1).content).records ? { workItems: ['测试'], personalItems: [], candidates: [{ kind: 'fact', summary: '测试残留' }] } : { workMarkdown: '工作', personalMarkdown: '无', candidates: [] } });
  assert.equal((await service.closeCurrentWorkday({ manual: true })).candidates, 0);
  assert.equal(h.store.status().pendingCandidates, 0);
}));

test('T70 organization retains every original and only ordinary work enters reference bucket', () => fixture(async h => {
  h.add(); h.add('preference', '喜欢简洁回答'); h.add('project', '项目方案可能有冲突，待确认');
  let requests = 0;
  const service = new MemoryCandidateReviewService({ store: h.store, loadSecret: () => ({}), requestJson: async ({ messages }) => { requests++; return { items: JSON.parse(messages.at(-1).content).items.map(item => ({ id: item.id, bucket: 'reference', topic: '共同主题' })) }; } });
  const before = h.store.db.prepare('SELECT * FROM memory_candidates ORDER BY id').all();
  assert.equal((await service.organize()).reference, 1);
  assert.equal(h.store.candidateReview().review, 2);
  assert.deepEqual(h.store.db.prepare('SELECT * FROM memory_candidates ORDER BY id').all(), before);
  assert.equal((await service.organize()).processed, 0); assert.equal(requests, 1);
  assert.equal(h.store.recentAcceptedContext().length, 0);
}));

test('T70 model unknown IDs/duplicate IDs fail closed; omissions stay reviewable', () => fixture(h => {
  h.add(); const items = h.store.candidateReview().groups.flatMap(g => g.items);
  assert.throws(() => validateClassification(items, { items: [{ id: 'unknown', bucket: 'reference' }] }));
  assert.throws(() => validateClassification(items, { items: [items[0], items[0]] }));
  assert.equal(validateClassification(items, { items: [] })[0].bucket, 'review');
}));

test('T70 editing invalidates classification and stale batch review is atomic', () => fixture(h => {
  const a = h.add(), b = h.add('fact', '旧事实');
  const items = h.store.candidateReview().groups.flatMap(g => g.items);
  h.store.saveCandidateReview(items, validateClassification(items, { items: items.map(item => ({ id: item.id, bucket: 'reference', topic: '工作' })) }));
  h.store.updateCandidate({ id: b.id, summary: '已纠正的事实' });
  assert.equal(h.store.candidateReview().unorganized, 1);
  assert.equal(h.store.reviewCandidateBatch({ items: items.map(item => ({ id: item.id, fingerprint: fingerprint(item) })), state: 'accepted' }).reason, 'memory-review-source-changed');
  assert.equal(h.store.status().longTermMemories, 0);
  assert.equal(h.store.saveCandidateReview(items, []).reason, 'memory-review-source-changed');
  const fresh = h.store.candidateReview().groups.flatMap(g => g.items).find(item => item.id === a.id);
  assert.equal(h.store.reviewCandidateBatch({ items: [fresh], state: 'accepted' }).ok, true);
  assert.equal(h.store.status().longTermMemories, 1);
  assert.equal(h.store.status().pendingCandidates, 1);
}));

test('T70 grouping never merges conflicting numbers or deletes originals', () => fixture(h => {
  h.add('fact', '7 天保留'); h.add('fact', '不保留 7 天，改为 20 天');
  const group = h.store.candidateReview().groups[0]; assert.equal(group.items.length, 2);
  assert.notEqual(fingerprint(group.items[0]), fingerprint(group.items[1]));
  h.store.saveCandidateReview(group.items, validateClassification(group.items, { items: [] }));
  h.store.forgetAll();
  assert.equal(h.store.db.prepare('SELECT COUNT(*) AS n FROM memory_candidate_reviews').get().n, 0);
}));

test('T70 model failure is bounded and cannot promote or erase memory', () => fixture(async h => {
  h.add(); let calls = 0;
  const service = new MemoryCandidateReviewService({ store: h.store, loadSecret: () => ({}), requestJson: async () => { calls++; throw Error('text-model-request-failed'); } });
  assert.equal((await service.organize()).ok, false); assert.equal(calls, 1);
  assert.equal(h.store.candidateReview().unorganized, 1); assert.equal(h.store.status().longTermMemories, 0);
}));

test('T70 missing old receipts do not block new journals; accepted payloads never resubmit', () => fixture(async h => {
  const old = h.queue('2026-09-01'); h.store.markJournalDelivery(old.id, { ok: true, submissionId: 'missing' });
  h.queue('2026-09-23');
  h.responder(async name => name === 'submission.get_status' ? { ok: false, reason: 'knowledgeos-resource-not-found', retryable: false } : { ok: true, data: { submission_id: 'new-receipt' } });
  const result = await new MemoryJournalService(h.options).syncPending({ force: true });
  assert.equal(result.accepted, 1); assert.equal(result.receipts[0].failed, true);
  assert.equal(h.calls.filter(call => call.name === 'memory.submit_journal').length, 1);
  assert.equal(h.calls.at(-1).args.idempotency_key, 'test:2026-09-23:work');
  assert.equal(h.store.journalDeliveryStatus().receiptFailed, 1);
}));

test('T70 offline transport still backs off instead of hammering new submissions', () => fixture(async h => {
  const old = h.queue('2026-09-01'); h.store.markJournalDelivery(old.id, { ok: true, submissionId: 'old' }); h.queue('2026-09-23');
  h.responder(async () => ({ ok: false, reason: 'knowledgeos-adapter-exited', retryable: true }));
  const service = new MemoryJournalService(h.options);
  assert.equal((await service.syncPending()).reason, 'knowledgeos-adapter-exited');
  assert.equal((await service.syncPending()).reason, 'knowledgeos-retry-delayed');
  assert.equal(h.calls.length, 1);
}));

test('T70 force receipt polling rotates past unsealed first four', () => fixture(async h => {
  for (let d = 1; d <= 6; d++) { const row = h.queue(`2026-09-0${d}`); h.store.markJournalDelivery(row.id, { ok: true, submissionId: `old-${d}` }); }
  h.responder(async () => ({ ok: false, reason: 'knowledgeos-resource-not-found', retryable: false }));
  const service = new MemoryJournalService(h.options);
  await service.syncPending({ force: true }); h.advance(1); await service.syncPending({ force: true });
  assert.equal(new Set(h.calls.map(call => call.args.submission_id)).size, 6);
}));

test('T70 MCP preserves safe snake_case error code without sensitive detail', async () => {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  const client = new KnowledgeOsMcpClient({ settings: { status: () => ({ readEnabled: true, syncEnabled: true }), loadConnection: () => ({ command: 'fixture', credentialId: 'fixture' }) }, spawnProcess: () => child });
  const pending = client.callTool('submission.get_status', {});
  child.stdout.write(JSON.stringify({ id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } }) + '\n');
  child.stdout.write(JSON.stringify({ id: 2, result: { isError: true, structuredContent: { code: 'resource_not_found', detail: 'DO NOT EXPOSE', retryable: false } } }) + '\n');
  assert.deepEqual(await pending, { ok: false, reason: 'knowledgeos-resource-not-found', retryable: false });
});
