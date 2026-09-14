import { useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconPlus, IconChevronLeft, IconChevronRight, IconDownload, IconX, IconLayoutGrid, IconInfoCircle, IconArrowsExchange, IconPhoto, IconCopy, IconHandClick, IconTrash } from '@tabler/icons-react';
import { useUnsavedChanges } from './domain/unsavedChanges.js';
import { STUDIO_SOURCE, STUDIO_DIAL, STUDIO_STYLES, STUDIO_EFFECTS, STUDIO_EFFECT_PARAMETERS, wrapStudioIndex, clampStudioStrength, clampStudioRadius, clampStudioDetail, studioPrompt, studioOrbit, studioScatter, clampStudioPosition, resolveStudioDraggedCard, studioKey, validStudioUpload } from './domain/styleStudio.js';
import { createStyleStudioDetentSound } from './domain/styleStudioDetentSound.js';
import { createStyleStudioMotionSound } from './domain/styleStudioMotionSound.js';
import { StyleStudioWheelRouter, styleStudioWheelStep } from './domain/styleStudioWheel.js';
import './style-studio.css';

const starter = { id: 'source', name: '生活中的我', image: STUDIO_SOURCE, sample: true };
const exampleResults = ['glass', 'paper', 'yarn'].map(id => ({ id: `example-${id}`, ...STUDIO_STYLES.find(s => s.id === id), sample: true, source: starter, strength: 65 }));
const bridge = () => window.desktopBridge;
function mediaUrl(bytes, mime, urls) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  urls.current.add(url);
  return url;
}
function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function Photo({ item, className = '', onClick, onDragStart, onDragEnd, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown, style, selected, caption }) {
  return <button type="button" className={`ss-photo ${className} ${selected ? 'is-selected' : ''}`} style={style} onClick={onClick} draggable={Boolean(onDragStart)} onDragStart={onDragStart} onDragEnd={onDragEnd} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onKeyDown={onKeyDown} aria-label={caption || item.name}>
    <img src={item.image} alt={item.name} draggable="false" /><span>{caption || item.name}</span>
  </button>;
}

function Reveal({ result, effect, radius, compare, detail, displayStrength, canvasRef }) {
  const localCanvas = useRef(null);
  const canvas = canvasRef || localCanvas;
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
      const processed = document.createElement('canvas');
      processed.width = processed.height = size;
      const pctx = processed.getContext('2d', { willReadFrequently: true });
      drawFit(transformed, pctx);
      if (effect > 0) {
        const sampleSize = Math.max(24, Math.min(88, Math.round(98 - detail * .72)));
        const small = document.createElement('canvas'); small.width = small.height = sampleSize;
        const c = small.getContext('2d', { willReadFrequently: true }); drawFit(transformed, c, small.width);
        const { data } = c.getImageData(0, 0, small.width, small.height);
        pctx.fillStyle = effect === 3 ? '#202832' : '#fbfbf9'; pctx.fillRect(0, 0, size, size);
        const step = size / small.width;
        for (let y = 0; y < small.height; y++) for (let x = 0; x < small.width; x++) {
          const i = (y * small.width + x) * 4;
          const luminance = (data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114) / 255;
          pctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
          if (effect === 1) { pctx.beginPath(); pctx.arc((x + .5) * step, (y + .5) * step, step * .42, 0, Math.PI * 2); pctx.fill(); }
          else if (effect === 2) pctx.fillRect(x * step, y * step, Math.ceil(step), Math.ceil(step));
          else if (effect === 3) { pctx.font = `${step}px monospace`; pctx.fillText(' .:-=+*#%@'[Math.min(9, Math.floor((1 - luminance) * 10))], x * step, (y + 1) * step); }
          else if (effect === 4) { pctx.fillStyle = luminance > .55 ? '#f6d7b1' : '#315a83'; pctx.fillRect(x * step, y * step, Math.ceil(step), Math.ceil(step)); }
          else { pctx.fillStyle = '#315a83'; pctx.fillRect(x * step, y * step + step / 2, step, Math.max(.5, (1 - luminance) * step * .7)); }
        }
      }
      if (displayStrength < 100 && effect > 0) {
        pctx.save(); pctx.globalAlpha = 1 - displayStrength / 100; drawFit(transformed, pctx); pctx.restore();
      }
      ctx.clearRect(0, 0, size, size);
      drawFit(compare ? original : processed);
      ctx.save(); ctx.beginPath(); ctx.arc(point.x * size, point.y * size, size * radius / 200, 0, Math.PI * 2); ctx.clip(); drawFit(compare ? processed : original); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(point.x * size, point.y * size, size * radius / 200, 0, Math.PI * 2); ctx.stroke();
    }).catch(() => {});
    return () => { active = false; };
  }, [result, effect, radius, compare, detail, displayStrength, point, canvas]);
  return <canvas ref={canvas} width={1000} height={1000} aria-label="移动鼠标查看圆形显影对比" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setPoint({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); }} />;
}

