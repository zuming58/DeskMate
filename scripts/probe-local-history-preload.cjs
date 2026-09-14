// Only used by probe-local-history.cjs with an isolated synthetic user profile.
const { contextBridge, ipcRenderer } = require('electron');
const seeded = (async () => {
  if (localStorage.getItem('t32-probe-seeded')) return;
  localStorage.setItem('deskmate.app-state', JSON.stringify({ schemaVersion: 15, history: [
    { id: 'probe-a', audioId: 'probe-audio', text: 'Synthetic audio history', rawText: 'Synthetic source', time: '12:00', date: '今天' },
    { id: 'probe-unknown', text: 'Synthetic unknown date', time: '11:00', date: '今天' }
  ] }));
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('deskmate-recordings', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('audio', {keyPath:'id'});
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('audio', 'readwrite');
      for (const id of ['probe-audio', 'orphan-audio']) tx.objectStore('audio').put({id, blob:new Blob([new Uint8Array([1,2,3])], {type:'audio/webm'}), createdAt:Date.parse('2025-01-01T00:00:00Z')});
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  });
  localStorage.setItem('t32-probe-seeded', 'true');
})();
contextBridge.exposeInMainWorld('desktopBridge', {
  localHistory: async (request) => { await seeded; return ipcRenderer.invoke('probe:history', request); }
});
