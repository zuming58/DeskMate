export const COMPANION_VIDEO_STATES = Object.freeze(['idle', 'listen', 'think', 'speak']);

// TTS generation is not playback. Only the existing audio sink can select speak.
export function companionVideoState(conversation = {}, playing = false) {
  if (playing) return 'speak';
  if (!conversation.active) return 'idle';
  if (conversation.state === 'listening') return 'listen';
  if (['thinking', 'speaking'].includes(conversation.state)) return 'think';
  return 'idle';
}

// Two bounded decoders, one short crossfade. No audio, IPC or conversation control.
export function createCompanionVideoPlayer({ videos, baseUrl, onStatus = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  let enabled = false, disposed = false, desired = 'idle', front = -1, serial = 0;
  let pending = -1, watchdog, settling;
  const states = ['', ''];
  const release = index => {
    const video = videos[index];
    if (!video) return;
    video.onloadeddata = video.onerror = video.ontimeupdate = null;
    video.pause(); video.style.opacity = '0';
    video.removeAttribute('src'); video.load(); states[index] = '';
  };
  const clearPending = () => {
    serial += 1; cancel(watchdog); cancel(settling);
    videos.forEach((_v, i) => { if (i !== front) release(i); });
    pending = -1;
  };
  const display = (loopBoundary = false) => {
    if (!enabled || disposed) return;
    clearPending();
    if (!loopBoundary && front >= 0 && states[front] === desired && videos[front].style.opacity === '1') return;
    const token = serial;
    // Stop mouth motion immediately on interruption, fade toward the neutral poster.
    if (front >= 0 && states[front] === 'speak' && desired !== 'speak') {
      videos[front].pause(); videos[front].style.opacity = '0';
    }
    const next = front === 0 ? 1 : 0;
    release(next); pending = next;
    const video = videos[next], target = desired;
    const valid = () => !disposed && enabled && serial === token;
    const fail = () => {
      if (!valid()) return;
      clearPending(); videos.forEach((_v, i) => release(i)); front = -1;
      onStatus({ state: target, error: true });
    };
    const reveal = () => {
      if (!valid()) return;
      cancel(watchdog);
      const previous = front;
      video.style.opacity = '1';
      if (previous >= 0) videos[previous].style.opacity = '0';
      front = next; pending = -1; states[next] = target;
      video.ontimeupdate = () => {
        if (valid() && front === next && pending < 0 && desired === target && video.duration > 1 && video.duration - video.currentTime < 0.35) display(true);
      };
      onStatus({ state: target, error: false });
      settling = schedule(() => { if (valid() && previous >= 0 && previous !== front) release(previous); }, 180);
    };
    video.muted = true; video.loop = true; video.playsInline = true;
    video.onloadeddata = () => {
      if (!valid()) return;
      video.onloadeddata = null;
      Promise.resolve(video.play()).then(() => {
        if (!valid()) return;
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
        else reveal();
      }).catch(fail);
    };
    video.onerror = fail;
    watchdog = schedule(fail, 4000);
    video.src = `${baseUrl}/${target}.mp4`; video.load();
  };
  return {
    setState(state) {
      const next = COMPANION_VIDEO_STATES.includes(state) ? state : 'idle';
      if (next === desired) return;
      desired = next; display();
    },
    setVisible(value) {
      const next = Boolean(value);
      if (disposed || next === enabled) return;
      enabled = next;
      if (enabled) display();
      else { clearPending(); videos.forEach((_v, i) => release(i)); front = -1; }
    },
    retry() { display(); },
    dispose() { disposed = true; enabled = false; clearPending(); videos.forEach((_v, i) => release(i)); front = -1; },
  };
}
