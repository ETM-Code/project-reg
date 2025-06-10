// src/renderer/app/input.js
import { state } from './state.js';
import * as dom from './dom.js';
import { saveEdit } from './editing.js';
import { sendMessage } from './streaming.js';
import { stopCurrentStream } from './streaming.js';

export function initializeInputHandlers() {
  const userInput = dom.getUserInput();
  const sendBtn = dom.getSendBtn();
  const expandedUserInput = dom.getExpandedUserInput();
  const expandedSendBtn = dom.getExpandedSendBtn();
  const expandInputBtn = dom.getExpandInputBtn();
  const closeExpandedInputBtn = dom.getCloseExpandedInputBtn();
  const inputOverlayBackdrop = dom.getInputOverlayBackdrop();

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendOrSave();
    }
    if (e.key === 'Escape' && state.isInputExpanded) {
      closeExpandedInput();
    }
  });

  sendBtn.addEventListener('click', handleSendOrSave);

  if (expandedUserInput) {
    expandedUserInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendOrSave();
      }
      if (e.key === 'Escape' && state.isInputExpanded) {
        closeExpandedInput();
      }
    });
  }

  if (expandedSendBtn) {
    expandedSendBtn.addEventListener('click', handleSendOrSave);
  }

  if (expandInputBtn) {
    expandInputBtn.addEventListener('click', openExpandedInput);
  }

  if (closeExpandedInputBtn) {
    closeExpandedInputBtn.addEventListener('click', closeExpandedInput);
  }

  if (inputOverlayBackdrop) {
    inputOverlayBackdrop.addEventListener('click', closeExpandedInput);
  }
}

function handleSendOrSave() {
  if (state.isStreaming) {
    stopCurrentStream();
    return;
  }

  const sourceInput = state.isInputExpanded ? dom.getExpandedUserInput() : dom.getUserInput();
  const message = sourceInput.value.trim();

  if (!message) return;

  if (state.isEditing && !state.isInputExpanded) {
    saveEdit(message);
  } else if (!state.isEditing) {
    sendMessage(message);
  } else if (state.isEditing && state.isInputExpanded) {
    console.warn("Cannot save edits from expanded view. Please close the expanded view first.");
    return;
  }

  sourceInput.value = '';

  if (state.isInputExpanded) {
    closeExpandedInput();
  }
}

function openExpandedInput() {
  const inputOverlay = dom.getInputOverlay();
  const expandedUserInput = dom.getExpandedUserInput();
  const chatInputArea = dom.getChatInputArea();

  if (!inputOverlay || !expandedUserInput || !chatInputArea || state.isInputExpanded) {
    return;
  }

  expandedUserInput.value = dom.getUserInput().value;
  chatInputArea.classList.add('hidden');
  inputOverlay.classList.remove('invisible', 'opacity-0', 'scale-95');
  inputOverlay.classList.add('opacity-100', 'scale-100');
  dom.getInputOverlayBackdrop().classList.remove('opacity-0');
  dom.getInputOverlayBackdrop().classList.add('opacity-100');
  dom.getExpandedInputContainer().classList.remove('scale-95');
  dom.getExpandedInputContainer().classList.add('scale-100');
  inputOverlay.style.pointerEvents = 'auto';

  setTimeout(() => {
    expandedUserInput.focus();
  }, 300);

  state.isInputExpanded = true;
}

function closeExpandedInput() {
  const inputOverlay = dom.getInputOverlay();
  const expandedUserInput = dom.getExpandedUserInput();
  const chatInputArea = dom.getChatInputArea();

  if (!inputOverlay || !expandedUserInput || !chatInputArea || !state.isInputExpanded) {
    return;
  }

  dom.getUserInput().value = expandedUserInput.value;
  inputOverlay.classList.remove('opacity-100', 'scale-100');
  inputOverlay.classList.add('invisible', 'opacity-0', 'scale-95');
  dom.getInputOverlayBackdrop().classList.remove('opacity-100');
  dom.getInputOverlayBackdrop().classList.add('opacity-0');
  dom.getExpandedInputContainer().classList.remove('scale-100');
  dom.getExpandedInputContainer().classList.add('scale-95');
  inputOverlay.style.pointerEvents = 'none';
  chatInputArea.classList.remove('hidden');
  expandedUserInput.value = '';

  setTimeout(() => {
    dom.getUserInput().focus();
    dom.getUserInput().dispatchEvent(new Event('input'));
  }, 300);

  state.isInputExpanded = false;
}