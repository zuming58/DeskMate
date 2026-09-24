const { contextBridge, ipcRenderer } = require('electron');
const call = command => value => ipcRenderer.invoke('probe:memory-review', { command, value });
contextBridge.exposeInMainWorld('desktopBridge', {
  getMemoryStatus: call('status'), getMemoryCandidateReview: call('review'), organizeMemoryCandidates: call('organize'), reviewMemoryCandidateBatch: call('batch'),
  listMemories: call('list'), listMemoryTurns: call('turns'),
  getMemoryJournalStatus: async () => ({ active: { day: '2099-01-01' }, delivery: { sealed: 20, awaitingReceipt: 20, receiptFailed: 20, failed: 0 }, pendingJournalSync: 0 }),
});
