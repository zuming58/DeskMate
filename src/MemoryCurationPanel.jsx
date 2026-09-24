import { useCallback, useEffect, useState } from 'react';

export default function MemoryCurationPanel({ notify, onChanged }) {
  const [status, setStatus] = useState({ questionsList: [], pending: 0, questions: 0 });
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const refresh = useCallback(async () => {
    const value = await globalThis.desktopBridge?.getMemoryCuration?.();
    if (value) setStatus(value);
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => { void refresh(); }, 3000); return () => clearInterval(timer); }, [refresh]);
  const toggle = async enabled => {
    try {
      const value = await globalThis.desktopBridge?.setMemoryCuration?.({ enabled, confirmed: enabled && consent });
      if (!value?.ok) { notify('自动整理设置未保存，请重试'); return; }
      setConsent(false); await refresh(); await onChanged();
      notify(enabled ? '已开启：历史及新增候选会在空闲时自动整理' : '自动整理已暂停；在途结果不会继续写入，原文保留');
    } catch { notify('设置未保存，请重试'); }
  };
  const run = async () => {
    setBusy(true);
    try {
      const result = await globalThis.desktopBridge?.runMemoryCuration?.();
      notify(result?.ok ? `本次已整理 ${result.processed || 0} 条原始候选` : result?.reason === 'memory-generation-active' ? '当前正在对话或整理日记，空闲后会继续' : '整理暂未完成，已完成部分保留；可稍后重试');
      await refresh(); await onChanged();
    } catch { notify('整理暂未完成，原始资料保留'); }
    finally { setBusy(false); }
  };
  const resolve = async () => {
    if (!confirmation) return;
    setBusy(true);
    try {
      const result = await globalThis.desktopBridge?.resolveMemoryCuration?.({ id: confirmation.item.id, fingerprint: confirmation.item.fingerprint, action: confirmation.action, summary: drafts[confirmation.item.id] ?? confirmation.item.summary, confirmed: true, replaceConflicts: confirmation.action === 'accept' && confirmation.item.conflicts.length > 0 });
      notify(result?.ok ? '已处理这组内容' : '内容已变化，请刷新后重新核对');
      setConfirmation(null); await refresh(); await onChanged();
    } catch { notify('本次未完成，请刷新后重试'); }
    finally { setBusy(false); }
  };
  return <section className="candidate-review memory-curation" aria-label="自动记忆整理">
    <div className="candidate-review__header"><div><h3>自动整理，只问有疑问的内容</h3><p>流水归档、重复合并，有依据的长期信息自动记住。原始候选保留，整理后的记忆可以纠正或删除。</p></div><div className="candidate-review__actions"><button type="button" disabled={busy || !status.enabled || status.running || !status.pending} onClick={run}>{busy || status.running ? '正在整理…' : '立即整理'}</button><button type="button" onClick={() => status.enabled ? toggle(false) : setConsent(true)}>{status.enabled ? '暂停自动整理' : '开启自动整理'}</button></div></div>
    <p className="memory-curation__status">{status.enabled ? '自动整理已开启' : '自动整理已暂停'} · 待自动处理 {status.pending} 条 · 已归档 / 合并 {status.archived || 0} 条 · 自动记忆 {status.automatic || 0} 条 · 需你核对 {status.questions} 组</p>
    {status.failures > 0 && <p role="status">{status.failures >= 3 ? '连续处理失败，已停止自动重试以避免重复费用。检查文本模型配置后可点“立即整理”。' : '本次模型处理未完成，已完成部分保留，稍后有限重试。'}</p>}
    {consent && <div className="candidate-review__confirm" role="alert"><p>允许将历史和之后新增的候选、相关原话及已有记忆发送给 DeskMate 当前配置的文本模型服务，可能包含个人信息并产生费用。明确内容自动成为可检索记忆；矛盾和不确定内容留给你核对。可随时暂停，原文保留。</p><button type="button" onClick={() => toggle(true)}>允许并开启</button><button type="button" onClick={() => setConsent(false)}>取消</button></div>}
    {!status.questions && <p>{status.pending ? '候选会由软件逐批处理，这些不是你的待办。' : '目前没有需要你核对的问题。'}</p>}
    {status.questionsList.map(item => <article className="memory-curation__question" key={item.id}><h4>{item.reason}</h4><textarea aria-label="核对后的记忆内容" maxLength={1200} value={drafts[item.id] ?? item.summary} disabled={busy || Boolean(confirmation)} onChange={event => setDrafts(current => ({ ...current, [item.id]: event.target.value }))} />{item.conflicts.length > 0 && <div><strong>与以下现有记忆不一致：</strong>{item.conflicts.map(old => <p key={old.id}>{old.summary}</p>)}</div>}<details><summary>查看原始候选 · {item.originals.length} 条</summary>{item.originals.map(original => <p key={original.id}><small>{original.day}</small><br />{original.content}</p>)}</details><div className="candidate-review__actions"><button type="button" disabled={busy} onClick={() => setConfirmation({ item, action: 'accept' })}>按此内容记住</button><button type="button" disabled={busy} onClick={() => setConfirmation({ item, action: 'archive' })}>不作为长期记忆</button></div></article>)}
    {confirmation && <div className="candidate-review__confirm" role="alert"><p>{confirmation.action === 'archive' ? '只归档这组原始候选，不删除原文，也不修改已有长期记忆。' : confirmation.item.conflicts.length ? '确认采用上面编辑后的内容，并停用所列的冲突旧记忆？旧内容仍保留，之后不再用于回答。' : '确认将上面编辑后的内容作为长期记忆？'}</p><button type="button" disabled={busy} onClick={resolve}>确认</button><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>取消</button></div>}
  </section>;
}
