// src/renderer/app/state.js

export const state = {
  availablePersonalities: [],
  currentDefaultPersonalityId: null,
  currentActivePersonalityName: 'Loading...',
  config: null,
  messageIndexCounter: 0,
  isEditing: false,
  editingChatId: null,
  editingMessageId: null,
  editingOriginalText: null,
  editingContainerElement: null,
  typingBubble: null,
  loadingBubbleElement: null,
  isInputExpanded: false,
  isStreaming: false,
  currentStreamAbortController: null,
  activeTimers: [],
  activeAlarms: [],
  timersAlarmsInterval: null,
};