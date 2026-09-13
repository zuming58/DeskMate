import { useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconPlus, IconChevronLeft, IconChevronRight, IconDownload, IconX, IconLayoutGrid, IconInfoCircle, IconArrowsExchange, IconPhoto, IconCopy } from '@tabler/icons-react';
import { useUnsavedChanges } from './domain/unsavedChanges.js';
import { STUDIO_SOURCE, STUDIO_DIAL, STUDIO_STYLES, STUDIO_EFFECTS, wrapStudioIndex, clampStudioStrength, studioPrompt, studioOrbit, studioKey, validStudioUpload } from './domain/styleStudio.js';
import './style-studio.css';

const starter = { id: 'source', name: '生活中的我', image: STUDIO_SOURCE, sample: true };
const exampleResults = ['glass', 'paper', 'yarn'].map(id => ({ id: `example-${id}`, ...STUDIO_STYLES.find(s => s.id === id), sample: true, source: starter, strength: 65 }));
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
  const [status, setStatus] = useState(''), [focused, setFocused] = useState(true);
  const uploader = useRef(null), urls = useRef(new Set()), timer = useRef(null), busy = useRef(false), wheelAt = useRef(0), alive = useRef(true), dialStart = useRef(null);
  const style = STUDIO_STYLES[wrapStudioIndex(cursor)];
  const importing = useRef(false);
  useUnsavedChanges(materials.some(item => !item.sample) || Boolean(brief.trim()));
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); urls.current.forEach(url => URL.revokeObjectURL(url)); }; }, []);
  useEffect(() => { const blur = () => { setFocused(false); setCompare(false); }; const focus = () => setFocused(true); window.addEventListener('blur', blur); window.addEventListener('focus', focus); return () => { window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); }; }, []);
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
    if (!source.sample) { setStatus('这张照片已放入。真实 AI 出图尚未接入，不会用样片冒充你的生成结果。'); return; }
    busy.current = true; setPhase('feeding'); setStatus('本地样片演示：进片、出片与查看流程');
    const result = { ...style, id: `result-${Date.now()}`, sample: true, source, strength };
    timer.current = setTimeout(() => {
      setPhase('printing'); setResults(items => [...items, result]); setActiveResult(result);
      timer.current = setTimeout(() => { setPhase('idle'); busy.current = false; setModal('result'); }, 1000);
    }, 650);
  }
  async function upload(files) {
    if (importing.current || busy.current) { setStatus('请等待当前导入或出片完成后再添加素材。'); return; }
    importing.current = true;
    try {
    let remaining = 8 - materials.length;
    for (const file of Array.from(files || [])) {
      if (!remaining) { setStatus('本次最多放入 8 张素材。'); break; }
      if (!validStudioUpload(file)) { setStatus('请选择 15 MB 以内的 PNG、JPG 或 WebP 图片。'); continue; }
      const image = URL.createObjectURL(file); urls.current.add(image);
      try { const decoded = new Image(); decoded.src = image; await decoded.decode(); if (decoded.width * decoded.height > 40000000) throw new Error('oversize'); }
      catch { URL.revokeObjectURL(image); urls.current.delete(image); if (alive.current) setStatus('图片无法读取，或超过 4000 万像素。'); continue; }
      if (!alive.current) { URL.revokeObjectURL(image); urls.current.delete(image); return; }
      const item = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), image, sample: false };
      setMaterials(items => [...items, item]); setSource(item); remaining--;
      setStatus('素材仅在本次页面中预览，不上传；离开前会提醒。AI 接入后可生成自己的风格作品。');
    }
    } finally { importing.current = false; }
  }
  async function save() {
    if (!activeResult) return;
    try { const response = await fetch(activeResult.image); if (!response.ok) throw new Error(); const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `deskmate-${activeResult.id}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('已请求保存样片，请查看下载目录或保存对话框。'); }
    catch { setStatus('保存未完成，请重试。'); }
  }
  function action(name) {
    if (name === 'close') { setModal(null); setAdjusting(false); setCompare(false); return; }
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
    const release = e => { if (e.code === 'Digit5') setCompare(false); };
    window.addEventListener('keydown', key); window.addEventListener('keyup', release);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', release); };
  }, []);
  const keyItems = [['strength','强度'],['view','查看'],['save','保存'],['close','收起'],['compare','对比'],['inspiration','灵感'],['reset','重置'],['mode','模式']];
  const wheel = e => { if (Math.abs(e.deltaY) < 2 || Date.now() - wheelAt.current < 110) return; wheelAt.current = Date.now(); move(e.deltaY > 0 ? 1 : -1); };
  return <section className="style-studio" aria-label="风格映像">
    <header className="ss-toolbar"><button className="ss-back" onClick={() => navigate('dashboard')}><IconArrowLeft size={18} />返回工作台</button><div className="ss-tabs" role="tablist" aria-label="创作模式">{[['generate','生成'],['reveal','显影']].map(([id,label]) => <button role="tab" aria-selected={mode === id} key={id} disabled={phase !== 'idle'} onClick={() => { if (!busy.current) setMode(id); }}>{label}</button>)}</div><div className="ss-mode"><IconInfoCircle size={16} /><span>{focused ? '键盘预览模式' : '按键已暂停'}<small>硬件接管待接入</small></span><span className="ss-badge">本地演示</span></div></header>
    {mode === 'generate' ? <div className={`ss-stage ${phase}`}>
      <div className="ss-material-heading"><h2>素材</h2><p>放入照片，开启风格之旅</p><button className="ss-soft" disabled={phase !== 'idle'} onClick={() => uploader.current.click()}><IconPlus size={17} />添加照片</button><small>点击或拖入 · 本次页面预览</small></div>
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
          <div className="ss-dial-row"><button aria-label="上一个风格" className="ss-step" onClick={() => move(-1)}><IconChevronLeft size={17} /></button><button className="ss-dial" aria-label={adjusting ? '确认强度' : '按下旋钮演示出片'} disabled={phase !== 'idle'} onClick={generate} onWheel={wheel} onPointerDown={e => { dialStart.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { if (dialStart.current !== null && Math.abs(e.clientX - dialStart.current) > 22) { move(e.clientX > dialStart.current ? 1 : -1); dialStart.current = 'dragged'; } else dialStart.current = null; }} onClickCapture={e => { if (dialStart.current === 'dragged') { e.stopPropagation(); dialStart.current = null; } }}><img src={STUDIO_DIAL} alt="" draggable="false" style={{ transform: `rotate(${adjusting ? strength * 2.7 : cursor * 36}deg)` }} /></button><button aria-label="下一个风格" className="ss-step" onClick={() => move(1)}><IconChevronRight size={17} /></button></div>
          <button className="ss-primary" disabled={phase !== 'idle'} onClick={generate}>{phase !== 'idle' ? '正在出片…' : adjusting ? '确认强度' : source.sample ? '演示出片' : 'AI 出图待接入'}</button>
        </div>
      </div>
      <div className="ss-output-heading"><div><h2>作品</h2><p>预制样片 · 非当前照片生成</p></div><button className="ss-soft" onClick={() => setOrganized(v => !v)}><IconLayoutGrid size={17} />{organized ? '自由排列' : '整理'}</button></div>
      <div className={`ss-results ${organized ? 'is-organized' : ''}`} aria-label="作品区" onDragOver={e => e.preventDefault()} onDrop={e => e.preventDefault()}>
        {results.map((item,index) => <Photo key={item.id} item={item} className={index === results.length - 1 && phase === 'printing' ? 'ss-ejecting' : ''} onClick={() => { setActiveResult(item); setCompare(false); setModal('result'); }} onDragStart={e => { e.dataTransfer.setData('application/x-deskmate-result', item.id); e.dataTransfer.effectAllowed = 'move'; }} style={{ '--tilt': `${organized ? 0 : index % 2 ? 4 : -7}deg` }} />)}
      </div>
    </div> : <div className="ss-reveal"><div className="ss-reveal-heading"><h2>显影实验室</h2><button className="ss-soft" onClick={() => setCompare(v => !v)}><IconArrowsExchange size={17} />{compare ? '返回作品' : '查看原图'}</button></div><p>本地样片 · 移动圆窗，探索不同的画面语言</p><Reveal result={activeResult} effect={effect} radius={radius} compare={compare} /><label className="ss-radius">圆窗大小 {radius}%<input aria-label="圆窗大小" type="range" min="10" max="90" value={radius} onChange={e => setRadius(Number(e.target.value))} /></label><div className="ss-effects">{STUDIO_EFFECTS.map((name,index) => <button key={name} aria-pressed={effect === index} onClick={() => setEffect(index)}><img src={activeResult.image} alt="" />{name}</button>)}</div></div>}
    <footer className="ss-footer"><p role="status">{status || '旋转选风格 · 按下演示出片。可用方向键、回车及数字 1–8 体验。'}</p><div className="ss-keys" aria-label="页面按键预览">{keyItems.map(([id,name],index) => <button key={id} onClick={() => action(id)} title={`数字 ${index + 1}：${name}`} className={id === 'strength' && adjusting ? 'is-selected' : ''}>S{index + 1}<small>{name}</small></button>)}</div></footer>
    {modal && <div className="ss-overlay" onPointerDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className={`ss-dialog ${modal === 'prompt' ? 'ss-prompt-dialog' : ''}`} role="dialog" aria-modal="true" aria-label={modal === 'prompt' ? '风格提示词' : '图片预览'} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setModal(null); } if (e.key === 'Tab') { const nodes = [...e.currentTarget.querySelectorAll('button,input,textarea')].filter(el => !el.disabled); const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}><button autoFocus className="ss-close" aria-label="关闭预览" onClick={() => setModal(null)}><IconX size={22} /></button>
      {modal === 'prompt' ? <><h2>{style.name}</h2><p>提示词模板 · AI 接入后用于图生图</p><label>创意补充<textarea value={brief} maxLength={1000} onChange={e => setBrief(e.target.value)} placeholder="可选：希望保留哪些特征？" /></label><pre>{studioPrompt(style, strength, brief)}</pre><button className="ss-primary" onClick={async () => { try { await navigator.clipboard.writeText(studioPrompt(style, strength, brief)); notify('提示词已复制'); } catch { setStatus('剪贴板不可用，请手动选择提示词复制。'); } }}><IconCopy size={17} />复制提示词</button></> : <><img className="ss-enlarged" src={modal === 'source' ? source.image : compare ? activeResult.source.image : activeResult.image} alt={modal === 'source' ? source.name : activeResult.name} /><h3>{modal === 'source' ? source.name : `${activeResult.name} · 预制样片`}</h3>{modal === 'result' && <div className="ss-dialog-actions"><button className="ss-primary" onClick={save}><IconDownload size={18} />保存样片</button><button className="ss-soft" onClick={() => setCompare(v => !v)}>{compare ? '查看作品' : '对比原图'}</button><button className="ss-soft" onClick={() => { setMode('reveal'); setModal(null); setCompare(false); }}>进入显影</button></div>}</>}
    </div></div>}
  </section>;
}
