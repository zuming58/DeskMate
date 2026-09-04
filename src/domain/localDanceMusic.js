export function createLocalDanceMusicEngine({ bridge, audioFactory = () => new Audio(), createObjectURL = (blob) => URL.createObjectURL(blob), revokeObjectURL = (value) => URL.revokeObjectURL(value) } = {}) {
  let generation = 0;
  let audio = null;
  let objectUrl = "";

  const report = (value) => bridge?.sendDanceMusicPlaybackEvent?.(value);
  const release = ({ reportStopped = false, requestId = "" } = {}) => {
    generation += 1;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause?.();
      try { audio.currentTime = 0; } catch { /* read-only media implementation */ }
    }
    audio = null;
    if (objectUrl) revokeObjectURL(objectUrl);
    objectUrl = "";
    if (reportStopped) report({ state: "idle", requestId });
  };

  const handleCommand = async (command = {}) => {
    const requestId = String(command.requestId || "").slice(0, 80);
    if (command.type === "stop") {
      release({ reportStopped: true, requestId });
      return { ok: true };
    }
    if (command.type !== "play" || !requestId) return { ok: false, reason: "dance-music-command-invalid" };
    release();
    const currentGeneration = generation;
    const track = await bridge?.loadDanceMusic?.();
    if (currentGeneration !== generation) return { ok: false, reason: "dance-music-command-superseded" };
    if (!track?.ok || !track.data) {
      report({ state: "error", requestId, reason: track?.reason || "dance-music-read-failed" });
      return { ok: false, reason: track?.reason || "dance-music-read-failed" };
    }
    try {
      const bytes = track.data instanceof Uint8Array ? track.data : new Uint8Array(track.data);
      objectUrl = createObjectURL(new Blob([bytes], { type: track.mimeType || "audio/mpeg" }));
      audio = audioFactory();
      audio.src = objectUrl;
      audio.volume = 0.72;
      audio.onended = () => { if (currentGeneration === generation) { release(); report({ state: "idle", requestId, reason: "dance-music-ended" }); } };
      audio.onerror = () => { if (currentGeneration === generation) { release(); report({ state: "error", requestId, reason: "dance-music-playback-failed" }); } };
      await audio.play();
      if (currentGeneration !== generation) return { ok: false, reason: "dance-music-command-superseded" };
      report({ state: "playing", requestId });
      return { ok: true };
    } catch {
      if (currentGeneration === generation) release();
      report({ state: "error", requestId, reason: "dance-music-playback-failed" });
      return { ok: false, reason: "dance-music-playback-failed" };
    }
  };

  return { handleCommand, close: () => release() };
}
