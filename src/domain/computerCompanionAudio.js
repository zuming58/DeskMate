import { downsampleToPcm16 } from "./pcmAudio.js";

const VERSION = 1;
const MAX_CHUNK_BYTES = 64 * 1024;

function reasonFor(error, fallback) {
  if (error?.name === "NotAllowedError") return "computer-microphone-permission-denied";
  if (error?.name === "NotFoundError") return "computer-microphone-not-found";
  if (error?.name === "OverconstrainedError") return "computer-microphone-device-unavailable";
  return fallback;
}

function sameSession(command, session) {
  return Boolean(session && String(command?.sessionId || "") === session.sessionId && Number(command?.generation) === session.generation);
}

export function createComputerCompanionAudioEngine({ bridge, mediaDevices = globalThis.navigator?.mediaDevices, AudioContextClass = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext } = {}) {
  let session = null;
  let stream = null;
  let captureContext = null;
  let processor = null;
  let playbackContext = null;
  let playbackAt = 0;
  const playbackNodes = new Map();
  const drainWaiters = new Map();

  const emit = (type, extra = {}) => bridge?.sendCompanionComputerAudioEvent?.({ version: VERSION, type, sessionId: session?.sessionId || "", generation: session?.generation || 0, ...extra });
  const stopCapture = async () => {
    if (processor) processor.onaudioprocess = null;
    processor?.disconnect?.();
    processor = null;
    stream?.getTracks?.().forEach((track) => track.stop());
    stream = null;
    await captureContext?.close?.().catch?.(() => {});
    captureContext = null;
  };
  const finishDrainWaiter = (requestSequence) => {
    const waiter = drainWaiters.get(requestSequence);
    if (!waiter) return;
    drainWaiters.delete(requestSequence);
    emit("sink.drained", { requestSequence });
  };
  const finishAllDrainWaiters = () => {
    for (const requestSequence of [...drainWaiters.keys()]) finishDrainWaiter(requestSequence);
  };
  const markPlaybackEnded = (node) => {
    const sequence = playbackNodes.get(node);
    if (!sequence) return;
    playbackNodes.delete(node);
    emit("sink.played", { audioSequence: sequence });
    for (const [requestSequence, waiter] of drainWaiters) {
      waiter.delete(node);
      if (waiter.size === 0) finishDrainWaiter(requestSequence);
    }
  };
  const interruptPlayback = () => {
    for (const [node, sequence] of playbackNodes) {
      playbackNodes.delete(node);
      node.onended = null;
      try { node.stop(); } catch { /* already ended */ }
      emit("sink.cancelled", { audioSequence: sequence });
    }
    playbackNodes.clear();
    playbackAt = playbackContext?.currentTime || 0;
    finishAllDrainWaiters();
  };
  const stopPlayback = async () => {
    interruptPlayback();
    await playbackContext?.close?.().catch?.(() => {});
    playbackContext = null;
    playbackAt = 0;
  };

  const startCapture = async (command) => {
    await stopCapture();
    try {
      if (!mediaDevices?.getUserMedia || !AudioContextClass) throw new Error("computer-audio-renderer-unsupported");
      session = Object.freeze({ sessionId: String(command.sessionId), generation: Number(command.generation) });
      const deviceId = String(command.deviceId || "");
      stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (!stream?.getAudioTracks?.().length) throw Object.assign(new Error("computer-microphone-not-found"), { name: "NotFoundError" });
      captureContext = new AudioContextClass();
      const input = captureContext.createMediaStreamSource(stream);
      processor = captureContext.createScriptProcessor(4096, 1, 1);
      const mute = captureContext.createGain();
      mute.gain.value = 0;
      input.connect(processor);
      processor.connect(mute);
      mute.connect(captureContext.destination);
      processor.onaudioprocess = (event) => {
        if (!sameSession(command, session)) return;
        const pcm = downsampleToPcm16(event.inputBuffer.getChannelData(0), captureContext.sampleRate, 16000);
        if (pcm.byteLength > 0 && pcm.byteLength <= MAX_CHUNK_BYTES) emit("source.audio", { audio: pcm });
      };
      stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => emit("source.error", { reason: "computer-microphone-disconnected" }), { once: true }));
      emit("source.started");
    } catch (error) {
      await stopCapture();
      emit("source.error", { reason: reasonFor(error, error?.message === "computer-audio-renderer-unsupported" ? error.message : "computer-microphone-start-failed") });
    }
  };

  const startPlayback = async (command) => {
    await stopPlayback();
    try {
      if (!AudioContextClass) throw new Error("computer-audio-renderer-unsupported");
      session = Object.freeze({ sessionId: String(command.sessionId), generation: Number(command.generation) });
      playbackContext = new AudioContextClass({ sampleRate: 24000 });
      await playbackContext.resume?.();
      playbackAt = playbackContext.currentTime;
      emit("sink.started");
    } catch (error) {
      emit("sink.error", { reason: error?.message === "computer-audio-renderer-unsupported" ? error.message : "computer-speaker-start-failed" });
    }
  };

  const play = (command) => {
    if (!sameSession(command, session) || !playbackContext) return;
    const bytes = command.audio instanceof ArrayBuffer
      ? new Uint8Array(command.audio)
      : ArrayBuffer.isView(command.audio)
        ? new Uint8Array(command.audio.buffer, command.audio.byteOffset, command.audio.byteLength)
        : new Uint8Array(command.audio || []);
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES || bytes.byteLength % 2 !== 0) return;
    const audioSequence = Number(command.sequence);
    if (!Number.isSafeInteger(audioSequence) || audioSequence < 1) return;
    const now = playbackContext.currentTime;
    const aligned = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice();
    const samples = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 2);
    const buffer = playbackContext.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index] / (samples[index] < 0 ? 0x8000 : 0x7fff);
    const node = playbackContext.createBufferSource();
    node.buffer = buffer;
    node.connect(playbackContext.destination);
    const startAt = Math.max(now, playbackAt);
    playbackAt = startAt + buffer.duration;
    playbackNodes.set(node, audioSequence);
    node.onended = () => markPlaybackEnded(node);
    node.start(startAt);
    emit("sink.accepted", { audioSequence });
  };

  const drainPlayback = (command) => {
    const requestSequence = Number(command.sequence);
    if (!Number.isSafeInteger(requestSequence) || requestSequence < 1) return;
    const pendingNodes = new Set(playbackNodes.keys());
    if (pendingNodes.size === 0) {
      emit("sink.drained", { requestSequence });
      return;
    }
    drainWaiters.set(requestSequence, pendingNodes);
  };

  const handleCommand = async (command = {}) => {
    if (!command || command.version !== VERSION || !command.sessionId || !Number.isInteger(Number(command.generation))) return;
    if (command.type === "source.start") return startCapture(command);
    if (command.type === "sink.start") return startPlayback(command);
    if (!sameSession(command, session)) return;
    if (command.type === "source.stop") return stopCapture();
    if (command.type === "sink.audio") return play(command);
    if (command.type === "sink.drain") return drainPlayback(command);
    if (command.type === "sink.interrupt") return interruptPlayback();
    if (command.type === "sink.stop") return stopPlayback();
  };

  const close = async () => { await stopCapture(); await stopPlayback(); session = null; };
  return Object.freeze({ close, handleCommand });
}
