// src/renderer/app.js - Main application entry point
import { initializeApp } from './app/init.js';
import { state } from './app/state.js';
import { applyTheme } from './app/theme.js';
import { updateActivePersonalityDisplay } from './app/personality.js';
import { handleAppEditClick } from './app/editing.js';
import * as dom from './app/dom.js';

// --- Global Exports ---
// Expose functions and state needed by other scripts or HTML attributes
window.applyTheme = applyTheme;
window.updateActivePersonalityDisplay = updateActivePersonalityDisplay;
window.handleAppEditClick = handleAppEditClick;

window.getAvailablePersonalities = () => state.availablePersonalities;
window.getCurrentDefaultPersonalityId = () => state.currentDefaultPersonalityId;
window.getCurrentActivePersonalityId = () => {
  const currentPersonality = state.availablePersonalities.find(p => p.name === state.currentActivePersonalityName);
  return currentPersonality ? currentPersonality.id : state.currentDefaultPersonalityId;
};

window.resetAppMessageCounter = (historyLength) => {
  console.log(`Resetting message index counter based on loaded history length: ${historyLength}`);
  state.messageIndexCounter = Math.ceil(historyLength / 2);
};

window.updateModelSelectorDisplay = (modelId) => {
  const modelSelector = dom.getModelSelector();
  if (modelSelector && modelId) {
    modelSelector.value = modelId;
    modelSelector.dispatchEvent(new CustomEvent('optionsUpdated', { bubbles: true }));
    console.log(`[App] Updated model selector to: ${modelId}`);
  }
};

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', initializeApp);
