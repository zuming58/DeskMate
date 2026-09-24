const { contextBridge, ipcRenderer } = require('electron');
const call = command => value => ipcRenderer.invoke('probe:memory-review', { command, value });
contextBridge.exposeInMainWorld('desktopBridge', {
  getMemoryStatus: call('status'), getMemoryCuration:call('curation'), setMemoryCuration:call('enable'), runMemoryCuration:call('run'), resolveMemoryCuration:call('resolve'),
  listMemories:call('list'), listMemoryTurns:call('turns'),
  getKnowledgeOsStatus:call('knowledge-status'), setKnowledgeOsSettings:call('knowledge-save'),
  getMemoryJournalStatus:async()=>({active:{day:'2099-01-01'},delivery:{sealed:20,awaitingReceipt:20,receiptFailed:20,failed:0},pendingJournalSync:0}),
});
