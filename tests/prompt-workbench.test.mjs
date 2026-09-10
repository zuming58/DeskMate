import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { firmwareAction, normalizeKeyBinding } from '../src/domain/keymap.js';
import { promptWheelStep, revealPromptRow } from '../src/domain/promptNavigation.js';
const require = createRequire(import.meta.url);
const { ACTIONS, setupPatch, library, PromptWorkbenchStore, validateState, chord, normalize } = require('../electron/prompt-workbench.cjs');
const { PromptWorkbenchController } = require('../electron/prompt-workbench-controller.cjs');
const { mergeKeyboardPatch, sanitizeKeyboardConfig, checkHostCapabilities } = require('../electron/config-merge.cjs');
const { InputBridgeManager } = require('../electron/input-bridge.cjs');
const fresh = () => new PromptWorkbenchStore();
const edit = (s, fields = {}) => s.mutate({ type: 'save', id: 'CODING-002', prompt: { title: '我的启动', description: '个人版', body: '  {{不要解析}} $&\n正文  ', primarySceneId: 'coding', ...fields } });
const harness = () => {
  const store = fresh(); const calls = []; let foreground = false; let voice = false; let failCopy = false;
  const controller = new PromptWorkbenchController({ store, isForeground: () => foreground, isVoiceActive: () => voice,
    show: () => { foreground = true; calls.push('show-main-prompts'); }, hide: () => { foreground = false; calls.push('hide'); },
    capture: async () => calls.push('capture'), restore: async () => { calls.push('restore'); return { ok: true }; },
    input: async c => { calls.push(c); return { ok: true }; }, writeClipboard: async t => { if (failCopy) throw Error('clipboard busy'); calls.push(['copy', t]); },
    announce: async t => calls.push(['say', t]), publish: () => {} });
  return { store, controller, calls, foreground: v => foreground = v, voice: v => voice = v, failCopy: () => failCopy = true };
};

