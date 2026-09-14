import { useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconPlus, IconChevronLeft, IconChevronRight, IconDownload, IconX, IconLayoutGrid, IconInfoCircle, IconArrowsExchange, IconPhoto, IconCopy } from '@tabler/icons-react';
import { useUnsavedChanges } from './domain/unsavedChanges.js';
import { STUDIO_SOURCE, STUDIO_DIAL, STUDIO_STYLES, STUDIO_EFFECTS, wrapStudioIndex, clampStudioStrength, studioPrompt, studioOrbit, studioKey, validStudioUpload } from './domain/styleStudio.js';
import './style-studio.css';

const starter = { id: 'source', name: '生活中的我', image: STUDIO_SOURCE, sample: true };
const exampleResults = ['glass', 'paper', 'yarn'].map(id => ({ id: `example-${id}`, ...STUDIO_STYLES.find(s => s.id === id), sample: true, source: starter, strength: 65 }));
const bridge = () => window.desktopBridge;
function mediaUrl(bytes, mime, urls) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  urls.current.add(url);
  return url;
}
function Photo({ item, className = '', onClick, onDragStart, style, selected, caption }) {
  return <button type="button" className={`ss-photo ${className} ${selected ? 'is-selected' : ''}`} style={style} onClick={onClick} draggable={Boolean(onDragStart)} onDragStart={onDragStart} aria-label={caption || item.name}>
    <img src={item.image} alt={item.name} draggable="false" /><span>{caption || item.name}</span>
  </button>;
}

function Reveal({ result, effect, radius, compare }) {
  const canvas = useRef(null);
  const [point, setPoint] = useState({ x: .5, y: .5 });
  useEffect(() => {
    const element = canvas.current;
    if (!element || !result) return;
    let active = true;
    const original = new Image(), transformed = new Image();
    original.src = result.source.image; transformed.src = result.image;
    Promise.all([original.decode(), transformed.decode()]).then(() => {
      if (!active) return;
      const ctx = element.getContext('2d');
      const size = element.width;
      const drawFit = (image, context = ctx, targetSize = size) => {
        const side = Math.min(image.width, image.height);
        context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, targetSize, targetSize);
      };
      drawFit(compare ? original : transformed);
      if (compare) return;
      if (effect > 0) {
        const small = document.createElement('canvas'); small.width = small.height = effect === 2 ? 48 : 76;
        const c = small.getContext('2d', { willReadFrequently: true }); drawFit(transformed, c, small.width);
        const { data } = c.getImageData(0, 0, small.width, small.height);
        ctx.fillStyle = effect === 3 ? '#202832' : '#fbfbf9'; ctx.fillRect(0, 0, size, size);
        const step = size / small.width;
        for (let y = 0; y < small.height; y++) for (let x = 0; x < small.width; x++) {
          const i = (y * small.width + x) * 4;
          const luminance = (data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114) / 255;
          ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
          if (effect === 1) { ctx.beginPath(); ctx.arc((x + .5) * step, (y + .5) * step, step * .42, 0, Math.PI * 2); ctx.fill(); }
          else if (effect === 2) ctx.fillRect(x * step, y * step, Math.ceil(step), Math.ceil(step));
          else if (effect === 3) { ctx.font = `${step}px monospace`; ctx.fillText(' .:-=+*#%@'[Math.min(9, Math.floor((1 - luminance) * 10))], x * step, (y + 1) * step); }
          else if (effect === 4) { ctx.fillStyle = luminance > .55 ? '#f6d7b1' : '#315a83'; ctx.fillRect(x * step, y * step, Math.ceil(step), Math.ceil(step)); }
          else { ctx.fillStyle = '#315a83'; ctx.fillRect(x * step, y * step + step / 2, step, Math.max(.5, (1 - luminance) * step * .7)); }
        }
      }
      ctx.save(); ctx.beginPath(); ctx.arc(point.x * size, point.y * size, size * radius / 200, 0, Math.PI * 2); ctx.clip(); drawFit(effect === 0 ? original : transformed); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(point.x * size, point.y * size, size * radius / 200, 0, Math.PI * 2); ctx.stroke();
    }).catch(() => {});
    return () => { active = false; };
  }, [result, effect, radius, compare, point]);
  return <canvas ref={canvas} width={720} height={720} aria-label="移动鼠标查看圆形显影对比" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setPoint({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); }} />;
}

