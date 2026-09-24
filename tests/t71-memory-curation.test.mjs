import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { MemoryCurationService, validatePlan, applyVerification } = require('../electron/memory-curation.cjs');

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t71-'));
  let now = Date.parse('2026-09-24T10:00:00+08:00');
  const store = new CompanionMemoryStore({ userDataPath: root, now: () => now });
  const source = '我希望回答简洁一些，这是我一直以来的习惯。';
  const turn = store.appendTurn({ sessionId: 'test', role: 'user', content: source });
  const add = (summary = '用户偏好简洁回答', overrides = {}) => store.addCandidate({ day: '2026-09-23', kind: 'preference', summary, sourceTurnIds: [turn.id], ...overrides });
  const enable = () => store.setCurationEnabled({ enabled: true, confirmed: true });
  const snapshot = () => store.curationSnapshot(store.curationCandidates());
  const group = (snap, overrides = {}) => ({ ids: snap.items.map(item => item.id), action: 'remember', kind: 'preference', summary: '用户希望回答简洁一些。', reason: '原话明确', certainty: 'explicit', sensitive: false, evidence: [{ turnId: turn.id, quote: source }], conflictIds: [], ...overrides });
  const calls = [];
  let response = async input => input.proposed ? { decisions: input.proposed.map(item => ({ index: item.index, verdict: item.mergeIntoId ? 'duplicate' : 'supported', reason: '直接原话支持' })) } : { groups: [group({ items: input.items })] };
  const options = { store, now: () => now, policyStore: { snapshot: () => ({ enabledSources: ['companion', 'dictation'] }) }, loadSecret: () => ({ test: true }), requestJson: async request => { const input = JSON.parse(request.messages.at(-1).content); calls.push(input); return response(input); } };
  try { await run({ store, root, add, enable, snapshot, group, turn, source, calls, options, response: fn => { response = fn; }, advance: ms => { now += ms; } }); }
  finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