test('T22 pack has 80 original bodies, 10 categories, no fake usage', () => {
  const s = fresh(); assert.equal(library.prompts.length, 80); assert.equal(library.categories.length, 10);
  assert.equal(new Set(library.prompts.map(p => p.id)).size, 80);
  assert(library.prompts.every(p => p.body && p.originalTemplate && p.origin === 'builtin'));
  assert.equal(s.rows({}).length, 16); assert.equal(s.rows({ scope: 'all' }).length, 80);
  assert.equal(s.rows({ filter: 'favorites' }).length, 0); assert.equal(s.snapshot().usage.length, 0);
});
test('T22 weighted search aliases and Unicode normalization', () => {
  const s = fresh(); assert.equal(normalize(' ＡＢＣ  Def '), 'abc def');
  for (const query of ['重启', '启动预览']) assert.equal(s.rows({ query })[0].id, 'CODING-002');
  assert.equal(s.rows({ query: '重启 notexist' }).length, 0);
});
test('T22 builtin edit creates personal fork, literal body, delete/restore', () => {
  const s = fresh(); const original = s.get('CODING-002'); const changed = edit(s); const id = changed.savedId;
  assert.equal(s.get(id).body, '  {{不要解析}} $&\n正文  '); assert.equal(s.rows({ scope: 'all' }).length, 80);
  assert(!s.rows({}).some(p => p.id === original.id)); assert.deepEqual(s.get(original.id), original);
  s.mutate({ type: 'delete', id }); assert(s.rows({}).some(p => p.id === original.id));
  assert(s.rows({ filter: 'trash' }).some(p => p.id === id)); s.mutate({ type: 'restore', id });
  assert(!s.rows({}).some(p => p.id === original.id));
});
test('T22 editing personal keeps ID/revisions; save-as is independent; stale edits rejected', () => {
  const s = fresh(); const id = edit(s).savedId;
  const saved = s.mutate({ type: 'save', id, prompt: { ...s.get(id), body: '第二版' }, revision: s.data.revision });
  assert.equal(saved.savedId, id); assert.equal(s.get(id).revision, 2); assert.equal(s.data.history.length, 1);
  assert.throws(() => s.mutate({ type: 'save', id, prompt: s.get(id), revision: 0 }), /已更新/);
  const fork = s.mutate({ type: 'save', id, saveAs: true, prompt: s.get(id) });
  assert.notEqual(fork.savedId, id); assert.equal(s.get(fork.savedId).forked_from, null);
});
test('T22 scene persists with user prompts, favorites and previous snapshot', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'deskmate-prompts-test-')); const s = new PromptWorkbenchStore({ userDataPath: dir });
  s.mutate({ type: 'scene', id: 'office' }); s.mutate({ type: 'favorite', id: 'OFFICE-003' });
  const loaded = new PromptWorkbenchStore({ userDataPath: dir }); assert.equal(loaded.data.activeScene, 'office');
  assert(loaded.rows({ filter: 'favorites' }).some(p => p.id === 'OFFICE-003')); assert(existsSync(s.file + '.previous'));
  assert.equal(JSON.parse(readFileSync(s.file + '.previous')).revision, 1);
});
test('T22 corrupt store never overwritten; invalid import never changes original', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'deskmate-prompts-test-')); const file = path.join(dir, 'prompt-workbench-v1.json');
  writeFileSync(file, 'broken'); const s = new PromptWorkbenchStore({ userDataPath: dir });
  assert(s.error); assert.throws(() => s.mutate({ type: 'scene', id: 'office' })); assert.equal(readFileSync(file, 'utf8'), 'broken');
  const valid = fresh(); const before = valid.export(); assert.throws(() => valid.import('{}', 0)); assert.equal(valid.export(), before);
});
test('T22 validated backup roundtrip and strict action/schema boundaries', () => {
  const s = fresh(); edit(s); const target = fresh(); target.import(s.export(), 0); assert.equal(target.data.personal.length, 1);
  for (const value of ['Ctrl+Z', 'Space', 'Ctrl+Alt+Shift+K', 'F12']) assert.equal(chord(value), value);
  for (const value of ['Shell+cmd', 'powershell.exe', 'Ctrl+Ctrl+V', 'F22', 'Ctrl+A;calc', 'Ctrl+']) assert.throws(() => chord(value));
  const bad = s.snapshot(); bad.scenes[0].id = '__proto__'; assert.throws(() => validateState(bad));
});
test('T22 new scene edits mappings without any hardware writes', () => {
  const s = fresh(); s.mutate({ type: 'save-scene', scene: { title: '资料整理', hint: '学习', bindings: s.data.scenes[0].bindings } });
  assert.equal(s.data.scenes.length, 4); assert(s.data.activeScene.startsWith('scene-')); assert.equal(s.data.scenes[3].bindings[7].value, 'Ctrl+C');
});
test('T22 main window KEY4 copy-return and KEY8 always paste', async () => {
  const h = harness(); await h.controller.key(4); assert.deepEqual(h.calls.slice(0, 2), ['capture', 'show-main-prompts']);
  const selected = h.controller.snapshot().selectedId; await h.controller.key(8); assert.equal(h.calls.at(-1), 'Ctrl+V');
  await h.controller.key(4); assert.deepEqual(h.calls.slice(-3), [['copy', h.store.get(selected).body], 'hide', 'restore']);
  await h.controller.key(8); assert.equal(h.calls.at(-1), 'Ctrl+V'); assert.equal(h.store.data.usage.length, 1);
});
test('T22 Esc only hides transient prompt entry, never normal browsing or voice', async () => {
  const h = harness(); h.foreground(true); assert.equal((await h.controller.command({ type: 'cancel' })).hidden, false);
  h.foreground(false); await h.controller.key(4); h.voice(true); assert.equal((await h.controller.command({ type: 'cancel' })).hidden, false);
  h.voice(false); assert.equal((await h.controller.command({ type: 'cancel' })).hidden, true); assert(!h.calls.some(x => Array.isArray(x) && x[0] === 'copy'));
});
test('T22 editing protects copy/cycle and escape does not hide', async () => {
  const h = harness(); await h.controller.key(4); await h.controller.command({ type: 'editing', active: true });
  assert.equal((await h.controller.key(4)).ok, false); assert.equal((await h.controller.command({ type: 'cycle' })).ok, false);
  assert.equal((await h.controller.command({ type: 'cancel' })).hidden, false); assert.equal(h.store.data.activeScene, 'coding');
});
test('T22 clipboard failure does not hide or update usage', async () => {
  const h = harness(); await h.controller.key(4); h.failCopy(); assert.equal((await h.controller.key(4)).ok, false);
  assert(!h.calls.includes('hide')); assert.equal(h.store.data.usage.length, 0);
});
test('T22 copy success plus metadata failure still returns to work', async () => {
  const h = harness(); await h.controller.key(4); h.store.mutate = () => { throw Error('disk full'); };
  const result = await h.controller.key(4); assert(result.ok); assert(result.warning); assert(h.calls.includes('hide'));
});
test('T22 selected pointer wins over stale focused row, empty result cannot copy', async () => {
  const h = harness(); await h.controller.key(4); const id = h.controller.snapshot().rows[2].id;
  await h.controller.command({ type: 'view', selectedId: id }); await h.controller.key(4);
  assert.deepEqual(h.calls.find(c => Array.isArray(c) && c[0] === 'copy'), ['copy', h.store.get(id).body]);
  await h.controller.key(4); await h.controller.command({ type: 'view', query: 'unmatchedrandomquery' });
  assert.equal((await h.controller.key(4)).ok, false);
});
test('T22 Tab cycles forwards/backwards, updates shortcuts, optional speech', async () => {
  const h = harness(); await h.controller.key(4); await h.controller.command({ type: 'cycle' });
  assert.equal(h.store.data.activeScene, 'scene-video'); assert(h.calls.some(c => Array.isArray(c) && c[0] === 'say'));
  h.foreground(false); await h.controller.key(5); assert.equal(h.calls.at(-1), 'Space');
  h.foreground(true); await h.controller.command({ type: 'cycle', reverse: true }); assert.equal(h.store.data.activeScene, 'coding');
  h.store.mutate({ type: 'settings', announcements: false }); const before = h.calls.length; await h.controller.command({ type: 'cycle' }); assert.equal(h.calls.length, before);
});
test('T22 scene fixed prompt copies but never auto-pastes or submits', async () => {
  const h = harness(); const scene = structuredClone(h.store.data.scenes[0]); scene.bindings[5] = { type: 'prompt', label: '自定', value: '安全正文' };
  h.store.mutate({ type: 'save-scene', scene }); await h.controller.key(5); assert.deepEqual(h.calls, [['copy', '安全正文']]);
});
test('T22 setup patch moves companion to KEY3, preserves first 2 keys and encoder', () => {
  const raw = { schema: 'ai_keyboard.v1', unknown: { preserved: true }, profiles: [{ id: 'default', keys: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`KEY${i + 1}`, { press: 'copy', release: 'keep' }])), encoder: { scroll: { axis: 'horizontal', mode: 'scroll', speed: 4 }, press: 'scroll_axis_toggle' } }] };
  const next = mergeKeyboardPatch(raw, setupPatch());
  for (let k = 1; k <= 2; k++) assert.deepEqual(next.profiles[0].keys[`KEY${k}`], raw.profiles[0].keys[`KEY${k}`]);
  assert.equal(sanitizeKeyboardConfig(next).keymap[2].action, 'companion-call');
  assert.equal(next.profiles[0].keys.KEY3.release, 'keep');
  assert.deepEqual(next.profiles[0].encoder, raw.profiles[0].encoder); assert.deepEqual(next.unknown, raw.unknown);
  for (let k = 4; k <= 7; k++) { const b = sanitizeKeyboardConfig(next).keymap[k - 1]; assert.equal(b.action, ACTIONS[k].kind); assert.equal(firmwareAction(normalizeKeyBinding(b)), `host_action:${ACTIONS[k].id}`); }
  assert.equal(next.profiles[0].keys.KEY8.press, 'paste');
  assert.equal(checkHostCapabilities(next, {}).ok, false); assert.equal(checkHostCapabilities(next, { host_action_v1: true }).ok, true);
});