export function StyleStudioPage({ navigate, notify = () => {} }) {
  const [cursor, setCursor] = useState(0), [strength, setStrength] = useState(65), [adjusting, setAdjusting] = useState(false);
  const [materials, setMaterials] = useState([starter]), [source, setSource] = useState(starter), [results, setResults] = useState(exampleResults);
  const [mode, setMode] = useState('generate'), [modal, setModal] = useState(null), [activeResult, setActiveResult] = useState(exampleResults[1]);
  const [phase, setPhase] = useState('idle'), [compare, setCompare] = useState(false), [effect, setEffect] = useState(0), [radius, setRadius] = useState(42);
  const [organized, setOrganized] = useState(false), [brief, setBrief] = useState(''), [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [status, setStatus] = useState(''), [focused, setFocused] = useState(true);
  const [provider, setProvider] = useState({ configured: false, available: Boolean(bridge()?.getStyleStudioStatus), active: false });
  const uploader = useRef(null), urls = useRef(new Set()), timer = useRef(null), busy = useRef(false), wheelAt = useRef(0), alive = useRef(true), dialStart = useRef(null), activeRequest = useRef(''), leaseToken = useRef(`studio-${crypto.randomUUID()}`);
  const style = STUDIO_STYLES[wrapStudioIndex(cursor)];
  const importing = useRef(false);
  useUnsavedChanges((!provider.available && materials.some(item => !item.sample)) || Boolean(brief.trim()) || busy.current);
  useEffect(() => {
    alive.current = true;
    const api = bridge();
    const load = async () => {
      if (!api?.getStyleStudioStatus) return;
      const snapshot = await api.getStyleStudioStatus();
      if (!alive.current) return;
      setProvider({ configured: snapshot.configured === true, available: true, active: snapshot.active === true });
      if (!snapshot.ok || !snapshot.library?.ok) { setStatus(snapshot.reason || '本地素材库暂时无法读取。'); return; }
      const records = snapshot.library.items || [];
      const hydrated = new Map();
      for (const record of records.filter(item => item.kind === 'source')) {
        const payload = await api.readStyleStudioMedia({ id: record.id, kind: 'source' });
        if (!alive.current) return;
        if (payload.ok) hydrated.set(record.id, { ...record, image: mediaUrl(payload.bytes, record.mime, urls), sample: false });
      }
      const sourceItems = [...hydrated.values()];
      const resultItems = [];
      for (const record of records.filter(item => item.kind === 'result')) {
        const payload = await api.readStyleStudioMedia({ id: record.id, kind: 'result' });
        if (!alive.current) return;
        const original = hydrated.get(record.sourceId);
        if (payload.ok && original) resultItems.push({ ...record, name: record.styleName || record.name, image: mediaUrl(payload.bytes, record.mime, urls), source: original, sample: false });
      }
      setMaterials([starter, ...sourceItems]);
      setResults([...exampleResults, ...resultItems]);
      if (resultItems.length) setActiveResult(resultItems.at(-1));
      if (sourceItems.length || resultItems.length) setStatus(`已读取本地素材 ${sourceItems.length} 张、作品 ${resultItems.length} 张。`);
    };
    void load().catch(() => { if (alive.current) setStatus('本地素材库暂时无法读取。'); });
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      if (activeRequest.current) void api?.cancelStyleStudioImage?.(activeRequest.current);
      void api?.releaseStyleStudioInput?.(leaseToken.current);
      urls.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);
  useEffect(() => {
    const api = bridge();
    const acquire = () => { setFocused(true); void api?.acquireStyleStudioInput?.(leaseToken.current); };
    const blur = () => { setFocused(false); setCompare(false); void api?.releaseStyleStudioInput?.(leaseToken.current); };
    acquire();
    const unsubscribe = api?.onStyleStudioInput?.(event => {
      if (!document.hasFocus()) return;
      if (event?.command === 'blocked-host-action') { setStatus('本页已暂停原场景按键动作；离开后自动恢复。'); return; }
      if (event?.command) actions.current(event.command);
    });
    window.addEventListener('blur', blur); window.addEventListener('focus', acquire);
    return () => { unsubscribe?.(); window.removeEventListener('blur', blur); window.removeEventListener('focus', acquire); };
  }, []);
  function move(direction) {
    if (phase !== 'idle') return;
    if (mode === 'reveal') setEffect(i => wrapStudioIndex(i + direction, STUDIO_EFFECTS.length));
    else if (adjusting) setStrength(n => clampStudioStrength(n + direction * 5));
    else setCursor(n => n + direction);
  }
  function choose(index) { if (busy.current) return; setCursor(index); setAdjusting(false); }
  function generate() {
    if (busy.current) return;
    if (adjusting) { setAdjusting(false); return; }
    if (!source.sample) {
      if (!provider.available) { setStatus('当前是浏览器预览，需在 DeskMate 桌面软件中生成。'); return; }
      if (!provider.configured) { setStatus('请先在设置页保存百炼 API Key，再返回生成。'); return; }
      setModal('consent');
      return;
    }
    busy.current = true; setPhase('feeding'); setStatus('本地样片演示：进片、出片与查看流程');
    const result = { ...style, id: `result-${Date.now()}`, sample: true, source, strength };
    timer.current = setTimeout(() => {
      setPhase('printing'); setResults(items => [...items, result]); setActiveResult(result);
      timer.current = setTimeout(() => { setPhase('idle'); busy.current = false; setModal('result'); }, 1000);
    }, 650);
  }
  async function generateReal() {
    const api = bridge();
    if (!api?.generateStyleStudioImage || source.sample || busy.current) return;
    const frozen = { source, style, strength, brief };
    const requestId = `studio-${crypto.randomUUID()}`;
    let completed = false;
    activeRequest.current = requestId;
    busy.current = true; setModal('progress'); setPhase('feeding'); setProvider(value => ({ ...value, active: true }));
    setStatus(`正在用“${frozen.style.name}”生成，本次照片将发送到已配置的百炼。`);
    try {
      const response = await api.generateStyleStudioImage({ requestId, sourceId: frozen.source.id, styleId: frozen.style.id, strength: frozen.strength, brief: frozen.brief, consent: true });
      if (!alive.current) return;
      if (!response.ok) { setStatus(response.reason || '风格作品生成失败，请稍后重试。'); setModal(null); return; }
      const result = { ...response.record, name: response.record.styleName || frozen.style.name, image: mediaUrl(response.bytes, response.record.mime, urls), source: frozen.source, sample: false };
      setResults(items => [...items, result]); setActiveResult(result); setPhase('printing');
      completed = true;
      timer.current = setTimeout(() => { if (!alive.current) return; setPhase('idle'); setModal('result'); }, 650);
      setStatus('作品已生成并保存到本地作品库。');
    } catch { if (alive.current) { setStatus('生成没有完成，请稍后重试。'); setModal(null); } }
    finally {
      if (alive.current) { busy.current = false; setProvider(value => ({ ...value, active: false })); if (!completed) setPhase('idle'); }
      activeRequest.current = '';
    }
  }
  async function cancelGeneration() {
    const id = activeRequest.current;
    if (id) await bridge()?.cancelStyleStudioImage?.(id);
    setStatus('正在取消本次生成…');
  }
  async function upload(files) {
    if (importing.current || busy.current) { setStatus('请等待当前导入或出片完成后再添加素材。'); return; }
    importing.current = true;
    try {
    let remaining = 8 - materials.filter(item => !item.sample).length;
    for (const file of Array.from(files || [])) {
      if (!remaining) { setStatus('本次最多放入 8 张素材。'); break; }
      if (!validStudioUpload(file)) { setStatus('请选择 10 MB 以内的 PNG、JPG 或 WebP 图片。'); continue; }
      const image = URL.createObjectURL(file); urls.current.add(image);
      try { const decoded = new Image(); decoded.src = image; await decoded.decode(); if (decoded.width * decoded.height > 40000000) throw new Error('oversize'); }
      catch { URL.revokeObjectURL(image); urls.current.delete(image); if (alive.current) setStatus('图片无法读取，或超过 4000 万像素。'); continue; }
      if (!alive.current) { URL.revokeObjectURL(image); urls.current.delete(image); return; }
      const api = bridge();
      if (!api?.importStyleStudioSource) { const item = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), image, sample: false }; setMaterials(items => [...items, item]); setSource(item); remaining--; setStatus('浏览器预览：素材只保留到本次页面关闭。'); continue; }
      const response = await api.importStyleStudioSource({ name: file.name.replace(/\.[^.]+$/, ''), mime: file.type, bytes: await file.arrayBuffer() });
      if (!alive.current) return;
      if (!response.ok) { URL.revokeObjectURL(image); urls.current.delete(image); setStatus(response.reason || '素材没有导入，请检查图片。'); continue; }
      const existing = materials.find(item => item.id === response.record.id);
      if (existing) { URL.revokeObjectURL(image); urls.current.delete(image); setSource(existing); setStatus('这张素材已在本地素材库中。'); continue; }
      const item = { ...response.record, image, sample: false };
      setMaterials(items => [...items, item]); setSource(item); remaining--;
      setStatus('素材已保存到本地素材库；只有确认生成后才会上传百炼。');
    }
    } finally { importing.current = false; }
  }
  async function save() {
    if (!activeResult) return;
    try { const response = await fetch(activeResult.image); if (!response.ok) throw new Error(); const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `deskmate-${activeResult.id}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus(`已请求保存${activeResult.sample ? '样片' : '作品'}，请查看下载目录或保存对话框。`); }
    catch { setStatus('保存未完成，请重试。'); }
  }
  async function removeLocal() {
    if (!deleteTarget || deleteTarget.sample) return;
    const response = await bridge()?.removeStyleStudioMedia?.({ id: deleteTarget.id });
    if (!alive.current) return;
    if (!response?.ok) { setStatus(response?.reason || '没有删除，请稍后重试。'); setModal(null); setDeleteTarget(null); return; }
    if (deleteTarget.kind === 'source') {
      setMaterials(items => items.filter(item => item.id !== deleteTarget.id));
      if (source.id === deleteTarget.id) setSource(starter);
    } else {
      setResults(items => items.filter(item => item.id !== deleteTarget.id));
      if (activeResult.id === deleteTarget.id) setActiveResult(exampleResults[1]);
    }
    if (deleteTarget.image) { URL.revokeObjectURL(deleteTarget.image); urls.current.delete(deleteTarget.image); }
    setStatus(`已从本地库删除“${deleteTarget.name}”。`); setModal(null); setDeleteTarget(null);
  }
  function action(name) {
    if (name === 'close') { if (modal === 'progress') { void cancelGeneration(); return; } setModal(null); setDeleteTarget(null); setAdjusting(false); setCompare(false); return; }
    if (modal && !['save', 'compare', 'view'].includes(name)) return;
    if (name === 'previous') move(-1);
    if (name === 'next') move(1);
    if (name === 'confirm') mode === 'generate' ? generate() : setMode('generate');
    if (name === 'strength') setAdjusting(v => !v);
    if (name === 'view') { if (activeResult) setModal(v => v === 'result' ? null : 'result'); }
    if (name === 'save') void save();
    if (name === 'compare') setCompare(v => !v);
    if (name === 'inspiration') { setBrief('保留主体轮廓，加入温柔的植物与自然光。'); setModal('prompt'); }
    if (name === 'reset' && !busy.current) { setCursor(0); setStrength(65); setAdjusting(false); setEffect(0); setRadius(42); setStatus('已重置风格参数，素材和作品保留。'); }
    if (name === 'mode' && !busy.current) setMode(v => v === 'generate' ? 'reveal' : 'generate');
  }
  const actions = useRef(action); actions.current = action;
  useEffect(() => {
    const key = e => { const command = studioKey(e); if (!command || !document.hasFocus()) return; e.preventDefault(); actions.current(command); };
    const release = e => { if (e.code === 'Digit5' || e.code === 'KeyA') setCompare(false); };
    window.addEventListener('keydown', key); window.addEventListener('keyup', release);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', release); };
  }, []);
  const keyItems = [['strength','强度'],['view','查看'],['save','保存'],['close','收起'],['compare','对比'],['inspiration','灵感'],['reset','重置'],['mode','模式']];
  const wheel = e => { if (Math.abs(e.deltaY) < 2 || Date.now() - wheelAt.current < 110) return; wheelAt.current = Date.now(); move(e.deltaY > 0 ? 1 : -1); };
  return <section className="style-studio" aria-label="风格映像">
    <header className="ss-toolbar"><button className="ss-back" onClick={() => navigate('dashboard')}><IconArrowLeft size={18} />返回工作台</button><div className="ss-tabs" role="tablist" aria-label="创作模式">{[['generate','生成'],['reveal','显影']].map(([id,label]) => <button role="tab" aria-selected={mode === id} key={id} disabled={phase !== 'idle'} onClick={() => { if (!busy.current) setMode(id); }}>{label}</button>)}</div><div className="ss-mode"><IconInfoCircle size={16} /><span>{focused ? '本页按键模式' : '按键已恢复'}<small>{focused ? '离开或失焦自动恢复' : '回到本页重新接管'}</small></span><span className="ss-badge">{provider.configured ? '百炼已配置' : provider.available ? '百炼未配置' : '浏览器预览'}</span></div></header>
    {mode === 'generate' ? <div className={`ss-stage ${phase}`}>
      <div className="ss-material-heading"><h2>素材</h2><p>放入照片，开启风格之旅</p><button className="ss-soft" disabled={phase !== 'idle'} onClick={() => uploader.current.click()}><IconPlus size={17} />添加照片</button><small>点击或拖入 · 本地素材库</small></div>
      <input ref={uploader} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
      <div className="ss-materials" aria-label="素材区" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}>
        {materials.map((item,index) => <Photo key={item.id} item={item} selected={source.id === item.id} onClick={() => { if (!busy.current) setSource(item); }} onDragStart={e => { e.dataTransfer.setData('application/x-deskmate-material', item.id); e.dataTransfer.effectAllowed = 'copy'; }} style={{ '--tilt': `${index % 2 ? 6 : -10}deg` }} />)}
      </div>
      <div className={`ss-inlet ${dragOver ? 'is-over' : ''}`} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); if (busy.current) return; const item = materials.find(m => m.id === e.dataTransfer.getData('application/x-deskmate-material')); if (item) { setSource(item); setStatus('素材已放入进片槽。'); } else if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); else setStatus('作品保留在下方；请从素材区放入原图。'); }}>
        <Photo item={source} className="ss-loaded" onClick={() => setModal('source')} /><span className="ss-slot-label">{dragOver ? '松开放入' : '原图进片口'}</span>
      </div>
      <div className="ss-orbit" aria-label="围绕旋钮选择风格" onWheel={wheel}>
        {STUDIO_STYLES.map((item,index) => { const pos = studioOrbit(index, cursor); return <Photo key={item.id} item={item} selected={item.id === style.id} onClick={() => choose(index)} style={{ '--ox': `${pos.x}px`, '--oy': `${pos.y}px`, '--scale': pos.scale, '--tilt': `${pos.angle}deg`, zIndex: pos.z }} />; })}
      </div>
      <div className={`ss-machine ${adjusting ? 'is-adjusting' : ''}`}>
        <div className="ss-description"><span className="ss-eyebrow"><IconPhoto size={15} />风格映像</span><h1>{adjusting ? '调整风格强度' : style.name}</h1><p>{adjusting ? '旋转调节，按下旋钮确认。' : style.description}</p><button className="ss-outline" onClick={() => setModal('prompt')}>查看提示词<IconChevronRight size={15} /></button></div>
        <img className="ss-style-preview" src={style.image} alt={`${style.name}预制样片`} />
        <div className="ss-control">
          <label className="ss-strength">风格强度 <strong>{strength}%</strong><input aria-label="风格强度" type="range" min="0" max="100" value={strength} disabled={phase !== 'idle'} onChange={e => setStrength(Number(e.target.value))} /></label>
          <div className="ss-dial-row"><button aria-label="上一个风格" className="ss-step" onClick={() => move(-1)}><IconChevronLeft size={17} /></button><button className="ss-dial" aria-label={adjusting ? '确认强度' : source.sample ? '按下旋钮演示出片' : '按下旋钮生成作品'} disabled={phase !== 'idle'} onClick={generate} onWheel={wheel} onPointerDown={e => { dialStart.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { if (dialStart.current !== null && Math.abs(e.clientX - dialStart.current) > 22) { move(e.clientX > dialStart.current ? 1 : -1); dialStart.current = 'dragged'; } else dialStart.current = null; }} onClickCapture={e => { if (dialStart.current === 'dragged') { e.stopPropagation(); dialStart.current = null; } }}><img src={STUDIO_DIAL} alt="" draggable="false" style={{ transform: `rotate(${adjusting ? strength * 2.7 : cursor * 36}deg)` }} /></button><button aria-label="下一个风格" className="ss-step" onClick={() => move(1)}><IconChevronRight size={17} /></button></div>
          <button className="ss-primary" disabled={phase !== 'idle'} onClick={generate}>{phase !== 'idle' ? '正在出片…' : adjusting ? '确认强度' : source.sample ? '演示出片' : provider.configured ? '生成作品' : '配置百炼后生成'}</button>
        </div>
      </div>
      <div className="ss-output-heading"><div><h2>作品</h2><p>样片与本地生成作品分开保存</p></div><button className="ss-soft" onClick={() => setOrganized(v => !v)}><IconLayoutGrid size={17} />{organized ? '自由排列' : '整理'}</button></div>
      <div className={`ss-results ${organized ? 'is-organized' : ''}`} aria-label="作品区" onDragOver={e => e.preventDefault()} onDrop={e => e.preventDefault()}>
        {results.map((item,index) => <Photo key={item.id} item={item} className={index === results.length - 1 && phase === 'printing' ? 'ss-ejecting' : ''} onClick={() => { setActiveResult(item); setCompare(false); setModal('result'); }} onDragStart={e => { e.dataTransfer.setData('application/x-deskmate-result', item.id); e.dataTransfer.effectAllowed = 'move'; }} style={{ '--tilt': `${organized ? 0 : index % 2 ? 4 : -7}deg` }} />)}
      </div>
    </div> : <div className="ss-reveal"><div className="ss-reveal-heading"><h2>显影实验室</h2><button className="ss-soft" onClick={() => setCompare(v => !v)}><IconArrowsExchange size={17} />{compare ? '返回作品' : '查看原图'}</button></div><p>{activeResult?.sample ? '本地样片' : '本地生成作品'} · 移动圆窗，探索不同的画面语言</p><Reveal result={activeResult} effect={effect} radius={radius} compare={compare} /><label className="ss-radius">圆窗大小 {radius}%<input aria-label="圆窗大小" type="range" min="10" max="90" value={radius} onChange={e => setRadius(Number(e.target.value))} /></label><div className="ss-effects">{STUDIO_EFFECTS.map((name,index) => <button key={name} aria-pressed={effect === index} onClick={() => setEffect(index)}><img src={activeResult.image} alt="" />{name}</button>)}</div></div>}
    <footer className="ss-footer"><p role="status">{status || '旋转选风格 · 选择自己的素材后，确认上传即可生成。离开本页自动恢复原按键。'}</p><div className="ss-keys" aria-label="页面按键预览">{keyItems.map(([id,name],index) => <button key={id} onClick={() => action(id)} title={`S${index + 1}：${name}`} className={id === 'strength' && adjusting ? 'is-selected' : ''}>S{index + 1}<small>{name}</small></button>)}</div></footer>
    {modal && <div className="ss-overlay" onPointerDown={e => { if (e.target === e.currentTarget && !['progress', 'consent', 'delete'].includes(modal)) setModal(null); }}>
      <div className={`ss-dialog ${modal === 'prompt' ? 'ss-prompt-dialog' : ''} ${['progress','consent','delete'].includes(modal) ? 'ss-confirm-dialog' : ''}`} role="dialog" aria-modal="true" aria-label={modal === 'prompt' ? '风格提示词' : modal === 'consent' ? '确认上传生成' : modal === 'progress' ? '正在生成' : modal === 'delete' ? '确认删除本地图片' : '图片预览'} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); action('close'); } if (e.key === 'Tab') { const nodes = [...e.currentTarget.querySelectorAll('button,input,textarea')].filter(el => !el.disabled); const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}>
        {modal !== 'progress' && <button autoFocus className="ss-close" aria-label="关闭预览" onClick={() => { setModal(null); setDeleteTarget(null); }}><IconX size={22} /></button>}
        {modal === 'prompt' ? <>
          <h2>{style.name}</h2><p>当前生成提示词预览</p>
          <label>创意补充<textarea value={brief} maxLength={500} onChange={e => setBrief(e.target.value)} placeholder="可选：希望保留哪些特征？" /></label>
          <pre>{studioPrompt(style, strength, brief)}</pre>
          <button className="ss-primary" onClick={async () => { try { await navigator.clipboard.writeText(studioPrompt(style, strength, brief)); notify('提示词已复制'); } catch { setStatus('剪贴板不可用，请手动选择提示词复制。'); } }}><IconCopy size={17} />复制提示词</button>
        </> : modal === 'consent' ? <>
          <span className="ss-eyebrow"><IconInfoCircle size={16} />本次上传确认</span>
          <h2>用百炼生成“{style.name}”作品？</h2>
          <p>仅这一次：所选照片会发送到你已配置的阿里云百炼。生成结果会立即下载并保存到本机素材库；打开页面和预览不会上传。</p>
          <div className="ss-consent-preview"><img src={source.image} alt={source.name} /><span>{source.name}<small>风格强度 {strength}%</small></span></div>
          <div className="ss-dialog-actions"><button className="ss-primary" onClick={() => void generateReal()}>确认上传并生成</button><button className="ss-soft" onClick={() => setModal(null)}>取消</button></div>
        </> : modal === 'progress' ? <>
          <span className="ss-spinner" aria-hidden="true" />
          <h2>正在生成“{style.name}”</h2><p>图片生成可能需要几分钟。完成后会自动保存到本地作品库。</p>
          <button autoFocus className="ss-soft" onClick={() => void cancelGeneration()}>取消本次生成</button>
        </> : modal === 'delete' && deleteTarget ? <>
          <span className="ss-eyebrow"><IconInfoCircle size={16} />本地库管理</span>
          <h2>删除“{deleteTarget.name}”？</h2>
          <p>{deleteTarget.kind === 'source' ? '素材有生成作品时会被保护；请先删除对应作品。删除后，本机保存的图片无法从风格映像中恢复。' : '删除后，本机作品库中的这张图片无法恢复。已另行下载的副本不受影响。'}</p>
          <div className="ss-consent-preview"><img src={deleteTarget.image} alt={deleteTarget.name} /><span>{deleteTarget.name}<small>{deleteTarget.kind === 'source' ? '本地素材' : '本地生成作品'}</small></span></div>
          <div className="ss-dialog-actions"><button className="ss-primary" onClick={() => void removeLocal()}>确认删除</button><button className="ss-soft" onClick={() => { setModal(null); setDeleteTarget(null); }}>取消</button></div>
        </> : <>
          <img className="ss-enlarged" src={modal === 'source' ? source.image : compare ? activeResult.source.image : activeResult.image} alt={modal === 'source' ? source.name : activeResult.name} />
          <h3>{modal === 'source' ? source.name : `${activeResult.name} · ${activeResult.sample ? '预制样片' : '本地生成作品'}`}</h3>
          {modal === 'source' && source.kind === 'source' && <div className="ss-dialog-actions"><button className="ss-soft" onClick={() => { setDeleteTarget(source); setModal('delete'); }}>从本地库删除</button></div>}
          {modal === 'result' && <div className="ss-dialog-actions"><button className="ss-primary" onClick={save}><IconDownload size={18} />保存{activeResult.sample ? '样片' : '作品'}</button><button className="ss-soft" onClick={() => setCompare(v => !v)}>{compare ? '查看作品' : '对比原图'}</button><button className="ss-soft" onClick={() => { setMode('reveal'); setModal(null); setCompare(false); }}>进入显影</button>{activeResult.kind === 'result' && <button className="ss-soft" onClick={() => { setDeleteTarget(activeResult); setModal('delete'); }}>从本地库删除</button>}</div>}
        </>}
      </div>
    </div>}
  </section>;
}