export function StyleStudioPage({ navigate, notify = () => {} }) {
  const [cursor, setCursor] = useState(0), [strength, setStrength] = useState(65), [adjusting, setAdjusting] = useState(false);
  const [materials, setMaterials] = useState([starter]), [source, setSource] = useState(starter), [results, setResults] = useState(exampleResults);
  const [mode, setMode] = useState('generate'), [modal, setModal] = useState(null), [activeResult, setActiveResult] = useState(exampleResults[1]);
  const [phase, setPhase] = useState('idle'), [compare, setCompare] = useState(false), [effect, setEffect] = useState(0), [radius, setRadius] = useState(42);
  const [displayStrength, setDisplayStrength] = useState(65), [detail, setDetail] = useState(42), [revealControl, setRevealControl] = useState('effect'), [revealConfirmed, setRevealConfirmed] = useState(false);
  const [modeSelecting, setModeSelecting] = useState(false), [modeChoice, setModeChoice] = useState('generate');
  const [organized, setOrganized] = useState(false), [brief, setBrief] = useState(''), [dragOver, setDragOver] = useState(false);
  const [orbitOpen, setOrbitOpen] = useState(false), [materialDrop, setMaterialDrop] = useState(false), [resultDrop, setResultDrop] = useState(false);
  const [materialPositions, setMaterialPositions] = useState({}), [resultPositions, setResultPositions] = useState({});
  const [ejectedResult, setEjectedResult] = useState(null), [progressSeconds, setProgressSeconds] = useState(0);
  const [insertPulse, setInsertPulse] = useState(false), [pullVisual, setPullVisual] = useState(null), [justPlacedId, setJustPlacedId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null), [trashOver, setTrashOver] = useState('');
  const [status, setStatus] = useState(''), [focused, setFocused] = useState(true), [hardwareLease, setHardwareLease] = useState('checking');
  const [provider, setProvider] = useState({ configured: false, available: Boolean(bridge()?.getStyleStudioStatus), active: false });
  const uploader = useRef(null), urls = useRef(new Set()), timer = useRef(null), orbitTimer = useRef(null), insertTimer = useRef(null), settleTimer = useRef(null), busy = useRef(false), alive = useRef(true), dialStart = useRef(null), dragOffset = useRef(null), activeRequest = useRef(''), leaseToken = useRef(`studio-${crypto.randomUUID()}`);
  const detentSound = useRef(null), motionSound = useRef(null), wheelRouter = useRef(null), pullState = useRef(null), suppressEjectClick = useRef(false), resultsRef = useRef(null), revealCanvas = useRef(null), keyboardKeymap = useRef(null), activeCardDrag = useRef(null);
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
      clearTimeout(orbitTimer.current);
      clearTimeout(insertTimer.current);
      clearTimeout(settleTimer.current);
      if (activeRequest.current) void api?.cancelStyleStudioImage?.(activeRequest.current);
      void api?.releaseStyleStudioInput?.(leaseToken.current);
      urls.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);
  useEffect(() => {
    if (modal !== 'progress') { setProgressSeconds(0); return undefined; }
    const startedAt = Date.now();
    const update = () => setProgressSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [modal]);
  useEffect(() => {
    const api = bridge();
    const acquire = async () => {
      setFocused(true); setHardwareLease('checking');
      const response = await api?.acquireStyleStudioInput?.(leaseToken.current);
      if (!alive.current) return;
      keyboardKeymap.current = Array.isArray(response?.config?.keymap) && response.config.keymap.length === 8 ? response.config.keymap : null;
      if (response?.keymapConfigured === false) setStatus('实体按键映射读取失败；旋钮仍可用，S 键暂用页面数字键测试。');
    };
    const blur = () => { setFocused(false); setHardwareLease('idle'); keyboardKeymap.current = null; setCompare(false); setOrbitOpen(false); clearTimeout(orbitTimer.current); void api?.releaseStyleStudioInput?.(leaseToken.current); };
    acquire();
    const unsubscribe = api?.onStyleStudioInput?.(event => {
      if (!document.hasFocus()) return;
      if (event?.command === 'hardware-lease-status') { setHardwareLease(event.state || 'checking'); return; }
      if (event?.command === 'blocked-host-action') { setStatus('本页已暂停原场景按键动作；离开后自动恢复。'); return; }
      if (event?.source === 'easyinput-wheel' && ['previous', 'next'].includes(event.command)) { wheelRouter.current?.accept(event.command === 'next' ? 1 : -1, 'native'); return; }
      if (event?.command) actions.current(event.command);
    });
    window.addEventListener('blur', blur); window.addEventListener('focus', acquire);
    return () => { unsubscribe?.(); window.removeEventListener('blur', blur); window.removeEventListener('focus', acquire); };
  }, []);
  function showOrbit(autoClose = true) {
    clearTimeout(orbitTimer.current);
    setOrbitOpen(true);
    if (autoClose) orbitTimer.current = setTimeout(() => { if (alive.current) setOrbitOpen(false); }, 1250);
  }
  function hideOrbit() { clearTimeout(orbitTimer.current); setOrbitOpen(false); }
  function showReveal() {
    setMode('reveal'); setModeSelecting(false); setModal(null); setCompare(false); setAdjusting(false); setRevealConfirmed(false); setRevealControl('effect');
    setStatus('显影：旋转选择方式，按下旋钮后调节圆窗与颗粒大小。');
  }
  function loadSourceIntoMachine(item, message = '素材已插入进片槽。') {
    if (!item || busy.current) return;
    setSource(item); setInsertPulse(false); clearTimeout(insertTimer.current);
    requestAnimationFrame(() => {
      if (!alive.current) return;
      setInsertPulse(true); void motionSound.current?.play('insert');
      insertTimer.current = setTimeout(() => { if (alive.current) setInsertPulse(false); }, 620);
    });
    setStatus(message);
  }
  function move(direction) {
    if (phase !== 'idle') return;
    if (modeSelecting) { setModeChoice(value => value === 'generate' ? 'reveal' : 'generate'); return; }
    if (mode === 'reveal' && adjusting) setDisplayStrength(n => clampStudioStrength(n + direction * 5));
    else if (mode === 'reveal' && (!revealConfirmed || revealControl === 'effect')) setEffect(i => wrapStudioIndex(i + direction, STUDIO_EFFECTS.length));
    else if (mode === 'reveal' && revealControl === 'window') setRadius(n => clampStudioRadius(n + direction * 4));
    else if (mode === 'reveal' && revealControl === 'detail') setDetail(n => clampStudioDetail(n + direction * 5));
    else if (adjusting) setStrength(n => clampStudioStrength(n + direction * 5));
    else { void detentSound.current?.play(direction); showOrbit(); setCursor(n => n + direction); }
  }
  function choose(index) { if (busy.current) return; setCursor(index); setAdjusting(false); hideOrbit(); setStatus(`已选择“${STUDIO_STYLES[index].name}”。`); }
  function generate() {
    if (busy.current) return;
    if (ejectedResult) { setStatus('请先把刚出片的作品拔出并拖到下方作品区。'); return; }
    hideOrbit();
    if (adjusting) { setAdjusting(false); return; }
    if (!source.sample) {
      if (!provider.available) { setStatus('当前是浏览器预览，需在 DeskMate 桌面软件中生成。'); return; }
      if (!provider.configured) { setStatus('请先在设置页保存 Image 2 API Key，再返回生成。'); return; }
      setModal('consent');
      return;
    }
    busy.current = true; setPhase('feeding'); setStatus('本地样片演示：进片、出片与查看流程');
    const result = { ...style, id: `result-${Date.now()}`, kind: 'sample-result', sample: true, source, strength };
    timer.current = setTimeout(() => {
      setPhase('printing'); setEjectedResult(result); setActiveResult(result);
      timer.current = setTimeout(() => { setPhase('idle'); busy.current = false; setStatus('样片已从出片口推出；向下拔出后拖到作品区。'); }, 1000);
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
    setStatus(`正在用“${frozen.style.name}”生成，本次照片将发送到已配置的 Image 2。`);
    try {
      const response = await api.generateStyleStudioImage({ requestId, sourceId: frozen.source.id, styleId: frozen.style.id, strength: frozen.strength, brief: frozen.brief, consent: true });
      if (!alive.current) return;
      if (!response.ok) { setStatus(response.reason || '风格作品生成失败，请稍后重试。'); setModal(null); return; }
      const result = { ...response.record, name: response.record.styleName || frozen.style.name, image: mediaUrl(response.bytes, response.record.mime, urls), source: frozen.source, sample: false };
      setEjectedResult(result); setActiveResult(result); setPhase('printing'); setModal(null);
      completed = true;
      timer.current = setTimeout(() => { if (!alive.current) return; setPhase('idle'); setStatus('作品已保存，并从出片口推出；向下拔出后拖到作品区。'); }, 900);
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
  async function upload(files, placement = null, insertIntoMachine = false) {
    if (importing.current || busy.current) { setStatus('请等待当前导入或出片完成后再添加素材。'); return; }
    importing.current = true;
    try {
    let remaining = 8 - materials.filter(item => !item.sample).length;
    let placementIndex = 0;
    let inserted = false;
    for (const file of Array.from(files || [])) {
      if (!remaining) { setStatus('本次最多放入 8 张素材。'); break; }
      if (!validStudioUpload(file)) { setStatus('请选择 10 MB 以内的 PNG、JPG 或 WebP 图片。'); continue; }
      const image = URL.createObjectURL(file); urls.current.add(image);
      try { const decoded = new Image(); decoded.src = image; await decoded.decode(); if (decoded.width * decoded.height > 40000000) throw new Error('oversize'); }
      catch { URL.revokeObjectURL(image); urls.current.delete(image); if (alive.current) setStatus('图片无法读取，或超过 4000 万像素。'); continue; }
      if (!alive.current) { URL.revokeObjectURL(image); urls.current.delete(image); return; }
      const api = bridge();
      if (!api?.importStyleStudioSource) { const item = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), image, sample: false }; setMaterials(items => [...items, item]); if (insertIntoMachine && !inserted) { loadSourceIntoMachine(item, '照片已插入机器；浏览器预览只保留到本次页面关闭。'); inserted = true; } else if (!insertIntoMachine) setSource(item); if (placement) setMaterialPositions(items => ({ ...items, [item.id]: clampStudioPosition({ x: placement.x + placementIndex * 4, y: placement.y + placementIndex * 3, tilt: (placementIndex % 3 - 1) * 4 }) })); placementIndex++; remaining--; setStatus(insertIntoMachine ? '照片已插入机器；浏览器预览只保留到本次页面关闭。' : '浏览器预览：素材只保留到本次页面关闭。'); continue; }
      const response = await api.importStyleStudioSource({ name: file.name.replace(/\.[^.]+$/, ''), mime: file.type, bytes: await file.arrayBuffer() });
      if (!alive.current) return;
      if (!response.ok) { URL.revokeObjectURL(image); urls.current.delete(image); setStatus(response.reason || '素材没有导入，请检查图片。'); continue; }
      const existing = materials.find(item => item.id === response.record.id);
      if (existing) { URL.revokeObjectURL(image); urls.current.delete(image); if (insertIntoMachine && !inserted) { loadSourceIntoMachine(existing, '这张素材已在本地库中，并已插入机器。'); inserted = true; } else setSource(existing); if (placement) setMaterialPositions(items => ({ ...items, [existing.id]: clampStudioPosition(placement) })); setStatus(insertIntoMachine ? '这张素材已在本地库中，并已插入机器。' : '这张素材已在本地素材库中。'); continue; }
      const item = { ...response.record, image, sample: false };
      setMaterials(items => [...items, item]); if (insertIntoMachine && !inserted) { loadSourceIntoMachine(item, '照片已保存到本地库，并插入机器。'); inserted = true; } else if (!insertIntoMachine) setSource(item); remaining--;
      if (placement) setMaterialPositions(items => ({ ...items, [item.id]: clampStudioPosition({ x: placement.x + placementIndex * 4, y: placement.y + placementIndex * 3, tilt: (placementIndex % 3 - 1) * 4 }) }));
      placementIndex++;
      setStatus(insertIntoMachine ? '照片已保存到本地库，并插入机器；确认生成后才会上传到 Image 2。' : '素材已保存到本地素材库；只有确认生成后才会上传到已配置的 Image 2 接口。');
    }
    } finally { importing.current = false; }
  }
  function beginCardDrag(event, kind, item) {
    if (busy.current) { event.preventDefault(); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
    const payload = { kind, id: item.id };
    activeCardDrag.current = payload;
    const value = JSON.stringify(payload);
    event.dataTransfer.setData('application/x-deskmate-studio-card', value);
    event.dataTransfer.setData(kind === 'material' ? 'application/x-deskmate-material' : 'application/x-deskmate-result', item.id);
    event.dataTransfer.effectAllowed = 'move';
  }
  function dropPosition(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = dragOffset.current || { x: 0, y: 0, width: 0, height: 0 };
    return clampStudioPosition({
      x: ((event.clientX - rect.left - offset.x + offset.width / 2) / rect.width) * 100,
      y: ((event.clientY - rect.top - offset.y + offset.height / 2) / rect.height) * 100,
      tilt: Math.round((((event.clientX - rect.left) / Math.max(1, rect.width)) - .5) * 10),
    });
  }
  function readDraggedCard(event) {
    return resolveStudioDraggedCard(event.dataTransfer, activeCardDrag.current);
  }
  function dragIntoMachine(event) {
    event.preventDefault();
    const payload = readDraggedCard(event);
    event.dataTransfer.dropEffect = payload?.kind === 'result' || payload?.kind === 'ejected' ? 'none' : 'copy';
    if (!busy.current) setDragOver(true);
  }
  function dropIntoMachine(event) {
    event.preventDefault(); event.stopPropagation(); setDragOver(false);
    if (busy.current) { setStatus('正在生成或出片，请稍后再放入照片。'); return; }
    const payload = readDraggedCard(event);
    if (payload?.kind === 'material') {
      const item = materials.find(material => material.id === payload.id);
      if (item) { dragOffset.current = null; activeCardDrag.current = null; loadSourceIntoMachine(item); return; }
    }
    if (!payload && event.dataTransfer.files?.length) { dragOffset.current = null; void upload(event.dataTransfer.files, null, true); return; }
    setStatus('机器进片口只接收上方素材或电脑里的图片。');
  }
  function clientPointInResults(clientX, clientY) {
    const rect = resultsRef.current?.getBoundingClientRect();
    if (!rect) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    return clampStudioPosition({
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
      tilt: Math.round((((clientX - rect.left) / Math.max(1, rect.width)) - .5) * 10),
    });
  }
  function placeEjected(item, point) {
    if (!item || !point) return false;
    setResults(items => items.some(value => value.id === item.id) ? items : [...items, item]);
    setEjectedResult(null);
    setResultPositions(items => ({ ...items, [item.id]: point }));
    setOrganized(false); setResultDrop(false); setJustPlacedId(item.id); clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => { if (alive.current) setJustPlacedId(''); }, 520);
    setStatus('作品已“啪”地拔出，并停在松手的位置；按“整理”可自动排齐。');
    return true;
  }
  function beginEjectPull(event, item) {
    if (phase !== 'idle' || !item) { setStatus('正在完成出片，请稍等一下再拔。'); return; }
    event.preventDefault();
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* synthetic QA and legacy Chromium */ }
    pullState.current = { id: item.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: 0, y: 0, moved: false, detached: false };
    suppressEjectClick.current = false;
    setPullVisual({ x: 0, y: 0, detached: false });
  }
  function moveEjectPull(event) {
    const state = pullState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    state.moved ||= Math.hypot(dx, dy) > 6;
    if (!state.detached && dy > 42) {
      state.detached = true;
      suppressEjectClick.current = true;
      void motionSound.current?.play('pull');
    }
    state.x = state.detached ? dx : dx * .22;
    state.y = Math.max(-3, dy);
    setPullVisual({ x: state.x, y: state.y, detached: state.detached });
    setResultDrop(Boolean(state.detached && clientPointInResults(event.clientX, event.clientY)));
  }
  function finishEjectPull(event) {
    const state = pullState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const item = ejectedResult;
    const point = state.detached ? clientPointInResults(event.clientX, event.clientY) : null;
    suppressEjectClick.current ||= state.moved;
    pullState.current = null; setPullVisual(null); setResultDrop(false);
    if (state.detached && point && item) placeEjected(item, point);
    else if (state.detached) setStatus('已经拔出一半；请拖到下方作品区再松手，照片会跟随鼠标落位。');
  }
  function cancelEjectPull() {
    pullState.current = null; setPullVisual(null); setResultDrop(false); suppressEjectClick.current = true;
  }
  function dropOnMaterials(event) {
    event.preventDefault(); setMaterialDrop(false);
    const payload = readDraggedCard(event);
    if (!payload && event.dataTransfer.files?.length) { dragOffset.current = null; const point = dropPosition(event); void upload(event.dataTransfer.files, point); return; }
    if (!payload) return;
    if (payload.kind !== 'material') { dragOffset.current = null; setStatus('作品仍保留在下方作品区；这里只接收原始素材。'); return; }
    const point = dropPosition(event); dragOffset.current = null;
    setMaterialPositions(items => ({ ...items, [payload.id]: point }));
    setStatus('素材位置已调整；拖到中间进片口即可设为当前原图。');
  }
  function dropOnResults(event) {
    event.preventDefault(); setResultDrop(false);
    const payload = readDraggedCard(event);
    if (!payload) return;
    if (!['result', 'ejected'].includes(payload.kind)) { dragOffset.current = null; setStatus('原图仍保留在上方素材区；作品区只摆放生成结果。'); return; }
    const point = dropPosition(event); dragOffset.current = null;
    if (payload.kind === 'ejected' && ejectedResult?.id === payload.id) {
      placeEjected(ejectedResult, point);
      return;
    }
    setResultPositions(items => ({ ...items, [payload.id]: point }));
    setOrganized(false);
    setStatus(payload.kind === 'ejected' ? '作品已拔出并放入作品区；可继续自由摆放。' : '作品已自由摆放；按“整理”可再次排齐。');
  }
  async function save() {
    if (!activeResult) return;
    try {
      let blob;
      let name = `deskmate-${activeResult.id}.png`;
      if (mode === 'reveal' && revealCanvas.current) {
        blob = await new Promise((resolve, reject) => revealCanvas.current.toBlob(value => value ? resolve(value) : reject(new Error('canvas-empty')), 'image/png'));
        name = `deskmate-reveal-${activeResult.id}-effect-${effect + 1}.png`;
      } else {
        const response = await fetch(activeResult.image); if (!response.ok) throw new Error(); blob = await response.blob();
      }
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(mode === 'reveal' ? '已请求保存当前显影画面，请查看下载目录或保存对话框。' : `已请求保存${activeResult.sample ? '样片' : '作品'}，请查看下载目录或保存对话框。`);
    }
    catch { setStatus('保存未完成，请重试。'); }
  }
  async function removeLocal(target = deleteTarget, kind = target?.kind, fromTrash = false) {
    if (!target) return;
    if (target.sample) {
      setStatus('预制样片固定保留，不占用你的本地素材或作品额度。');
      setTrashOver(''); setModal(null); setDeleteTarget(null); return;
    }
    const api = bridge();
    if (api?.removeStyleStudioMedia && ['source', 'result'].includes(target.kind)) {
      const response = await api.removeStyleStudioMedia({ id: target.id });
      if (!alive.current) return;
      if (!response?.ok) { setStatus(response?.reason || '没有删除，请稍后重试。'); setTrashOver(''); setModal(null); setDeleteTarget(null); return; }
    }
    if (kind === 'source') {
      setMaterials(items => items.filter(item => item.id !== target.id));
      setMaterialPositions(items => { const next = { ...items }; delete next[target.id]; return next; });
      if (source.id === target.id) setSource(starter);
    } else {
      setResults(items => items.filter(item => item.id !== target.id));
      setResultPositions(items => { const next = { ...items }; delete next[target.id]; return next; });
      if (ejectedResult?.id === target.id) setEjectedResult(null);
      if (activeResult?.id === target.id) setActiveResult(exampleResults[1]);
    }
    if (target.image) { URL.revokeObjectURL(target.image); urls.current.delete(target.image); }
    setStatus(`${fromTrash ? '已扔进垃圾桶并删除' : '已从本地库删除'}“${target.name}”。`); setTrashOver(''); setModal(null); setDeleteTarget(null);
  }
  function trashPayload(event, zone) {
    const payload = readDraggedCard(event);
    const valid = zone === 'material' ? payload?.kind === 'material' : ['result', 'ejected'].includes(payload?.kind);
    return valid ? payload : null;
  }
  function dragOverTrash(event, zone) {
    event.preventDefault(); event.stopPropagation();
    const payload = trashPayload(event, zone);
    event.dataTransfer.dropEffect = payload ? 'move' : 'none';
    setTrashOver(payload ? zone : '');
  }
  function dropOnTrash(event, zone) {
    event.preventDefault(); event.stopPropagation();
    const payload = trashPayload(event, zone); dragOffset.current = null; setTrashOver('');
    if (!payload) { setStatus(zone === 'material' ? '上方垃圾桶只接收素材。' : '下方垃圾桶只接收作品。'); return; }
    const item = zone === 'material' ? materials.find(value => value.id === payload.id) : payload.kind === 'ejected' ? ejectedResult : results.find(value => value.id === payload.id);
    if (item) void removeLocal(item, zone === 'material' ? 'source' : 'result', true);
  }
  function action(name) {
    if (name === 'close') {
      if (modal === 'progress') { void cancelGeneration(); return; }
      if (modal) { const returnAfterClose = modal === 'result'; setModal(null); setDeleteTarget(null); setCompare(false); if (returnAfterClose) navigate('dashboard'); return; }
      if (modeSelecting) { setModeSelecting(false); setStatus('已取消模式选择。'); return; }
      if (adjusting) { setAdjusting(false); setStatus('已退出当前强度调整。'); return; }
      hideOrbit(); setCompare(false); navigate('dashboard'); return;
    }
    if (modal && !['save', 'compare', 'view'].includes(name)) return;
    if (name === 'previous') move(-1);
    if (name === 'next') move(1);
    if (name === 'confirm') {
      if (modeSelecting) {
        setMode(modeChoice); setModeSelecting(false); setAdjusting(false); setCompare(false);
        if (modeChoice === 'reveal') { setRevealConfirmed(false); setRevealControl('effect'); }
        setStatus(modeChoice === 'reveal' ? '已进入显影：旋转选择一种画面效果。' : '已回到风格生成。');
      } else if (mode === 'reveal') {
        if (adjusting) { setAdjusting(false); setRevealControl(revealConfirmed ? 'window' : 'effect'); setStatus(`显示强度已设为 ${displayStrength}%。`); }
        else if (!revealConfirmed || revealControl === 'effect') { setRevealConfirmed(true); setRevealControl('window'); setStatus('效果已确认：旋转调节圆窗；再次按压切换颗粒参数。'); }
        else if (revealControl === 'window' && effect > 0) { setRevealControl('detail'); setStatus(`旋转调节${STUDIO_EFFECT_PARAMETERS[effect]}；再次按压重选效果。`); }
        else { setRevealConfirmed(false); setRevealControl('effect'); setStatus('重新选择显影效果。'); }
      } else if (adjusting) { setAdjusting(false); setStatus(`风格强度已设为 ${strength}%。`); }
      else generate();
    }
    if (name === 'strength') { hideOrbit(); setAdjusting(value => !value); setStatus(mode === 'reveal' ? 'S1 显示强度：旋转调节，按下确认。' : 'S1 风格强度：旋转调节，按下确认。'); }
    if (name === 'view') {
      if (!activeResult) return;
      if (modal === 'result') showReveal();
      else if (mode === 'reveal') { setModal('result'); setStatus('作品已放大；再按 S2 返回显影。'); }
      else { setCompare(false); setModal('result'); setStatus('作品已放大；再按 S2 缩小并进入显影。'); }
    }
    if (name === 'save') void save();
    if (name === 'compare') {
      if (!activeResult) return;
      if (mode === 'reveal') { setCompare(value => !value); setStatus('S5 已交换圆窗内外的原图与作品。'); }
      else { if (modal !== 'result') setModal('result'); setCompare(value => !value); setStatus('S5 对比原图与当前作品。'); }
    }
    if (name === 'inspiration') { if (mode === 'reveal') setMode('generate'); setBrief('保留主体轮廓，加入温柔的植物与自然光。'); setModal('prompt'); setStatus('已填入一条可编辑的本地灵感，不会自动发送请求。'); }
    if (name === 'reset' && !busy.current) { hideOrbit(); setCursor(0); setStrength(65); setDisplayStrength(65); setAdjusting(false); setEffect(0); setRadius(42); setDetail(42); setRevealConfirmed(false); setRevealControl('effect'); setCompare(false); setStatus('已重置风格与显影参数，素材和作品保留。'); }
    if (name === 'mode' && !busy.current) { hideOrbit(); setModeSelecting(true); setModeChoice(mode); setStatus('S8 模式选择：旋转选择“生成 / 显影”，按下旋钮确认。'); }
  }
  const actions = useRef(action); actions.current = action;
  if (!wheelRouter.current) wheelRouter.current = new StyleStudioWheelRouter(step => actions.current(step > 0 ? 'next' : 'previous'));
  useEffect(() => {
    const key = e => { const command = studioKey(e, keyboardKeymap.current); if (!command || !document.hasFocus()) return; e.preventDefault(); actions.current(command); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    detentSound.current = createStyleStudioDetentSound();
    motionSound.current = createStyleStudioMotionSound();
    const prime = () => { void detentSound.current?.prime(); void motionSound.current?.prime(); };
    const wheel = event => {
      if (!document.hasFocus() || event.defaultPrevented || event.target?.closest?.('input, textarea, .ss-overlay')) return;
      const step = styleStudioWheelStep(event);
      if (!step) return;
      event.preventDefault();
      wheelRouter.current?.accept(step, 'dom');
    };
    window.addEventListener('pointerdown', prime, true);
    window.addEventListener('keydown', prime, true);
    window.addEventListener('wheel', wheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('pointerdown', prime, true);
      window.removeEventListener('keydown', prime, true);
      window.removeEventListener('wheel', wheel, true);
      wheelRouter.current?.reset();
      void detentSound.current?.close();
      void motionSound.current?.close();
      detentSound.current = null;
      motionSound.current = null;
    };
  }, []);
  const keyItems = [['strength','强度'],['view','查看/显影'],['save','保存'],['close','收起'],['compare','对比'],['inspiration','灵感'],['reset','重置'],['mode','模式']];
  return <section className="style-studio" aria-label="风格映像">
    <header className="ss-toolbar"><button className="ss-back" onClick={() => navigate('dashboard')}><IconArrowLeft size={18} />返回工作台</button><div className={`ss-tabs ${modeSelecting ? 'is-choosing' : ''}`} role="tablist" aria-label="创作模式">{[['generate','生成'],['reveal','显影']].map(([id,label]) => <button role="tab" aria-selected={(modeSelecting ? modeChoice : mode) === id} key={id} disabled={phase !== 'idle'} onClick={() => { if (!busy.current) { setMode(id); setModeChoice(id); setModeSelecting(false); setAdjusting(false); if (id === 'reveal') { setRevealConfirmed(false); setRevealControl('effect'); } } }}>{label}</button>)}</div><div className="ss-mode"><IconInfoCircle size={16} /><span>{focused ? '本页按键模式' : '按键已恢复'}<small>{!focused ? '回到本页重新接管' : hardwareLease === 'active' ? '旋钮按压＝确认/生图 · 离开或失焦自动恢复' : hardwareLease === 'unsupported' ? '旋钮按压需新版固件 · 离开或失焦自动恢复' : '正在连接旋钮按压 · 离开或失焦自动恢复'}</small></span><span className="ss-badge">{provider.configured ? 'Image 2 已配置' : provider.available ? 'Image 2 未配置' : '浏览器预览'}</span></div></header>
    {mode === 'generate' ? <div className={`ss-stage ${phase}`}>
      <div className="ss-material-heading"><h2>素材</h2><p>放入照片，开启风格之旅</p><div className="ss-heading-actions"><button className="ss-soft" disabled={phase !== 'idle'} onClick={() => uploader.current.click()}><IconPlus size={17} />添加照片</button><button className={`ss-trash ${trashOver === 'material' ? 'is-over' : ''}`} aria-label="删除素材" onClick={() => setStatus('把不需要的素材拖到这个垃圾桶即可删除。')} onDragEnter={e => dragOverTrash(e, 'material')} onDragOver={e => dragOverTrash(e, 'material')} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setTrashOver(''); }} onDrop={e => dropOnTrash(e, 'material')}><IconTrash size={17} /><span>删除素材</span></button></div><small>可从电脑拖入，也可自由摆放</small></div>
      <input ref={uploader} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
      <div className={`ss-materials ${materialDrop ? 'is-file-over' : ''}`} aria-label="素材自由摆放区" onDragEnter={e => { if (e.dataTransfer.types?.includes('Files')) setMaterialDrop(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setMaterialDrop(false); }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = readDraggedCard(e)?.kind === 'result' ? 'none' : 'move'; }} onDrop={dropOnMaterials}>
        {materials.map((item,index) => { const position = materialPositions[item.id] || studioScatter(index, 'material'); return <Photo key={item.id} item={item} selected={source.id === item.id} onClick={() => { if (!busy.current) loadSourceIntoMachine(item); }} onDragStart={e => beginCardDrag(e, 'material', item)} onDragEnd={() => { dragOffset.current = null; activeCardDrag.current = null; setDragOver(false); setTrashOver(''); }} style={{ '--x': `${position.x}%`, '--y': `${position.y}%`, '--tilt': `${position.tilt}deg`, '--z': source.id === item.id ? 4 : 2 + index }} />; })}
      </div>
      <div className={`ss-inlet ${dragOver ? 'is-over' : ''} ${insertPulse ? 'is-inserting' : ''}`} onDragEnter={dragIntoMachine} onDragOver={dragIntoMachine} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }} onDrop={dropIntoMachine}>
        <Photo item={source} className="ss-loaded" onClick={() => setModal('source')} /><span className="ss-slot-label">{dragOver ? '松开放入' : '原图进片口'}</span>
      </div>
      <div className={`ss-machine ${adjusting ? 'is-adjusting' : ''} ${dragOver ? 'is-receiving' : ''} ${insertPulse ? 'is-inserting' : ''}`} aria-label="风格映像机器，可拖入素材" onDragEnter={dragIntoMachine} onDragOver={dragIntoMachine} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }} onDrop={dropIntoMachine}>
        <div className="ss-description"><span className="ss-eyebrow"><IconPhoto size={15} />风格映像</span><h1>{adjusting ? '调整风格强度' : style.name}</h1><p>{adjusting ? '旋转调节，按下旋钮确认。' : style.description}</p><button className="ss-outline" onClick={() => setModal('prompt')}>查看提示词<IconChevronRight size={15} /></button></div>
        <img className="ss-style-preview" src={style.image} alt={`${style.name}预制样片`} />
        <div className="ss-control">
          <label className="ss-strength">风格强度 <strong>{strength}%</strong><input aria-label="风格强度" type="range" min="0" max="100" value={strength} disabled={phase !== 'idle'} onChange={e => setStrength(Number(e.target.value))} /></label>
          {orbitOpen && !adjusting && <div className="ss-orbit" aria-label="围绕旋钮选择风格">
            {STUDIO_STYLES.map((item,index) => { const pos = studioOrbit(index, cursor); return <Photo key={item.id} item={item} selected={item.id === style.id} onClick={() => choose(index)} style={{ '--ox': `${pos.x}px`, '--oy': `${pos.y}px`, '--scale': pos.scale, '--opacity': pos.opacity, '--tilt': `${pos.angle}deg`, '--delay': `${index * 24}ms`, zIndex: pos.z }} />; })}
          </div>}
          <div className="ss-dial-row"><button aria-label="上一个风格" className="ss-step" onClick={() => move(-1)}><IconChevronLeft size={17} /></button><button className="ss-dial" aria-label={adjusting ? '按压旋钮确认强度' : '旋转选择风格，按压旋钮生成'} disabled={phase !== 'idle'} onClick={() => action('confirm')} onPointerDown={e => { dialStart.current = { start: e.clientX, last: e.clientX, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { const drag = dialStart.current; if (!drag || Math.abs(e.clientX - drag.last) < 22) return; drag.moved = true; showOrbit(false); move(e.clientX > drag.last ? 1 : -1); drag.last = e.clientX; }} onPointerUp={() => { if (dialStart.current?.moved) { dialStart.current = 'dragged'; showOrbit(); } else dialStart.current = null; }} onClickCapture={e => { if (dialStart.current === 'dragged') { e.stopPropagation(); dialStart.current = null; } }}><img src={STUDIO_DIAL} alt="" draggable="false" style={{ transform: `rotate(${adjusting ? strength * 2.7 : cursor * 36}deg)` }} /></button><button aria-label="下一个风格" className="ss-step" onClick={() => move(1)}><IconChevronRight size={17} /></button></div>
          <button className="ss-press-action" disabled={phase !== 'idle'} onClick={() => action('confirm')}><IconHandClick size={14} stroke={1.8} />{phase !== 'idle' ? '正在出片' : adjusting ? '按压确认强度' : ejectedResult ? '先收好作品' : '按压旋钮生图'}</button>
        </div>
      </div>
      {ejectedResult && <div className={`ss-eject-slot ${pullVisual?.detached ? 'is-pulling-card' : ''}`} aria-label="作品出片口">
        <Photo item={ejectedResult} className={`ss-ejected-card ${pullVisual ? 'is-pulling' : ''} ${pullVisual?.detached ? 'is-detached' : ''}`} style={pullVisual ? { '--pull-x': `${pullVisual.x}px`, '--pull-y': `${pullVisual.y}px` } : undefined} caption={`向下拔出 · ${ejectedResult.name}`} onClick={e => { if (suppressEjectClick.current) { e.preventDefault(); suppressEjectClick.current = false; return; } setActiveResult(ejectedResult); setCompare(false); setModal('result'); }} onPointerDown={e => beginEjectPull(e, ejectedResult)} onPointerMove={moveEjectPull} onPointerUp={finishEjectPull} onPointerCancel={cancelEjectPull} onDragStart={e => beginCardDrag(e, 'ejected', ejectedResult)} onDragEnd={() => { dragOffset.current = null; activeCardDrag.current = null; setResultDrop(false); setTrashOver(''); }} />
        <span>{pullVisual?.detached ? '保持拖动，放进作品区' : '按住照片向下拔出'}</span>
      </div>}
      <div className="ss-output-heading"><div><h2>作品</h2><p>从出片口拔出后可自由摆放，按整理自动排齐</p></div><div className="ss-heading-actions"><button className={`ss-trash ${trashOver === 'result' ? 'is-over' : ''}`} aria-label="删除作品" onClick={() => setStatus('把不需要的作品拖到这个垃圾桶即可删除。')} onDragEnter={e => dragOverTrash(e, 'result')} onDragOver={e => dragOverTrash(e, 'result')} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setTrashOver(''); }} onDrop={e => dropOnTrash(e, 'result')}><IconTrash size={17} /><span>删除作品</span></button><button className="ss-soft" aria-pressed={organized} onClick={() => { setOrganized(true); setStatus('作品已整理并排齐；再次拖动即可恢复自由摆放。'); }}><IconLayoutGrid size={17} />整理</button></div></div>
      <div ref={resultsRef} className={`ss-results ${organized ? 'is-organized' : ''} ${resultDrop ? 'is-drop-target' : ''}`} aria-label="作品自由摆放区" onDragEnter={e => { const payload = readDraggedCard(e); if (payload && ['result','ejected'].includes(payload.kind)) setResultDrop(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setResultDrop(false); }} onDragOver={e => { e.preventDefault(); const payload = readDraggedCard(e); e.dataTransfer.dropEffect = payload?.kind === 'material' ? 'none' : 'move'; if (payload && ['result','ejected'].includes(payload.kind)) setResultDrop(true); }} onDrop={dropOnResults}>
        {results.map((item,index) => { const position = resultPositions[item.id] || studioScatter(index, 'result'); return <Photo key={item.id} item={item} className={justPlacedId === item.id ? 'is-just-placed' : ''} onClick={() => { setActiveResult(item); setCompare(false); setModal('result'); }} onDragStart={e => beginCardDrag(e, 'result', item)} onDragEnd={() => { dragOffset.current = null; activeCardDrag.current = null; setResultDrop(false); setTrashOver(''); }} style={organized ? { '--tilt': '0deg' } : { '--x': `${position.x}%`, '--y': `${position.y}%`, '--tilt': `${position.tilt}deg`, '--z': 2 + index }} />; })}
      </div>
    </div> : <div className="ss-reveal"><div className="ss-reveal-heading"><h2>显影实验室</h2><button className="ss-soft" onClick={() => { setCompare(value => !value); setStatus('已交换圆窗内外的原图与作品。'); }}><IconArrowsExchange size={17} />交换内外</button></div><p>{activeResult?.sample ? '本地样片' : '本地生成作品'} · 先旋转选择效果，按下确认，再连续调节圆窗与颗粒</p><div className="ss-reveal-frame"><Reveal result={activeResult} effect={effect} radius={radius} compare={compare} detail={detail} displayStrength={displayStrength} canvasRef={revealCanvas} /><span className="ss-inside-label">圆窗内 · {compare ? '显影作品' : '原图'}</span><span className="ss-outside-label">圆窗外 · {compare ? '原图' : '显影作品'}</span></div><div className="ss-reveal-readout"><strong>{STUDIO_EFFECTS[effect]}</strong><span>{adjusting ? `S1 显示强度 ${displayStrength}%` : !revealConfirmed ? '旋转选择 · 按压确认' : revealControl === 'window' ? `圆窗大小 ${radius}%` : `${STUDIO_EFFECT_PARAMETERS[effect]} ${detail}%`}</span></div>{revealConfirmed ? <div className="ss-reveal-controls"><button aria-pressed={revealControl === 'window'} onClick={() => { setAdjusting(false); setRevealControl('window'); }}>窗口大小</button><button disabled={effect === 0} aria-pressed={revealControl === 'detail'} onClick={() => { setAdjusting(false); setRevealControl('detail'); }}>{STUDIO_EFFECT_PARAMETERS[effect]}</button><button onClick={() => { setAdjusting(false); setRevealConfirmed(false); setRevealControl('effect'); setStatus('重新选择显影效果。'); }}>重选模式</button></div> : <button type="button" className="ss-reveal-select-cue" onClick={() => action('confirm')}>旋转旋钮浏览 6 种方式，按下或点击进入参数调节</button>}<label className="ss-radius">{revealControl === 'detail' && effect > 0 ? STUDIO_EFFECT_PARAMETERS[effect] : adjusting ? '显示强度' : '圆窗大小'} {revealControl === 'detail' && effect > 0 ? detail : adjusting ? displayStrength : radius}%<input aria-label={revealControl === 'detail' && effect > 0 ? STUDIO_EFFECT_PARAMETERS[effect] : adjusting ? '显示强度' : '圆窗大小'} type="range" min={adjusting ? 0 : 10} max={adjusting ? 100 : 90} value={revealControl === 'detail' && effect > 0 ? detail : adjusting ? displayStrength : radius} onChange={e => { const value = Number(e.target.value); if (revealControl === 'detail' && effect > 0) setDetail(value); else if (adjusting) setDisplayStrength(value); else setRadius(value); }} /></label><div className="ss-effects">{STUDIO_EFFECTS.map((name,index) => <button key={name} aria-pressed={effect === index} onClick={() => { setEffect(index); setAdjusting(false); setRevealConfirmed(true); setRevealControl('window'); setStatus(`已选择“${name}”，旋转调节圆窗。`); }}><img src={activeResult.image} alt="" />{name}</button>)}</div></div>}
    <footer className="ss-footer"><p role="status">{status || '旋转选择风格 · 点击或用已映射的旋钮按压生图 · S2 查看/显影。'}</p><div className="ss-keys" aria-label="页面按键预览">{keyItems.map(([id,name],index) => <button key={id} onClick={() => action(id)} title={`S${index + 1}：${name}`} className={(id === 'strength' && adjusting) || (id === 'mode' && modeSelecting) ? 'is-selected' : ''}>S{index + 1}<small>{name}</small></button>)}</div></footer>
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
          <h2>用 Image 2 生成“{style.name}”作品？</h2>
          <p>仅这一次：所选照片会发送到你配置的 Image 2 兼容接口。结果完成后会保存到本机作品库，再从出片口推出；打开页面和预览不会上传。</p>
          <div className="ss-consent-preview"><img src={source.image} alt={source.name} /><span>{source.name}<small>风格强度 {strength}%</small></span></div>
          <div className="ss-dialog-actions"><button className="ss-primary" onClick={() => void generateReal()}>确认上传并生成</button><button className="ss-soft" onClick={() => setModal(null)}>取消</button></div>
        </> : modal === 'progress' ? <>
          <span className="ss-spinner" aria-hidden="true" />
          <h2>Image 2 正在显影“{style.name}”</h2><strong className="ss-progress-time">{formatElapsed(progressSeconds)}</strong><p>通常需要数分钟，本次最长等待 20 分钟。成功后会自动保存，并从中间出片口推出。为避免重复扣费，网络结果不确定时不会自动重试。</p>
          <button autoFocus className="ss-soft" onClick={() => void cancelGeneration()}>取消本次生成</button>
        </> : modal === 'delete' && deleteTarget ? <>
          <span className="ss-eyebrow"><IconInfoCircle size={16} />本地库管理</span>
          <h2>删除“{deleteTarget.name}”？</h2>
          <p>{deleteTarget.kind === 'source' ? '素材有生成作品时会被保护；请先删除对应作品。删除后，本机保存的图片无法从风格映像中恢复。' : '删除后，本机作品库中的这张图片无法恢复。已另行下载的副本不受影响。'}</p>
          <div className="ss-consent-preview"><img src={deleteTarget.image} alt={deleteTarget.name} /><span>{deleteTarget.name}<small>{deleteTarget.kind === 'source' ? '本地素材' : '本地生成作品'}</small></span></div>
          <div className="ss-dialog-actions"><button className="ss-primary" onClick={() => void removeLocal()}>确认删除</button><button className="ss-soft" onClick={() => { setModal(null); setDeleteTarget(null); }}>取消</button></div>
        </> : <>
          {modal === 'result' && compare ? <div className="ss-compare-pair"><figure><img src={activeResult.source.image} alt={`${activeResult.source.name}原图`} /><figcaption>原图</figcaption></figure><figure><img src={activeResult.image} alt={`${activeResult.name}作品`} /><figcaption>作品</figcaption></figure></div> : modal === 'result' ? <button type="button" className="ss-enlarged-action" aria-label={`进入“${activeResult.name}”显影编辑`} title="再次点击进入显影" onClick={showReveal}><img className="ss-enlarged" src={activeResult.image} alt={activeResult.name} /></button> : <img className="ss-enlarged" src={source.image} alt={source.name} />}
          <h3>{modal === 'source' ? source.name : `${activeResult.name} · ${activeResult.sample ? '预制样片' : '本地生成作品'}`}</h3>
          {modal === 'source' && source.kind === 'source' && <div className="ss-dialog-actions"><button className="ss-soft" onClick={() => { setDeleteTarget(source); setModal('delete'); }}>从本地库删除</button></div>}
          {modal === 'result' && <div className="ss-dialog-actions"><button className="ss-primary" onClick={() => void save()}><IconDownload size={18} />保存{activeResult.sample ? '样片' : '作品'}</button><button className="ss-soft" onClick={() => setCompare(v => !v)}>{compare ? '收起对比' : '并排对比原图'}</button><button className="ss-soft" onClick={showReveal}>进入显影</button>{activeResult.kind === 'result' && <button className="ss-soft" onClick={() => { setDeleteTarget(activeResult); setModal('delete'); }}>从本地库删除</button>}</div>}
        </>}
      </div>
    </div>}
  </section>;
}
