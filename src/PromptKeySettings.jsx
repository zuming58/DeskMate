import { useEffect, useState } from 'react';
import { IconKeyboard } from '@tabler/icons-react';

const bridge = () => window.desktopBridge;
const actionNames = { 'companion-call': '语音助手', 'prompt-key-4': '提示词页 / 复制收起', 'prompt-key-5': '场景按键 5', 'prompt-key-6': '场景按键 6', 'prompt-key-7': '场景按键 7', paste: '粘贴', 'voice-edit': '语音整理', 'open-app': '打开应用' };

export function PromptKeySettings({ notify, onConfigured }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let live = true;
    bridge()?.promptWorkbench?.({ type: 'get' }).then(value => { if (live && value?.scenes) setData(value); }).catch(() => {});
    const off = bridge()?.onPromptWorkbenchState?.(value => { if (value?.scenes) setData(value); });
    return () => { live = false; off?.(); };
  }, []);
  useEffect(() => {
    if (data && !editing) setDraft({ ...structuredClone(data.scenes.find(s => s.id === data.activeScene)), revision: data.revision });
  }, [data, editing]);
  useEffect(() => {
    if (!confirmation) return;
    const close = e => { if (e.key === 'Escape' && !busy) { e.preventDefault(); setConfirmation(null); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [confirmation, busy]);
  const command = async value => {
    try { const result = await bridge().promptWorkbench(value); if (result?.ok === false) throw Error(result.reason); if (result?.scenes) setData(result); return result; }
    catch (e) { notify(e.message || '场景设置未保存'); return { ok: false }; }
  };
  const changeBinding = (key, fields) => { setEditing(true); setDraft({ ...draft, bindings: { ...draft.bindings, [key]: { ...draft.bindings[key], ...fields } } }); };
  const setup = async () => {
    setBusy(true);
    try {
      const patch = await bridge().getPromptSetupPatch();
      const result = await bridge().previewKeyboardConfigPatch(patch);
      if (!result?.ok) throw Error(result?.reason || '请连接 EasyInput');
      if (result.diff?.length) setConfirmation(result); else notify('开发板已使用这套按键方案，无需重复写入');
    } catch (e) { notify(`尚未配置：${e.message}`); }
    setBusy(false);
  };
  const commit = async () => {
    setBusy(true);
    try {
      const result = await bridge().commitKeyboardConfig(confirmation.token);
      if (!result?.ok) throw Error(result?.reason || '回读结果未确认');
      setConfirmation(null); await onConfigured?.(); notify('已写入并读回：第 3 键语音助手，第 4 键提示词');
    } catch (e) { notify(`未完成：${e.message}，请重新读取板上配置`); setConfirmation(null); }
    setBusy(false);
  };
  if (!data || !draft) return null;
  return <section className="scene-key-settings" aria-label="场景按键配置">
    <div className="scene-key-heading"><div><h2><IconKeyboard size={21} />提示词与场景按键</h2><p>Tab 在提示词页切换场景，第 5～7 键随之切换；这里统一管理按键，不在提示词页重复配置。</p></div><button className="pw-button primary" disabled={busy} onClick={setup}>应用提示词按键方案…</button></div>
    <div className="scene-key-contract"><span>KEY 1 · 保留语音输入</span><span>KEY 2 · 保留回车</span><span>KEY 3 · 语音助手</span><span>KEY 4 · 提示词页 / 复制收起</span><span>KEY 8 · 粘贴</span></div>
    <small className="prompt-help">第 3 键替代原语音整理，直接呼叫 AI 陪伴；后台语音唤醒不受影响。应用方案需预览并确认 KEY3～8，保留 KEY1～2、旋钮及其他配置，不烧录固件。</small>
    <div className="scene-key-editor-heading"><label>配置场景<select aria-label="配置场景" disabled={editing} value={draft.id} onChange={e => { setDraft({ ...structuredClone(data.scenes.find(s => s.id === e.target.value)), revision: data.revision }); setEditing(true); }}>{data.scenes.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><span>当前使用：{data.scenes.find(s => s.id === data.activeScene)?.title}。编辑配置不会擅自切换正在使用的场景。</span></div>
    <div className="scene-key-bindings">{[5, 6, 7].map(key => { const b = draft.bindings[key]; return <fieldset key={key} className="prompt-binding"><legend>KEY {key}</legend><label>显示名称<input maxLength={50} value={b.label} onChange={e => changeBinding(key, { label: e.target.value })} /></label><label>动作<select value={b.type} onChange={e => changeBinding(key, { type: e.target.value, value: e.target.value === 'hotkey' ? 'Ctrl+Z' : '' })}><option value="hotkey">快捷键</option><option value="prompt">复制固定提示词</option><option value="disabled">禁用</option></select></label>{b.type === 'hotkey' && <label>快捷键<input maxLength={64} value={b.value} onChange={e => changeBinding(key, { value: e.target.value })} /></label>}{b.type === 'prompt' && <label>提示词<textarea rows={3} maxLength={30000} value={b.value} onChange={e => changeBinding(key, { value: e.target.value })} /></label>}</fieldset>; })}</div>
    <div className="scene-key-save"><small>固定提示词键只复制，KEY8 粘贴；不会自动发送。剪辑快捷键请按所用软件调整。</small><button className="pw-button" disabled={!editing || busy} onClick={() => setEditing(false)}>取消修改</button><button className="pw-button primary" disabled={!editing || busy} onClick={async () => { setBusy(true); const result = await command({ type: 'save-scene', scene: draft, revision: draft.revision, activate: false }); setBusy(false); if (result?.ok !== false) { setEditing(false); notify('场景按键已保存到本机'); } }}>保存场景按键</button></div>
    <div className="scene-key-options"><label className="prompt-check"><input type="checkbox" checked={data.announcements} disabled={editing} onChange={e => command({ type: 'settings', announcements: e.target.checked, revision: data.revision })} />切换场景时语音播报</label><label className="prompt-check"><input type="checkbox" checked={data.reverseSelection} disabled={editing} onChange={e => command({ type: 'settings', reverseSelection: e.target.checked, revision: data.revision })} />反转提示词选词方向</label><small>仅调整提示词页的方向；按本次实测默认反转，让右转向下选、左转向上选。其他软件的旋钮设置不变。播报使用豆包音色与工作提醒音量，语音忙碌时不插播。</small></div>
    {confirmation && <div className="prompt-modal-scrim"><section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-setup-title"><h2 id="prompt-setup-title">确认开发板按键变更</h2><p>第 3 键改为语音助手，第 4 键用于提示词。KEY1～2、旋钮及其他配置保持原样。</p><ul className="prompt-diff">{confirmation.diff.map(item => <li key={item.path}><strong>{item.path.match(/KEY\d/)?.[0] || item.path}</strong><span>{actionNames[item.before.action] || item.before.shortcut || item.before.action} → {actionNames[item.after.action] || item.after.action}</span></li>)}</ul><div className="prompt-modal-footer"><button className="pw-button" disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button autoFocus className="pw-button primary" disabled={busy} onClick={commit}>{busy ? '写入并读回验证…' : '确认写入第 3～8 键'}</button></div></section></div>}
  </section>;
}