test('T22 page-only wheel polarity supports the reported device without changing encoder settings', () => {
  assert.equal(promptWheelStep({ deltaY: -120 }), 1);
  assert.equal(promptWheelStep({ deltaY: 120 }), -1);
  assert.equal(promptWheelStep({ deltaX: -120, deltaY: 0 }), 1);
  assert.equal(promptWheelStep({ deltaX: 120, deltaY: 0 }), -1);
  assert.equal(promptWheelStep({ deltaY: 120 }, false), 1);
  assert.equal(promptWheelStep({ deltaY: 0 }), 0);
  assert.equal(promptWheelStep({ deltaY: NaN }), 0);
  const store = new PromptWorkbenchStore();
  store.mutate({ type: 'settings', reverseSelection: false });
  assert.equal(store.data.announcements, true);
  store.mutate({ type: 'settings', announcements: false });
  assert.equal(store.data.reverseSelection, false);
  assert.equal(validateState(JSON.parse(store.export())).reverseSelection, false);
});

test('T22 selected row reveals only within its own list, never via ancestor scrollIntoView', () => {
  const list = { scrollTop: 50, getBoundingClientRect: () => ({ top: 200, bottom: 400 }) };
  revealPromptRow(list, { getBoundingClientRect: () => ({ top: 420, bottom: 480 }) });
  assert.equal(list.scrollTop, 130);
  revealPromptRow(list, { getBoundingClientRect: () => ({ top: 180, bottom: 220 }) });
  assert.equal(list.scrollTop, 110);
  revealPromptRow(list, { getBoundingClientRect: () => ({ top: 240, bottom: 280 }) });
  assert.equal(list.scrollTop, 110);
});

