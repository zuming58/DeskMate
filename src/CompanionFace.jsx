import { useEffect, useMemo, useState } from "react";

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

export function CompanionFace({ expressionId = "focus", className = "", allowBlink = true, alt = "DeskMate 表情" }) {
  const [blinking, setBlinking] = useState(false);
  const source = useMemo(
    () => expressionAssetUrl(blinking ? "sleep" : expressionId),
    [blinking, expressionId],
  );

  useEffect(() => {
    if (!allowBlink || expressionId === "sleep" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let blinkTimer;
    let resetTimer;
    const schedule = () => {
      blinkTimer = window.setTimeout(() => {
        setBlinking(true);
        resetTimer = window.setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 150);
      }, 4200 + Math.round(Math.random() * 3600));
    };
    schedule();
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(resetTimer);
    };
  }, [allowBlink, expressionId]);

  return (
    <span className={`companion-face ${blinking ? "is-blinking" : ""} ${className}`.trim()}>
      <img src={source} alt={alt} draggable="false" />
    </span>
  );
}
