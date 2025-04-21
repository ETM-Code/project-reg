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
          'functionCallResponse', // Assuming this is still needed
          'chat-title-updated',
          'chat-deleted',
          'token-usage-updated' // Assuming this is still needed
      ];
      if (allowedReceiveChannels.includes(channel)) {
          // Ensure the listener function is correctly passed
          const listener = (event, ...args) => func(...args);
          ipcRenderer.on(channel, listener);
          // Optional: Return a function to remove the listener
          // return () => ipcRenderer.removeListener(channel, listener);
      } else {
           console.error(`Attempted to listen on unallowed channel: ${channel}`);
      }
  },
  invoke: (channel, data) => {
      const allowedInvokeChannels = [
          'list-chats',
          'start-new-chat',
          'load-chat',
          // 'edit-message', // Removed from invoke
          'get-current-chat-id',
          'get-initial-token-usage'
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
