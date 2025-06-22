// preload.js - Exposes safe APIs to the renderer via contextBridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Ensure sendMessage covers 'chatMessage' and 'edit-message'
  sendMessage: (channel, data) => {
      const allowedSendChannels = [
          'chatMessage',
          'edit-message',
          'stop-stream', // Added for stopping streams
          'show-native-notification', // Added for sending notification requests
          'window-control', // Added for window controls
          'timer-created', // Added for timer creation notifications
          'show-enhanced-notification', // Added for enhanced notifications
          'request-attention' // Added for macOS dock bouncing
      ];
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
          'streamError', // Added for stream errors
          'streamStopped', // Added for stream stop confirmations
          'functionCallResponse', // This is where tool results come back to renderer
          'tool-execution-result', // Added for tool execution UI updates
          'new-chat-saved', // Added for new chat save notifications
          'chat-title-updated',
          'chat-deleted',
          'token-usage-updated',
          'native-notification-clicked', // Added for notification clicks
          'show-in-app-notification-fallback', // Added for fallback
          'window-maximized-status', // Added for window controls
          'chat-personality-updated',
          'timer-updated', // Added for timer update notifications
          'alarm-updated', // Added for alarm update notifications
          'timer-completed', // Added for timer completion notifications
          'chat-loaded' // Added for chat loading notifications
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
          'get-config', // Added channel for fetching config
          // Settings Modal & Personality Channels
          'get-api-keys',
          'save-api-key',
          'get-personalities',
          'set-active-personality',
          'set-current-chat-personality',
          'get-personality-details',
          'save-personality-settings',
          // Global settings (some might be used by settingsManager below)
          'get-settings', // General settings access
          'save-setting', // General settings save
          // Timer and Alarm Channels
          'get-active-timers',
          'get-active-alarms',
          'dismiss-timer',
          'dismiss-alarm',
          'mark-timer-triggered',
          'mark-alarm-triggered',
          // Personality Management Channels
          'get-context-sets',
          'get-prompt-content',
          'save-personality',
          'delete-personality',
          'toggle-personality-availability',
          // File Management Channels
          'browse-context-files',
          'convert-and-add-context-files',
          'delete-context-file',
          // Channels for settingsManager
          'settings:get-font-settings',
          'settings:get-available-fonts',
          'settings:save-default-font',
          'settings:get-global-setting',
          'settings:save-global-setting',
          'settings:get-model-details', // Added for fetching full model details
          'get-current-active-state' // Added for getting current active model and personality
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
  onChatDeleted: (func) => ipcRenderer.on('chat-deleted', (event, ...args) => func(...args)),
  // Add listener for opening settings modal
  onOpenSettings: (func) => {
      const channel = 'open-settings-modal';
      if (contextBridge.electronAPI.onMessageAllowedChannels && contextBridge.electronAPI.onMessageAllowedChannels.includes(channel)) { // Check if channel is allowed
          const listener = (event, ...args) => func(...args);
          ipcRenderer.on(channel, listener);
          return () => ipcRenderer.removeListener(channel, listener);
      } else {
          console.error(`Attempted to listen on unallowed channel for onOpenSettings: ${channel}`);
      }
  },
  // Expose settingsManager for font and theme settings
  settingsManager: {
      getFontSettings: () => ipcRenderer.invoke('settings:get-font-settings'),
      getAvailableFonts: () => ipcRenderer.invoke('settings:get-available-fonts'),
      saveDefaultFont: (fontName) => ipcRenderer.invoke('settings:save-default-font', fontName),
      getGlobalSetting: (key) => ipcRenderer.invoke('settings:get-global-setting', key),
      saveGlobalSetting: (key, value) => ipcRenderer.invoke('settings:save-global-setting', { key, value }),
      getModelDetails: (modelId) => ipcRenderer.invoke('settings:get-model-details', modelId), // Added for fetching full model details
  },
  // Helper to access the allowed channels for onMessage, used by onOpenSettings
  onMessageAllowedChannels: [
      'streamPartialResponse',
      'streamFinalResponse',
      'streamError', // Added for stream errors
      'streamStopped', // Added for stream stop confirmations
      'functionCallResponse',
      'tool-execution-result',
      'new-chat-saved',
      'chat-title-updated',
      'chat-deleted',
      'token-usage-updated',
      'native-notification-clicked',
      'show-in-app-notification-fallback',
      'window-maximized-status',
      'chat-personality-updated',
      'timer-updated',
      'alarm-updated',
      'timer-completed',
      'chat-loaded'
  ]
});
