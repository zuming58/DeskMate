import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconPlus, IconCode, IconScissors, IconBriefcase, IconX, IconAppWindow, IconFolderOpen } from '@tabler/icons-react';
import { COMMON_SCENE_ACTIONS, sceneBindingForMode, sceneBindingMode } from './domain/sceneKeyActions.js';

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
    cycle: reverse => transact(async () => { await save(); await command({ type: 'cycle', reverse }); }),
    add: fields => transact(async () => { await save(); const current = await command({ type: 'get' }); await command({ type: 'save-scene', scene: fields, revision: current.revision }); }),
    setting: fields => transact(async () => { await save(); const current = await command({ type: 'get' }); await command({ type: 'settings', ...fields, revision: current.revision }); }),
  };
}

// Page navigation owns Tab only outside editors and dialogs. Native shortcut
// recording runs earlier and retains Tab as a valid key, not a scene command.
export function useKeymapSceneTab(scenes, disabled) {
  const root = useRef(null);
  const restoreSceneFocus = useRef(false);
  useEffect(() => {
    if (!restoreSceneFocus.current || scenes.busy) return;
    const element = root.current;
    const selected = element?.querySelector('.keymap-scene[aria-pressed="true"]');
    const rail = element?.querySelector('.keymap-scenes');
    if (!selected || !rail || selected.disabled) return;
    restoreSceneFocus.current = false;
    selected.focus({ preventScroll: true });
    const itemBox = selected.getBoundingClientRect(); const railBox = rail.getBoundingClientRect();
    if (itemBox.right > railBox.right) rail.scrollLeft += itemBox.right - railBox.right;
    else if (itemBox.left < railBox.left) rail.scrollLeft -= railBox.left - itemBox.left;
  }, [scenes.data?.activeScene, scenes.busy]);
  useEffect(() => {
    const element = root.current;
    const key = event => {
      if (!element?.isConnected || event.key !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.keyCode === 229 || !document.hasFocus()) return;
      if (event.target.closest?.('.key-editor,input,textarea,select,[contenteditable="true"]') || document.querySelector('[role="dialog"],[role="alertdialog"],.shortcut-recorder__field.is-capturing')) return;
      event.preventDefault();
      if (event.repeat || disabled || scenes.busy || !scenes.data) return;
      restoreSceneFocus.current = true;
      void scenes.cycle(event.shiftKey).then(ok => { if (!ok) restoreSceneFocus.current = false; });
    };
    // A disabled in-flight scene button temporarily sends native focus to body.
    // Keep page ownership there too, and restore focus only after React enables it.
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [scenes, disabled]);
  return root;
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

function SceneApplicationPicker({ binding, onChange, notify }) {
  const [apps, setApps] = useState([]);
  const load = async () => {
    try { setApps(await bridge()?.listRegisteredApplications?.() || []); }
    catch { notify?.('暂时无法读取应用白名单'); }
  };
  useEffect(() => { void load(); }, []);
  const choose = async () => {
    try {
      const result = await bridge()?.chooseApplication?.();
      if (!result || result.cancelled) return;
      if (!result.id) throw Error(result.reason || '应用登记失败');
      onChange({ type: 'app', value: '', label: result.label.slice(0, 50), appActionId: result.id, appName: result.label });
      await load();
    } catch (error) { notify?.(`应用未加入：${error.message || 'unknown'}`); }
  };
  const selectedKnown = apps.some(app => app.id === binding.appActionId);
  return <div className="scene-application-picker">
    <label>打开应用<select aria-label="场景打开应用" value={binding.appActionId || ''} onChange={event => { const app = apps.find(item => item.id === event.target.value); if (app) onChange({ type: 'app', value: '', label: app.label.slice(0, 50), appActionId: app.id, appName: app.label }); }}><option value="">选择已登记应用</option>{!selectedKnown && binding.appActionId && <option value={binding.appActionId}>{binding.appName || binding.label}</option>}{apps.map(app => <option key={app.id} value={app.id}>{app.label}</option>)}</select></label>
    <button type="button" onClick={() => void choose()}><IconFolderOpen size={16} />选择其他应用</button>
    <small><IconAppWindow size={14} />只允许已登记的 Windows 应用或快捷方式，不接受命令和参数。</small>
  </div>;
}

export function SceneKeyEditor({ binding, onChange, notify }) {
  if (!binding) return <p>正在读取场景按键…</p>;
  const mode = sceneBindingMode(binding);
  const changeMode = value => onChange(sceneBindingForMode(value));
  return <>
    <label>按键名称<input aria-label="场景按键名称" maxLength={50} value={binding.label} onChange={event => onChange({ label: event.target.value })} /></label>
    <label>按下动作<select aria-label="场景按键动作" value={mode} onChange={event => changeMode(event.target.value)}>{COMMON_SCENE_ACTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}<option value="hotkey">自定义快捷键</option><option value="prompt">复制提示词</option><option value="app">打开应用</option><option value="disabled">禁用</option></select></label>
    {mode === 'hotkey' && <label>快捷键<input aria-label="场景快捷键" placeholder="例如 Ctrl+K 或 Space" maxLength={64} value={binding.value} onChange={event => onChange({ value: event.target.value })} /></label>}
    {binding.type === 'prompt' && <label>提示词正文<textarea aria-label="场景固定提示词" rows={4} maxLength={30000} value={binding.value} onChange={event => onChange({ value: event.target.value })} /><small>只复制到剪贴板，不自动粘贴或发送。</small></label>}
    {binding.type === 'app' && <SceneApplicationPicker binding={binding} onChange={onChange} notify={notify} />}
  </>;
}
