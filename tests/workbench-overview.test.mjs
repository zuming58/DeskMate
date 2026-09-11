import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workbenchProjects, workbenchSchedule } from '../src/domain/workbenchOverview.js';
const require = createRequire(import.meta.url);
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { createWorkbenchOverview } = require('../electron/workbench-overview.cjs');
const { PromptWorkbenchStore } = require('../electron/prompt-workbench.cjs');
const { CompanionMemoryPolicyStore } = require('../electron/companion-memory-policy.cjs');
const { createKnowledgeOsSettings } = require('../electron/knowledgeos-settings.cjs');

test('real main-owned stores provide an empty safe projection without mutating the workday or databases', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-overview-stores-'));
  const store = new CompanionMemoryStore({ userDataPath: directory });
  try {
    const options = { memoryStore: store, policyStore: new CompanionMemoryPolicyStore({ userDataPath: directory }), knowledgeOsSettings: createKnowledgeOsSettings({ userDataPath: directory }), promptStore: new PromptWorkbenchStore({ userDataPath: directory }), serviceStatus: {}, wakeStatus: {} };
    const changes = store.db.prepare('SELECT total_changes() AS count').get().count;
    const result = createWorkbenchOverview(options);
    assert.equal(result.memory.today.dictationCount, 0);
    assert.equal(result.policy.dailyTime, '23:30');
    assert.equal(result.scene.promptCount, 16);
    assert.equal(result.scene.bindings[0].key, 5);
    assert.equal(result.knowledge.configured, false);
    assert.equal(store.db.prepare('SELECT total_changes() AS count').get().count, changes);
    assert.doesNotMatch(JSON.stringify(result), /credential|sqlite|content|filePath/);
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('home distinguishes candidates, completed journals and all unacknowledged sync states', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-overview-statuses-'));
  const store = new CompanionMemoryStore({ userDataPath: directory });
  try {
    for (const state of ['accepted','pending','rejected']) store.db.prepare('INSERT INTO memory_candidates (id,day,kind,summary,source_turn_ids,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(state,'2026-09-11','fact','private','[]',state,1,1);
    for (const status of ['closing','completed']) store.db.prepare('INSERT INTO memory_daily_journals (day,period_start,period_end,status,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(status==='closing'?'2026-09-11':'2026-09-10',1,2,status,1,1);
    for (const [index, status] of ['pending','sending','failed','accepted'].entries()) store.db.prepare('INSERT INTO memory_journal_outbox (id,day,memory_class,payload_json,idempotency_key,status,created_at,updated_at,accepted_at) VALUES (?,?,?,?,?,?,?,?,?)').run(status,`2026-09-0${index+1}`,'work','{}',status,status,1,20,status==='accepted'?10:null);
    const result = store.dashboardSummary();
    assert.equal(result.pendingCandidates, 1);
    assert.equal(result.longTermMemories, 1);
    assert.equal(result.completedJournals, 1);
    assert.equal(result.latestJournal.status, 'closing');
    assert.equal(result.pendingSync, 3);
    assert.equal(result.acceptedSync, 1);
    assert.equal(result.lastAcceptedAt, 10);
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('home usage counts local-calendar final user turns and survives raw retention through summaries', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-overview-test-'));
  const now = new Date(2026, 8, 11, 12).getTime();
  const store = new CompanionMemoryStore({ userDataPath: directory, now: () => now });
  try {
    const add = (id, role, source, timestamp, content) => store.commitConversationTurn({ eventId: id, sessionId: 'test-session', role, source, content, createdAt: new Date(timestamp).toISOString() });
    add('one', 'user', 'companion', now - 1000, '私密内容');
    add('one', 'user', 'companion', now - 1000, '私密内容');
    add('two', 'assistant', 'companion', now - 500, '不计算回答');
    add('three', 'user', 'dictation', new Date(2026, 8, 11).getTime(), '测试😀');
    add('four', 'user', 'dictation', new Date(2026, 8, 11).getTime() - 1, '昨日');
    add('five', 'user', 'companion', now + 10000, '未来数据不能计数');
    store.upsertDailySummary({ day: '2026-09-01', source: 'companion', summary: '先前对话摘要', sourceTurnCount: 2 });
    const overview = store.dashboardSummary();
    assert.equal(overview.companionDays, 11);
    assert.equal(overview.activity.length, 7);
    assert.deepEqual(overview.today, { day: '2026-09-11', companionCount: 1, dictationCount: 1, dictationCharacters: 3 });
    assert.equal(overview.activity.at(-2).dictationCount, 1);
    assert.equal(overview.pendingSync, 0);
    assert.equal(overview.acceptedSync, 0);
    assert.doesNotMatch(JSON.stringify(overview), /私密|content|summary|test-session/);
    store.db.exec('DELETE FROM conversation_turns');
    assert.equal(store.dashboardSummary().companionDays, 11);
    store.forgetAll();
    assert.equal(store.dashboardSummary().companionDays, 0);
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('home projection strips identifiers, credentials, content and paths from all inputs', () => {
  const data = createWorkbenchOverview({
    memoryStore: { dashboardSummary: () => ({ ready: true }) },
    policyStore: { snapshot: () => ({ hourlyEnabled: true, enabledSources: ['companion'], schedule: 'daily', dailyTime: '23:30', lastResults: { secret: 'sensitive' } }) },
    knowledgeOsSettings: { status: () => ({ configured: true, credentialId: 'sensitive', projectId: 'sensitive', command: 'sensitive', syncEnabled: true }) },
    serviceStatus: { configured: true, stages: { asr: { configured: true, apiKey: 'sensitive' } } },
    wakeStatus: { enabled: true, phrase: 'sensitive' },
    promptStore: { snapshot: () => ({ activeScene: 'coding', personal: [{ body: 'sensitive' }], scenes: [{ id: 'coding', title: '开发', bindings: { 5: { label: '复制', value: 'sensitive' } } }] }), rows: () => [{ body: 'sensitive' }] }, now: 123,
  });
  assert.doesNotMatch(JSON.stringify(data), /sensitive|credentialId|projectId|apiKey|body|command/);
  assert.equal(data.scene.promptCount, 1);
  assert.equal(data.knowledge.configured, true);
  assert.equal(data.knowledge.readEnabled, false);
  assert.equal(data.updatedAt, 123);
});

test('home groups reports by project and respects completed or paused memory schedules', () => {
  const projects = workbenchProjects([{ taskLabel: 'DeskMate', state: 'working', receivedAt: 10 }, { taskLabel: 'DeskMate', state: 'waiting', receivedAt: 20 }, { taskLabel: 'Other', state: 'completed', receivedAt: 30 }]);
  assert.deepEqual(projects[0], { label: 'DeskMate', state: 'waiting', count: 2, receivedAt: 20 });
  const policy = { sourcesEnabled: true, schedule: 'daily', dailyTime: '23:30' };
  assert.equal(workbenchSchedule(policy, null), '每天 23:30');
  assert.equal(workbenchSchedule(policy, { day: '2026-09-11', status: 'completed' }, new Date(2026, 8, 11)), '今天已完成');
  assert.equal(workbenchSchedule({ ...policy, sourcesEnabled: false }), '已暂停整理');
});
