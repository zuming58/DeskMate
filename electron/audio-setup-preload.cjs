const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("easyInputAudioSetup", Object.freeze({
  load: () => ipcRenderer.invoke("audio-setup:load"),
  preview: (value) => ipcRenderer.invoke("audio-setup:preview", value),
  commit: (token) => ipcRenderer.invoke("audio-setup:commit", token),
  close: () => ipcRenderer.invoke("audio-setup:close"),
}));
