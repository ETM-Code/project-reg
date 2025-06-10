// src/renderer/app/message.js
import * as dom from './dom.js';
import { state } from './state.js';

export function appendMessage(sender, text, index) {
  const bubbleElements = createBubble(sender, text, index);
  dom.getChatWindow().appendChild(bubbleElements.container);
  if (window.chatHistoryScrollToBottomIfAppropriate) {
    window.chatHistoryScrollToBottomIfAppropriate();
  }
}

export function createBubble(sender, text, messageId = null) {
  const bubble = document.createElement('div');
  const container = document.createElement('div');
  container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2 relative group`;
  if (messageId) {
    container.dataset.messageId = messageId;
  }

  const bubbleBgVar = sender === 'user' ? 'var(--user-bubble-bg)' : 'var(--bot-bubble-bg)';
  const bubbleTextVar = sender === 'user' ? 'var(--user-bubble-text)' : 'var(--bot-bubble-text)';
  bubble.className = `w-fit max-w-3xl px-4 py-2 rounded-lg whitespace-pre-wrap text-left shadow-sm fade-in`;
  bubble.style.backgroundColor = bubbleBgVar;
  bubble.style.color = bubbleTextVar;

  let editButton = null;
  let personalityIconHtml = '';

  if (sender === 'user' && messageId) {
    editButton = document.createElement('button');
    editButton.className = 'absolute top-0.5 left-0.5 text-[var(--user-bubble-text)]/60 hover:text-[var(--user-bubble-text)] bg-[var(--user-bubble-bg)]/50 hover:bg-[var(--user-bubble-bg)]/75 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 edit-button p-1';
    editButton.title = 'Edit message';
    editButton.dataset.messageId = messageId;
    editButton.dataset.rawText = text;
    editButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
      </svg>
    `;
  } else if (sender === 'bot' || sender === 'model') {
    const personalities = window.getAvailablePersonalities ? window.getAvailablePersonalities() : [];
    let currentPersonalityId = null;
    if (window.getCurrentActivePersonalityId) {
      currentPersonalityId = window.getCurrentActivePersonalityId();
    }
    if (!currentPersonalityId && window.getCurrentDefaultPersonalityId) {
      currentPersonalityId = window.getCurrentDefaultPersonalityId();
    }
    const currentPersonalityConfig = personalities.find(p => p.id === currentPersonalityId);
    if (currentPersonalityConfig && currentPersonalityConfig.icon) {
      let iconSrc = currentPersonalityConfig.icon;
      if (iconSrc.startsWith('src/renderer/')) {
        iconSrc = iconSrc.substring('src/renderer/'.length);
      }
      if (!iconSrc.startsWith('./') && !iconSrc.startsWith('http') && !iconSrc.startsWith('/')) {
        iconSrc = './' + iconSrc;
      }
      personalityIconHtml = `
        <img src="${iconSrc}" 
             alt="${currentPersonalityConfig.name}" 
             class="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full object-cover opacity-60 border border-[var(--bot-bubble-text)]/20"
             onerror="this.style.display='none'">
      `;
    }
  }

  const metadataRegex = /^(Date: \d{1,2}\/\d{1,2}\/\d{4} \| Time: \d{1,2}:\d{2}:\d{2} \| Since last msg: \d+s\n)|(\(System: [^\)]+\)\n)/;
  let cleanText = text.replace(metadataRegex, '');
  cleanText = cleanText.trim();
  const systemMessageRegex = /^\(System: [^\)]+\)\n/gm;
  cleanText = cleanText.replace(systemMessageRegex, '');
  cleanText = cleanText.trim();

  bubble.innerHTML = personalityIconHtml + marked.parse(cleanText);

  const links = bubble.querySelectorAll('a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = link.href;
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        window.electronAPI.sendMessage('open-external-url', url);
      }
    });
  });

  container.appendChild(bubble);

  // Add edit button to container (not bubble) to avoid affecting bubble dimensions
  if (editButton) {
    container.appendChild(editButton);
  }

  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([bubble]).catch((err) => {
      console.warn('MathJax rendering error:', err);
    });
  }

  // Set up edit button event handler
  if (editButton) {
    editButton.onclick = (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const id = btn.dataset.messageId;
      const rawText = btn.dataset.rawText;
      if (window.handleAppEditClick && window.getCurrentChatId) {
        const currentChatId = window.getCurrentChatId();
        if (currentChatId) {
          window.handleAppEditClick(currentChatId, id, rawText, container);
        } else {
          console.warn("Edit clicked, but currentChatId is not available.");
        }
      } else {
        console.warn("Edit clicked, but handleAppEditClick or getCurrentChatId is not available.");
      }
    };
  }

  return { container, bubble, rawText: text };
}

export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}