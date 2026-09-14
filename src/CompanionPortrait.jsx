import { useEffect, useRef, useState } from 'react';
import { createCompanionVideoPlayer } from './domain/companionVideo.js';

const BASE = `${import.meta.env.BASE_URL}assets/companion/home-video`;

export function CompanionPortrait({ videoState = 'idle' }) {
  const element = useRef(null), first = useRef(null), second = useRef(null), player = useRef(null);
  const [status, setStatus] = useState({ state: 'idle', error: false });
  const [posterFailed, setPosterFailed] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let visible = typeof IntersectionObserver !== 'function';
    let focused = true;
    const controller = createCompanionVideoPlayer({ videos: [first.current, second.current], baseUrl: BASE, onStatus: setStatus });
    player.current = controller;
    const refresh = () => controller.setVisible(visible && focused && !document.hidden && !motion?.matches);
    const focus = () => { focused = true; refresh(); };
    const blur = () => { focused = false; refresh(); };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); refresh(); }) : null;
    observer?.observe(element.current);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', focus); window.addEventListener('blur', blur);
    motion?.addEventListener?.('change', refresh);
    refresh();
    return () => {
      controller.dispose(); player.current = null;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', focus); window.removeEventListener('blur', blur);
      motion?.removeEventListener?.('change', refresh);
    };
  }, []);
  useEffect(() => { player.current?.setState(videoState); }, [videoState]);
  return <div ref={element} className="companion-portrait" data-video-state={status.state} aria-label="居家陪伴人物 · 非实时口型">
    {posterFailed ? <span className="companion-portrait__fallback">人物画面暂不可用，语音功能不受影响</span> : <img className="companion-portrait__base" src={`${BASE}/poster.jpg`} alt="居家陪伴画面" draggable="false" onError={() => setPosterFailed(true)} />}
    <video ref={first} muted loop playsInline preload="none" aria-hidden="true" />
    <video ref={second} muted loop playsInline preload="none" aria-hidden="true" />
    {status.error && <button className="companion-portrait__retry" onClick={() => { setPosterFailed(false); player.current?.retry(); }}>画面加载失败，点击重试（语音不受影响）</button>}
  </div>;
}
