const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const library = require('./prompt-library.json');

const ACTIONS = Object.freeze(Object.fromEntries([4, 5, 6, 7].map(key => [key, Object.freeze({
  id: `922d0be0-5ee8-4a32-bcff-00000000000${key}`, kind: `prompt-key-${key}`,
  label: ({ 4: '提示词页面 / 复制并收起', 5: '场景按键 5', 6: '场景按键 6', 7: '场景按键 7', 8: '粘贴' })[key],
})])));
const setupPatch = () => ({ keymap: { ...Object.fromEntries(Object.entries(ACTIONS).map(([key, action]) => [`KEY${key}`, { action: action.kind }])), KEY8: { action: 'paste' } } });
const clone = value => structuredClone(value);
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const fail = reason => { throw new Error(reason); };
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) fail('文本无效或过长');
  return value;
};
const chord = value => {
  if (typeof value !== 'string' || value.length > 64) fail('快捷键无效');
  const parts = value.split('+'); const key = parts.pop();
  if (new Set(parts).size !== parts.length || parts.some(p => !['Ctrl', 'Alt', 'Shift', 'Win'].includes(p)) || !/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Tab|Escape|Backspace|Delete|Left|Right|Up|Down|Home|End|PageUp|PageDown)$/.test(key)) fail('快捷键格式如 Ctrl+Z、Space');
  return value;
};
const binding = value => {
  if (!value || !['hotkey', 'prompt', 'disabled'].includes(value.type)) fail('按键类型无效');
  return { type: value.type, label: text(value.label || '', 50), value: value.type === 'hotkey' ? chord(value.value) : text(value.value || '', value.type === 'prompt' ? 30000 : 0, value.type === 'prompt') };
};
const hotkey = (label, value) => ({ type: 'hotkey', label, value });
const defaultBindings = id => id === 'scene-video'
  ? { 5: hotkey('播放 / 暂停', 'Space'), 6: hotkey('分割（按剪辑软件调整）', 'Ctrl+K'), 7: hotkey('撤销', 'Ctrl+Z') }
  : id === 'office' ? { 5: hotkey('全选', 'Ctrl+A'), 6: hotkey('保存', 'Ctrl+S'), 7: hotkey('复制', 'Ctrl+C') }
    : { 5: hotkey('全选', 'Ctrl+A'), 6: hotkey('撤销', 'Ctrl+Z'), 7: hotkey('复制', 'Ctrl+C') };
const initial = () => ({ schema: 'deskmate.prompt-workbench', schemaVersion: 1, revision: 0,
  scenes: library.primaryScenes.map(scene => ({ ...scene, bindings: defaultBindings(scene.id) })),
  activeScene: 'coding', selected: {}, personal: [], favorites: [], usage: [], history: [], announcements: true });

