import { useCallback, useEffect, useRef, useState } from "react";
import { downsampleToPcm16 } from "../domain/pcmAudio.js";

export { downsampleToPcm16 } from "../domain/pcmAudio.js";

export function shouldIgnoreToggle(lastToggle, now, debounceMs = 350) {
  return now - lastToggle < debounceMs;
}

export function useRecorder({ deviceId, onComplete, onError, onAudioChunk } = {}) {
  const [status, setStatus] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef(null); const streamRef = useRef(null); const contextRef = useRef(null); const processorRef = useRef(null); const animationRef = useRef(null); const chunksRef = useRef([]); const startedRef = useRef(0); const startingRef = useRef(false); const lastToggleRef = useRef(0); const audioChunkRef = useRef(onAudioChunk);
  audioChunkRef.current = onAudioChunk;
  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    contextRef.current?.close?.();
    contextRef.current = null;
    if (processorRef.current) processorRef.current.onaudioprocess = null;
    processorRef.current = null;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);
  useEffect(() => () => stopTracks(), [stopTracks]);
  useEffect(() => { if (status !== "recording") return undefined; const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 250); return () => clearInterval(timer); }, [status]);
  const start = useCallback(async () => {
    setError("");
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !AudioContextClass) { const message = "当前浏览器不支持麦克风录音"; setError(message); setStatus("error"); onError?.(message); return false; }
    try {
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      if (!stream.getAudioTracks().length) throw new Error("没有可用的麦克风设备");
      const recorder = new MediaRecorder(stream); const context = new AudioContextClass(); const source = context.createMediaStreamSource(stream); const analyser = context.createAnalyser(); analyser.fftSize = 256; source.connect(analyser); const data = new Uint8Array(analyser.frequencyBinCount);
      const processor = context.createScriptProcessor(4096, 1, 1); const mute = context.createGain(); mute.gain.value = 0; source.connect(processor); processor.connect(mute); mute.connect(context.destination);
      processor.onaudioprocess = (event) => { const pcm = downsampleToPcm16(event.inputBuffer.getChannelData(0), context.sampleRate); if (pcm.byteLength) audioChunkRef.current?.(pcm); };
      const updateLevel = () => { analyser.getByteTimeDomainData(data); let sum = 0; data.forEach((v) => { const n = (v - 128) / 128; sum += n * n; }); setLevel(Math.min(100, Math.round(Math.sqrt(sum / data.length) * 180))); animationRef.current = requestAnimationFrame(updateLevel); }; updateLevel();
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onerror = () => { const message = "录音设备发生错误，请重新选择麦克风"; setError(message); onError?.(message); };
      recorder.onstop = () => { const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }) : null; chunksRef.current = []; stopTracks(); recorderRef.current = null; setLevel(0); setStatus("completed"); onComplete?.({ blob, duration: Math.floor((Date.now() - startedRef.current) / 1000), status: "pending" }); };
      recorderRef.current = recorder; streamRef.current = stream; contextRef.current = context; processorRef.current = processor; startedRef.current = Date.now(); setSeconds(0); setStatus("recording"); recorder.start();
      stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => {
        if (recorderRef.current?.state === "recording") {
          const message = "录音设备已断开，已保存当前录音";
          setError(message);
          onError?.(message);
          recorderRef.current.stop();
        }
      }, { once: true }));
      return true;
    } catch (cause) { stopTracks(); const message = cause?.name === "NotAllowedError" ? "麦克风权限被拒绝，请在浏览器设置中允许访问。" : cause?.name === "NotFoundError" ? "没有找到可用的麦克风设备。" : `无法开始录音：${cause?.message || "未知错误"}`; setError(message); setStatus("error"); onError?.(message); return false; }
  }, [deviceId, onComplete, onError, stopTracks]);
  const stop = useCallback(() => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); }, []);
  const toggle = useCallback(async () => {
    const now = Date.now();
    if (shouldIgnoreToggle(lastToggleRef.current, now) || startingRef.current) return { ignored: true };
    lastToggleRef.current = now;
    if (recorderRef.current?.state === "recording") {
      stop();
      return { ignored: false, action: "stop" };
    }
    startingRef.current = true;
    try {
      const started = await start();
      return { ignored: false, action: "start", started };
    } finally {
      startingRef.current = false;
    }
  }, [start, stop]);
  const cancel = useCallback(() => { if (recorderRef.current?.state === "recording") { recorderRef.current.onstop = null; recorderRef.current.stop(); } recorderRef.current = null; chunksRef.current = []; stopTracks(); setStatus("idle"); setSeconds(0); setLevel(0); }, [stopTracks]);
  return { status, seconds, level, error, start, stop, toggle, cancel };
}
