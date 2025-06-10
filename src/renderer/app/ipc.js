// src/renderer/app/ipc.js
import { state } from './state.js';
import { setStreamingState } from './streaming.js';
import { appendMessage, createBubble } from './message.js';
import { removeInlineLoadingBubble, showInAppAlert } from './ui.js';
import { loadTimersAndAlarms } from './timers.js';

export function initializeIpcListeners() {
  window.electronAPI.onMessage('streamPartialResponse', (data) => {
    removeInlineLoadingBubble();
    if (!state.typingBubble) {
      state.typingBubble = createBubble('bot', '');
      document.getElementById('chatWindow').appendChild(state.typingBubble.container);
    }
    state.typingBubble.rawText += data.text;
    if (state.typingBubble && state.typingBubble.bubble) {
      const existingButton = state.typingBubble.bubble.querySelector('button');
      const existingIcon = state.typingBubble.bubble.querySelector('img');
      let preservedHtml = '';
      if (existingButton) preservedHtml += existingButton.outerHTML;
      if (existingIcon) preservedHtml += existingIcon.outerHTML;
      state.typingBubble.bubble.innerHTML = preservedHtml + marked.parse(state.typingBubble.rawText);
      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([state.typingBubble.bubble]).catch(console.warn);
      }
    }
    if (window.chatHistoryScrollToBottomIfAppropriate) {
      window.chatHistoryScrollToBottomIfAppropriate();
    }
  });

  window.electronAPI.onMessage('streamFinalResponse', (data) => {
    removeInlineLoadingBubble();
    setStreamingState(false);
    state.currentStreamAbortController = null;
    if (state.typingBubble) {
      state.typingBubble.rawText = data.text;
      if (state.typingBubble.bubble) {
        const existingButton = state.typingBubble.bubble.querySelector('button');
        const existingIcon = state.typingBubble.bubble.querySelector('img');
        let preservedHtml = '';
        if (existingButton) preservedHtml += existingButton.outerHTML;
        if (existingIcon) preservedHtml += existingIcon.outerHTML;
        state.typingBubble.bubble.innerHTML = preservedHtml + marked.parse(data.text);
        const links = state.typingBubble.bubble.querySelectorAll('a');
        links.forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const url = link.href;
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
              window.electronAPI.sendMessage('open-external-url', url);
            }
          });
        });
        if (window.MathJax && window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise([state.typingBubble.bubble]).catch(console.warn);
        }
        if (window.chatHistoryScrollToBottomIfAppropriate) {
          window.chatHistoryScrollToBottomIfAppropriate();
        }
      }
      state.typingBubble = null;
    } else {
      appendMessage('bot', data.text);
    }
    state.messageIndexCounter++;
    if (window.hideLoadingIndicator) window.hideLoadingIndicator();
  });

  window.electronAPI.onMessage('streamError', (data) => {
    console.error('[App] Stream error received:', data);
    setStreamingState(false);
    state.currentStreamAbortController = null;
    removeInlineLoadingBubble();
    if (window.hideLoadingIndicator) window.hideLoadingIndicator();
    if (data.message) {
      appendMessage('system', `Error: ${data.message}`);
      state.messageIndexCounter++;
    }
    if (state.typingBubble) {
      state.typingBubble = null;
    }
  });

  window.electronAPI.onMessage('streamStopped', () => {
    console.log('[App] Stream stopped confirmation received');
    setStreamingState(false);
    state.currentStreamAbortController = null;
    removeInlineLoadingBubble();
    if (window.hideLoadingIndicator) window.hideLoadingIndicator();
    if (state.typingBubble && state.typingBubble.rawText) {
      if (state.typingBubble.bubble) {
        state.typingBubble.bubble.innerHTML = marked.parse(state.typingBubble.rawText + '\n\n*[Response stopped by user]*');
      }
      state.typingBubble = null;
      state.messageIndexCounter++;
    }
  });

  window.electronAPI.onMessage('functionCallResponse', (data) => {
    appendMessage('bot', "Tool action processed. Result: " + data.text);
    state.messageIndexCounter++;
    removeInlineLoadingBubble();
    if (window.hideLoadingIndicator) window.hideLoadingIndicator();
  });

  window.electronAPI.onMessage('chat-personality-updated', (data) => {
    const { personalityId, personalityName, modelId } = data;
    if (personalityName && window.updateActivePersonalityDisplay) {
      window.updateActivePersonalityDisplay(personalityName);
    }
    if (modelId && window.updateModelSelectorDisplay) {
      window.updateModelSelectorDisplay(modelId);
    }
    if (personalityId && window.updatePersonalityDropdown) {
      window.updatePersonalityDropdown(state.availablePersonalities, personalityId);
    }
  });

  window.electronAPI.onMessage('tool-execution-result', (data) => {
    const { toolName, result, chatIdFromMain } = data;
    if (result && result.success) {
      if (toolName === 'create_notification' && result.data) {
        const currentChatId = window.getCurrentChatId ? window.getCurrentChatId() : chatIdFromMain;
        if (!currentChatId) return;
        window.electronAPI.sendMessage('show-native-notification', {
          title: result.data.title,
          body: result.data.body,
          chatId: currentChatId
        });
      } else if (toolName === 'create_alarm' || toolName === 'start_timer') {
        loadTimersAndAlarms();
      }
    }
  });

  window.electronAPI.onMessage('native-notification-clicked', (chatId) => {
    if (window.loadChat && chatId) {
      window.loadChat(chatId);
    }
  });

  window.electronAPI.onMessage('show-in-app-notification-fallback', (data) => {
    showInAppAlert('info', data.title, data.body, data.chatId);
  });

  window.electronAPI.onMessage('new-chat-saved', (chatData) => {
    if (window.addChatToHistoryList) {
      window.addChatToHistoryList(chatData);
    }
  });

  window.electronAPI.onMessage('token-usage-updated', (usageData) => {
    const tokenCounterDisplay = document.getElementById('tokenCounterDisplay');
    if (tokenCounterDisplay && usageData && typeof usageData.total === 'number') {
      tokenCounterDisplay.textContent = `Today's Tokens: ${usageData.total.toLocaleString()}`;
    } else {
      tokenCounterDisplay.textContent = "Today's Tokens: N/A";
    }
  });
}