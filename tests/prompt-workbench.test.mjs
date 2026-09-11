import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { actionLabel, keycapLabel, createKeyboardConfig, firmwareAction, normalizeKeyBinding } from '../src/domain/keymap.js';
import { promptWheelStep, revealPromptRow } from '../src/domain/promptNavigation.js';
import { COMMON_SCENE_ACTIONS, sceneBindingForMode, sceneBindingMode } from '../src/domain/sceneKeyActions.js';
import { keyboardSyncFeedback, normalizeKeyboardPending, prepareCompanionPromptKeys, projectKeyboardRead, workspaceKeyboardPatch } from '../src/domain/keymapWorkspace.js';
import { DEFAULT_KEYMAP, DEFAULT_ENCODER } from '../src/domain/keymap.js';
import { validateConfig } from '../src/store/appStore.js';
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
test('T22F prompt order moves one row, stays per scene and survives reload', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'deskmate-prompts-order-test-'));
  const store = new PromptWorkbenchStore({ userDataPath: dir });
  const before = store.rows({});
  store.mutate({ type: 'reorder', id: before[1].id, direction: -1 });
  assert.deepEqual(store.rows({}).slice(0, 2).map(prompt => prompt.id), [before[1].id, before[0].id]);
  assert.equal(store.data.selected.coding, before[1].id);
  store.mutate({ type: 'scene', id: 'office' });
  assert.equal(store.rows({})[0].id, library.featuredIds.find(id => id.startsWith('OFFICE-')));
  store.mutate({ type: 'scene', id: 'coding' });
  assert.deepEqual(new PromptWorkbenchStore({ userDataPath: dir }).rows({}).slice(0, 2).map(prompt => prompt.id), [before[1].id, before[0].id]);
  const imported = fresh(); imported.import(store.export(), imported.data.revision);
  assert.deepEqual(imported.rows({}).slice(0, 2).map(prompt => prompt.id), [before[1].id, before[0].id]);
  assert.throws(() => store.mutate({ type: 'reorder', id: before[1].id, direction: -1 }), /边界/);
});
test('T22F filtered prompt projections cannot reorder the canonical scene list', async () => {
  const h = harness(); const before = h.store.rows({}).map(prompt => prompt.id);
  await h.controller.command({ type: 'view', query: '重启' });
  assert.deepEqual(await h.controller.command({ type: 'reorder', id: before[1], direction: -1 }), { ok: false, reason: '请先回到当前场景的全部列表再排序' });
  assert.deepEqual(h.store.rows({}).map(prompt => prompt.id), before);
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
test('T22F scene action presets are direct choices and retain custom shortcut mode', () => {
  assert.deepEqual(COMMON_SCENE_ACTIONS.map(item => item.label), ['全选', '复制', '粘贴', '撤销', '保存']);
  assert.deepEqual(sceneBindingForMode('copy'), { type: 'hotkey', label: '复制', value: 'Ctrl+C' });
  assert.equal(sceneBindingMode(sceneBindingForMode('save')), 'save');
  assert.equal(sceneBindingMode({ type: 'hotkey', label: '分割', value: 'Ctrl+K' }), 'hotkey');
  assert.equal(sceneBindingMode({ type: 'hotkey', label: '快捷键', value: 'Ctrl+Z' }), 'hotkey');
  assert.deepEqual(sceneBindingForMode('app'), { type: 'app', label: '打开应用', value: '', appActionId: '', appName: '' });
});
test('T22F scene app action accepts only registered IDs and executes via whitelist store', async () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const store = fresh();
  const scene = structuredClone(store.data.scenes[0]);
  scene.bindings[5] = { type: 'app', label: 'Codex', value: '', appActionId: id, appName: 'Codex' };
  store.mutate({ type: 'save-scene', scene });
  assert.throws(() => {
    const invalid = structuredClone(scene);
    invalid.bindings[5].appActionId = 'powershell.exe';
    store.mutate({ type: 'save-scene', scene: invalid });
  }, /已登记的应用/);
  const calls = [];
  const controller = new PromptWorkbenchController({ store, isForeground: () => false, input: async () => ({ ok: true }), writeClipboard: async () => {}, appActions: { execute: async actionId => { calls.push(actionId); return { ok: true, label: 'Codex' }; } } });
  assert.deepEqual(await controller.key(5), { ok: true, label: 'Codex' });
  assert.deepEqual(calls, [id]);
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

test('T22B shared key edits survive persisted state and device readback', () => {
  const pending = { keymap: { KEY1: { action: 'copy' }, KEY8: { action: 'undo' } }, encoder: { speed: 5 } };
  const restored = validateConfig({ ...validateConfig({}), keyboardPending: pending });
  assert.deepEqual(restored.keyboardPending, pending);
  const view = projectKeyboardRead({ keymap: DEFAULT_KEYMAP, encoder: DEFAULT_ENCODER }, restored.keyboardPending);
  assert.equal(view.keymap[0].action, 'copy'); assert.equal(view.keymap[7].action, 'undo'); assert.equal(view.encoder.speed, 5);
  assert.deepEqual(view.keymap[1], DEFAULT_KEYMAP[1]);
});

test('T22B board patch carries shared edits and routes, never per-scene payloads', () => {
  const patch = workspaceKeyboardPatch({ keymap: { KEY1: { action: 'copy' }, KEY6: { action: 'fixed-text', text: 'must stay local' } }, encoder: { speed: 4 } }, DEFAULT_KEYMAP);
  assert.deepEqual(Object.keys(patch.keymap), ['KEY1', 'KEY5', 'KEY6', 'KEY7']);
  assert.deepEqual(patch.keymap.KEY6, { action: 'prompt-key-6' });
  assert(!JSON.stringify(patch).includes('must stay local'));
  const configured = DEFAULT_KEYMAP.map((binding, index) => patch.keymap[`KEY${index + 1}`] || binding);
  assert.deepEqual(workspaceKeyboardPatch({}, configured), {});
  assert.deepEqual(normalizeKeyboardPending({ keymap: { KEY99: { action: 'copy' } }, encoder: { unknown: true } }), { keymap: {}, encoder: {} });
});

test('T22B key settings can activate scenes but cannot copy or run shortcuts into itself', async () => {
  const h = harness(); let settings = true; h.controller.isSettingsForeground = () => settings;
  const next = await h.controller.command({ type: 'scene', id: 'scene-video' });
  assert.equal(next.activeScene, 'scene-video'); assert(h.calls.some(c => Array.isArray(c) && c[0] === 'say'));
  assert.equal((await h.controller.copy()).ok, false);
  assert.equal((await h.controller.key(5)).ok, false);
  assert(!h.calls.includes('Space'));
  settings = false; assert.equal((await h.controller.command({ type: 'cycle' })).ok, false);
  await h.controller.key(5); assert(h.calls.includes('Space'));
});

test('T22B editing key 5 in video does not change coding or other scene keys', () => {
  const s = fresh(); const before = s.snapshot();
  s.mutate({ type: 'scene', id: 'scene-video' });
  const scene = structuredClone(s.data.scenes[1]); scene.bindings[5] = { type: 'hotkey', label: '保存项目', value: 'Ctrl+S' };
  s.mutate({ type: 'save-scene', scene, revision: s.data.revision, activate: false });
  assert.deepEqual(s.data.scenes[0], before.scenes[0]); assert.deepEqual(s.data.scenes[2], before.scenes[2]);
  assert.deepEqual(s.data.scenes[1].bindings[6], before.scenes[1].bindings[6]);
  assert.equal(s.data.scenes[1].bindings[5].value, 'Ctrl+S');
});

test('T22C legacy key 3 and 4 stage locally once and survive old device readback', () => {
  const keys = structuredClone(DEFAULT_KEYMAP); keys[3] = { action: 'companion-call' };
  const state = { keymap: keys, keyboardPending: { keymap: { KEY1: { action: 'copy' } }, encoder: { speed: 4 } } };
  const upgrade = prepareCompanionPromptKeys(state);
  assert.equal(upgrade.keymap[2].action, 'companion-call'); assert.equal(upgrade.keymap[3].action, 'prompt-key-4');
  for (const i of [0,1,4,5,6,7]) assert.deepEqual(upgrade.keymap[i], keys[i]);
  assert.equal(upgrade.keyboardPending.keymap.KEY1.action, 'copy'); assert.equal(upgrade.keyboardPending.encoder.speed, 4);
  const persisted = validateConfig({ ...validateConfig({}), ...state, ...upgrade });
  const readback = projectKeyboardRead({ keymap: keys, encoder: DEFAULT_ENCODER }, persisted.keyboardPending);
  assert.equal(readback.keymap[2].action, 'companion-call'); assert.equal(readback.keymap[3].action, 'prompt-key-4');
  assert.equal(prepareCompanionPromptKeys(persisted), null);
  const defaults = prepareCompanionPromptKeys({ keymap: DEFAULT_KEYMAP });
  assert.equal(defaults.keymap[3].action, 'prompt-key-4');
});

test('T22C legacy migration does not overwrite custom, pending or later reassigned keys', () => {
  const custom = structuredClone(DEFAULT_KEYMAP); custom[3] = { action: 'copy' };
  assert.deepEqual(prepareCompanionPromptKeys({ keymap: custom }), { keyboardLayoutVersion: 1 });
  assert.deepEqual(prepareCompanionPromptKeys({ keymap: DEFAULT_KEYMAP, keyboardPending: { keymap: { KEY3: { action: 'undo' } } } }), { keyboardLayoutVersion: 1 });
  assert.equal(prepareCompanionPromptKeys({ keymap: DEFAULT_KEYMAP, keyboardLayoutVersion: 1 }), null);
  assert.deepEqual(DEFAULT_KEYMAP[2], { action: 'voice-edit' });
});

test('T22D prompt keycap stays short without changing the full action or firmware route', () => {
  const binding = { action: 'prompt-key-4' };
  assert.equal(keycapLabel(binding), '弹出/收起');
  assert.equal(actionLabel(binding), '提示词页 / 复制收起');
  assert.equal(firmwareAction(binding), 'host_action:922d0be0-5ee8-4a32-bcff-000000000004');
  assert.equal(keycapLabel({ action: 'companion-call' }), 'AI 陪伴呼唤');
});

test('T22D local key migration actually enters the confirmed patch, preserving unrelated values', () => {
  const keys = structuredClone(DEFAULT_KEYMAP); keys[3] = { action: 'companion-call' };
  const raw = createKeyboardConfig({ keymap: keys, encoder: DEFAULT_ENCODER });
  const upgrade = prepareCompanionPromptKeys({ keymap: keys });
  const patch = workspaceKeyboardPatch(upgrade.keyboardPending, upgrade.keymap);
  const merged = mergeKeyboardPatch(raw, patch);
  assert.equal(raw.profiles[0].keys.KEY4.press, firmwareAction({ action: 'companion-call' }));
  assert.equal(merged.profiles[0].keys.KEY3.press, firmwareAction({ action: 'companion-call' }));
  assert.equal(merged.profiles[0].keys.KEY4.press, firmwareAction({ action: 'prompt-key-4' }));
  for (const key of ['KEY1','KEY2','KEY8']) assert.deepEqual(merged.profiles[0].keys[key], raw.profiles[0].keys[key]);
  assert.deepEqual(merged.profiles[0].encoder, raw.profiles[0].encoder);
  assert.equal(sanitizeKeyboardConfig(merged).keymap[3].action, 'prompt-key-4');
});

test('T22D sync feedback separates device read, local pending, failures and verified write', () => {
  const read = { status: 'success', readStatus: 'success', label: 'DeskMate NVS' };
  const pending = { keymap: { KEY4: { action: 'prompt-key-4' } } };
  assert.deepEqual(keyboardSyncFeedback(read, {}), { label: '键盘配置已读取', tone: 'demo' });
  assert.deepEqual(keyboardSyncFeedback(read, pending), { label: '本机修改待同步', tone: 'warning' });
  assert.equal(keyboardSyncFeedback(read, { encoder: { speed: 4 } }).tone, 'warning');
  for (const status of ['syncing','review','error','warning']) assert.equal(keyboardSyncFeedback({ ...read, status, label: 'specific status' }, pending).label, 'specific status');
  assert.equal(keyboardSyncFeedback({ ...read, verified: true }, {}).tone, 'success');
  assert.equal(keyboardSyncFeedback({ ...read, verified: true }, pending).tone, 'warning');
});
