// src/renderer/app/dom.js

// Main Chat Elements
export const getChatWindow = () => document.getElementById('chatWindow');
export const getUserInput = () => document.getElementById('userInput');
export const getSendBtn = () => document.getElementById('sendBtn');
export const getModelSelector = () => document.getElementById('modelSelector');
export const getTokenCounterDisplay = () => document.getElementById('tokenCounterDisplay');

// Personality Elements
export const getOpenPersonalitySelectorBtn = () => document.getElementById('openPersonalitySelectorBtn');
export const getPersonalityNameElement = () => document.getElementById('active-personality-name');

// Expanded Input Elements
export const getExpandInputBtn = () => document.getElementById('expandInputBtn');
export const getInputOverlay = () => document.getElementById('inputOverlay');
export const getInputOverlayBackdrop = () => document.getElementById('inputOverlayBackdrop');
export const getExpandedInputContainer = () => document.getElementById('expandedInputContainer');
export const getCloseExpandedInputBtn = () => document.getElementById('closeExpandedInputBtn');
export const getExpandedUserInput = () => document.getElementById('expandedUserInput');
export const getExpandedSendBtn = () => document.getElementById('expandedSendBtn');
export const getChatInputArea = () => document.getElementById('chatInputArea');

// Timers & Alarms
export const getTimersAlarmsContainer = () => document.getElementById('timersAlarmsContainer');
export const getInAppAlertsContainer = () => document.getElementById('inAppAlertsContainer');

// Window Controls
export const getMinimizeBtn = () => document.getElementById('minimizeBtn');
export const getMaximizeBtn = () => document.getElementById('maximizeBtn');
export const getCloseBtn = () => document.getElementById('closeBtn');
export const getSettingsBtn = () => document.getElementById('settingsBtn');
export const getSettingsModal = () => document.getElementById('settingsModal');

// Sidebar
export const getSidebarToggleBtn = () => document.getElementById('sidebarToggleBtn');
export const getSidebar = () => document.getElementById('sidebar');
export const getMainContent = () => document.getElementById('mainContent');