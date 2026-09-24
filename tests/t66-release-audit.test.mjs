import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const require = createRequire(import.meta.url);
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { CompanionMemoryPolicyStore } = require('../electron/companion-memory-policy.cjs');
const { MemoryJournalService } = require('../electron/memory-journal-service.cjs');
const { LocalRetention, DAY } = require('../electron/local-retention.cjs');

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t66-'));
  let now = new Date(2026, 8, 1, 22).getTime();
  const store = new CompanionMemoryStore({ userDataPath: root, now: () => now });
  const policyStore = new CompanionMemoryPolicyStore({ userDataPath: root });
  const calls = [];
  let online = true, receipt = { status: 'completed', stage: 'raw_sealed' };
  const options = { store, policyStore, now: () => now, loadSecret: () => ({}), knowledgeBaseProjection: () => ({}),
    knowledgeOsSettings: { status: () => ({ configured: true, syncEnabled: true }) },
    knowledgeOsClient: { callTool: async (name, args) => { calls.push({ name, args }); return !online ? { ok: false, reason: 'knowledgeos-adapter-exited', retryable: true } : { ok: true, data: name === 'memory.submit_journal' ? { submission_id: `receipt-${calls.length}` } : receipt }; } },
    requestJson: async () => ({ workItems: ['测试'], personalItems: [], candidates: [], workMarkdown: '工作', personalMarkdown: '个人' }) };
  const add = (source, id) => store.commitConversationTurn({ eventId: id, sessionId: 'fixture', role: 'user', content: '测试', source, createdAt: new Date(now).toISOString() });
  try { await run({ root, store, policyStore, options, calls, add, advance: ms => { now += ms; }, now: () => now, online: value => { online = value; }, receipt: value => { receipt = value; } }); }
  finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

test('T66 offline sync stops a batch, persists bounded backoff across restart, and manual retry preserves payload', () => fixture(async h => {
  h.add('dictation', 'offline'); h.online(false);
  let service = new MemoryJournalService(h.options);
  await service.closeCurrentWorkday({ manual: true });
  assert.equal(h.calls.length, 1);
  const firstPayload = h.calls[0].args;
  assert.equal(h.store.syncMeta('next-at') - h.now(), 5 * 60_000);
  service = new MemoryJournalService(h.options);
  for (let i = 0; i < 4; i++) await service.syncPending();
  assert.equal(h.calls.length, 1);
  h.advance(5 * 60_000); await service.syncPending();
  assert.equal(h.store.syncMeta('next-at') - h.now(), 15 * 60_000);
  h.online(true); await service.syncPending({ force: true });
  assert.deepEqual(h.calls.filter(c => c.args.memory_class === firstPayload.memory_class).at(-1).args, firstPayload);
  assert.equal(h.store.syncMeta('next-at'), 0);
}));

test('T66 acceptance is not sealing, failed receipts stay visible and accepted content is never resubmitted', () => fixture(async h => {
  h.add('dictation', 'accepted'); const service = new MemoryJournalService(h.options);
  await service.closeCurrentWorkday({ manual: true });
  assert.equal(h.store.journalDeliveryStatus().sealed, 0);
  assert.equal(h.store.journalDeliveryStatus().awaitingReceipt, 2);
  h.receipt({ status: 'failed', stage: 'ingestion' });
  assert.equal((await service.syncPending()).reason, 'knowledgeos-receipt-failed');
  assert.equal(h.store.journalDeliveryStatus().receiptFailed, 2);
  await service.syncPending();
  assert.equal(h.calls.filter(c => c.name === 'memory.submit_journal').length, 2);
  h.receipt({ status: 'completed', stage: 'raw_sealed' });
  await service.syncPending({ force: true });
  assert.equal(h.store.journalDeliveryStatus().sealed, 2);
  assert.equal(h.store.journalDeliveryStatus().receiptFailed, 0);
  assert.equal(h.calls.filter(c => c.name === 'memory.submit_journal').length, 2);
}));

