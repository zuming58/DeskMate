const { ACTIONS } = require('./prompt-workbench.cjs');
const { PromptWheelRouter } = require('./prompt-wheel-router.cjs');

class PromptWorkbenchController {
  constructor({ store, isForeground, isSettingsForeground = () => false, show, hide, capture, restore, input, writeClipboard, announce, publish, isVoiceActive = () => false }) {
    Object.assign(this, { store, isForeground, isSettingsForeground, show, hide, capture, restore, input, writeClipboard, announce, publish, isVoiceActive });
    this.view = { query: '', filter: 'all', scope: 'scene', category: '' };
    this.selected = ''; this.editing = false; this.transient = false; this.busy = false; this.openSequence = 0;
    this.wheel = new PromptWheelRouter(step => this.move(step));
  }
  move(step) {
    if (!this.isForeground() || this.editing) return;
    const d = this.snapshot();
    if (d.rows.length) this.selected = d.rows[Math.max(0, Math.min(d.rows.length - 1, d.rows.findIndex(p => p.id === d.selectedId) + step))].id;
    this.changed();
  }
  snapshot() {
    const state = this.store.snapshot(); const rows = this.store.rows(this.view);
    if (!rows.some(p => p.id === this.selected)) this.selected = rows.find(p => p.id === state.selected[state.activeScene])?.id || rows[0]?.id || '';
    return { ...state, rows, view: { ...this.view }, selectedId: this.selected, transient: this.transient, openSequence: this.openSequence };
  }
  changed() { const s = this.snapshot(); this.publish?.(s); return s; }
  async copy(id = this.selected) {
    const hadPending = this.wheel.pending.length > 0;
    this.wheel.flush(); if (hadPending) id = this.selected;
    if (!this.isForeground() || this.editing) return { ok: false, reason: '请先退出编辑并回到提示词页' };
    if (!this.store.rows(this.view).some(p => p.id === id)) return { ok: false, reason: '请先选择一条提示词' };
    const prompt = this.store.get(id); if (!prompt) return { ok: false, reason: '提示词不存在' };
    try { await this.writeClipboard(prompt.body); } catch { return { ok: false, reason: '复制失败，页面已保留，可打开编辑手动复制' }; }
    let warning = '';
    try { this.store.mutate({ type: 'used', id }); } catch { warning = '已复制，但使用记录保存失败'; }
    this.transient = false; this.wheel.reset(); this.changed(); this.hide();
    const returned = await this.restore();
    return { ok: true, warning: warning || (returned?.ok ? '' : '已复制；请点击原工作窗口后粘贴') };
  }
  async key(key) {
    if (this.busy) return { ok: false, reason: '操作正在完成，请稍候' };
    this.busy = true;
    try {
      if (key === 4) {
        if (this.isForeground()) return await this.copy();
        await this.capture();
        this.wheel.reset();
        this.transient = true; this.editing = false; this.openSequence += 1;
        this.view = { query: '', filter: 'all', scope: 'scene', category: '' }; this.selected = '';
        this.show(); this.changed(); return { ok: true };
      }
      if (key === 8) return await this.input('Ctrl+V');
      if (![5, 6, 7].includes(key)) return { ok: false, reason: '按键无效' };
      if (this.isForeground() || this.isSettingsForeground()) return { ok: false, reason: '请回到工作窗口使用场景快捷键' };
      const state = this.store.snapshot(); const action = state.scenes.find(s => s.id === state.activeScene).bindings[key];
      if (action.type === 'disabled') return { ok: false, reason: '当前场景未配置这个按键' };
      if (action.type === 'prompt') {
        // Explicit fixed text key copies only. KEY8 pastes; never auto-send.
        await this.writeClipboard(action.value); return { ok: true, copied: true };
      }
      return await this.input(action.value);
    } catch { return { ok: false, reason: '提示词快捷操作失败，请检查桌面输入桥' }; }
    finally { this.busy = false; }
  }
  async command(value = {}) {
    if (value.type === 'get') return this.snapshot();
    if (value.type === 'wheel') {
      if (this.isForeground() && !this.editing && !this.busy) this.wheel.accept(value.step, value.source);
      return { ok: true };
    }
    if (value.type === 'move') {
      if (!this.isForeground() || this.editing || this.busy || ![-1, 1].includes(value.step)) return { ok: false, reason: '当前不能选择提示词' };
      const d = this.snapshot();
      if (d.rows.length) this.selected = d.rows[Math.max(0, Math.min(d.rows.length - 1, d.rows.findIndex(p => p.id === d.selectedId) + value.step))].id;
      return this.changed();
    }
    if (value.type === 'view') {
      this.view = { query: String(value.query ?? this.view.query).slice(0, 200), filter: ['all', 'mine', 'recent', 'favorites', 'trash'].includes(value.filter) ? value.filter : this.view.filter,
        scope: ['scene', 'all'].includes(value.scope) ? value.scope : this.view.scope, category: String(value.category ?? this.view.category).slice(0, 60) };
      if (value.selectedId !== undefined) this.selected = String(value.selectedId); return this.changed();
    }
    if (value.type === 'editing') { this.wheel.reset(); this.editing = value.active === true; return { ok: true }; }
    if (value.type === 'leave') { this.wheel.reset(); this.editing = false; this.transient = false; return { ok: true }; }
    if (value.type === 'copy') {
      if (this.busy) return { ok: false, reason: '操作正在完成，请稍候' };
      this.busy = true; try { return await this.copy(value.id || this.selected); } finally { this.busy = false; }
    }
    if (value.type === 'cancel') {
      if (!this.isForeground() || this.editing || this.isVoiceActive() || !this.transient) return { ok: true, hidden: false };
      this.wheel.reset(); this.transient = false; this.hide(); await this.restore(); return { ok: true, hidden: true };
    }
    if (value.type === 'cycle' || value.type === 'scene') {
      if ((!this.isForeground() && !this.isSettingsForeground()) || this.editing) return { ok: false, reason: '请先退出编辑' };
      this.wheel.reset();
      const d = this.store.snapshot();
      const i = d.scenes.findIndex(s => s.id === d.activeScene);
      const id = value.type === 'scene' ? value.id : d.scenes[(i + (value.reverse ? -1 : 1) + d.scenes.length) % d.scenes.length].id;
      this.store.mutate({ type: 'scene', id });
      this.view = { query: '', filter: 'all', scope: 'scene', category: '' }; this.selected = '';
      const result = this.changed();
      if (d.announcements) void Promise.resolve(this.announce(`切换到${result.scenes.find(s => s.id === id).title}模式`)).catch(() => {});
      return result;
    }
    this.store.mutate(value); return this.changed();
  }
  reservedActions() { return new Map(Object.entries(ACTIONS).map(([key, a]) => [a.id, () => this.key(Number(key))])); }
}
module.exports = { PromptWorkbenchController };
