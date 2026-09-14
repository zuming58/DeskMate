import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultState, migrateState, persistState, reduceAppState, serializeConfig, validateConfig } from '../src/store/appStore.js';
import { mergeVocabulary, serializeHistory, stableVocabulary, validateVocabulary } from '../src/domain/vocabulary.js';
import { createDraftGuard } from '../src/domain/draftGuard.js';
import { deleteRecordingBlobs } from '../src/store/recordingStore.js';

const fixture = () => ({ ...structuredClone(defaultState), history: [{ id: 'synthetic', text: 'synthetic history', time: '10:00', audioId: 'owned-audio' }], diagnostics: { retained: true } });

test('T31 export/import does not replace history, runtime, diagnostics or layout provenance', () => {
  const state = fixture();
  const imported = validateConfig(JSON.parse(serializeConfig(state)));
  const next = reduceAppState(state, { type: 'replace', value: imported });
  for (const field of ['history', 'runtime', 'diagnostics', 'keyboardLayoutVersion']) assert.deepEqual(next[field], state[field]);
  for (const key of ['KEY1', 'KEY2', 'KEY3', 'KEY4', 'KEY8']) assert.ok(next.keyboardPending.keymap[key]);
  for (const index of [4, 5, 6]) assert.deepEqual(next.keymap[index], state.keymap[index]);
});

test('T31 partial import changes only supplied top-level configuration fields', () => {
  const state = fixture();
  const value = validateConfig({ schemaVersion: 15, vocabulary: { hotwords: ['new'], rules: [] } });
  const next = reduceAppState(state, { type: 'replace', value, fields: ['vocabulary', 'schemaVersion'] });
  assert.deepEqual(next.settings, state.settings);
  assert.deepEqual(next.keymap, state.keymap);
  assert.deepEqual(next.keyboardPending, state.keyboardPending);
  assert.deepEqual(next.history, state.history);
  assert.deepEqual(next.vocabulary.hotwords, ['new']);
});

test('T31 software reset retains user stores and new installs have no fabricated records', () => {
  const state = fixture(); state.settings.formatting = 'smart';
  const next = reduceAppState(state, { type: 'reset' });
  for (const key of ['history', 'vocabulary', 'keymap', 'encoder', 'keyboardPending', 'runtime', 'diagnostics']) assert.deepEqual(next[key], state[key]);
  assert.equal(next.settings.formatting, 'raw');
  assert.deepEqual(defaultState.history, []);
  assert.equal(migrateState(state).history.length, 1);
});

test('T31 deletion uses confirmed IDs and preserves concurrently inserted records', () => {
  const state = fixture(); state.history.push({ id: 'new', text: 'new', time: '10:01' });
  const next = reduceAppState(state, { type: 'history-remove', ids: ['synthetic'] });
  assert.deepEqual(next.history.map(item => item.id), ['new']);
});

test('T31 persistence failure is explicit and does not discard in-memory records', () => {
  const state = fixture(); let serialized;
  assert.equal(persistState(state, { setItem() { throw new Error('quota'); } }), 'error');
  assert.equal(state.history.length, 1);
  assert.equal(persistState(state, { getItem() { return null; }, setItem(key, value) { serialized = JSON.parse(value); } }), 'saved');
  assert.equal(serialized.runtime, undefined);
  assert.equal(serialized.history.length, 1);
});

test('T31 history export whitelists private text fields without audio, paths or credentials', () => {
  const item = { ...fixture().history[0], rawText: 'source', apiKey: 'must-not-export', path: 'must-not-export' };
  const result = JSON.parse(serializeHistory([item]));
  assert.equal(result.records[0].rawText, 'source');
  for (const key of ['audioId', 'apiKey', 'path', 'runtime']) assert.equal(result.records[0][key], undefined);
});

