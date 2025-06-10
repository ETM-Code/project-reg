// promptLoader.js - Loads a specific prompt based on its ID from the configuration.
const fs = require('fs');
const path = require('path');
const settingsManager = require('../config/settingsManager'); // Import settingsManager
const { app } = require('electron'); // Import app

/**
 * Loads the content of a prompt file specified by its ID in the configuration.
 * @param {string} promptId - The ID of the prompt to load (must match an ID in config.json's prompts array).
 * @returns {string} The content of the prompt file, or an empty string if not found or an error occurs.
 */
function loadPromptById(promptId) {
  try {
    const promptConfig = settingsManager.getPromptById(promptId);
    if (!promptConfig || !promptConfig.path) {
      console.warn(`[promptLoader] Prompt configuration not found for ID: ${promptId}`);
      return '';
    }

    // Resolve the prompt path directly relative to the application root
    const appRoot = app.getAppPath();
    // promptConfig.path is like "src/prompt/regLifecoachPrompt.md"
    const absolutePromptPath = path.resolve(appRoot, promptConfig.path);

    console.log(`[promptLoader] Attempting to load prompt from: ${absolutePromptPath}`);

    let promptContent = '';
    // Use asynchronous readFile for better practice, though sync is often okay in main process init
    // Sticking with sync for now to minimize changes, but consider async later.
    if (fs.existsSync(absolutePromptPath)) {
      promptContent = fs.readFileSync(absolutePromptPath, 'utf-8');
    } else {
      console.warn(`[promptLoader] Prompt file not found at path: ${absolutePromptPath} for ID: ${promptId}`);
      return '';
    }

    // Universal instructions (if any) from config.json
    let universalInstructions = '';
    try {
      const universalData = settingsManager.getUniversalInstructions();
      if (universalData && universalData.markdown) {
        universalInstructions = universalData.markdown;
        console.log('[promptLoader] Universal markdown instructions loaded and will be appended');
      }
    } catch (error) {
      console.warn('[promptLoader] Failed to load universal instructions:', error);
      // Continue without universal instructions
    }

    console.log(`[promptLoader] Loaded prompt content: ${promptContent.length} characters`);
    return promptContent.trim() + universalInstructions;
  } catch (error) {
    console.error(`[promptLoader] Error loading prompt for ID ${promptId}:`, error);
    return ''; // Return empty string on error
  }
}

module.exports = { loadPromptById };