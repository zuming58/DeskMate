import { useCallback, useEffect, useRef, useState } from 'react';
import { IconSearch, IconPlus, IconCopy, IconPencil, IconStar, IconTrash, IconArrowBackUp, IconCode, IconScissors, IconBriefcase, IconKeyboard, IconDownload, IconUpload, IconX, IconCheck, IconSettings2, IconLayersIntersect } from '@tabler/icons-react';
import './prompt-workbench.css';

const bridge = () => window.desktopBridge;
const sceneIcon = id => id === 'coding' ? IconCode : id === 'scene-video' ? IconScissors : IconBriefcase;
const filterNames = { all: '全部', favorites: '收藏', recent: '最近', mine: '我的', trash: '回收站' };
const actionNames = { 'prompt-key-4': '提示词页 / 复制收起', 'prompt-key-5': '场景按键 5', 'prompt-key-6': '场景按键 6', 'prompt-key-7': '场景按键 7', paste: '粘贴', copy: '复制', undo: '撤销', 'select-all': '全选', 'companion-call': 'AI 陪伴呼唤' };

export function PromptWorkbenchPage({ notify = () => {} }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [sceneEditor, setSceneEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef(null); const latest = useRef(null); const wheelAt = useRef(0);
  const editing = Boolean(editor || sceneEditor || confirmation);
  const accept = useCallback(value => { if (value?.rows) { setData(value); latest.current = value; } }, []);
  const command = useCallback(async value => {
    try {
      const result = await bridge()?.promptWorkbench?.(value);
      if (!result) throw Error('请使用最新的 DeskMate 桌面应用，浏览器不具备本地按键能力');
      if (result.ok === false) { notify(result.reason || '操作未完成'); return result; }
      accept(result); if (result.warning) notify(result.warning); return result;
    } catch (e) { notify(e.message || '无法连接提示词服务'); return { ok: false }; }
  }, [accept, notify]);
  useEffect(() => {
    if (!bridge()?.promptWorkbench) { setError('提示词需要最新桌面版本。此页面不会模拟设备连接或保存成功。'); return; }
    let alive = true;
    bridge().promptWorkbench({ type: 'get' }).then(v => { if (alive) { accept(v); if (v?.reason) setError(v.reason); } }).catch(() => setError('提示词服务暂不可用'));
    const off = bridge().onPromptWorkbenchState(accept);
    root.current?.focus();
    return () => { alive = false; off?.(); void bridge()?.promptWorkbench?.({ type: 'leave' }); };
  }, [accept]);
  useEffect(() => { void bridge()?.promptWorkbench?.({ type: 'editing', active: editing }); }, [editing]);
  useEffect(() => { if (data?.openSequence) root.current?.focus(); }, [data?.openSequence]);
  useEffect(() => {
    root.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [data?.selectedId]);
  const copy = useCallback(id => command({ type: 'copy', id }), [command]);
  useEffect(() => {
    const move = step => {
      const d = latest.current; if (!d?.rows?.length) return;
      const index = Math.max(0, d.rows.findIndex(p => p.id === d.selectedId));
      const id = d.rows[Math.max(0, Math.min(d.rows.length - 1, index + step))].id;
      void command({ type: 'view', selectedId: id });
    };
    const onKey = event => {
      if (event.isComposing || event.keyCode === 229 || event.repeat || event.ctrlKey || event.altKey || event.metaKey || !document.hasFocus()) return;
      const field = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
      if (editing && event.key === 'Tab') {
        const focusable = [...document.querySelectorAll('.prompt-modal button:not(:disabled),.prompt-modal input,.prompt-modal textarea,.prompt-modal select')];
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (event.key === 'Escape') {
        if (editing) { event.preventDefault(); event.stopImmediatePropagation(); setEditor(null); setSceneEditor(null); setConfirmation(null); return; }
        // Voice Escape is owned by the shared voice workflow; controller won't hide while voice is active.
        void command({ type: 'cancel' }); return;
      }
      if (editing || field) return;
      if (event.key === 'Tab') { event.preventDefault(); void command({ type: 'cycle', reverse: event.shiftKey }); }
      else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); move(['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1); }
      else if (event.key === 'Enter') { event.preventDefault(); void copy(latest.current?.selectedId); }
    };
    const onWheel = event => {
      if (editing || event.ctrlKey || event.metaKey || !document.hasFocus() || event.target.closest?.('input,textarea,select,.prompt-preview-body')) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return; event.preventDefault();
      if (performance.now() - wheelAt.current < 90) return;
      wheelAt.current = performance.now(); move(delta > 0 ? 1 : -1);
    };
    const element = root.current;
    window.addEventListener('keydown', onKey, true); element?.addEventListener('wheel', onWheel, { passive: false });
    return () => { window.removeEventListener('keydown', onKey, true); element?.removeEventListener('wheel', onWheel); };
  }, [editing, command, copy]);
  const openEditor = prompt => {
    setEditor({ id: prompt?.id || '', title: prompt?.title || '', description: prompt?.description || '', body: prompt?.body || '', primarySceneId: prompt?.primarySceneId || data.activeScene, revision: data.revision, origin: prompt?.origin });
  };
  const savePrompt = async saveAs => {
    setBusy(true);
    const result = await command({ type: 'save', id: editor.id, saveAs, revision: editor.revision, prompt: { title: editor.title, description: editor.description, body: editor.body, primarySceneId: editor.primarySceneId } });
    setBusy(false); if (result.ok !== false) { setEditor(null); notify('提示词已保存'); }
  };
  const previewSetup = async () => {
    setSetupBusy(true);
    try {
      const patch = await bridge().getPromptSetupPatch();
      const result = await bridge().previewKeyboardConfigPatch(patch);
      if (result?.ok) { if (result.diff?.length) setConfirmation(result); else notify('当前开发板已经使用提示词按键配置，无需重复写入'); }
      else notify(`尚未配置开发板：${result?.reason || '请连接 EasyInput'}`);
    } catch { notify('无法读取开发板配置'); }
    setSetupBusy(false);
  };
  const commitSetup = async () => {
    setSetupBusy(true);
    try { const r = await bridge().commitKeyboardConfig(confirmation.token); notify(r.ok ? '按键配置已写入并读回验证，请测试第 4 键' : `未完成：${r.reason}`); if (r.ok) setConfirmation(null); }
    catch { notify('写入结果未确认，请重新读取开发板配置'); }
    setSetupBusy(false);
  };
  const transfer = async kind => {
    try { const r = kind === 'export' ? await bridge().exportPrompts() : await bridge().importPrompts(data.revision); if (r.ok) { notify(kind === 'export' ? '备份已导出' : '备份已导入'); await command({ type: 'get' }); } else if (!r.cancelled) notify(r.reason); }
    catch { notify('备份操作未完成'); }
  };
  const d = data; const scene = d?.scenes.find(s => s.id === d.activeScene); const selected = d?.rows.find(p => p.id === d.selectedId);
  return <section className="prompt-workbench" ref={root} tabIndex={-1} aria-label="提示词工作台">
    <div className="prompt-heading"><div><span className="prompt-eyebrow">DESKMATE / PROMPTS</span><h1>选一句，继续工作。</h1><p>把常用提示词和顺手的按键，放在同一个工作场景里。</p></div><button className="pw-button primary" onClick={() => openEditor()} disabled={!d || Boolean(d.error)}><IconPlus size={18} />新建提示词</button></div>
    {error && <div className="pw-notice" role="alert">{error}</div>}
    {!d && !error && <p>正在读取本地提示词库…</p>}
    {d && <>
      {d.error && <div className="pw-notice" role="alert">{d.error}</div>}
      <div className="prompt-scenes" role="group" aria-label="工作场景">
        {d.scenes.map(s => { const Icon = sceneIcon(s.id); return <button key={s.id} className={`prompt-scene ${s.id === d.activeScene ? 'active' : ''}`} onClick={() => { void command({ type: 'scene', id: s.id }); root.current?.focus(); }}><span className={`scene-glyph ${s.icon}`}><Icon size={22} /></span><span><strong>{s.title}</strong><small>{s.hint || '自定义工作场景'}</small></span>{s.id === d.activeScene && <IconCheck size={17} />}</button>; })}
        <button className="prompt-add-scene" title="新增场景" aria-label="新增场景" onClick={() => setSceneEditor({ title: '', hint: '', bindings: structuredClone(scene.bindings), revision: d.revision })}><IconPlus size={20} /></button>
      </div>
      <div className="prompt-key-hint"><span><kbd>Tab</kbd> 切换场景，按键同步切换</span><span><kbd>旋钮</kbd> 选择</span><span><kbd>KEY 4</kbd> 复制并收起</span><span><kbd>KEY 8</kbd> 粘贴</span></div>
      <div className="prompt-columns">
        <div className="prompt-library">
          <div className="prompt-list-title"><h2>{d.view.scope === 'all' ? '全部提示词' : scene.title}<span>{d.rows.length}</span></h2><button className="pw-link" onClick={() => command({ type: 'view', scope: d.view.scope === 'all' ? 'scene' : 'all', category: '' })}>{d.view.scope === 'all' ? '回到当前场景' : `浏览全部 ${d.builtinCount} 条`}</button></div>
          <label className="prompt-search"><IconSearch size={19} /><input aria-label="搜索提示词" placeholder="搜索提示词、关键词或想做的事…" value={d.view.query} onChange={e => command({ type: 'view', query: e.target.value })} /><small>按名称 / 正文查找</small></label>
          <div className="prompt-filters">{Object.entries(filterNames).map(([id, title]) => <button key={id} className={d.view.filter === id ? 'active' : ''} onClick={() => command({ type: 'view', filter: id })}>{title}</button>)}{d.view.scope === 'all' && <select aria-label="提示词分类" value={d.view.category} onChange={e => command({ type: 'view', category: e.target.value })}><option value="">全部分类</option>{d.categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}</div>
          <div className="prompt-rows" role="list" aria-label="提示词列表">
            {!d.rows.length && <div className="prompt-empty"><IconLayersIntersect size={32} /><h3>这里还没有提示词</h3><p>试试其他关键词，或者创建属于这个场景的第一条。</p></div>}
            {d.rows.map(p => { const Icon = sceneIcon(p.primarySceneId); return <div key={p.id} role="listitem" className={`prompt-row ${p.id === d.selectedId ? 'selected' : ''}`} data-selected={p.id === d.selectedId}>
              <button className="prompt-row-main" aria-label={`${p.title}，复制并收起`} disabled={d.view.filter === 'trash' || Boolean(d.error)} onFocus={() => command({ type: 'view', selectedId: p.id })} onClick={() => copy(p.id)}><span className="prompt-row-icon"><Icon size={22} /></span><span><strong>{p.title}</strong><small>{p.description || '我的提示词'}</small></span></button>
              <div className="prompt-row-tools">{d.view.filter === 'trash' ? <button aria-label={`恢复 ${p.title}`} title="恢复" onClick={() => command({ type: 'restore', id: p.id, revision: d.revision })}><IconArrowBackUp size={18} /></button> : <><button aria-label={`收藏 ${p.title}`} aria-pressed={d.favorites.includes(p.id)} title="收藏" onClick={() => command({ type: 'favorite', id: p.id, revision: d.revision })}><IconStar size={18} fill={d.favorites.includes(p.id) ? 'currentColor' : 'none'} /></button><button aria-label={`编辑 ${p.title}`} title="编辑" onClick={() => openEditor(p)}><IconPencil size={18} /></button>{p.origin === 'user' && <button aria-label={`删除 ${p.title}`} title="移入回收站" onClick={() => command({ type: 'delete', id: p.id, revision: d.revision })}><IconTrash size={18} /></button>}</>}</div>
            </div>; })}
          </div>
          <footer className="prompt-library-footer"><span>点击标题即复制并收起 · 旁边铅笔可编辑</span><div><button title="导出含个人提示词的 JSON 备份" onClick={() => transfer('export')}><IconDownload size={16} />导出</button><button onClick={() => transfer('import')}><IconUpload size={16} />导入</button></div></footer>
        </div>
        <aside className="prompt-context">
          <div className="prompt-context-card"><div className="prompt-card-heading"><IconKeyboard size={20} /><h3>当前场景按键</h3><button title="编辑场景与按键" aria-label="编辑场景与按键" onClick={() => setSceneEditor({ ...structuredClone(scene), revision: d.revision })}><IconSettings2 size={18} /></button></div><p>{scene.title} · 只改变第 5～7 键</p>
            <div className="prompt-key-grid">{['语音输入', '回车', '语音编辑', '提示词'].map((name, i) => <div key={name}><small>KEY {i + 1}</small><strong>{name}</strong></div>)}{[5, 6, 7].map(key => <button key={key} onClick={() => setSceneEditor({ ...structuredClone(scene), revision: d.revision })}><small>KEY {key}</small><strong>{scene.bindings[key].label || '未配置'}</strong><span>{scene.bindings[key].type === 'hotkey' ? scene.bindings[key].value : scene.bindings[key].type === 'prompt' ? '复制固定提示词' : '禁用'}</span></button>)}<div><small>KEY 8</small><strong>粘贴</strong><span>Ctrl+V</span></div></div>
            <button className="pw-button full" disabled={setupBusy} onClick={previewSetup}><IconKeyboard size={17} />{setupBusy ? '正在读取开发板…' : '配置到 EasyInput…'}</button><small className="prompt-help">首次使用需预览并确认第 4～8 键映射。保留第 1～3 键、旋钮与其他配置；不烧录固件。</small>
            <label className="prompt-check"><input type="checkbox" checked={d.announcements} onChange={e => command({ type: 'settings', announcements: e.target.checked, revision: d.revision })} />切换场景时语音播报</label><small className="prompt-help">使用已配置的豆包音色与工作提醒音量。语音忙碌时不插播。</small>
          </div>
          <div className="prompt-context-card prompt-preview"><div className="prompt-card-heading"><IconCopy size={19} /><h3>选中内容</h3></div><strong>{selected?.title || '等待选择'}</strong><div className="prompt-preview-body">{selected?.body || '旋转旋钮或按方向键，查看要复制的提示词。'}</div>{selected && d.view.filter !== 'trash' && <button className="pw-button primary full" onClick={() => copy(selected.id)}><IconCopy size={17} />复制并收起</button>}<small className="prompt-help">{d.transient ? 'Esc：取消本次呼出，收回后台，不复制。' : '当前为普通浏览。Esc 不会隐藏主窗口。'}</small></div>
        </aside>
      </div>
    </>}
    {editor && <div className="prompt-modal-scrim"><section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-edit-title"><div className="prompt-modal-title"><h2 id="prompt-edit-title">{editor.id ? '编辑提示词' : '新建提示词'}</h2><button aria-label="关闭编辑" onClick={() => setEditor(null)}><IconX /></button></div><p>{editor.origin === 'builtin' ? '保存为个人版本，原始内置内容仍保留。' : '直接编辑要复制的正文，不需要填写变量表单。'}</p><label>标题<input autoFocus maxLength={120} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} /></label><div className="prompt-form-pair"><label>工作场景<select value={editor.primarySceneId} onChange={e => setEditor({ ...editor, primarySceneId: e.target.value })}>{d.scenes.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label>一句话说明<input maxLength={240} value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} /></label></div><label>提示词正文<textarea rows={12} maxLength={30000} value={editor.body} onChange={e => setEditor({ ...editor, body: e.target.value })} /></label><div className="prompt-modal-footer"><button className="pw-button" onClick={() => setEditor(null)}>取消</button>{editor.id && <button className="pw-button" disabled={busy} onClick={() => savePrompt(true)}>另存为新提示词</button>}<button className="pw-button primary" disabled={busy} onClick={() => savePrompt(false)}>保存提示词</button></div></section></div>}
    {sceneEditor && <div className="prompt-modal-scrim"><section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="scene-edit-title"><div className="prompt-modal-title"><h2 id="scene-edit-title">场景与按键</h2><button aria-label="关闭场景编辑" onClick={() => setSceneEditor(null)}><IconX /></button></div><div className="prompt-form-pair"><label>场景名称<input autoFocus maxLength={40} value={sceneEditor.title} onChange={e => setSceneEditor({ ...sceneEditor, title: e.target.value })} /></label><label>场景说明<input maxLength={100} value={sceneEditor.hint} onChange={e => setSceneEditor({ ...sceneEditor, hint: e.target.value })} /></label></div>{[5, 6, 7].map(key => { const b = sceneEditor.bindings[key]; const change = fields => setSceneEditor({ ...sceneEditor, bindings: { ...sceneEditor.bindings, [key]: { ...b, ...fields } } }); return <fieldset key={key} className="prompt-binding"><legend>KEY {key}</legend><div className="prompt-form-pair"><label>名称<input maxLength={50} value={b.label} onChange={e => change({ label: e.target.value })} /></label><label>动作<select value={b.type} onChange={e => change({ type: e.target.value, value: e.target.value === 'hotkey' ? 'Ctrl+Z' : '' })}><option value="hotkey">快捷键</option><option value="prompt">复制固定提示词</option><option value="disabled">禁用</option></select></label></div>{b.type === 'hotkey' && <label>快捷键（例如 Ctrl+A、Space、Ctrl+K）<input value={b.value} maxLength={64} onChange={e => change({ value: e.target.value })} /></label>}{b.type === 'prompt' && <label>提示词正文<textarea rows={3} maxLength={30000} value={b.value} onChange={e => change({ value: e.target.value })} /></label>}</fieldset>; })}<small className="prompt-help">固定提示词键只复制，按第 8 键粘贴；不会自动发送。剪辑快捷键以你使用的软件设置为准。</small><div className="prompt-modal-footer"><button className="pw-button" onClick={() => setSceneEditor(null)}>取消</button><button className="pw-button primary" disabled={busy} onClick={async () => { setBusy(true); const r = await command({ type: 'save-scene', scene: sceneEditor, revision: sceneEditor.revision }); setBusy(false); if (r.ok !== false) setSceneEditor(null); }}>保存场景</button></div></section></div>}
    {confirmation && <div className="prompt-modal-scrim"><section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-setup-title"><h2 id="prompt-setup-title">确认开发板按键变更</h2><p>仅修改以下按下动作。第 1～3 键、旋钮及其他配置保持原样。修改后按 Tab 切场景，无需反复写入开发板。</p><ul className="prompt-diff">{confirmation.diff.map(item => <li key={item.path}><strong>{item.path.match(/KEY\d/)?.[0] || item.path}</strong><span>{actionNames[item.before.action] || item.before.shortcut || item.before.action} → {actionNames[item.after.action] || item.after.action}</span></li>)}</ul><div className="prompt-modal-footer"><button className="pw-button" onClick={() => setConfirmation(null)}>取消</button><button className="pw-button primary" disabled={setupBusy} onClick={commitSetup}>{setupBusy ? '写入并读回验证…' : '确认写入第 4～8 键'}</button></div></section></div>}
  </section>;
}
