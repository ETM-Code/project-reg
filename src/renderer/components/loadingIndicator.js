// src/renderer/components/loadingIndicator.js
// Simplified: Manages state, visual indicator handled in app.js

let isLoading = false;
let thinkingTimeout = null; // Keep timeout logic in case we re-add thinking messages later

// Function to signal start of loading
window.showLoadingIndicator = () => {
  if (isLoading) return;
  isLoading = true;
  console.log("LoadingIndicator: State set to loading.");
  // Clear any previous timeout if re-implementing thinking messages
  if (thinkingTimeout) clearTimeout(thinkingTimeout);
  // Placeholder for potential future thinking message logic
  // thinkingTimeout = setTimeout(() => { ... }, 1500);
};

// Function to signal end of loading
window.hideLoadingIndicator = () => {
  if (!isLoading) return;
  isLoading = false;
  console.log("LoadingIndicator: State set to not loading.");
  // Clear the thinking timeout immediately
  if (thinkingTimeout) {
    clearTimeout(thinkingTimeout);
    thinkingTimeout = null;
  }
};

// Function to check loading state (might be useful)
window.isLoadingIndicatorVisible = () => {
    return isLoading;
};

console.log("LoadingIndicator component initialized (state management only).");