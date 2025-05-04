const { loadConfig } = require('./configLoader');
const path = require('path');
const fs = require('fs').promises; // Added for file writing
const CONFIG_FILE_PATH = path.join(__dirname, '..', '..', 'config.json'); // Define config path

let config = null;
let initializationPromise = null;

/**
 * Initializes the SettingsManager by loading the configuration.
 * Should be called once at application startup.
 * @returns {Promise<void>}
 */
async function initializeSettings() {
  if (!initializationPromise) {
    initializationPromise = loadConfig().then(loadedConfig => {
      config = loadedConfig;
      console.log('SettingsManager initialized.');
    }).catch(error => {
      console.error('Failed to initialize SettingsManager:', error);
      // Prevent further attempts if initialization fails critically
      initializationPromise = Promise.reject(error); 
      throw error; // Re-throw to signal failure upstream
    });
  }
  return initializationPromise;
}

/**
 * Ensures settings are loaded before accessing them.
 * @private
 */
function ensureInitialized() {
  if (!config) {
    throw new Error('SettingsManager not initialized. Call initializeSettings() first.');
  }
}

// --- Getters for Configuration Sections ---

function getPaths() {
  ensureInitialized();
  // Resolve relative paths from config.json to be absolute based on project root
  const projectRoot = path.join(__dirname, '..', '..'); 
  const resolvedPaths = {};
  for (const key in config.paths) {
    resolvedPaths[key] = path.resolve(projectRoot, config.paths[key]);
  }
  return resolvedPaths;
}

/**
 * Gets the API key for a specific provider from the loaded configuration.
 * @param {'openai' | 'gemini'} provider The API provider name.
 * @returns {string | undefined} The API key, or undefined if not found.
 */
function getApiKey(provider) {
  ensureInitialized();
  // Return the key directly from the loaded config object
  return config.apiKeys ? config.apiKeys[provider] : undefined;
}

function getDefaults() {
  ensureInitialized();
  return config.defaults || {};
}

function getPrompts() {
  ensureInitialized();
  return config.prompts || [];
}

function getContextSets() {
  ensureInitialized();
  return config.contextSets || [];
}

function getPersonalities() {
  ensureInitialized();
  return config.personalities || [];
}

function getPersonalityById(id) {
    ensureInitialized();
    return getPersonalities().find(p => p.id === id);
}

function getPromptById(id) {
    ensureInitialized();
    return getPrompts().find(p => p.id === id);
}

function getContextSetById(id) {
    ensureInitialized();
    return getContextSets().find(cs => cs.id === id);
}


// --- Functions for Managing Settings (Placeholders) ---

/**
 * Saves the current state of dynamic settings (prompts, contexts, personalities)
 * back to the configuration file or a user-specific override file.
 * TODO: Implement persistence logic.
 */
