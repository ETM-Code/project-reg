// src/renderer/app/ipc.js
import { state } from './state.js';
import { setStreamingState } from './streaming.js';
import { appendMessage, createBubble } from './bubble.js';
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
        // Reload timers to get the latest data
        loadTimersAndAlarms();
        
        // Trigger a delayed timer widget injection
        setTimeout(() => {
          if (window.renderChatTimers) {
            window.renderChatTimers();
          }
          // Trigger refresh of chat timer display
          window.electronAPI.sendMessage('timer-created', { 
            toolName, 
            result,
            chatId: chatIdFromMain || (window.getCurrentChatId ? window.getCurrentChatId() : null)
          });
        }, 500);
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

  // Listen for timer updates and refresh display
  window.electronAPI.onMessage('timer-updated', (data) => {
    console.log('[IPC] Timer updated:', data);
    loadTimersAndAlarms();
  });

  // Listen for alarm updates and refresh display  
  window.electronAPI.onMessage('alarm-updated', (data) => {
    console.log('[IPC] Alarm updated:', data);
    loadTimersAndAlarms();
  });

  // Listen for timer completion notifications
  window.electronAPI.onMessage('timer-completed', (data) => {
    console.log('[IPC] Timer completed:', data);
    const { timerId, label } = data;
    
    // Update the specific timer widget if it exists
    const timerWidget = document.querySelector(`[data-timer-id="${timerId}"]`);
    if (timerWidget) {
      const timerInner = timerWidget.querySelector('.timer-widget-inner');
      const timerDisplay = timerWidget.querySelector('.timer-display');
      
      if (timerInner) {
        timerInner.className = 'timer-widget-inner timer-finished';
        timerInner.style.animation = 'completion 0.6s ease-out';
      }
      
      if (timerDisplay) {
        timerDisplay.textContent = 'Finished!';
      }
    }
    
    // Show enhanced notification
    showInAppAlert('timer', 'Timer Completed!', `${label || 'Your timer'} has finished.`);
  });

  // Listen for alarm trigger notifications
  window.electronAPI.onMessage('alarm-triggered', (data) => {
    console.log('[IPC] Alarm triggered:', data);
    const { alarmId, label } = data;
    
    // Update the specific alarm widget if it exists
    const alarmWidget = document.querySelector(`[data-alarm-id="${alarmId}"]`);
    if (alarmWidget) {
      const alarmInner = alarmWidget.querySelector('.alarm-widget-inner');
      const alarmDisplay = alarmWidget.querySelector('.alarm-display');
      
      if (alarmInner) {
        alarmInner.className = 'alarm-widget-inner alarm-triggered';
        alarmInner.style.animation = 'pulse 2s infinite';
      }
      
      if (alarmDisplay) {
        alarmDisplay.textContent = 'Triggered!';
      }
    }
    
    // Show enhanced notification
    showInAppAlert('alarm', 'Alarm!', `${label || 'Your alarm'} is ringing.`);
  });
}