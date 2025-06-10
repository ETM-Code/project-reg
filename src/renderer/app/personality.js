// src/renderer/app/personality.js
import { state } from './state.js';
import * as dom from './dom.js';

export async function fetchPersonalities() {
  try {
    console.log("[App] Fetching personalities...");
    const result = await window.electronAPI.invoke('get-personalities');
    if (result && !result.error) {
      state.availablePersonalities = result.personalities || [];
      state.currentDefaultPersonalityId = result.currentPersonalityId;
      console.log(`[App] Fetched ${state.availablePersonalities.length} personalities. Default ID: ${state.currentDefaultPersonalityId}`);
      const defaultPersonality = state.availablePersonalities.find(p => p.id === state.currentDefaultPersonalityId);
      updateActivePersonalityDisplay(defaultPersonality ? defaultPersonality.name : 'Unknown');
      if (window.updatePersonalityDropdown) {
        window.updatePersonalityDropdown(state.availablePersonalities, state.currentDefaultPersonalityId);
      }
    } else {
      console.error("[App] Error fetching personalities:", result?.error || "Unknown error");
      state.availablePersonalities = [];
      state.currentDefaultPersonalityId = null;
      updateActivePersonalityDisplay('Error');
    }
  } catch (error) {
    console.error("[App] Exception fetching personalities:", error);
    state.availablePersonalities = [];
    state.currentDefaultPersonalityId = null;
    updateActivePersonalityDisplay('Error');
  }
}

export async function handlePersonalityChange(selectedId) {
  try {
    console.log(`[App] Setting default personality to: ${selectedId}`);
    const result = await window.electronAPI.invoke('set-active-personality', selectedId);
    if (result && result.success) {
      state.currentDefaultPersonalityId = selectedId;
      console.log(`[App] Default personality successfully updated to ${selectedId}`);
      const selectedPersonality = state.availablePersonalities.find(p => p.id === selectedId);
      if (selectedPersonality) updateActivePersonalityDisplay(selectedPersonality.name);
    } else {
      console.error("[App] Failed to set default personality:", result?.error || "Unknown error");
      alert(`Failed to set personality: ${result?.error || 'Unknown error'}`);
      if (window.updatePersonalityDropdown) {
        window.updatePersonalityDropdown(state.availablePersonalities, state.currentDefaultPersonalityId); // Revert UI
      }
    }
  } catch (error) {
    console.error("[App] Exception setting personality:", error);
    alert(`Error setting personality: ${error.message}`);
    if (window.updatePersonalityDropdown) {
      window.updatePersonalityDropdown(state.availablePersonalities, state.currentDefaultPersonalityId); // Revert UI
    }
  }
}

export function updateActivePersonalityDisplay(newName) {
  const personalityNameElement = dom.getPersonalityNameElement();
  if (personalityNameElement) {
    state.currentActivePersonalityName = newName || 'Unknown';
    personalityNameElement.textContent = state.currentActivePersonalityName;
    console.log(`[App] Active personality display updated to: ${state.currentActivePersonalityName}`);
  } else {
    console.error("[App] Cannot update personality display: element 'active-personality-name' not found.");
  }
}

export async function handleCurrentChatPersonalitySelect(selectedId) {
  try {
    console.log(`[App] Setting current chat personality to: ${selectedId}`);
    const result = await window.electronAPI.invoke('set-current-chat-personality', selectedId);
    if (result && result.success) {
      console.log(`[App] Current chat personality successfully set to ${selectedId}`);
      const selectedPersonality = state.availablePersonalities.find(p => p.id === selectedId);
      updateActivePersonalityDisplay(selectedPersonality ? selectedPersonality.name : 'Unknown');
    } else {
      console.error("[App] Failed to set current chat personality:", result?.error || "Unknown error");
      alert(`Failed to switch personality for this chat: ${result?.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error("[App] Exception setting current chat personality:", error);
    alert(`Error switching personality: ${error.message}`);
  }
}