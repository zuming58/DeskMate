import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmationDialog } from './ui.jsx';
import { useUnsavedChanges } from './domain/unsavedChanges.js';

export function SceneManager({ scenes, onClose }) {
  const [draft,setDraft]=useState(null);
  useUnsavedChanges(Boolean(draft));
  const [discard,setDiscard]=useState(false);
  const close=()=>draft ? setDiscard(true) : onClose();
  return createPortal(<div className="prompt-modal-scrim"><section className="prompt-modal scene-manager" role="dialog" aria-modal="true" aria-labelledby="scene-manager-title" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!scenes.busy)close();}
    if(event.key==='Tab') {const fields=[...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled)')]; if(event.shiftKey && event.target===fields[0]){event.preventDefault();fields.at(-1)?.focus();}else if(!event.shiftKey && event.target===fields.at(-1)){event.preventDefault();fields[0]?.focus();}}
  }}>
    <div className="prompt-modal-title"><h2 id="scene-manager-title">管理场景</h2><button autoFocus disabled={scenes.busy} onClick={close}>关闭</button></div>
    <p>按此顺序循环切换。归档会保留提示词和按键配置，至少保留一个可用场景。</p>
    <div className="scene-manager-list">{scenes.data.scenes.map((scene,index)=><div className="scene-manager-row" key={scene.id}>
      <span><strong>{scene.title}</strong><small>{scene.archived?'已归档':scene.hint || '自定义场景'}</small></span>
      <div className="button-row">
        <button disabled={scenes.busy || Boolean(draft) || index===0} aria-label={`上移${scene.title}`} onClick={()=>scenes.manage({id:scene.id,direction:-1,revision:scenes.data.revision})}>↑</button>
        <button disabled={scenes.busy || Boolean(draft) || index===scenes.data.scenes.length-1} aria-label={`下移${scene.title}`} onClick={()=>scenes.manage({id:scene.id,direction:1,revision:scenes.data.revision})}>↓</button>
        <button disabled={scenes.busy || Boolean(draft)} onClick={()=>setDraft({id:scene.id,title:scene.title,hint:scene.hint,revision:scenes.data.revision})}>编辑</button>
        <button disabled={scenes.busy || Boolean(draft) || (!scene.archived && scenes.data.scenes.filter(s=>!s.archived).length===1)} onClick={()=>scenes.manage({id:scene.id,archived:!scene.archived,revision:scenes.data.revision})}>{scene.archived?'恢复':'归档'}</button>
      </div>
    </div>)}</div>
    {draft ? <div className="scene-manager-editor"><label>场景名称<input disabled={scenes.busy} maxLength={40} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>简短说明<input disabled={scenes.busy} maxLength={100} value={draft.hint} onChange={e=>setDraft({...draft,hint:e.target.value})}/></label><p>若其他页面已修改场景，将保留此草稿并提示冲突。取消后重新打开即可读取最新内容。</p><div className="button-row"><button disabled={scenes.busy} onClick={()=>setDraft(null)}>取消修改</button><button disabled={scenes.busy || !draft.title.trim()} onClick={async()=>{const ok=draft.id?await scenes.manage(draft):await scenes.add(draft);if(ok)setDraft(null);}}>保存场景</button></div></div> : <button className="pw-button primary" disabled={scenes.busy || scenes.data.scenes.length>=30} onClick={()=>setDraft({title:'',hint:'',revision:scenes.data.revision})}>新增场景</button>}
    <ConfirmationDialog open={discard} title="放弃场景修改？" description="尚未保存的场景草稿将被丢弃。" notice="已保存的场景和按键配置保持不变。" confirmLabel="放弃修改" onCancel={()=>setDiscard(false)} onConfirm={onClose}/>
  </section></div>,document.body);
}
