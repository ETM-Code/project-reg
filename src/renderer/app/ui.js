// src/renderer/app/ui.js
import * as dom from './dom.js';
import { state } from './state.js';

// --- Window Controls ---
export function initializeWindowControls() {
  const minimizeBtn = dom.getMinimizeBtn();
  const maximizeBtn = dom.getMaximizeBtn();
  const closeBtn = dom.getCloseBtn();
  const settingsBtn = dom.getSettingsBtn();

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => window.electronAPI.sendMessage('window-control', 'minimize'));
  }
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => window.electronAPI.sendMessage('window-control', 'maximize'));
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => window.electronAPI.sendMessage('window-control', 'close'));
  }
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      const settingsModal = dom.getSettingsModal();
      if (settingsModal) {
        settingsModal.style.display = 'flex';
        settingsModal.style.visibility = 'visible';
        settingsModal.style.opacity = '1';
      } else {
        console.error('[App] Settings modal not found in DOM');
      }
    });
  }

  window.electronAPI.onMessage('window-maximized-status', (isMaximized) => {
    const maxBtn = dom.getMaximizeBtn();
    if (maxBtn) {
      const icon = maxBtn.querySelector('.window-control-icon');
      if (icon) {
        if (isMaximized) {
          icon.classList.remove('fa-expand-alt');
          icon.classList.add('fa-compress-alt');
          maxBtn.setAttribute('aria-label', 'Restore');
          maxBtn.setAttribute('title', 'Restore');
        } else {
          icon.classList.remove('fa-compress-alt');
          icon.classList.add('fa-expand-alt');
          maxBtn.setAttribute('aria-label', 'Maximize');
          maxBtn.setAttribute('title', 'Maximize');
        }
      }
    }
  });
}

// --- Sidebar Toggle ---
export function initializeSidebarToggle() {
  const sidebarToggleBtn = dom.getSidebarToggleBtn();
  const sidebar = dom.getSidebar();
  const mainContent = dom.getMainContent();

  if (sidebarToggleBtn && sidebar && mainContent) {
    sidebarToggleBtn.addEventListener('click', () => {
      const isHidden = sidebar.classList.contains('hidden');
      sidebar.classList.toggle('hidden', !isHidden);
      mainContent.classList.toggle('sidebar-hidden', !isHidden);
      const icon = sidebarToggleBtn.querySelector('i');
      if (icon) {
        icon.className = isHidden ? 'fas fa-bars' : 'fas fa-chevron-right';
      }
    });
  }
}

// --- Loading Bubbles ---
export function createInlineLoadingBubble() {
  removeInlineLoadingBubble();
  const container = document.createElement('div');
  container.className = 'flex justify-start mb-2 relative group loading-bubble-container';
  const bubble = document.createElement('div');
  bubble.className = 'w-fit max-w-3xl px-3 py-2 rounded-lg whitespace-pre-wrap text-left shadow-sm flex items-center space-x-2';
  bubble.style.backgroundColor = 'var(--bot-bubble-bg)';
  bubble.style.color = 'var(--bot-bubble-text)';
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner w-4 h-4 border-2 border-t-[var(--accent-color)] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin flex-shrink-0';
  bubble.appendChild(spinner);
  container.appendChild(bubble);
  dom.getChatWindow().appendChild(container);
  if (window.chatHistoryScrollToBottomIfAppropriate) {
    window.chatHistoryScrollToBottomIfAppropriate();
  }
  state.loadingBubbleElement = container;
}

export function removeInlineLoadingBubble() {
  if (state.loadingBubbleElement) {
    state.loadingBubbleElement.classList.add('fade-out-fast');
    setTimeout(() => {
      if (state.loadingBubbleElement && state.loadingBubbleElement.parentNode) {
        state.loadingBubbleElement.parentNode.removeChild(state.loadingBubbleElement);
      }
      state.loadingBubbleElement = null;
    }, 200);
  }
}

// --- In-App Alerts ---
export function showInAppAlert(type, title, message, chatId) {
  const inAppAlertsContainer = dom.getInAppAlertsContainer();
  if (!inAppAlertsContainer) {
    console.warn('[App] inAppAlertsContainer not found in DOM.');
    return;
  }
  const alertId = `alert-${Date.now()}`;
  const alertDiv = document.createElement('div');
  alertDiv.id = alertId;
  alertDiv.className = `p-3 mb-2 rounded-md shadow-lg border ${type === 'timer' ? 'bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700' : 'bg-orange-50 dark:bg-orange-900 border-orange-300 dark:border-orange-700'} text-sm relative`;

  const titleEl = document.createElement('h4');
  titleEl.className = 'font-bold';
  titleEl.textContent = title;
  alertDiv.appendChild(titleEl);

  const messageEl = document.createElement('p');
  messageEl.textContent = message;
  alertDiv.appendChild(messageEl);

  if (chatId && window.loadChat) {
    const goToChatBtn = document.createElement('button');
    goToChatBtn.textContent = 'Go to Chat';
    goToChatBtn.className = 'mt-2 mr-2 px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs';
    goToChatBtn.onclick = () => {
      window.loadChat(chatId);
      alertDiv.remove();
    };
    alertDiv.appendChild(goToChatBtn);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.className = 'mt-2 px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs';
  dismissBtn.onclick = () => alertDiv.remove();
  alertDiv.appendChild(dismissBtn);

  inAppAlertsContainer.appendChild(alertDiv);
  setTimeout(() => {
    const stillExists = document.getElementById(alertId);
    if (stillExists) stillExists.remove();
  }, 30000);
}