test('T71 explicit persistent consent; disabled and empty runs never call a model', () => fixture(async h => {
  h.add(); const service = new MemoryCurationService(h.options);
  assert.equal(h.store.setCurationEnabled({ enabled: true }).ok, false);
  assert.equal((await service.run()).reason, 'memory-curation-disabled'); assert.equal(h.calls.length, 0);
  h.enable(); assert.equal((await service.run()).ok, true); assert.equal(h.calls.length, 2);
  assert.equal((await new MemoryCurationService(h.options).run()).processed, 0); assert.equal(h.calls.length, 2);
}));
test('T71 duplicates become one retrievable memory; raw candidates and turns remain byte equal', () => fixture(async h => {
  h.add(); h.add('偏好：希望简洁回答'); h.enable();
  const originals = h.store.db.prepare('SELECT * FROM memory_candidates ORDER BY id').all();
  const raw = h.store.db.prepare('SELECT * FROM conversation_turns').all();
  const result = await new MemoryCurationService(h.options).run();
  assert.equal(result.ok, true); assert.equal(result.processed, 2);
  assert.deepEqual(h.store.db.prepare("SELECT * FROM memory_candidates WHERE state='pending' ORDER BY id").all(), originals);
  assert.deepEqual(h.store.db.prepare('SELECT * FROM conversation_turns').all(), raw);
  assert.equal(h.store.status().longTermMemories, 1); assert.equal(h.store.status().pendingCandidates, 0);
  assert.equal(h.store.list({ filter: 'candidates' }).length, 0);
  assert.equal(h.store.list({ filter: 'archive' }).length, 2);
  assert.equal(h.store.list({ filter: 'long-term' })[0].provenance.length, 2);
  assert.equal(h.store.recentAcceptedContext().length, 1);
  assert.equal(h.store.reviewedContextForQuery('简洁回答')[0].summary, '用户希望回答简洁一些。');
  assert.equal(h.store.searchLongTermMemory({query:'简洁回答'}).length, 1);
}));
test('T71 exact equivalent merges into existing memory without overwriting it', () => fixture(async h => {
  const old = h.add(); h.store.setCandidateState(old.id, 'accepted'); const original = h.store.db.prepare('SELECT * FROM memory_candidates WHERE id=?').get(old.id);
  const duplicate = h.add('同样希望简洁回答'); h.enable();
  h.response(async input => input.proposed ? { decisions: [{ index: 0, verdict: 'duplicate', reason: '等价' }] } : { groups: [h.group({ items: input.items }, { mergeIntoId: old.id })] });
  assert.equal((await new MemoryCurationService(h.options).run()).ok, true);
  assert.equal(h.store.status().longTermMemories, 1);
  h.store.deleteItem({ type: 'candidate', id: duplicate.id });
  assert.deepEqual(h.store.db.prepare('SELECT * FROM memory_candidates WHERE id=?').get(old.id), original);
}));
test('T71 routine work archives without human questions or verifier calls', () => fixture(async h => {
  h.add('今天调试了按钮'); h.enable();
  h.response(async input => ({ groups: [h.group({ items: input.items }, { action: 'archive', evidence: [], summary: '调试流水' })] }));
  await new MemoryCurationService(h.options).run();
  assert.equal(h.calls.length, 1); assert.equal(h.store.curationStatus().archived, 1); assert.equal(h.store.curationStatus().questions, 0);
}));
test('T71 valuable uncertain items form one real question; archiving retains originals', () => fixture(async h => {
  h.add(); h.add('另一条相同偏好'); h.enable();
  h.response(async input => ({ groups: [h.group({ items: input.items }, { certainty: 'uncertain' })] }));
  await new MemoryCurationService(h.options).run();
  const question = h.store.curationQuestions()[0]; assert.equal(question.originals.length, 2);
  assert.equal(h.store.curationStatus().questions, 1);
  assert.equal(h.store.resolveCurationQuestion({ ...question, action: 'archive', confirmed: true }).ok, true);
  assert.equal(h.store.curationStatus().questions, 0); assert.equal(h.store.db.prepare('SELECT COUNT(*) n FROM memory_candidates').get().n, 2);
}));
test('T71 conflict never silently replaces existing truth and requires explicit confirmation', () => fixture(async h => {
  const old = h.add('希望详细回答'); h.store.setCandidateState(old.id, 'accepted'); h.add(); h.enable();
  h.response(async input => ({ groups: [h.group({ items: input.items }, { conflictIds: [old.id] })] }));
  await new MemoryCurationService(h.options).run();
  const question = h.store.curationQuestions()[0]; assert.equal(question.conflicts.length, 1);
  assert.equal(h.store.resolveCurationQuestion({ ...question, action: 'accept', confirmed: true }).reason, 'memory-curation-conflict-confirmation-required');
  assert.equal(h.store.resolveCurationQuestion({ ...question, action: 'accept', confirmed: true, replaceConflicts: true }).ok, true);
  assert.equal(h.store.db.prepare('SELECT state FROM memory_candidates WHERE id=?').get(old.id).state, 'rejected');
  assert.equal(h.store.status().longTermMemories, 1);
}));
test('T71 revoking consent while model awaits discards result and skips verification', () => fixture(async h => {
  h.add(); h.enable(); h.response(async input => { h.store.setCurationEnabled({ enabled: false }); return { groups: [h.group({ items: input.items })] }; });
  assert.equal((await new MemoryCurationService(h.options).run()).reason, 'memory-curation-source-changed');
  assert.equal(h.calls.length, 1); assert.equal(h.store.curationStatus().processed, 0);
}));
for (const mutation of ['candidate', 'evidence', 'context']) test(`T71 ${mutation} changes invalidate in-flight output`, () => fixture(async h => {
  const candidate = h.add(); h.enable();
  h.response(async input => {
    if (mutation === 'candidate') h.store.updateCandidate({ id: candidate.id, summary: '修改过的内容' });
    if (mutation === 'evidence') h.store.db.prepare('UPDATE conversation_turns SET content=? WHERE id=?').run('原话已纠正', h.turn.id);
    if (mutation === 'context') { const c = h.add('新背景'); h.store.setCandidateState(c.id, 'accepted'); }
    return { groups: [h.group({ items: input.items })] };
  });
  assert.equal((await new MemoryCurationService(h.options).run()).reason, 'memory-curation-source-changed'); assert.equal(h.calls.length, 1);
}));
test('T71 checkpoint avoids reprocessing completed batches; failures persist and stop at three', () => fixture(async h => {
  h.add(); h.enable(); h.response(async () => { throw Error('text-model-request-failed'); });
  for (let i = 0; i < 3; i++) { await new MemoryCurationService(h.options).run(); h.advance(3600001); }
  assert.equal(h.calls.length, 3); assert.equal((await new MemoryCurationService(h.options).run()).reason, 'memory-curation-retry-delayed');
  assert.equal(h.calls.length, 3); assert.equal(h.store.curationStatus().processed, 0);
}));
test('T71 source policy excludes disabled sources including mixed candidates', () => fixture(async h => {
  h.add('听写', { source: 'dictation' }); h.add('混合', { source: 'mixed' }); h.enable();
  h.options.policyStore.snapshot = () => ({ enabledSources: ['companion'] });
  assert.equal((await new MemoryCurationService(h.options).run()).processed, 0); assert.equal(h.calls.length, 0);
}));
test('T71 secrets are locally archived, never included in outbound model requests', () => fixture(async h => {
  // Generated fixture, never a credential issued by a provider.
  h.add(`api_key: ${['sk', '123456789abcdefghijklmnop'].join('-')}`); h.enable();
  assert.equal((await new MemoryCurationService(h.options).run()).processed, 1); assert.equal(h.calls.length, 0);
  assert.equal(h.store.curationStatus().archived, 1);
}));
test('T71 deleting derived memory does not resurrect old candidates on next run', () => fixture(async h => {
  h.add(); h.enable(); const service = new MemoryCurationService(h.options); await service.run();
  h.store.deleteItem({ type: 'candidate', id: h.store.list({ filter: 'long-term' })[0].id });
  assert.equal((await service.run()).processed, 0); assert.equal(h.calls.length, 2); assert.equal(h.store.status().longTermMemories, 0);
}));
test('T71 editing original invalidates auto-derived memory, but a human correction is retained', () => fixture(async h => {
  const c = h.add(); h.enable(); const service = new MemoryCurationService(h.options); await service.run();
  h.store.updateCandidate({ id: c.id, summary: '原文纠正' }); assert.equal(h.store.status().longTermMemories, 0);
  await service.run(); const memory = h.store.list({ filter: 'long-term' })[0]; h.store.updateCandidate({ id: memory.id, summary: '用户确认的纠正' });
  h.store.updateCandidate({ id: c.id, summary: '第二次原文纠正' }); assert.equal(h.store.status().longTermMemories, 1);
}));
test('T71 stale question confirmation is rejected after conflicting old memory changes', () => fixture(async h => {
  const old = h.add('需要详细回答'); h.store.setCandidateState(old.id, 'accepted'); h.add(); h.enable();
  h.response(async input => ({ groups: [h.group({ items: input.items }, { conflictIds: [old.id] })] }));
  await new MemoryCurationService(h.options).run(); const q = h.store.curationQuestions()[0];
  h.store.updateCandidate({ id: old.id, summary: '按场景区别长短' });
  assert.equal(h.store.resolveCurationQuestion({ ...q, action: 'accept', confirmed: true, replaceConflicts: true }).reason, 'memory-curation-source-changed');
}));
test('T71 validator rejects omissions, foreign/duplicate IDs and invented/assistant quotations', () => fixture(h => {
  h.add(); h.enable(); const snap = h.snapshot(); const valid = h.group(snap);
  for (const groups of [[], [{ ...valid, ids: ['foreign'] }], [valid, valid]]) assert.throws(() => validatePlan(snap, { groups }));
  assert.equal(validatePlan(snap,{groups:[{...valid,evidence:[{turnId:h.turn.id,quote:'不是用户的原话内容'}]}]})[0].action,'review');
  snap.evidence[0].role = 'assistant'; assert.equal(validatePlan(snap, { groups: [valid] })[0].action,'review');
}));
test('T71 unsupported numbers, missing evidence and sensitive traits never auto-promote', () => fixture(h => {
  h.add(); h.enable(); const snap = h.snapshot();
  for (const overrides of [{ evidence: [] }, { sensitive: true }, { summary: '用户有宗教信仰' }]) assert.equal(validatePlan(snap, { groups: [h.group(snap, overrides)] })[0].action, 'review');
  const proposed = validatePlan(snap,{groups:[h.group(snap,{summary:'用户希望每天 3 次简洁回答'})]});
  assert.equal(applyVerification(snap,proposed,{decisions:[{index:0,verdict:'uncertain',reason:'原话没有每天 3 次'}]})[0].action,'review');
}));
test('T71 independent verifier vetoes negation/meaning mismatch and malformed decisions fail closed', () => fixture(h => {
  h.add(); h.enable(); const snap = h.snapshot(); const groups = validatePlan(snap, { groups: [h.group(snap, { summary: '用户不喜欢简洁回答' })] });
  assert.equal(applyVerification(snap, groups, { decisions: [{ index: 0, verdict: 'uncertain', reason: '否定与原话相反' }] })[0].action, 'review');
  assert.throws(() => applyVerification(snap, groups, { decisions: [] }));
  assert.throws(() => applyVerification(snap, groups, { decisions: [{ index: 99, verdict: 'supported', reason: 'bad' }] }));
}));
test('T71 source integration exposes real curation counts, background scheduler, pause and provenance', () => {
  const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  for (const fragment of ['getMemoryCuration', 'setMemoryCuration', 'runMemoryCuration', 'resolveMemoryCuration']) assert.ok(read('electron/preload.cjs').includes(fragment));
  assert.match(read('electron/main.cjs'), /await memoryCurationService.run\(\)/);
  assert.match(read('src/pages.jsx'), /label="需你核对"/);
  assert.match(read('src/pages.jsx'), /查看整理来源/);
  assert.match(read('src/MemoryCurationPanel.jsx'), /暂停自动整理/);
  assert.match(read('electron/local-backup.cjs'), /memory.setCurationMeta\('enabled',0\)/);
});
test('T71 empty archive labels normalize without inventing accepted facts', () => fixture(h => {
  h.add(); h.enable(); const snap = h.snapshot();
  const result = validatePlan(snap, {groups:[h.group(snap,{action:'archive',summary:'',reason:''})]});
  assert.equal(result[0].action,'archive'); assert.equal(result[0].summary,'日常资料已归档，原文保留');
  assert.throws(()=>validatePlan(snap,{groups:[h.group(snap,{summary:''})]}));
}));