async function saveSettings() {
  ensureInitialized();
  console.warn('saveSettings() not implemented yet.');
  // Implementation would involve writing the relevant parts of 'config' back to config.json
  // or potentially merging with a user config file.
  // const configPath = path.join(__dirname, '..', '..', 'config.json');
  // await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// TODO: Add functions to add/update/delete prompts, context sets, personalities
// These functions would modify the 'config' object in memory and then call saveSettings().

/**
 * Saves the API key for a specific provider to config.json.
 * @param {'openai' | 'gemini'} provider The API provider name.
 * @param {string} key The API key to save.
 * @returns {Promise<void>}
 */
async function saveApiKey(provider, key) {
    ensureInitialized(); // Make sure config is loaded

    console.log(`[SettingsManager] Attempting to save API key for provider: ${provider}`);

    if (!config.apiKeys) {
        // Initialize apiKeys object if it doesn't exist (shouldn't happen with current config.json)
        config.apiKeys = { openai: "", gemini: "" };
        console.warn("[SettingsManager] Initialized missing apiKeys object in config.");
    }

    if (provider !== 'openai' && provider !== 'gemini') {
        throw new Error(`Invalid API key provider specified: ${provider}. Must be 'openai' or 'gemini'.`);
    }

    // Update the key in the config object in memory
    config.apiKeys[provider] = key || ""; // Store empty string if key is null/undefined

    // Write the entire updated config object back to the file
    try {
        const configString = JSON.stringify(config, null, 2); // Pretty print JSON
        await fs.writeFile(CONFIG_FILE_PATH, configString, 'utf8');
        console.log(`[SettingsManager] Successfully wrote updated config to ${CONFIG_FILE_PATH}`);
    } catch (error) {
        console.error(`[SettingsManager] Error writing config file: ${error}`);
        // Consider reverting in-memory change? For now, let error propagate.
        throw new Error(`Failed to save API key configuration changes: ${error.message}`);
    }
}


/**
 * Saves overrides for a specific personality's settings to config.json.
 * @param {string} personalityId The ID of the personality to update.
* @param {object} updatedSettings An object containing the fields to update.
*                                 Expected: { defaultContextSetIds: string[], customInstructions: string | null }
* @returns {Promise<void>}
*/
async function savePersonalityOverrides(personalityId, updatedSettings) {
 ensureInitialized(); // Make sure config is loaded

 console.log(`[SettingsManager] Attempting to save overrides for personality: ${personalityId}`);

 const personalityIndex = config.personalities.findIndex(p => p.id === personalityId);

 if (personalityIndex === -1) {
   throw new Error(`Personality with ID "${personalityId}" not found.`);
 }

 // Update the specific fields in the config object in memory
 const personalityToUpdate = config.personalities[personalityIndex];
 let updated = false;

 if (updatedSettings.hasOwnProperty('defaultContextSetIds')) {
     // Basic validation: ensure it's an array
     if (!Array.isArray(updatedSettings.defaultContextSetIds)) {
         throw new Error('Invalid format for defaultContextSetIds - expected an array.');
     }
     // Only update if different to avoid unnecessary writes? Optional.
     personalityToUpdate.defaultContextSetIds = updatedSettings.defaultContextSetIds;
     console.log(`[SettingsManager] Updated defaultContextSetIds for ${personalityId}`);
     updated = true;
 }

 if (updatedSettings.hasOwnProperty('customInstructions')) {
     // Allow null or string
     if (typeof updatedSettings.customInstructions !== 'string' && updatedSettings.customInstructions !== null) {
         throw new Error('Invalid format for customInstructions - expected a string or null.');
     }
     // Only update if the personality allows it and the value is provided
     if (personalityToUpdate.allowCustomInstructions) {
         personalityToUpdate.customInstructions = updatedSettings.customInstructions;
         console.log(`[SettingsManager] Updated customInstructions for ${personalityId}`);
         updated = true;
     } else if (updatedSettings.customInstructions !== null && updatedSettings.customInstructions !== undefined) {
         // Log a warning if trying to set instructions when not allowed, but don't throw error
         console.warn(`[SettingsManager] Attempted to set customInstructions for personality ${personalityId}, but allowCustomInstructions is false. Ignoring.`);
     }
 }

 if (!updated) {
     console.log(`[SettingsManager] No changes detected for personality ${personalityId}. Skipping save.`);
     return; // No need to write if nothing changed
 }

 // Write the entire updated config object back to the file
 try {
   const configString = JSON.stringify(config, null, 2); // Pretty print JSON
   await fs.writeFile(CONFIG_FILE_PATH, configString, 'utf8');
   console.log(`[SettingsManager] Successfully wrote updated config to ${CONFIG_FILE_PATH}`);
 } catch (error) {
   console.error(`[SettingsManager] Error writing config file: ${error}`);
   // Revert in-memory changes? Maybe not, let the error propagate.
   throw new Error(`Failed to save configuration changes: ${error.message}`);
 }
}


module.exports = {
 initializeSettings,
  getPaths,
  getApiKey, // Updated function name
  getDefaults,
  getPrompts,
  getContextSets,
  getPersonalities,
  getPersonalityById,
  getPromptById,
  getContextSetById,
 savePersonalityOverrides,
 saveApiKey, // Export the new function
 // saveSettings, // Export when implemented
};