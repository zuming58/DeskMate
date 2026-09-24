import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const require = createRequire(import.meta.url);
const { CompanionPersonaStore, PERSONA_DEFAULTS } = require('../electron/companion-persona.cjs');
const { wakeGreeting } = require('../electron/companion-call.cjs');
const { CompanionPreferenceStore } = require('../electron/companion-preferences.cjs');
const { createKnowledgeOsSettings } = require('../electron/knowledgeos-settings.cjs');
const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');
const { MemoryJournalService } = require('../electron/memory-journal-service.cjs');
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { KnowledgeBaseProjection } = require('../electron/knowledge-base-projection.cjs');
const root = new URL('../', import.meta.url);

async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t72-'));
  try { await run(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('T72 clean profile uses 小明, empty personal details and 小岚; saved names are preserved', () => fixture(directory => {
  const store = new CompanionPersonaStore({ userDataPath: directory });
  assert.equal(store.snapshot().persona.ownerName, '小明');
  assert.equal(wakeGreeting(), '在呢，小明。');
  assert.deepEqual(Object.values(store.snapshot().persona.ownerProfile), ['', '', '', '']);
  store.save({ ...PERSONA_DEFAULTS, ownerName: '测试使用者', speakingStyle: '我自定义的风格' });
  const saved = new CompanionPersonaStore({ userDataPath: directory }).snapshot().persona;
  assert.equal(saved.ownerName, '测试使用者');
  assert.equal(saved.speakingStyle, '我自定义的风格');
  assert.equal(wakeGreeting(saved), '在呢，测试使用者。');
  const prefs = new CompanionPreferenceStore({ userDataPath: directory });
  assert.equal(prefs.get().name, '小岚');
  assert.equal(prefs.get().wakeEnabled, false);
}));

test('T72 KnowledgeOS is off by default and disabled transport cannot start an adapter', () => fixture(async directory => {
  const settings = createKnowledgeOsSettings({ userDataPath: directory });
  assert.equal(settings.status().readEnabled, false);
  assert.equal(settings.status().syncEnabled, false);
  const client = new KnowledgeOsMcpClient({ settings, spawnProcess() { assert.fail('must not spawn'); } });
  for (const name of ['health.get_summary', 'knowledge.search', 'memory.submit_journal', 'submission.get_status']) {
    assert.equal((await client.callTool(name, {})).reason, 'knowledgeos-disabled');
  }
  settings.save({ credentialId: '01900000-0000-7000-8000-000000000001', readEnabled: true, syncEnabled: true });
  const before = settings.status();
  assert.equal(createKnowledgeOsSettings({ userDataPath: directory }).status().syncEnabled, true);
  settings.save({ ...before, readEnabled: false, syncEnabled: false });
  assert.equal(settings.status().credentialId, before.credentialId);
  assert.equal((await client.testConnection()).reason, 'knowledgeos-disabled');
}));

test('T72 switching off aborts in-flight initialization and never sends its queued tool', async () => {
  let enabled = true;
  let killed = 0;
  const writes = [];
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin.on('data', data => writes.push(JSON.parse(data.toString())));
  child.kill = () => { killed += 1; };
  const client = new KnowledgeOsMcpClient({ settings: { status: () => ({ syncEnabled: enabled }), loadConnection: () => ({ command: 'fixture', credentialId: 'fixture' }) }, spawnProcess: () => child });
  const pending = client.callTool('memory.submit_journal', {});
  enabled = false; client.cancelPending();
  assert.equal((await pending).reason, 'knowledgeos-disabled');
  assert.equal(killed, 1); assert.equal(client.pending.size, 0);
  child.stdout.write(JSON.stringify({ id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } }) + '\n');
  assert.deepEqual(writes.map(row => row.method), ['initialize']);
});

test('T72 a sync batch rechecks permission before each journal', async () => {
  let enabled = true;
  const calls = [], acknowledged = [];
  const store = {
    syncMeta: () => 0, setSyncMeta() {}, pendingJournalReceipts: () => [], journalProjectionItems: () => [],
    pendingJournalDeliveries: () => [{ id: 'one', payload: { idempotency_key: 'one' } }, { id: 'two', payload: { idempotency_key: 'two' } }],
    markJournalDelivery: (id, result) => acknowledged.push({ id, ...result }),
  };
  const service = new MemoryJournalService({ store, policyStore: { snapshot: () => ({}) }, knowledgeBaseProjection: {}, knowledgeOsSettings: { status: () => ({ configured: true, syncEnabled: enabled }) }, knowledgeOsClient: { callTool: async (name, value) => { calls.push(value.idempotency_key); enabled = false; return { ok: true, data: { submission_id: 'accepted-one' } }; } }, loadSecret: () => ({}) });
  const result = await service.syncPending({ force: true });
  assert.equal(result.reason, 'knowledgeos-sync-disabled');
  assert.deepEqual(calls, ['one']);
  assert.equal(acknowledged[0].submissionId, 'accepted-one');
});

test('T72 local long-term memory and Markdown survive raw retention and reopening without KnowledgeOS', () => fixture(directory => {
  const at = new Date(2026, 8, 1, 12).getTime();
  let store = new CompanionMemoryStore({ userDataPath: directory, now: () => at });
  try {
    store.upsertDailySummary({ day: '2026-09-01', summary: '本地日终摘要', sourceTurnCount: 1 });
    const item = store.addCandidate({ day: '2026-09-01', kind: 'preference', summary: '测试用户喜欢简短回答' });
    store.setCandidateState(item.id, 'accepted');
    const projection = new KnowledgeBaseProjection({ root: path.join(directory, 'knowledge-base') });
    projection.sync(store.projectionItems());
    const file = path.join(directory, 'knowledge-base', 'DeskMate', 'memories', `${item.id}.md`);
    assert.equal(fs.existsSync(file), true);
    store.cleanupExpiredRaw({ retentionDays: 20, at: at + 365 * 86400000, requireRemoteAccepted: false });
    projection.sync(store.projectionItems());
    store.close(); store = new CompanionMemoryStore({ userDataPath: directory });
    assert.equal(store.status().longTermMemories, 1);
    assert.equal(store.status().dailySummaries, 1);
    assert.match(fs.readFileSync(file, 'utf8'), /测试用户喜欢简短回答/);
  } finally { store.close(); }
}));

test('T72 packages restrictive original-work license and excludes personal profile paths', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.build.nsis.license, 'LICENSE');
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'resources/licenses']) assert(pkg.build.extraResources.some(item => item.from === name));
  for (const entry of pkg.build.files) assert.doesNotMatch(entry, /user-data|recordings|sqlite|credentials/i);
  const license = fs.readFileSync(new URL('LICENSE', root), 'utf8');
  assert.match(license, /套壳/); assert.match(license, /事先书面许可/); assert.match(license, /第三方/);
  const page = fs.readFileSync(new URL('src/pages.jsx', root), 'utf8');
  assert.match(page, /label="启用 KnowledgeOS"/);
  assert.match(page, /本地长期保存/);
});
