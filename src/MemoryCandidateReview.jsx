import { useCallback, useEffect, useState } from 'react';

export default function MemoryCandidateReview({ notify, onChanged, onShowOriginal }) {
  const [review, setReview] = useState({ groups: [], total: 0, unorganized: 0, reference: 0, review: 0 });
  const [tab, setTab] = useState('review');
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [organizeConsent, setOrganizeConsent] = useState(false);
  const [query, setQuery] = useState('');
  const refresh = useCallback(async () => {
    const result = await globalThis.desktopBridge?.getMemoryCandidateReview?.();
    if (result) setReview(result);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const organize = async (useModel = false) => {
    if (busy) return;
    setBusy(true); setSelected({}); setConfirmation(null);
    try {
      const result = await globalThis.desktopBridge?.organizeMemoryCandidates?.({ useModel, confirmed: useModel && organizeConsent });
      notify(result?.ok ? `已整理 ${result.processed} 条资料；${result.reference} 条归入工作资料，原文均保留` : `整理暂未完成，已完成部分保留；${result?.reason || '服务不可用'}`);
      await refresh(); await onChanged();
    } catch { notify('候选整理未完成，原始记录保留'); }
    finally { setBusy(false); setOrganizeConsent(false); }
  };
  const confirm = async () => {
    if (busy || !confirmation) return;
    setBusy(true);
    try {
      const result = await globalThis.desktopBridge?.reviewMemoryCandidateBatch?.(confirmation);
      notify(result?.ok ? `已${confirmation.state === 'accepted' ? '确认' : '忽略'} ${result.reviewed} 条` : '所选资料已变化，请刷新后重新确认');
      setSelected({}); setConfirmation(null); await refresh(); await onChanged();
    } catch { notify('操作未完成，请刷新核对；不会批量删除原文'); }
    finally { setBusy(false); }
  };
  const visibleGroups = review.groups.filter(group => group.bucket === tab).map(group => ({ ...group, items: group.items.filter(item => `${group.topic} ${item.day} ${item.content}`.includes(query.trim())) })).filter(group => group.items.length);
  const selectedItems = Object.values(selected);
  return <section className="candidate-review" aria-label="候选资料整理">
    <div className="candidate-review__header"><div><h3>记下来，不等于要逐条审批</h3><p>日记自动保存和同步。工作资料按主题收好；想让小岚长期记住的偏好、事实，再挑选确认。</p></div><div className="candidate-review__actions"><button type="button" disabled={busy || review.running || !review.unorganized} onClick={() => organize(false)}>本地分类</button><button type="button" className="candidate-review__primary" disabled={busy || review.running || !review.modelPending} onClick={() => setOrganizeConsent(true)}>{busy ? '正在整理…' : `模型归类${review.modelPending ? `（${review.modelPending}）` : '完成'}`}</button></div></div>
    {organizeConsent && <div className="candidate-review__confirm" role="alert"><p>这会把尚未由模型归类的 {review.modelPending} 条候选内容发送给 DeskMate 当前配置的文本模型服务，可能包含个人事实、偏好或敏感信息，并产生模型费用。仅做分类，不自动确认画像。若不想外发，请取消并使用本地分类。</p><button type="button" disabled={busy} onClick={() => organize(true)}>允许本次模型归类</button><button type="button" disabled={busy} onClick={() => setOrganizeConsent(false)}>取消</button></div>}
    <small>智能归类使用已配置的文本模型；不改写原文、不自动批准、不删除资料。相似记录同主题展示，冲突与时间变化保留。</small>
    <div className="candidate-review__toolbar"><button type="button" aria-pressed={tab === 'review'} disabled={busy} onClick={() => { setTab('review'); setSelected({}); setConfirmation(null); }}>可选确认 · {review.review}</button><button type="button" aria-pressed={tab === 'reference'} disabled={busy} onClick={() => { setTab('reference'); setSelected({}); setConfirmation(null); }}>工作资料 · {review.reference}</button><input aria-label="搜索候选资料" placeholder="搜索主题或内容" value={query} onChange={event => { setQuery(event.target.value); setSelected({}); setConfirmation(null); }} disabled={busy} /><button type="button" disabled={busy} onClick={onShowOriginal}>逐条纠正或删除</button></div>
    <div className="candidate-review__actions"><span>已选 {selectedItems.length} 条（最多 200 条）</span><button type="button" disabled={busy || !selectedItems.length} onClick={() => setConfirmation({ items: selectedItems, state: 'accepted' })}>确认所选为长期记忆</button><button type="button" disabled={busy || !selectedItems.length} onClick={() => setConfirmation({ items: selectedItems, state: 'rejected' })}>忽略所选</button></div>
    {confirmation && <div className="candidate-review__confirm" role="alert"><p>{confirmation.state === 'accepted' ? `将选中的 ${confirmation.items.length} 条资料作为已确认长期记忆。请确认你读过并认可所选原文；未选条目不受影响。` : `忽略选中的 ${confirmation.items.length} 条候选，不删除日记和原始记录。`}</p><button type="button" disabled={busy} onClick={confirm}>确认操作</button><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>取消</button></div>}
    {!visibleGroups.length && <p>当前分类没有匹配资料。</p>}
    {visibleGroups.map(group => <details className="candidate-review__group" key={group.key}><summary>{group.topic}<span>{group.items.length} 条</span></summary>{group.items.map(item => <label className="candidate-review__item" key={item.id}><input type="checkbox" checked={Boolean(selected[item.id])} disabled={busy || Boolean(confirmation) || (!selected[item.id] && selectedItems.length >= 200)} onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[item.id] = { id: item.id, fingerprint: item.fingerprint }; else delete next[item.id]; return next; })} /><div><time>{item.day}</time><p>{item.content}</p><small>{item.reason}</small></div></label>)}</details>)}
  </section>;
}
