import { useEffect, useMemo, useState } from "react";
import { softCompanionClosed } from './domain/companionVisual.js';

const BASE_ASSET_URL = `${import.meta.env.BASE_URL}assets/expressions`;

export const companionExpressionAssets = {
  focus: `${BASE_ASSET_URL}/idle.png`,
  sleep: `${BASE_ASSET_URL}/blink.png`,
  happy: `${BASE_ASSET_URL}/happy.png`,
  sad: `${BASE_ASSET_URL}/sad.png`,
  alert: `${BASE_ASSET_URL}/angry.png`,
  think: `${BASE_ASSET_URL}/thinking.png`,
  listen: `${BASE_ASSET_URL}/listening.png`,
};

export function expressionAssetUrl(expressionId) {
  return companionExpressionAssets[expressionId] || companionExpressionAssets.focus;
}

export function CompanionFace({ expressionId = "focus", className = "", allowBlink = true, appearance = "classic", transparent = false, alt = "DeskMate 表情" }) {
  const [blinking, setBlinking] = useState(false);
  const source = useMemo(
    () => expressionAssetUrl(blinking ? "sleep" : expressionId),
    [blinking, expressionId],
  );

  useEffect(() => {
    setBlinking(false);
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let blinkTimer;
    let resetTimer;
    const clear = () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(resetTimer);
      setBlinking(false);
    };
    const schedule = () => {
      blinkTimer = window.setTimeout(() => {
        setBlinking(true);
        resetTimer = window.setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 150);
      }, 4200 + Math.round(Math.random() * 3600));
    };
    const restart = () => {
      clear();
      if (allowBlink && expressionId !== "sleep" && !motion?.matches && !document.hidden) schedule();
    };
    restart();
    motion?.addEventListener?.('change', restart);
    document.addEventListener('visibilitychange', restart);
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(resetTimer);
      motion?.removeEventListener?.('change', restart);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [allowBlink, expressionId]);

  if (appearance === 'soft') {
    const closed = softCompanionClosed(expressionId, blinking);
    return <span role="img" aria-label={alt} data-eye-state={closed ? 'closed' : 'open'} className={`companion-face companion-face--soft ${transparent ? 'companion-face--transparent' : ''} ${closed ? 'is-closed' : ''} ${blinking ? 'is-blinking' : ''} ${className}`.trim()}>
      <img className="soft-face-open" src={`${BASE_ASSET_URL}/soft/${transparent ? 'transparent-' : ''}open.png`} alt="" draggable="false" />
      <img className="soft-face-closed" src={`${BASE_ASSET_URL}/soft/${transparent ? 'transparent-' : ''}closed.png`} alt="" draggable="false" />
    </span>;
  }

  return (
    <span className={`companion-face ${blinking ? "is-blinking" : ""} ${className}`.trim()}>
      <img src={source} alt={alt} draggable="false" />
    </span>
  );
}