function validateState(raw) {
  if (raw?.schema !== 'deskmate.prompt-workbench' || raw.schemaVersion !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0) fail('提示词备份版本不受支持');
  if (!Array.isArray(raw.scenes) || raw.scenes.length < 1 || raw.scenes.length > 30) fail('场景数量无效');
  const scenes = raw.scenes.map(s => {
    if (!/^[a-z0-9-]{1,64}$/.test(s.id) || ['constructor', 'prototype', '__proto__'].includes(s.id)) fail('场景 ID 无效');
    return { id: s.id, title: text(s.title, 40, true), hint: text(s.hint || '', 100), icon: ['coding', 'editing', 'office'].includes(s.icon) ? s.icon : 'office',
      bindings: Object.fromEntries([5, 6, 7].map(key => [key, binding(s.bindings?.[key])])) };
  });
  if (new Set(scenes.map(s => s.id)).size !== scenes.length || !scenes.some(s => s.id === raw.activeScene)) fail('当前场景无效');
  if (!Array.isArray(raw.personal) || raw.personal.length > 1000) fail('个人提示词最多 1000 条');
  const personal = raw.personal.map(p => {
    if (!/^user-[0-9a-f-]{36}$/.test(p.id) || !Number.isSafeInteger(p.revision) || p.revision < 1) fail('个人提示词 ID 或版本无效');
    if (!scenes.some(s => s.id === p.primarySceneId)) fail('提示词所属场景不存在');
    if (p.forked_from && !library.prompts.some(b => b.id === p.forked_from)) fail('内置来源不存在');
    return { id: p.id, title: text(p.title, 120, true), description: text(p.description || '', 240), body: text(p.body, 30000, true),
      primarySceneId: p.primarySceneId, origin: 'user', revision: p.revision, forked_from: p.forked_from || null, deleted: p.deleted === true,
      aliases: [], tags: [], qualityStatus: 'user-authored' };
  });
  if (new Set(personal.map(p => p.id)).size !== personal.length) fail('个人提示词 ID 重复');
  const forks = personal.filter(p => p.forked_from && !p.deleted).map(p => p.forked_from);
  if (new Set(forks).size !== forks.length) fail('同一内置提示词只能有一个生效的个人版本');
  const ids = new Set([...library.prompts, ...personal].map(p => p.id));
  if (!Array.isArray(raw.favorites) || raw.favorites.length > 1080 || !Array.isArray(raw.usage) || raw.usage.length > 200) fail('使用记录无效');
  const favorites = [...new Set(raw.favorites.filter(id => ids.has(id)))];
  const usage = raw.usage.map(u => { if (!ids.has(u.id) || !Number.isSafeInteger(u.at) || u.at < 0) fail('使用记录无效'); return { id: u.id, at: u.at }; });
  const selected = Object.fromEntries(scenes.map(s => [s.id, ids.has(raw.selected?.[s.id]) ? raw.selected[s.id] : '']));
  // Revision history is bounded and validated as plain snapshots, never interpreted.
  const history = (Array.isArray(raw.history) ? raw.history : []).slice(-100).map(h => ({ id: text(h.id, 80), title: text(h.title, 120), body: text(h.body, 30000), revision: Number.isSafeInteger(h.revision) ? h.revision : 1 }));
  return { schema: raw.schema, schemaVersion: 1, revision: raw.revision, scenes, activeScene: raw.activeScene, selected, personal, favorites, usage, history, announcements: raw.announcements !== false };
}

function rowsFor(state, { query = '', filter = 'all', scope = 'scene', category = '' } = {}) {
  const overridden = new Set(state.personal.filter(p => !p.deleted && p.forked_from).map(p => p.forked_from));
  let rows = filter === 'trash' ? state.personal.filter(p => p.deleted)
    : [...library.prompts.filter(p => !overridden.has(p.id)), ...state.personal.filter(p => !p.deleted)];
  if (scope !== 'all') rows = rows.filter(p => p.primarySceneId === state.activeScene);
  if (category) rows = rows.filter(p => p.categoryId === category);
  if (filter === 'favorites') rows = rows.filter(p => state.favorites.includes(p.id));
  if (filter === 'recent') rows = rows.filter(p => state.usage.some(u => u.id === p.id));
  if (filter === 'mine') rows = rows.filter(p => p.origin === 'user');
  const terms = normalize(query).split(' ').filter(Boolean);
  const weighted = rows.map(p => {
    const title = normalize(p.title); const aliases = normalize((p.aliases || []).join(' '));
    const rest = normalize([p.description, p.body, p.id, ...(p.tags || [])].join(' '));
    return { p, score: terms.every(t => (title + ' ' + aliases + ' ' + rest).includes(t)) ? terms.reduce((n, t) => n + (title.includes(t) ? 100 : aliases.includes(t) ? 60 : 10), 0) : -1 };
  }).filter(x => x.score >= 0);
  const order = id => { const i = library.featuredIds.indexOf(id); return i < 0 ? 999 : i; };
  return weighted.sort((a, b) => b.score - a.score || (filter === 'recent' ? (state.usage.find(u => u.id === b.p.id)?.at || 0) - (state.usage.find(u => u.id === a.p.id)?.at || 0) : order(a.p.forked_from || a.p.id) - order(b.p.forked_from || b.p.id))).map(x => x.p);
}

