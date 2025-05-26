const settingsManager = window.electronAPI.settingsManager;

let settingsModal = null;
console.log('settingsModal element at definition:', settingsModal); // Added console.log
let closeSettingsButton = null;
let themeSelector = null;
let fontSelector = null;
let currentTheme = null;
let currentFont = null;
let settingsBtn = null;
// Variables for all modal elements
let globalModelSelector = null;
let openaiApiKeyInput = null;
let geminiApiKeyInput = null;
let saveOpenaiApiKeyBtn = null;
let saveGeminiApiKeyBtn = null;
let reasoningEffortGroup = null;
let reasoningEffortSelector = null;

async function initSettingsModal() {
    console.log('[SettingsModal] Starting initialization...');
    settingsModal = document.getElementById('settingsModal');
    console.log('[SettingsModal] settingsModal element found:', !!settingsModal);
    if (!settingsModal) {
        console.error('[SettingsModal] Settings modal element not found! Cannot initialize.');
        return;
    }
    closeSettingsButton = document.getElementById('closeSettingsBtn');
    themeSelector = document.getElementById('themeSelector');
    fontSelector = document.getElementById('font-selector');
    settingsBtn = document.getElementById('settingsBtn');

    // Get model and API key elements
    globalModelSelector = document.getElementById('globalModelSelector');
    openaiApiKeyInput = document.getElementById('openaiApiKeyInput');
    geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
    saveOpenaiApiKeyBtn = document.getElementById('saveOpenaiApiKeyBtn');
    saveGeminiApiKeyBtn = document.getElementById('saveGeminiApiKeyBtn');
    reasoningEffortGroup = document.getElementById('reasoningEffortGroup');
    reasoningEffortSelector = document.getElementById('reasoningEffortSelector');

    // Check for required elements (removed personality-related checks)
    if (!settingsModal || !closeSettingsButton || !themeSelector || !fontSelector ||
        !globalModelSelector || !openaiApiKeyInput || !geminiApiKeyInput || 
        !saveOpenaiApiKeyBtn || !saveGeminiApiKeyBtn || !reasoningEffortGroup || !reasoningEffortSelector) {
        
        console.error('Settings modal elements not found. Check IDs in settingsModal.js and settings.html.');
        // Detailed logging for missing elements
        if (!settingsModal) console.error('Missing: settingsModal');
        if (!closeSettingsButton) console.error('Missing: closeSettingsButton');
        if (!themeSelector) console.error('Missing: themeSelector');
        if (!fontSelector) console.error('Missing: fontSelector');
        if (!globalModelSelector) console.error('Missing: globalModelSelector');
        if (!openaiApiKeyInput) console.error('Missing: openaiApiKeyInput');
        if (!geminiApiKeyInput) console.error('Missing: geminiApiKeyInput');
        if (!saveOpenaiApiKeyBtn) console.error('Missing: saveOpenaiApiKeyBtn');
        if (!saveGeminiApiKeyBtn) console.error('Missing: saveGeminiApiKeyBtn');
        if (!reasoningEffortGroup) console.error('Missing: reasoningEffortGroup');
        if (!reasoningEffortSelector) console.error('Missing: reasoningEffortSelector');
        return;
    }

    // Load current settings
    try {
        // Load theme
        currentTheme = await settingsManager.getGlobalSetting('theme') || 'dark';
        console.log(`[SettingsModal] Initial theme loaded: ${currentTheme}`);
        applyTheme(currentTheme);
        if (themeSelector) {
            themeSelector.value = currentTheme;
            console.log(`[SettingsModal] Theme selector initialized to: ${themeSelector.value}`);
        }

        // Load font settings
        const fontSettings = await settingsManager.getFontSettings();
        currentFont = fontSettings.defaultFont;
        await populateFontSelector();
        applyFont(currentFont);
        if (fontSelector) fontSelector.value = currentFont;

        // Load model settings
        await loadAndPopulateModelSettings();

        // Load API keys
        await loadApiKeys();

    } catch (error) {
        console.error("Failed to load initial settings for modal:", error);
        // Fallback to defaults if loading fails
        currentTheme = 'dark';
        applyTheme(currentTheme);
        currentFont = 'System Default';
        await populateFontSelector();
        applyFont(currentFont);
        // Still try to load other settings
        try {
            await loadAndPopulateModelSettings();
            await loadApiKeys();
        } catch (innerError) {
            console.error("Failed to load settings during fallback:", innerError);
        }
    }

    // Event Listeners
    closeSettingsButton.addEventListener('click', () => {
        if (settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // Add event listener for footer close button if it exists
    const closeSettingsFooterBtn = document.getElementById('closeSettingsFooterBtn');
    if (closeSettingsFooterBtn) {
        closeSettingsFooterBtn.addEventListener('click', () => {
            if (settingsModal) {
                settingsModal.style.display = 'none';
            }
        });
    }

    // Close modal when clicking backdrop
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // Theme selector
    if (themeSelector) {
        themeSelector.addEventListener('change', async (event) => {
            const newTheme = event.target.value;
            console.log(`[SettingsModal] Theme selector changed to: ${newTheme}`);
            applyTheme(newTheme);
            try {
                await settingsManager.saveGlobalSetting('theme', newTheme);
                currentTheme = newTheme;
                console.log(`[SettingsModal] Theme saved: ${newTheme}`);
                // Ensure dropdown reflects the saved value
                themeSelector.value = newTheme;
                console.log(`[SettingsModal] Theme selector value set to: ${themeSelector.value}`);
                
                // Apply theme to main window directly since we're in the same window
                if (window.applyTheme) {
                    window.applyTheme(newTheme);
                    console.log(`[SettingsModal] Applied theme directly to main window: ${newTheme}`);
                }
            } catch (error) {
                console.error("Failed to save theme:", error);
                // Revert theme if save fails
                applyTheme(currentTheme);
                themeSelector.value = currentTheme;
            }
        });
    }

    // Font selector
    if (fontSelector) {
        fontSelector.addEventListener('change', async (event) => {
            const newFontName = event.target.value;
            applyFont(newFontName);
            try {
                await settingsManager.saveDefaultFont(newFontName);
                currentFont = newFontName;
                console.log(`[SettingsModal] Font saved: ${newFontName}`);
            } catch (error) {
                console.error("Failed to save font:", error);
                // Revert font if save fails
                applyFont(currentFont);
                fontSelector.value = currentFont;
            }
        });
    }

    // Global model selector
    if (globalModelSelector) {
        globalModelSelector.addEventListener('change', async (event) => {
            const newModelId = event.target.value;
            try {
                await window.electronAPI.settingsManager.saveGlobalSetting('defaultModel', newModelId);
                console.log(`[SettingsModal] Default model saved: ${newModelId}`);
                await updateReasoningEffortVisibility(newModelId);
            } catch (error) {
                console.error(`[SettingsModal] Failed to save default model:`, error);
            }
        });
    }

    // Reasoning effort selector
    if (reasoningEffortSelector) {
        reasoningEffortSelector.addEventListener('change', async (event) => {
            const newEffort = event.target.value;
            try {
                await window.electronAPI.settingsManager.saveGlobalSetting('reasoningEffort', newEffort);
                console.log(`[SettingsModal] Reasoning effort saved: ${newEffort}`);
            } catch (error) {
                console.error(`[SettingsModal] Failed to save reasoning effort:`, error);
            }
        });
    }

    // API Key save buttons
    if (saveOpenaiApiKeyBtn) {
        saveOpenaiApiKeyBtn.addEventListener('click', async () => {
            const apiKey = openaiApiKeyInput.value.trim();
            try {
                await window.electronAPI.invoke('save-api-key', { provider: 'openai', key: apiKey });
                console.log('[SettingsModal] OpenAI API key saved successfully');
                // Provide user feedback
                showTemporaryMessage(saveOpenaiApiKeyBtn, 'Saved!', 'success');
            } catch (error) {
                console.error('[SettingsModal] Failed to save OpenAI API key:', error);
                showTemporaryMessage(saveOpenaiApiKeyBtn, 'Error!', 'error');
            }
        });
    }

    if (saveGeminiApiKeyBtn) {
        saveGeminiApiKeyBtn.addEventListener('click', async () => {
            const apiKey = geminiApiKeyInput.value.trim();
            try {
                await window.electronAPI.invoke('save-api-key', { provider: 'gemini', key: apiKey });
                console.log('[SettingsModal] Gemini API key saved successfully');
                // Provide user feedback
                showTemporaryMessage(saveGeminiApiKeyBtn, 'Saved!', 'success');
            } catch (error) {
                console.error('[SettingsModal] Failed to save Gemini API key:', error);
                showTemporaryMessage(saveGeminiApiKeyBtn, 'Error!', 'error');
            }
        });
    }
}

async function loadAndPopulateModelSettings() {
    if (!globalModelSelector || !reasoningEffortSelector || !reasoningEffortGroup) {
        console.error('[SettingsModal] Model settings UI elements not found for population.');
        return;
    }

    try {
        const settings = await window.electronAPI.invoke('get-settings');
        if (settings.error) {
            console.error('[SettingsModal] Error fetching global settings for models:', settings.error);
            globalModelSelector.innerHTML = '<option value="">Error loading models</option>';
            return;
        }

        const { availableModels, defaultModel, reasoningEffort } = settings;

        // Populate Global Model Selector
        globalModelSelector.innerHTML = '';
        if (availableModels && availableModels.length > 0) {
            availableModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name || model.id;
                if (model.id === defaultModel) {
                    option.selected = true;
                }
                globalModelSelector.appendChild(option);
            });
        } else {
            globalModelSelector.innerHTML = '<option value="">No models available</option>';
        }

        // Set current reasoning effort
        reasoningEffortSelector.value = reasoningEffort || 'medium';

        // Update reasoning effort visibility based on the initially selected/default model
        if (defaultModel) {
            await updateReasoningEffortVisibility(defaultModel);
        } else if (availableModels && availableModels.length > 0) {
            await updateReasoningEffortVisibility(availableModels[0].id);
        } else {
            reasoningEffortGroup.style.display = 'none';
        }

    } catch (error) {
        console.error('[SettingsModal] Exception loading model settings:', error);
        globalModelSelector.innerHTML = '<option value="">Error loading models</option>';
    }
}

async function updateReasoningEffortVisibility(modelId) {
    if (!modelId || !reasoningEffortGroup) return;

    try {
        const modelDetails = await window.electronAPI.settingsManager.getModelDetails(modelId);
        if (modelDetails.success && modelDetails.details) {
            const isReasoningModel = modelDetails.details.implementation === 'openai-reasoning';
            if (isReasoningModel) {
                reasoningEffortGroup.style.display = ''; // Or 'block', 'flex' depending on original
            } else {
                reasoningEffortGroup.style.display = 'none';
            }
        } else {
            // If we can't get model details, hide reasoning effort
            reasoningEffortGroup.style.display = 'none';
        }
    } catch (error) {
        console.error(`[SettingsModal] Error checking model details for ${modelId}:`, error);
        reasoningEffortGroup.style.display = 'none';
    }
}

async function loadApiKeys() {
    try {
        const apiKeys = await window.electronAPI.invoke('get-api-keys');
        if (apiKeys.error) {
            console.error('[SettingsModal] Error fetching API keys:', apiKeys.error);
            return;
        }

        // Populate API key inputs (mask the keys for security)
        if (openaiApiKeyInput && apiKeys.openai) {
            openaiApiKeyInput.value = apiKeys.openai ? maskApiKey(apiKeys.openai) : '';
            openaiApiKeyInput.placeholder = apiKeys.openai ? 'API key is set' : 'Enter your OpenAI key';
        }
        
        if (geminiApiKeyInput && apiKeys.gemini) {
            geminiApiKeyInput.value = apiKeys.gemini ? maskApiKey(apiKeys.gemini) : '';
            geminiApiKeyInput.placeholder = apiKeys.gemini ? 'API key is set' : 'Enter your Gemini key';
        }

    } catch (error) {
        console.error('[SettingsModal] Exception loading API keys:', error);
    }
}

function maskApiKey(key) {
    if (!key || key.length < 8) return key;
    // Show first 4 and last 4 characters, mask the middle
    return key.substring(0, 4) + '•'.repeat(Math.max(key.length - 8, 3)) + key.substring(key.length - 4);
}

function applyTheme(themeName) {
    // Remove existing theme classes
    document.body.classList.remove('theme-dark', 'theme-light');
    
    // Apply new theme class (only for dark and light, default has no class)
    if (themeName === 'dark') {
        document.body.classList.add('theme-dark');
    } else if (themeName === 'light') {
        document.body.classList.add('theme-light');
    }
    // For 'default' theme, no class is added (uses :root variables)
    
    console.log(`Theme applied: ${themeName}`);
}

async function populateFontSelector() {
    if (!fontSelector) {
        console.error('[SettingsModal] Font selector element not found in populateFontSelector.');
        return;
    }

    console.log('[SettingsModal] Attempting to fetch font settings via IPC...');
    try {
        const fontSettingsData = await window.electronAPI.invoke('settings:get-font-settings');
        console.log('[SettingsModal] Font settings received:', fontSettingsData);

        if (!fontSettingsData || typeof fontSettingsData !== 'object') {
            console.error('[SettingsModal] Invalid or no font settings data received:', fontSettingsData);
            fontSelector.innerHTML = '<option value="">Error loading fonts</option>';
            return;
        }

        const availableFonts = fontSettingsData.availableFonts;
        const defaultFont = fontSettingsData.defaultFont;

        console.log('[SettingsModal] availableFonts from received data:', availableFonts);
        console.log('[SettingsModal] defaultFont from received data:', defaultFont);

        fontSelector.innerHTML = '';

        if (!Array.isArray(availableFonts) || availableFonts.length === 0) {
            console.warn('[SettingsModal] No available fonts found or availableFonts is not an array. Displaying fallback.');
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No fonts available";
            fontSelector.appendChild(option);
            if (defaultFont) {
                const defaultOption = document.createElement('option');
                defaultOption.value = defaultFont;
                defaultOption.textContent = `${defaultFont} (Default - not in list)`;
                defaultOption.selected = true;
                fontSelector.appendChild(defaultOption);
            }
            return;
        }

        availableFonts.forEach(font => {
            if (typeof font !== 'object' || !font.name) {
                console.warn('[SettingsModal] Invalid font object in availableFonts:', font);
                return;
            }
            console.log('[SettingsModal] Processing font for dropdown:', font);
            const option = document.createElement('option');
            option.value = font.name;
            option.textContent = font.name;
            if (font.name === defaultFont) {
                option.selected = true;
            }
            fontSelector.appendChild(option);
        });

        if (defaultFont && fontSelector.options.namedItem(defaultFont)) {
             fontSelector.value = defaultFont;
        } else if (defaultFont) {
            console.warn(`[SettingsModal] Default font "${defaultFont}" not found in available fonts list.`);
        }

    } catch (error) {
        console.error("[SettingsModal] Failed to populate font selector via IPC:", error);
        fontSelector.innerHTML = '<option value="">Error loading fonts</option>';
    }
}

async function applyFont(fontName) {
    try {
        const fontData = await settingsManager.getAvailableFonts();
        if (!fontData || !fontData.success || !Array.isArray(fontData.fonts)) {
            console.error("Failed to get available fonts or data is not in expected format:", fontData);
            document.body.style.setProperty('--font-family-base', 'sans-serif');
            console.warn("Applied generic sans-serif due to missing font data.");
            return;
        }

        const availableFonts = fontData.fonts;
        const selectedFont = availableFonts.find(f => f.name === fontName);

        if (selectedFont) {
            document.body.style.setProperty('--font-family-base', selectedFont.cssName);
            console.log(`Font applied: ${selectedFont.name} (${selectedFont.cssName})`);
        } else {
            const systemDefaultFont = availableFonts.find(f => f.name === "Modern Sans");
            if (systemDefaultFont) {
                 document.body.style.setProperty('--font-family-base', systemDefaultFont.cssName);
                 console.warn(`Font "${fontName}" not found, applied Modern Sans.`);
            } else {
                document.body.style.setProperty('--font-family-base', 'sans-serif');
                console.error(`Font "${fontName}" and "Modern Sans" not found. Applied generic sans-serif.`);
            }
        }
    } catch (error) {
        console.error("Failed to apply font:", error);
        document.body.style.setProperty('--font-family-base', 'sans-serif');
    }
}

function showTemporaryMessage(buttonElement, message, type) {
    const originalText = buttonElement.textContent;
    buttonElement.textContent = message;
    
    // Add visual feedback based on type
    if (type === 'success') {
        buttonElement.style.backgroundColor = '#10b981'; // Green
    } else if (type === 'error') {
        buttonElement.style.backgroundColor = '#ef4444'; // Red
    }
    
    setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.style.backgroundColor = ''; // Reset to default
    }, 2000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('[SettingsModal] DOM loaded, initializing settings modal...');
    initSettingsModal();
});