test('T66 unfinished remote receipt prevents expired raw cleanup until confirmed sealed', () => fixture(async h => {
  h.add('dictation', 'retention'); const service = new MemoryJournalService(h.options);
  await service.closeCurrentWorkday({ manual: true }); h.advance(30 * DAY);
  fs.writeFileSync(path.join(h.root, 'knowledgeos-settings.json'), JSON.stringify({ syncEnabled: true }));
  const retention = new LocalRetention({ userDataPath: h.root, now: h.now });
  assert.equal(retention.preview().eligible.memoryTurns, 0);
  assert.equal(h.store.cleanupExpiredRaw({ at: h.now(), requireRemoteAccepted: true }).removed, 0);
  await service.syncPending();
  assert.equal(retention.preview().eligible.memoryTurns, 1);
}));

test('T66 disabling a source never makes its unsummarized records eligible for cleanup', () => fixture(async h => {
  h.add('dictation', 'covered'); h.add('companion', 'not-covered');
  const p = { ...h.policyStore.snapshot(), enabledSources: ['dictation'] }; delete p.lastResults; h.policyStore.save(p);
  await new MemoryJournalService(h.options).closeCurrentWorkday({ manual: true }); h.advance(30 * DAY);
  const preview = new LocalRetention({ userDataPath: h.root, now: h.now }).preview();
  assert.equal(preview.eligible.memoryTurns, 1);
  assert.equal(preview.held['raw-summary-incomplete'], 1);
  assert.equal(h.store.cleanupExpiredRaw({ at: h.now() }).removed, 1);
  assert.equal(h.store.db.prepare('SELECT source FROM conversation_turns').get().source, 'companion');
}));

test('T66 idle sync does not rewrite revisions for existing outbox items', () => fixture(async h => {
  h.add('dictation', 'idle'); const service = new MemoryJournalService(h.options);
  await service.closeCurrentWorkday({ manual: true }); await service.syncPending();
  const revision = () => h.store.db.prepare("SELECT value FROM companion_memory_meta WHERE key='revision'").get().value;
  const before = revision(); await service.syncPending(); await service.syncPending(); assert.equal(revision(), before);
}));

test('T66 installer keeps identity and data, includes desktop/start-menu shortcuts and exact runtime', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'deskmate'); assert.equal(pkg.build.appId, 'com.deskmate.app');
  assert.equal(pkg.build.nsis.createDesktopShortcut, 'always');
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(pkg.build.nsis.perMachine, false);
  assert.equal(pkg.devDependencies.electron, '44.4.3');
});

test('T66 partial credential writes and failed replace preserve the previous encrypted file', () => fixture(async h => {
  const { writePrivateJson } = require('../electron/atomic-private-json.cjs');
  const file = path.join(h.root, 'synthetic-credentials.json');
  writePrivateJson(file, { ciphertext: 'old-fixture' });
  const old = fs.readFileSync(file, 'utf8');
  const brokenWrite = { ...fs, writeFileSync: (fd) => { fs.writeSync(fd, '{'); throw new Error('simulated-disk-full'); } };
  assert.throws(() => writePrivateJson(file, { ciphertext: 'new-fixture' }, brokenWrite), /simulated-disk-full/);
  assert.equal(fs.readFileSync(file, 'utf8'), old);
  assert.throws(() => writePrivateJson(file, {}, { ...fs, renameSync: () => { throw new Error('simulated-rename-failure'); } }), /simulated-rename-failure/);
  assert.equal(fs.readFileSync(file, 'utf8'), old);
  assert.equal(fs.readdirSync(h.root).filter(name => name.endsWith('.tmp')).length, 0);
}));

test('T66 MCP waits for initialization and sends initialized before tools/call', async () => {
  const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');
  const child = new EventEmitter();
  const writes = [];
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  child.stdin.on('data', value => writes.push(JSON.parse(String(value))));
  const client = new KnowledgeOsMcpClient({ settings: { status: () => ({ readEnabled: true, syncEnabled: true }), loadConnection: () => ({ command: 'fixture', credentialId: 'fixture' }) }, spawnProcess: () => child });
  const result = client.callTool('health.get_summary', {});
  assert.deepEqual(writes.map(row => row.method), ['initialize']);
  child.stdout.write(JSON.stringify({ id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } }) + '\n');
  assert.deepEqual(writes.map(row => row.method), ['initialize', 'notifications/initialized', 'tools/call']);
  child.stdout.write(JSON.stringify({ id: 2, result: { structuredContent: { data: { ready: true } } } }) + '\n');
  assert.equal((await result).ok, true);
});
