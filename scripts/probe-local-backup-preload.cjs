// Synthetic profile only; no production credentials, hardware or network adapters.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopBridge',{
  localHistory:value=>ipcRenderer.invoke('probe:history',value),
  localBackup:value=>ipcRenderer.invoke('probe:backup',value)
});