test('T31 vocabulary input validates malformed, oversized and future data', () => {
  for (const value of [null, [], { hotwords: null, rules: [] }, { hotwords: [1], rules: [] }, { hotwords: ['x'.repeat(201)], rules: [] }, { hotwords: [], rules: [{ from: '', to: 'x' }] }, { hotwords: [], rules: [], schemaVersion: 2 }, { hotwords: Array(2001).fill('x'), rules: [] }]) assert.throws(() => validateVocabulary(value));
  assert.throws(() => validateConfig({ vocabulary: { hotwords: null } }));
  assert.throws(() => validateConfig({ vocabulary: { rules: null } }));
});

test('T31 vocabulary merge preserves old rules and gives stable unique IDs', () => {
  const current = stableVocabulary({ hotwords: ['one'], rules: [{ from: 'a', to: 'b' }] });
  const incoming = validateVocabulary({ hotwords: ['one', 'two'], rules: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }] });
  const merged = mergeVocabulary(current, incoming);
  assert.deepEqual(merged.hotwords, ['one', 'two']);
  assert.equal(merged.rules.length, 2);
  assert.equal(merged.rules[0].id, current.rules[0].id);
  assert.equal(new Set(merged.rules.map(rule => rule.id)).size, 2);
  const edited = stableVocabulary({ ...merged, rules: merged.rules.map(rule => ({ ...rule, from: 'changed' })) });
  assert.deepEqual(edited.rules.map(rule => rule.id), merged.rules.map(rule => rule.id));
});

test('T31 polling and stale save acknowledgements cannot overwrite a draft', () => {
  const guard = createDraftGuard();
  const poll = guard.revision;
  assert.equal(guard.acceptPoll(poll), true);
  guard.edit(); assert.equal(guard.acceptPoll(poll), false);
  const save = guard.revision;
  guard.edit(); assert.equal(guard.saved(save), false); assert.equal(guard.dirty, true);
  assert.equal(guard.saved(guard.revision), true); assert.equal(guard.dirty, false);
  assert.equal(guard.acceptPoll(save), false);
  assert.equal(guard.acceptPoll(guard.revision), true);
});

test('T31 batch recording deletion targets only IDs and propagates database failure', async () => {
  const previous = globalThis.indexedDB;
  const deleted = [];
  const failOpen = () => { const request = {}; queueMicrotask(() => request.onerror()); return request; };
  try {
    globalThis.indexedDB = { open: failOpen };
    await assert.rejects(deleteRecordingBlobs(['a']));
    await deleteRecordingBlobs([]);
    globalThis.indexedDB = { open() {
      const request = {};
      queueMicrotask(() => {
        request.result = { close() {}, transaction() {
          const tx = { objectStore() { return { delete(id) { deleted.push(id); return {}; }, clear() { assert.fail('must not clear entire store'); } }; } };
          queueMicrotask(() => tx.oncomplete()); return tx;
        } }; request.onsuccess();
      }); return request;
    } };
    await deleteRecordingBlobs(['a', 'a', 'b', undefined]);
    assert.deepEqual(deleted, ['a', 'b']);
  } finally { globalThis.indexedDB = previous; }
});

test('T31 production controls expose real handlers and remove confirmed simulation controls', async () => {
  const pages = await readFile(new URL('../src/pages.jsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const fragment of ['已生成演示导出文件', '蓝牙状态为模拟能力', '已试听“', '陪伴会接续最近 24 小时', 'key={`${rule.from}-${index}`}', 'value={theme}', 'value={state.settings.backgroundOpacity}']) assert.equal(pages.includes(fragment), false, fragment);
  for (const fragment of ['本地核心已运行', 'aria-label="通知"', 'editor: ExpressionEditorPage', 'sensors: SensorsPage']) assert.equal(app.includes(fragment), false, fragment);
  for (const fragment of ['onChange={readVocabulary}', 'onClick={exportVocabulary}', 'policyGuard.current.acceptPoll', 'knowledgeGuard.current.acceptPoll', 'await deleteRecordingBlobs', 'removeHistory(confirmation.items']) assert.ok(pages.includes(fragment), fragment);
});
