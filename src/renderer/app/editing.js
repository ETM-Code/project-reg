// src/renderer/app/editing.js
import { state } from './state.js';
import * as dom from './dom.js';
import { escapeHtml } from './message.js';
import { setStreamingState } from './streaming.js';
import { createInlineLoadingBubble } from './ui.js';

export function handleAppEditClick(chatId, messageId, currentText, messageContainerElement) {
  if (state.isEditing) {
    cancelEdit();
  }
  state.isEditing = true;
  state.editingChatId = chatId;
  state.editingMessageId = messageId;
  state.editingOriginalText = currentText;
  state.editingContainerElement = messageContainerElement;
  
  const userInput = dom.getUserInput();
  userInput.value = currentText;
  userInput.focus();

  const sendBtn = dom.getSendBtn();
  sendBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  `;
  sendBtn.title = "Save Edit";
  addCancelButton();
  console.log(`Editing mode activated for chat ID: ${chatId}, message ID: ${messageId}`);
}

export async function saveEdit(newContent) {
  if (!state.editingChatId || !state.editingMessageId || !state.editingContainerElement) {
    console.error("Save Edit called without active editing state.");
    cancelEdit();
    return;
  }

  try {
    console.log(`Sending edit request for chat ${state.editingChatId}, message ID ${state.editingMessageId}`);
    setStreamingState(true);

    let elementToRemove = state.editingContainerElement.nextElementSibling;
    while (elementToRemove) {
      const nextElement = elementToRemove.nextElementSibling;
      dom.getChatWindow().removeChild(elementToRemove);
      elementToRemove = nextElement;
    }

    const metadataRegex = /^(Date: \d{1,2}\/\d{1,2}\/\d{4} \| Time: \d{1,2}:\d{2}:\d{2} \| Since last msg: \d+s\n)|(\(System: [^\)]+\)\n)/;
    let cleanNewContent = newContent.replace(metadataRegex, '').trim();
    const systemMessageRegex = /^\(System: [^\)]+\)\n/gm;
    cleanNewContent = cleanNewContent.replace(systemMessageRegex, '').trim();

    const bubbleDiv = state.editingContainerElement.querySelector('div:not(button)');
    if (bubbleDiv) {
      const buttonHtml = `
        <button class="absolute top-1.5 left-1.5 p-1 text-[var(--user-bubble-text)]/60 hover:text-[var(--user-bubble-text)] bg-[var(--user-bubble-bg)]/50 hover:bg-[var(--user-bubble-bg)]/75 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 edit-button"
                title="Edit message"
                data-message-id="${state.editingMessageId}"
                data-raw-text="${escapeHtml(newContent)}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
        </button>
      `;
      bubbleDiv.innerHTML = buttonHtml + marked.parse(cleanNewContent);
      const editBtn = bubbleDiv.querySelector('.edit-button');
      if (editBtn) {
        editBtn.onclick = (e) => {
          e.stopPropagation();
          if (window.handleAppEditClick && window.getCurrentChatId) {
            const currentChatId = window.getCurrentChatId();
            if (currentChatId) {
              window.handleAppEditClick(currentChatId, state.editingMessageId, newContent, state.editingContainerElement);
            }
          }
        };
      }
    }

    if (window.showLoadingIndicator) {
      window.showLoadingIndicator();
      createInlineLoadingBubble();
    }

    state.currentStreamAbortController = new AbortController();
    window.electronAPI.sendMessage('edit-message', {
      chatId: state.editingChatId,
      messageId: state.editingMessageId,
      newContent
    });

  } catch (error) {
    console.error("Error during saveEdit:", error);
    alert("An error occurred while trying to save the edit.");
    setStreamingState(false);
    state.currentStreamAbortController = null;
  }
  cancelEdit();
}

export function cancelEdit() {
  state.isEditing = false;
  state.editingChatId = null;
  state.editingMessageId = null;
  state.editingOriginalText = null;
  state.editingContainerElement = null;
  dom.getUserInput().value = "";
  
  const sendBtn = dom.getSendBtn();
  sendBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  `;
  sendBtn.title = "Send Message";
  removeCancelButton();
  console.log("Editing mode cancelled.");
}

function addCancelButton() {
  removeCancelButton();
  const cancelButton = document.createElement('button');
  cancelButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  `;
  cancelButton.id = "cancelEditBtn";
  cancelButton.className = "btn btn-secondary p-2 ml-2";
  cancelButton.title = "Cancel Edit";
  cancelButton.onclick = cancelEdit;
  const sendBtn = dom.getSendBtn();
  sendBtn.parentNode.insertBefore(cancelButton, sendBtn.nextSibling);
}

function removeCancelButton() {
  const cancelButton = document.getElementById('cancelEditBtn');
  if (cancelButton) {
    cancelButton.parentNode.removeChild(cancelButton);
  }
}