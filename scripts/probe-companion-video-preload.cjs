// QA-only bridge. No user profile, credentials, devices, cloud or non-silent audio.
const { contextBridge, ipcRenderer } = require('electron');
const listen = channel => callback => { const handler = (_e, value) => callback(value); ipcRenderer.on(channel, handler); return () => ipcRenderer.removeListener(channel, handler); };
contextBridge.exposeInMainWorld('desktopBridge', {
  getCompanionConversationStatus: async () => ({ active: false, state: 'idle' }),
  onCompanionConversationEvent: listen('probe:conversation'),
  onCompanionComputerAudioCommand: listen('probe:audio'),
  sendCompanionComputerAudioEvent: value => ipcRenderer.send('probe:audio-event', value),
  setCompanionComputerAudioReady: async () => true,
});