test('T22 editing scene shortcuts on key settings does not switch active scene', () => {
  const store = new PromptWorkbenchStore();
  const scene = structuredClone(store.data.scenes[1]); scene.bindings[5].value = 'Ctrl+S';
  store.mutate({ type: 'save-scene', scene, activate: false });
  assert.equal(store.data.activeScene, 'coding');
  assert.equal(store.data.scenes[1].bindings[5].value, 'Ctrl+S');
});
test('T22 native request is bounded, result matched and not replayed after restart', async () => {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  const writes = []; child.stdin = { writable: true, write: (line, cb) => { writes.push(JSON.parse(line)); cb?.(); } };
  const manager = new InputBridgeManager({ executable: 'bridge.exe', spawnImpl: () => child }); manager.start();
  const request = manager.workbenchInput('chord', 'Ctrl+V'); const sent = writes[0];
  assert.equal(sent.type, 'workbench-input'); assert(sent.expiresUnixMs > Date.now()); assert(!JSON.stringify(sent).includes('targetWindow'));
  assert.equal((await manager.workbenchInput('chord', 'Ctrl+C')).ok, false);
  manager.handleLine(JSON.stringify({ version: 1, type: 'desktop-output-result', source: 'desktop-output', requestId: sent.requestId, ok: true, reason: '', time: '2026-09-10T00:00:00.000Z', sequence: 1 }));
  assert.deepEqual(await request, { ok: true });
  const interrupted = manager.workbenchInput('restore'); manager.stop(); assert.equal((await interrupted).ok, false); assert.equal(writes.length, 2);
});
