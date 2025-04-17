// preload.js - Exposes safe APIs to the renderer via contextBridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (channel, data) => ipcRenderer.send(channel, data),
  onMessage: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  // Add listener for title updates (using onMessage structure)
  onTitleUpdate: (func) => ipcRenderer.on('chat-title-updated', (event, ...args) => func(...args))
});
