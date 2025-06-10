// src/renderer/app/streaming.js
import { state } from './state.js';
import * as dom from './dom.js';
import { appendMessage } from './bubble.js';
import { createInlineLoadingBubble } from './ui.js';

export function sendMessage(message) {
  const modelSelector = dom.getModelSelector();
  if (!modelSelector || modelSelector.disabled) return;

  setStreamingState(true);

  const currentIndex = state.messageIndexCounter;
  appendMessage('user', message, currentIndex);
  state.messageIndexCounter++;

  if (window.showLoadingIndicator) {
    window.showLoadingIndicator();
    createInlineLoadingBubble();
  }

  const model = modelSelector.value;
  console.log(`[App] Sending message with model: ${model}`);

  state.currentStreamAbortController = new AbortController();
  window.electronAPI.sendMessage('chatMessage', { message, model });
}

export function setStreamingState(streaming) {
  state.isStreaming = streaming;
  updateSendButtonState();

  dom.getUserInput().disabled = streaming;
  const expandedUserInput = dom.getExpandedUserInput();
  if (expandedUserInput) {
    expandedUserInput.disabled = streaming;
  }
  const expandInputBtn = dom.getExpandInputBtn();
  if (expandInputBtn) {
    expandInputBtn.disabled = streaming;
  }
}

export function updateSendButtonState() {
  const buttons = [dom.getSendBtn(), dom.getExpandedSendBtn()].filter(btn => btn);

  buttons.forEach(button => {
    if (state.isStreaming) {
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
        </svg>
      `;
      button.title = "Stop Generation";
      button.classList.add('btn-stop');
      button.classList.remove('btn-primary');
    } else {
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        </svg>
      `;
      button.title = state.isEditing ? "Save Edit" : "Send Message";
      button.classList.remove('btn-stop');
      button.classList.add('btn-primary');
    }
  });
}

export function stopCurrentStream() {
  if (state.currentStreamAbortController) {
    console.log('[App] Stopping current stream...');
    state.currentStreamAbortController.abort();
  }
  window.electronAPI.sendMessage('stop-stream');
  console.log('[App] Stop request sent to main process');
}