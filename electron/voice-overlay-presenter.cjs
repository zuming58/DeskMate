// One presenter owns terminal timers across dictation and companion snapshots.
function createVoiceOverlayPresenter({ getWindow, show, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null;
  let revision = 0;
  return snapshot => {
    const token = ++revision;
    if (timer !== null) cancel(timer);
    timer = null;
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send('voice-state', snapshot);
    if (snapshot.floating === false || snapshot.state === 'idle') { window.hide(); return; }
    if (!window.isVisible()) show();
    if (['completed', 'error', 'cancelled'].includes(snapshot.state)) {
      timer = schedule(() => {
        if (token === revision && !window.isDestroyed()) window.hide();
      }, snapshot.state === 'completed' ? 700 : 1800);
    }
  };
}
module.exports = { createVoiceOverlayPresenter };
