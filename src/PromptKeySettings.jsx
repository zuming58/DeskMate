import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconPlus, IconCode, IconScissors, IconBriefcase, IconX } from '@tabler/icons-react';

const bridge = () => window.desktopBridge;
export const isSceneKey = index => index >= 4 && index <= 6;

// Main owns the scene selection shared by the prompt page and keyboard diagram.
export function useSceneKeymap(notify) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    const accept = value => { if (live && value?.scenes) { setData(value); setError(''); } };
    bridge()?.promptWorkbench?.({ type: 'get' }).then(value => {
      accept(value); if (live && !value?.scenes) setError(value?.reason || '场景尚未加载');
    }).catch(() => { if (live) setError('场景服务暂不可用'); });
    const off = bridge()?.onPromptWorkbenchState?.(accept);
    return () => { live = false; off?.(); };
  }, []);
  const command = async value => {
    const result = await bridge()?.promptWorkbench?.(value);
    if (!result || result.ok === false) throw Error(result?.reason || '场景服务暂不可用');
    if (result.scenes) setData(result);
    return result;
  };
  const transact = async work => {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try { await work(); return true; }
    catch (e) { notify(e.message || '未能保存，请检查当前按键'); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  const save = async () => {
    if (!draft) return;
    await command({ type: 'save-scene', scene: draft.scene, revision: draft.revision, activate: false });
    setDraft(null);
  };
  const scene = data?.scenes.find(s => s.id === data.activeScene);
  const shownScene = draft && draft.scene.id === scene?.id ? draft.scene : scene;
  return {
    data, scene: shownScene, busy, error, dirty: Boolean(draft),
    change(key, fields) {
      if (!scene || lock.current) return;
      const next = draft || { scene: structuredClone(scene), revision: data.revision };
      setDraft({ ...next, scene: { ...next.scene, bindings: { ...next.scene.bindings, [key]: { ...next.scene.bindings[key], ...fields } } } });
    },
    save: () => transact(save),
    discard: () => setDraft(null),
    beforeSelect: callback => transact(async () => { await save(); callback(); }),
    select: id => transact(async () => { await save(); await command({ type: 'scene', id }); }),
    add: fields => transact(async () => { await save(); const current = await command({ type: 'get' }); await command({ type: 'save-scene', scene: fields, revision: current.revision }); }),
    setting: fields => transact(async () => { await save(); const current = await command({ type: 'get' }); await command({ type: 'settings', ...fields, revision: current.revision }); }),
  };
}

export function KeymapSceneRail({ scenes, disabled }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  useEffect(() => {
    if (!adding) return;
    const key = event => {
      if (event.key === 'Escape' && !scenes.busy) { event.preventDefault(); event.stopPropagation(); setAdding(false); }
      if (event.key === 'Tab') {
        const items = [...document.querySelectorAll('.keymap-scene-modal button:not(:disabled), .keymap-scene-modal input:not(:disabled)')];
        if (event.shiftKey && event.target === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && event.target === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [adding, scenes.busy]);
  return <>
    <div className="keymap-scenes" role="group" aria-label="工作场景">
      {scenes.data?.scenes.map(scene => { const Icon = scene.id === 'coding' ? IconCode : scene.id === 'scene-video' ? IconScissors : IconBriefcase; return <button type="button" key={scene.id} disabled={disabled || scenes.busy} aria-pressed={scene.id === scenes.data.activeScene} className={`keymap-scene ${scene.id === scenes.data.activeScene ? 'is-active' : ''}`} onClick={() => scenes.select(scene.id)}><Icon size={23} stroke={1.6} /><span><strong>{scene.title}</strong><small>{scene.hint || '自定义工作场景'}</small></span>{scene.id === scenes.data.activeScene && <IconCheck size={18} />}</button>; })}
      <button type="button" className="keymap-scene-add" aria-label="添加工作场景" disabled={!scenes.data || disabled || scenes.busy} onClick={() => { setTitle(''); setHint(''); setAdding(true); }}><IconPlus size={22} /></button>
    </div>
    {scenes.error && <p role="alert">{scenes.error}</p>}
    {adding && <div className="prompt-modal-scrim"><section className="prompt-modal keymap-scene-modal" role="dialog" aria-modal="true" aria-labelledby="keymap-scene-title"><div className="prompt-modal-title"><h2 id="keymap-scene-title">添加工作场景</h2><button aria-label="关闭场景编辑" disabled={scenes.busy} onClick={() => setAdding(false)}><IconX /></button></div><label>场景名称<input autoFocus maxLength={40} value={title} onChange={event => setTitle(event.target.value)} /></label><label>简短说明<input maxLength={100} value={hint} onChange={event => setHint(event.target.value)} /></label><p>共用键保持不变；创建后点击第 5～7 键设置这个场景的功能。</p><div className="prompt-modal-footer"><button className="pw-button" disabled={scenes.busy} onClick={() => setAdding(false)}>取消</button><button className="pw-button primary" disabled={scenes.busy || !title.trim()} onClick={async () => { if (await scenes.add({ title, hint })) setAdding(false); }}>创建场景</button></div></section></div>}
  </>;
}

export function SceneKeyEditor({ binding, onChange }) {
  if (!binding) return <p>正在读取场景按键…</p>;
  return <>
    <label>按键名称<input aria-label="场景按键名称" maxLength={50} value={binding.label} onChange={event => onChange({ label: event.target.value })} /></label>
    <label>按下动作<select aria-label="场景按键动作" value={binding.type} onChange={event => onChange({ type: event.target.value, value: event.target.value === 'hotkey' ? 'Ctrl+Z' : '' })}><option value="hotkey">快捷键</option><option value="prompt">复制提示词</option><option value="disabled">禁用</option></select></label>
    {binding.type === 'hotkey' && <label>快捷键<input aria-label="场景快捷键" placeholder="例如 Ctrl+K 或 Space" maxLength={64} value={binding.value} onChange={event => onChange({ value: event.target.value })} /></label>}
    {binding.type === 'prompt' && <label>提示词正文<textarea aria-label="场景固定提示词" rows={4} maxLength={30000} value={binding.value} onChange={event => onChange({ value: event.target.value })} /><small>只复制到剪贴板，不自动粘贴或发送。</small></label>}
  </>;
}