class PromptWorkbenchStore {
  constructor({ userDataPath, fileSystem = fs } = {}) {
    this.fs = fileSystem; this.file = userDataPath ? path.join(userDataPath, 'prompt-workbench-v1.json') : null; this.data = initial(); this.error = '';
    if (this.file && this.fs.existsSync(this.file)) {
      try { this.data = validateState(JSON.parse(this.fs.readFileSync(this.file, 'utf8'))); }
      catch { this.error = '提示词数据损坏，原文件已保留；请先导出备份并检查，未覆盖任何数据'; }
    }
  }
  snapshot() { return { ...clone(this.data), error: this.error, builtinCount: library.prompts.length, categories: clone(library.categories) }; }
  get(id) { return clone(this.data.personal.find(p => p.id === id && !p.deleted) || library.prompts.find(p => p.id === id) || null); }
  rows(view) { return clone(rowsFor(this.data, view)); }
  commit(next, expected = this.data.revision) {
    if (this.error) fail(this.error);
    if (expected !== this.data.revision) fail('内容已更新，请刷新后再保存');
    const data = validateState({ ...next, revision: this.data.revision + 1 });
    if (this.file) {
      this.fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.${randomUUID()}.tmp`;
      try {
        this.fs.writeFileSync(temp, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
        if (this.fs.existsSync(this.file)) this.fs.copyFileSync(this.file, `${this.file}.previous`);
        this.fs.renameSync(temp, this.file);
      } catch (error) { try { this.fs.unlinkSync(temp); } catch {} throw error; }
    }
    this.data = data; return this.snapshot();
  }
  mutate(command = {}) {
    const d = clone(this.data); let savedId = '';
    switch (command.type) {
      case 'scene':
        if (!d.scenes.some(s => s.id === command.id)) fail('场景不存在'); d.activeScene = command.id; break;
      case 'settings': d.announcements = command.announcements === true; break;
      case 'select': d.selected[d.activeScene] = command.id; break;
      case 'used': d.selected[d.activeScene] = command.id; d.usage = [{ id: command.id, at: Date.now() }, ...d.usage.filter(u => u.id !== command.id)].slice(0, 200); break;
      case 'favorite': d.favorites = d.favorites.includes(command.id) ? d.favorites.filter(id => id !== command.id) : [...d.favorites, command.id]; break;
      case 'save': {
        const source = command.id ? this.get(command.id) : null;
        if (command.id && !source) fail('提示词不存在');
        const existing = source?.origin === 'user' && !command.saveAs ? source : null;
        const forked = source?.origin === 'builtin' && !command.saveAs ? source.id : existing?.forked_from || null;
        savedId = existing?.id || `user-${randomUUID()}`;
        if (existing) d.history = [...d.history, { id: existing.id, title: existing.title, body: existing.body, revision: existing.revision }].slice(-100);
        const p = { ...command.prompt, id: savedId, forked_from: forked, origin: 'user', revision: (existing?.revision || 0) + 1, deleted: false };
        d.personal = [...d.personal.filter(x => x.id !== savedId), p]; d.selected[d.activeScene] = savedId; break;
      }
      case 'delete': case 'restore': {
        const p = d.personal.find(p => p.id === command.id); if (!p) fail('内置提示词不能删除，请修改为个人版本后管理');
        p.deleted = command.type === 'delete'; break;
      }
      case 'save-scene': {
        const scene = command.scene; const old = d.scenes.find(s => s.id === scene.id);
        const next = { ...old, ...scene, id: old?.id || `scene-${randomUUID()}`, bindings: scene.bindings || defaultBindings('coding') };
        d.scenes = [...d.scenes.filter(s => s.id !== next.id), next];
        if (old) d.scenes.sort((a, b) => this.data.scenes.findIndex(s => s.id === a.id) - this.data.scenes.findIndex(s => s.id === b.id));
        d.activeScene = next.id; break;
      }
      default: fail('不支持的提示词操作');
    }
    return { ...this.commit(d, command.revision ?? d.revision), savedId };
  }
  export() { if (this.error && this.file) return this.fs.readFileSync(this.file, 'utf8'); return JSON.stringify(this.data, null, 2); }
  import(raw, revision) {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 40000000) fail('备份过大');
    const incoming = validateState(JSON.parse(raw));
    return this.commit(incoming, revision);
  }
}

module.exports = { ACTIONS, setupPatch, library, normalize, chord, validateState, rowsFor, PromptWorkbenchStore };
