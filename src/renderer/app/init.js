// src/renderer/app/init.js
import { personalitySelector } from '../components/personalitySelector.js';
import { applyInitialTheme } from './theme.js';
import { applyInitialFont } from './font.js';
import { fetchConfig } from './config.js';
import { fetchPersonalities, handleCurrentChatPersonalitySelect } from './personality.js';
import { initializeInputHandlers } from './input.js';
import { initializeIpcListeners } from './ipc.js';
import { initializeTimers } from './timers.js';
import { initializeWindowControls, initializeSidebarToggle } from './ui.js';
import * as dom from './dom.js';
import { state } from './state.js';

export async function initializeApp() {
  // Initial UI setup
  await applyInitialTheme();
  await applyInitialFont();
  initializeWindowControls();
  initializeSidebarToggle();

  // Fetch core data
  await fetchConfig();
  await fetchPersonalities();

  // Initialize Token Counter
  try {
    const initialUsage = await window.electronAPI.invoke('get-initial-token-usage');
    const tokenCounterDisplay = dom.getTokenCounterDisplay();
    if (tokenCounterDisplay && initialUsage && typeof initialUsage.total === 'number') {
      tokenCounterDisplay.textContent = `Today's Tokens: ${initialUsage.total.toLocaleString()}`;
    } else if (tokenCounterDisplay) {
      tokenCounterDisplay.textContent = "Today's Tokens: N/A";
    }
  } catch (error) {
    console.error("Error fetching initial token usage:", error);
    const tokenCounterDisplay = dom.getTokenCounterDisplay();
    if (tokenCounterDisplay) tokenCounterDisplay.textContent = "Today's Tokens: N/A";
  }

  // Initialize components and handlers
  initializeInputHandlers();
  initializeIpcListeners();
  initializeTimers();

  // Initialize Personality Selector Component
  const openPersonalitySelectorBtn = dom.getOpenPersonalitySelectorBtn();
  if (personalitySelector && openPersonalitySelectorBtn) {
    try {
      await personalitySelector.init(handleCurrentChatPersonalitySelect);
      openPersonalitySelectorBtn.addEventListener('click', () => personalitySelector.show());
    } catch (error) {
      console.error('[App] Failed to initialize personality selector:', error);
      if (openPersonalitySelectorBtn) {
        openPersonalitySelectorBtn.disabled = true;
        openPersonalitySelectorBtn.title = 'Personality selector failed to load';
      }
    }
  }

  console.log("[App] Frontend initialized.");
}