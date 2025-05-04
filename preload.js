// preload.js - Exposes safe APIs to the renderer via contextBridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Ensure sendMessage covers 'chatMessage' and 'edit-message'
  sendMessage: (channel, data) => {
      const allowedSendChannels = ['chatMessage', 'edit-message'];
      if (allowedSendChannels.includes(channel)) {
          ipcRenderer.send(channel, data);
      } else {
          console.error(`Attempted to send message on unallowed channel: ${channel}`);
      }
  },
  onMessage: (channel, func) => {
      const allowedReceiveChannels = [
          'streamPartialResponse',
          'streamFinalResponse',
          'functionCallResponse',
          'chat-title-updated',
          'chat-deleted',
          'token-usage-updated'
      ];
      if (allowedReceiveChannels.includes(channel)) {
          // Ensure the listener function is correctly passed
          const listener = (event, ...args) => func(...args);
          ipcRenderer.on(channel, listener);
          // Return a function to remove the listener for cleanup
          return () => ipcRenderer.removeListener(channel, listener);
      } else {
           console.error(`Attempted to listen on unallowed channel: ${channel}`);
      }
  },
  invoke: (channel, data) => {
      const allowedInvokeChannels = [
          'list-chats',
          'start-new-chat',
          'load-chat',
          'get-current-chat-id',
          'get-initial-token-usage',
          // Settings Modal & Personality Channels
          'get-api-keys',
          'save-api-key',
          'get-personalities',
          'set-active-personality',
          'set-current-chat-personality',
          'get-personality-details',
          'save-personality-settings'
      ];
       if (allowedInvokeChannels.includes(channel)) {
           return ipcRenderer.invoke(channel, data);
       } else {
           console.error(`Attempted to invoke unallowed channel: ${channel}`);
           return Promise.reject(new Error(`Invocation of channel ${channel} is not allowed.`));
       }
  },
  // Specific listeners remain for clarity, but could be handled by onMessage
  onTitleUpdate: (func) => ipcRenderer.on('chat-title-updated', (event, ...args) => func(...args)),
  // Add listener for chat deletion notifications
  onChatDeleted: (func) => ipcRenderer.on('chat-deleted', (event, ...args) => func(...args))
});
