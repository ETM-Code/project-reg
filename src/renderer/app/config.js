// src/renderer/app/config.js
import * as dom from './dom.js';
import { state } from './state.js';

export async function fetchConfig() {
  try {
    console.log("[App] Fetching configuration...");
    const configData = await window.electronAPI.invoke('get-config');
    if (!configData || configData.error || !configData.availableModels || !configData.defaults) {
      console.error("[App] Error fetching or invalid config structure:", configData?.error || "Invalid data received");
      state.config = null;
      const modelSelector = dom.getModelSelector();
      if (modelSelector) modelSelector.disabled = true;
    } else {
      console.log("[App] Config fetched successfully.");
      state.config = configData;
      populateModelSelector(configData.availableModels, configData.defaults.modelId);
    }
  } catch (error) {
    console.error("[App] Exception fetching config:", error);
    state.config = null;
    const selectorElement = dom.getModelSelector();
    if (selectorElement) selectorElement.disabled = true;
  }
}

export function populateModelSelector(availableModels, defaultModelId) {
  const modelSelector = dom.getModelSelector();
  if (!modelSelector) {
    console.error("[App] Cannot populate model selector: Hidden select element '#modelSelector' not found.");
    return;
  }
  if (!availableModels) {
    console.error("[App] Cannot populate model selector: availableModels data is missing.");
    modelSelector.disabled = true;
    return;
  }

  modelSelector.innerHTML = '';
  let foundDefault = false;

  availableModels.forEach(model => {
    if (!model || typeof model.id !== 'string' || typeof model.name !== 'string') {
      console.warn("[App] Skipping invalid model entry in config:", model);
      return;
    }
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    modelSelector.appendChild(option);
    if (model.id === defaultModelId) {
      option.selected = true;
      foundDefault = true;
    }
  });

  if (!foundDefault && availableModels.length > 0 && availableModels[0].id) {
    console.warn(`[App] Default model ID "${defaultModelId}" not found. Falling back to first model.`);
    defaultModelId = availableModels[0].id;
    const firstOption = modelSelector.querySelector(`option[value="${defaultModelId}"]`);
    if (firstOption) firstOption.selected = true;
  } else if (availableModels.length === 0) {
    console.warn("[App] No available models found in config.");
    modelSelector.disabled = true;
  }

  if (availableModels.length > 0) {
    modelSelector.value = defaultModelId;
    modelSelector.disabled = false;
  }

  console.log(`[App] Hidden model selector populated. Selected value: ${modelSelector.value}`);
  modelSelector.dispatchEvent(new CustomEvent('optionsUpdated', { bubbles: true }));
  
  // Add change handler to sync model selection with backend
  setupModelSelectorChangeHandler(modelSelector);
}

function setupModelSelectorChangeHandler(modelSelector) {
  // Remove any existing change handler to avoid duplicates
  modelSelector.removeEventListener('change', handleModelSelectorChange);
  
  // Add new change handler
  modelSelector.addEventListener('change', handleModelSelectorChange);
  console.log("[App] Model selector change handler attached");
}

async function handleModelSelectorChange(event) {
  const selectedModelId = event.target.value;
  if (!selectedModelId) return;
  
  try {
    console.log(`[App] User selected model: ${selectedModelId}, syncing with backend...`);
    const result = await window.electronAPI.invoke('set-current-chat-model', selectedModelId);
    
    if (result && result.success) {
      console.log(`[App] Successfully synced model to backend: ${selectedModelId}`);
    } else {
      console.error(`[App] Failed to sync model with backend:`, result?.error || 'Unknown error');
    }
  } catch (error) {
    console.error(`[App] Error syncing model selection with backend:`, error);
  }
}