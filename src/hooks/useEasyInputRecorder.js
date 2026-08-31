import { useCallback, useEffect, useRef, useState } from "react";

export function useEasyInputRecorder({ onComplete, onError } = {}) {
  const [status, setStatus] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const startedAtRef = useRef(0);
  const activeRef = useRef(false);

  useEffect(() => globalThis.desktopBridge?.onEasyInputVoiceRecordingEvent?.((event) => {
    if (!event || !activeRef.current) return;
    if (event.type === "level") {
      setLevel(Math.max(0, Math.min(100, Number(event.level) || 0)));
      setSeconds(Math.max(0, Number(event.seconds) || 0));
    } else if (event.type === "error") {
      activeRef.current = false;
      const message = `EasyInput 板载麦克风录音中断：${event.reason || "音频链路不可用"}`;
      setError(message);
      setStatus("error");
      setLevel(0);
      onError?.(message);
    }
  }), [onError]);

  const start = useCallback(async () => {
    setError("");
    if (typeof globalThis.desktopBridge?.startEasyInputVoiceRecording !== "function") return { ok: false, reason: "desktop-bridge-unavailable" };
    let result;
    try { result = await globalThis.desktopBridge.startEasyInputVoiceRecording(); }
    catch { result = { ok: false, reason: "easyinput-audio-unavailable" }; }
    if (!result?.ok) return { ok: false, reason: result?.reason || "easyinput-audio-unavailable" };
    activeRef.current = true;
    startedAtRef.current = Date.now();
    setSeconds(0);
    setLevel(0);
    setStatus("recording");
    return { ok: true };
  }, []);

  const stop = useCallback(async () => {
    if (!activeRef.current) return { ok: false, reason: "easyinput-recording-not-active" };
    activeRef.current = false;
    const result = await globalThis.desktopBridge?.stopEasyInputVoiceRecording?.();
    setLevel(0);
    if (!result?.ok) {
      const message = `EasyInput 板载麦克风录音失败：${result?.reason || "没有收到有效音频"}`;
      setError(message);
      setStatus("error");
      onError?.(message);
      return result || { ok: false, reason: "desktop-bridge-unavailable" };
    }
    const blob = new Blob([result.audio], { type: result.mimeType || "audio/wav" });
    setStatus("completed");
    setSeconds(Math.max(0, Number(result.duration) || Math.floor((Date.now() - startedAtRef.current) / 1000)));
    onComplete?.({ blob, duration: Math.max(0, Number(result.duration) || 0), status: "pending", microphoneSource: "easyinput" });
    return { ok: true };
  }, [onComplete, onError]);

  const cancel = useCallback(async () => {
    activeRef.current = false;
    await globalThis.desktopBridge?.cancelEasyInputVoiceRecording?.();
    setStatus("idle");
    setSeconds(0);
    setLevel(0);
  }, []);

  useEffect(() => () => { if (activeRef.current) void globalThis.desktopBridge?.cancelEasyInputVoiceRecording?.(); }, []);
  return { status, seconds, level, error, start, stop, cancel };
}
