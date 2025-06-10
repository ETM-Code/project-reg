const { ipcMain } = require('electron');
const chatStorage = require('../services/chatStorage');
const chatManager = require('../models/chatManager');
const settingsManager = require('../config/settingsManager'); // Import settingsManager
const dailyTokenTracker = require('../services/dailyTokenTracker'); // Added for token tracking
const { countTokens } = require('../util/tokenCounter'); // Added for token counting
const fileConverter = require('../util/fileConverter'); // Import file converter
const pathManager = require('../util/pathManager'); // Import path manager
const { dialog } = require('electron'); // For file dialogs
const fs = require('fs');
const path = require('path');

// Import shared stream state
const { streamState } = require('./streamState');

// Use path manager for file paths
const TIMERS_FILE_PATH = pathManager.getTimersPath();
const ALARMS_FILE_PATH = pathManager.getAlarmsPath();

// Helper function to read JSON file safely
function readJsonFile(filePath, defaultData = []) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
        return defaultData;
    } catch (error) {
        console.error(`[IPC] Error reading JSON file ${filePath}:`, error);
        return defaultData;
    }
}

// Helper function to write JSON file safely
function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`[IPC] Error writing JSON file ${filePath}:`, error);
        return false;
    }
}


function setupIpcHandlers(mainWindow) { // Accept mainWindow
    ipcMain.handle('list-chats', async () => {
        return await chatStorage.listChats();
    });

    ipcMain.handle('start-new-chat', async () => {
        const { newChatId, deletedChatId, error } = await chatManager.startNewChat(); // Get result object
        // REMOVED: Explicit saveChat call here. Let the first interaction save it.
        // Notify renderer if a previous chat was deleted
        if (deletedChatId && mainWindow && !mainWindow.isDestroyed()) {
            console.log(`[IPC] Notifying renderer of deleted chat: ${deletedChatId}`);
            mainWindow.webContents.send('chat-deleted', deletedChatId);
        }
        return newChatId; // Return the ID of the newly started chat
    });

    ipcMain.handle('load-chat', async (_, chatId) => {
        const { success, history, deletedChatId } = await chatManager.loadChat(chatId); // Get result object
        // Notify renderer if a previous chat was deleted during the load process
        if (deletedChatId && mainWindow && !mainWindow.isDestroyed()) {
             console.log(`[IPC] Notifying renderer of deleted chat: ${deletedChatId}`);
             mainWindow.webContents.send('chat-deleted', deletedChatId);
        }
        if (success) {
            // Also get the current personality and model info for the loaded chat
            const currentPersonality = chatManager.getCurrentPersonalityConfig();
            const currentModel = chatManager.getActiveModelInstance();
            
            return {
                history: history,
                personalityId: currentPersonality?.id,
                personalityName: currentPersonality?.name,
                modelId: currentModel?.getModelName(),
                modelName: currentModel?.getModelName() // In case they're different
            };
        } else {
            // Handle load failure - maybe return null or throw an error?
            // Returning null for now, renderer should handle this.
            console.error(`[IPC] Failed to load chat ${chatId} in chatManager.`);
            return null;
        }
    });

    // Handler for editing a message (changed to ipcMain.on for streaming)
    ipcMain.on('edit-message', async (event, { chatId, messageId, newContent }) => { // Use messageId
        // Check if the sender is destroyed before proceeding
        if (event.sender.isDestroyed()) {
            console.warn(`[IPC Edit] Cannot process edit request: sender has been destroyed`);
            return;
        }

        // Ensure the correct chat is loaded AND the ID is valid before proceeding
        const currentChatIdFromManager = chatManager.getCurrentChatId();
        if (!currentChatIdFromManager || typeof currentChatIdFromManager !== 'string') {
            console.error(`[IPC Edit] Invalid or missing currentChatId ('${currentChatIdFromManager}') in chatManager when trying to edit.`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('streamError', { message: "Error: Chat session not fully initialized. Cannot edit message." });
            }
            return; // Stop processing
        }
        if (currentChatIdFromManager !== chatId) {
            console.warn(`[IPC Edit] Attempting to edit message in non-active chat ${chatId}. Current: ${currentChatIdFromManager}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('streamError', { message: `Error: Cannot edit message in a non-active chat.` });
            }
            return; // Stop processing
        }

        // Create abort controller for this edit request
        streamState.currentAbortController = new AbortController();
        const abortSignal = streamState.currentAbortController.signal;

        try {
            // Check if request was aborted before starting
            if (abortSignal.aborted) {
                console.log('[IPC Edit] Edit request aborted before starting');
                return;
            }

            // Call the refactored chatManager function which returns a result object or an error object
            const modelResult = await chatManager.editMessage(messageId, newContent, { abortSignal }); // Pass abort signal in options

            // Check if the edit itself failed (e.g., messageId not found) or if model response failed
            if (modelResult && modelResult.error) {
                console.error(`[IPC Edit] Edit or model response failed for message ID ${messageId}. Error: ${modelResult.error}`);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    // Send specific error back
                    mainWindow.webContents.send('streamError', { message: modelResult.error });
                    mainWindow.webContents.send('streamFinalResponse', { text: "" }); // Ensure stream ends
                }
                return; // Stop processing
            }

            // --- Stream Processing Logic (adapted from main.js chatMessage handler) ---
            // This logic needs to be self-contained here as edit is a separate interaction flow
            let responseBuffer = "";
            let detectedToolCalls = []; // Standardized: { id, name, arguments }
            let rawToolDataForHistory = null;
            let responsePromise = modelResult.response; // For Gemini token counting
            const activeModel = chatManager.getActiveModelInstance(); // Get the currently active model instance

            if (!activeModel) {
                 console.error("[IPC Edit] No active model instance found after edit call.");
                 if (mainWindow && !mainWindow.isDestroyed()) {
                     mainWindow.webContents.send('streamError', { message: "Internal error: Model instance lost after edit." });
                 }
                 return;
            }
            const modelType = activeModel.getImplementationType();
            const modelName = activeModel.getModelName();

            // Process the stream with abort signal checking
            try {
                for await (const chunk of modelResult.stream) {
                    // Check if request was aborted during streaming
                    if (abortSignal.aborted) {
                        console.log('[IPC Edit] Edit stream aborted during processing');
                        break;
                    }

                    // Check if sender is still valid before sending partial responses
                    if (event.sender.isDestroyed()) {
                        console.warn('[IPC Edit] Sender destroyed during streaming, aborting');
                        break;
                    }

                    // Use same stream processing logic as in main.js's chatMessage handler
                    if (modelType === 'gpt') {
                        if (chunk.choices && chunk.choices[0].delta) {
                            const delta = chunk.choices[0].delta;
                            if (delta.content) {
                                responseBuffer += delta.content;
                                if (mainWindow && !mainWindow.isDestroyed()) {
                                    mainWindow.webContents.send('streamPartialResponse', { text: delta.content });
                                }
                            }
                            if (delta.tool_calls) {
                                rawToolDataForHistory = rawToolDataForHistory || [];
                                for (const toolCallDelta of delta.tool_calls) {
                                    if (toolCallDelta.index != null) {
                                        const index = toolCallDelta.index;
                                        if (!rawToolDataForHistory[index]) {
                                            rawToolDataForHistory[index] = { id: null, type: 'function', function: { name: '', arguments: '' } };
                                        }
                                        if (toolCallDelta.id) rawToolDataForHistory[index].id = toolCallDelta.id;
                                        if (toolCallDelta.function?.name) rawToolDataForHistory[index].function.name += toolCallDelta.function.name;
                                        if (toolCallDelta.function?.arguments) rawToolDataForHistory[index].function.arguments += toolCallDelta.function.arguments;
                                    }
                                }
                            }
                        }
                    } else if (modelType === 'gemini') {
                        if (chunk.functionCall) {
                            detectedToolCalls.push({ id: `gemini_call_${Date.now()}_${detectedToolCalls.length}`, name: chunk.functionCall.name, arguments: chunk.functionCall.args });
                            continue;
                        }
                        if (chunk.candidates && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
                            for (const part of chunk.candidates[0].content.parts) {
                                if (part.text) {
                                    responseBuffer += part.text;
                                    if (mainWindow && !mainWindow.isDestroyed()) {
                                        mainWindow.webContents.send('streamPartialResponse', { text: part.text });
                                    }
                                }
                                if (part.functionCall) {
                                    detectedToolCalls.push({ id: `gemini_call_${Date.now()}_${detectedToolCalls.length}`, name: part.functionCall.name, arguments: part.functionCall.args });
                                }
                            }
                        } else if (chunk.text) {
                            responseBuffer += chunk.text;
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('streamPartialResponse', { text: chunk.text });
                            }
                        }
                    }
                } // End stream processing
            } catch (error) {
                if (error.name === 'AbortError' || abortSignal.aborted) {
                    console.log('[IPC Edit] Edit stream processing aborted');
                    return; // Exit gracefully on abort
                }
                throw error; // Re-throw other errors
            }

            // Check if aborted after stream processing
            if (abortSignal.aborted) {
                console.log('[IPC Edit] Edit request aborted after stream processing');
                return;
            }

            // Finalize GPT tool calls
            if (modelType === 'gpt' && rawToolDataForHistory) {
                detectedToolCalls = rawToolDataForHistory
                    .filter(tc => tc && tc.id && tc.function.name)
                    .map(tc => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
            }

            // --- Append Model Response (after edit) ---
            // History was already truncated by chatManager.editMessage
            chatManager.appendModelResponse(responseBuffer, rawToolDataForHistory);

            // --- Token Counting (after edit) ---
            let inputTokens = 0; // Input count after edit is tricky, focus on output
            let outputTokens = 0;
            if (modelType === "gpt") {
                try { outputTokens = countTokens(modelName, responseBuffer); } catch (e) { console.error("Token count error:", e); }
            } else if (modelType === "gemini" && responsePromise) {
                try {
                    const aggResp = await responsePromise;
                    outputTokens = aggResp?.usageMetadata?.candidatesTokenCount || 0;
                    // Input tokens from Gemini might reflect the truncated history sent
                    inputTokens = aggResp?.usageMetadata?.promptTokenCount || 0;
                } catch (e) { console.error("Gemini token count error:", e); }
            }
            console.log(`[IPC Edit] Token Usage - Input (approx): ${inputTokens}, Output: ${outputTokens}`);
            if (inputTokens > 0 || outputTokens > 0) {
                await dailyTokenTracker.updateTodaysUsage(inputTokens, outputTokens);
            }

            // --- Handle Tool Calls (if any occurred during the response-after-edit) ---
            if (detectedToolCalls.length > 0) {
                console.log(`[IPC Edit] Processing ${detectedToolCalls.length} tool calls after edit...`);
                // This recursive call pattern is complex here.
                // For simplicity, let's assume the response *after an edit* doesn't typically involve further tool calls.
                // If it does, the logic from main.js's handleModelInteraction needs to be fully replicated or extracted.
                // For now, we'll just log a warning if tools are detected here.
                 console.warn("[IPC Edit] Tool calls detected in response after edit - further interaction not implemented in this handler.");
                 // TODO: Implement recursive tool call handling if needed after edits.
            }

            // Send final response text
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('streamFinalResponse', { text: responseBuffer });
            }

            // --- Final Save ---
            // Saving the history after the full interaction (including model response) should happen centrally.
            // Let's trigger a save here for the edit flow completion.
            const currentChatId = chatManager.getCurrentChatId();
            const currentHistory = chatManager.getConversationHistory();
            const currentPersonality = chatManager.getCurrentPersonalityConfig();
            // Add explicit type check for currentChatId before saving in edit flow
            if (currentChatId && typeof currentChatId === 'string' && currentHistory && activeModel && currentPersonality) {
                await chatStorage.saveChat(
                    currentChatId,
                    currentHistory,
                    activeModel.getModelName(),
                    currentPersonality.id
                );
                console.log(`[IPC Edit] History saved for chat ${currentChatId} after edit completion.`);
            } else if (typeof currentChatId !== 'string') {
                 console.error(`[IPC Edit] Could not save history after edit - Invalid chatId type: ${typeof currentChatId} (Value: ${currentChatId})`);
            } else {
                 console.error("[IPC Edit] Could not save history after edit - missing info.");
            }

        } catch (error) {
            // Check if error is due to abort
            if (error.name === 'AbortError' || streamState.currentAbortController?.signal.aborted) {
                console.log("[IPC Edit] Edit message processing aborted by user");
                // Send abort confirmation to renderer
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('streamStopped', { message: 'Edit stream stopped by user' });
                }
                return; // Exit gracefully
            }
            
            console.error("[IPC Edit] Error processing edit message stream:", error);
            if (mainWindow && !mainWindow.isDestroyed()) {
                 mainWindow.webContents.send('streamError', { message: "Error processing edit: " + error.message });
                 mainWindow.webContents.send('streamFinalResponse', { text: "" }); // Ensure stream ends
            }
        } finally {
            // Clean up abort controller
            streamState.currentAbortController = null;
        }
    });

    // Handler to get the currently active chat ID from the manager
    ipcMain.handle('get-current-chat-id', () => {
        return chatManager.getCurrentChatId();
    });

    // Handler to stop current stream
    ipcMain.on('stop-stream', (event) => {
        console.log('[IPC] Received stop-stream request');
        
        if (streamState.currentAbortController) {
            console.log('[IPC] Aborting current stream...');
            streamState.currentAbortController.abort();
            streamState.currentAbortController = null;
            
            // Notify renderer that stream was stopped
            if (mainWindow) {
                mainWindow.webContents.send('streamStopped', { message: 'Stream stopped by user' });
            }
        } else {
            console.log('[IPC] No active stream to stop');
            // Still notify renderer in case UI needs to reset
            if (mainWindow) {
                mainWindow.webContents.send('streamStopped', { message: 'No active stream' });
            }
        }
    });

    // Handler to get available personalities and the current default
    ipcMain.handle('get-personalities', async () => {
        try {
            const settingsManager = require('../config/settingsManager'); // Require dynamically or ensure it's loaded
            const personalities = settingsManager.getPersonalities(); // Assumes this function exists and returns the array
            const currentPersonalityId = chatManager.getCurrentPersonalityConfig()?.id; // Get current default ID from chatManager
            if (!personalities) {
                console.error("[IPC] get-personalities: No personalities found via settingsManager.");
                return { personalities: [], currentPersonalityId: null }; // Return empty array
            }
            console.log(`[IPC] Returning ${personalities.length} personalities. Current default: ${currentPersonalityId}`);
            return { personalities, currentPersonalityId };
        } catch (error) {
            console.error("[IPC] Error getting personalities:", error);
            return { personalities: [], currentPersonalityId: null, error: error.message }; // Return empty on error
        }
    });
// Handler to get the full details for a specific personality
    ipcMain.handle('get-personality-details', async (_, personalityId) => {
        try {
            const settingsManager = require('../config/settingsManager'); // Ensure it's accessible
            const personalityDetails = settingsManager.getPersonalityById(personalityId);
            if (!personalityDetails) {
                console.error(`[IPC] get-personality-details: Personality not found for ID: ${personalityId}`);
                return { error: `Personality not found for ID: ${personalityId}` };
            }
            console.log(`[IPC] Returning details for personality: ${personalityId}`);
            return personalityDetails; // Return the full object
        } catch (error) {
            console.error(`[IPC] Error getting details for personality ${personalityId}:`, error);
            return { error: error.message };
        }
    });

    // Handler to set the default personality for new chats
    ipcMain.handle('set-active-personality', async (_, personalityId) => {
        try {
            // Assuming chatManager has a method to set the default personality ID
            await chatManager.setDefaultPersonality(personalityId);
            console.log(`[IPC] Default personality set to: ${personalityId}`);
            // Optionally, notify the renderer if needed, though a simple success might suffice
            // mainWindow?.webContents.send('default-personality-changed', personalityId);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error setting default personality to ${personalityId}:`, error);
            return { success: false, error: error.message };
        }
    });

    // Handler to set the personality for the *current chat session only*
    ipcMain.handle('set-current-chat-personality', async (event, personalityId) => {
        try {
            // Call a new function in chatManager to handle the temporary switch
            await chatManager.setCurrentChatPersonality(personalityId);
            console.log(`[IPC] Current chat session personality temporarily set to: ${personalityId}`);
            
            // Get the updated personality and model information to send to renderer
            const currentPersonality = chatManager.getCurrentPersonalityConfig();
            const currentModel = chatManager.getActiveModelInstance();
            
            if (currentPersonality && currentModel && mainWindow) {
                // Send update to renderer to update UI displays
                mainWindow.webContents.send('chat-personality-updated', {
                    personalityId: currentPersonality.id,
                    personalityName: currentPersonality.name,
                    modelId: currentModel.getModelName()
                });
                console.log(`[IPC] Sent personality update to renderer: ${currentPersonality.name} with model ${currentModel.getModelName()}`);
            }
            
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error setting current chat personality to ${personalityId}:`, error);
            return { success: false, error: error.message };
        }
    });

    // Handler to set the model for the *current chat session only*
    ipcMain.handle('set-current-chat-model', async (event, modelId) => {
        try {
            // Call the new function in chatManager to handle the temporary model switch
            await chatManager.setCurrentChatModel(modelId);
            console.log(`[IPC] Current chat session model temporarily set to: ${modelId}`);
            
            // Get the updated personality and model information to send to renderer
            const currentPersonality = chatManager.getCurrentPersonalityConfig();
            const currentModel = chatManager.getActiveModelInstance();
            
            if (currentPersonality && currentModel && mainWindow) {
                // Send update to renderer to update UI displays
                mainWindow.webContents.send('chat-personality-updated', {
                    personalityId: currentPersonality.originalPersonalityId || currentPersonality.id,
                    personalityName: currentPersonality.name,
                    modelId: currentModel.getModelName()
                });
                console.log(`[IPC] Sent model update to renderer: model ${currentModel.getModelName()}`);
            }
            
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error setting current chat model to ${modelId}:`, error);
            return { success: false, error: error.message };
        }
    });

// Handler to save updated personality settings
    ipcMain.handle('save-personality-settings', async (_, { personalityId, updatedSettings }) => {
        console.log(`[IPC] Received request to save settings for personality: ${personalityId}`, updatedSettings);
        try {
            const settingsManager = require('../config/settingsManager'); // Ensure it's accessible
            // Call the new function in settingsManager to handle the actual saving
            await settingsManager.savePersonalityOverrides(personalityId, updatedSettings);
            console.log(`[IPC] Successfully saved overrides for personality: ${personalityId}`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error saving overrides for personality ${personalityId}:`, error);
            return { success: false, error: error.message };
        }
    });
// Handler to get API keys from settings
    ipcMain.handle('get-api-keys', async () => {
        console.log('[IPC] Received request to get API keys.');
        try {
            const settingsManager = require('../config/settingsManager'); // Ensure settingsManager is loaded
            const openaiKey = settingsManager.getApiKey('openai') || ""; // Default to empty string if undefined
            const geminiKey = settingsManager.getApiKey('gemini') || ""; // Default to empty string if undefined
            console.log('[IPC] Returning API keys.');
            return { openai: openaiKey, gemini: geminiKey };
        } catch (error) {
            console.error('[IPC] Error getting API keys:', error);
            return { error: error.message }; // Return error object
        }
    });

    // Handler to save a specific API key
    ipcMain.handle('save-api-key', async (_, { provider, key }) => {
        console.log(`[IPC] Received request to save API key for provider: ${provider}`);
        if (!provider || (provider !== 'openai' && provider !== 'gemini')) {
            console.error(`[IPC] Invalid provider specified for save-api-key: ${provider}`);
            return { success: false, error: 'Invalid provider specified. Must be "openai" or "gemini".' };
        }
        // Basic validation for the key (e.g., ensure it's a string)
        if (typeof key !== 'string') {
             console.error(`[IPC] Invalid key type provided for save-api-key (provider: ${provider}): ${typeof key}`);
             return { success: false, error: 'Invalid API key format provided.' };
        }

        try {
            const settingsManager = require('../config/settingsManager'); // Ensure settingsManager is loaded
            await settingsManager.saveApiKey(provider, key);
            console.log(`[IPC] Successfully saved API key for provider: ${provider}`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error saving API key for provider ${provider}:`, error);
            return { success: false, error: error.message }; // Return error object
        }
    });

    // Handler to get the configuration object (Corrected)
    ipcMain.handle('get-config', async () => {
        console.log('[IPC] Received request to get configuration.');
        try {
            // Retrieve specific configuration parts from settingsManager
            const defaults = settingsManager.getDefaults();
            const personalities = settingsManager.getPersonalities();
            const availableModels = settingsManager.getAvailableModels();
            const paths = settingsManager.getPaths();
            const apiKeys = {
                openai: settingsManager.getApiKey('openai') || "",
                gemini: settingsManager.getApiKey('gemini') || ""
            };

            // Construct the config object to return
            const config = {
                defaults,
                personalities,
                availableModels,
                paths,
                apiKeys
            };

            console.log('[IPC] Returning constructed configuration data.');
            return config; // Return the constructed object
        } catch (error) {
            console.error('[IPC] Error getting configuration:', error);
            // Return null or an error object to the renderer
            return { error: `Failed to get configuration: ${error.message}` };
        }
    });

    // Handler to get global model settings
    ipcMain.handle('get-settings', async () => {
        console.log('[IPC] Received request to get global settings.');
        try {
            // Ensure settingsManager is initialized (though it should be by now)
            await settingsManager.initializeSettings();

            const availableModels = settingsManager.getAvailableModels();
            const defaults = settingsManager.getDefaults();
            const defaultModel = defaults.defaultModel || ''; // Provide default if missing
            const reasoningEffort = defaults.reasoningEffort || 'medium'; // Provide default if missing

            console.log(`[IPC] Returning settings: ${availableModels.length} models, default: ${defaultModel}, effort: ${reasoningEffort}`);
            return {
                availableModels: availableModels.map(m => ({ id: m.id, name: m.name || m.id })), // Return only id and name
                defaultModel: defaultModel,
                reasoningEffort: reasoningEffort
            };
        } catch (error) {
            console.error('[IPC] Error getting global settings:', error);
            return { error: error.message }; // Return error object
        }
    });

    // Handler to save a specific global setting
    ipcMain.handle('save-setting', async (_, { key, value }) => {
        console.log(`[IPC] Received request to save setting: ${key} = ${value}`);
        if (!key || (key !== 'defaultModel' && key !== 'reasoningEffort')) {
            console.error(`[IPC] Invalid key specified for save-setting: ${key}`);
            return { success: false, error: 'Invalid setting key specified.' };
        }
        if (typeof value !== 'string') {
             console.error(`[IPC] Invalid value type provided for save-setting (key: ${key}): ${typeof value}`);
             return { success: false, error: 'Invalid setting value format provided.' };
        }

        try {
            // Ensure settingsManager is initialized
            await settingsManager.initializeSettings();
            await settingsManager.saveGlobalSetting(key, value);
            console.log(`[IPC] Successfully saved setting: ${key} = ${value}`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error saving setting ${key}:`, error);
            return { success: false, error: error.message }; // Return error object
        }
    });

    // --- Timer and Alarm IPC Handlers ---
    ipcMain.handle('get-active-timers', async () => {
        const timers = readJsonFile(TIMERS_FILE_PATH).filter(t => !t.triggered && (t.startTime + t.duration * 1000) > Date.now());
        return { success: true, timers };
    });

    ipcMain.handle('get-active-alarms', async () => {
        const alarms = readJsonFile(ALARMS_FILE_PATH).filter(a => !a.triggered); // Basic filter, frontend handles time check for display
        return { success: true, alarms };
    });

    ipcMain.handle('dismiss-timer', async (_, timerId) => {
        try {
            let timers = readJsonFile(TIMERS_FILE_PATH);
            timers = timers.filter(t => t.id !== timerId);
            writeJsonFile(TIMERS_FILE_PATH, timers);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error dismissing timer ${timerId}:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('dismiss-alarm', async (_, alarmId) => {
        try {
            let alarms = readJsonFile(ALARMS_FILE_PATH);
            alarms = alarms.filter(a => a.id !== alarmId);
            writeJsonFile(ALARMS_FILE_PATH, alarms);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error dismissing alarm ${alarmId}:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('mark-timer-triggered', async (_, timerId) => {
        try {
            let timers = readJsonFile(TIMERS_FILE_PATH);
            const timer = timers.find(t => t.id === timerId);
            if (timer) {
                timer.triggered = true;
                writeJsonFile(TIMERS_FILE_PATH, timers);
                return { success: true, timer };
            }
            return { success: false, error: 'Timer not found' };
        } catch (error) {
            console.error(`[IPC] Error marking timer ${timerId} as triggered:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('mark-alarm-triggered', async (_, alarmId) => {
        try {
            let alarms = readJsonFile(ALARMS_FILE_PATH);
            const alarm = alarms.find(a => a.id === alarmId);
            if (alarm) {
                alarm.triggered = true;
                writeJsonFile(ALARMS_FILE_PATH, alarms);
                return { success: true, alarm };
            }
            return { success: false, error: 'Alarm not found' };
        } catch (error) {
            console.error(`[IPC] Error marking alarm ${alarmId} as triggered:`, error);
            return { success: false, error: error.message };
        }
    });
 
    // --- SettingsManager IPC Handlers ---
    ipcMain.handle('settings:get-font-settings', async () => {
      try {
        // Directly return the result of settingsManager.getFontSettings()
        // The settingsManager.getFontSettings() already returns the correct structure.
        return settingsManager.getFontSettings();
      } catch (error) {
        console.error("Error in 'settings:get-font-settings' handler:", error);
        // Return a default structure on error to prevent frontend breaking
        return { defaultFont: "System Default", availableFonts: [] };
      }
    });

    ipcMain.handle('settings:get-available-fonts', async () => {
        try {
            const availableFonts = await settingsManager.getAvailableFonts();
            return { success: true, fonts: availableFonts };
        } catch (error) {
            console.error('[IPC] Error getting available fonts:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('settings:save-default-font', async (_, fontName) => {
        try {
            await settingsManager.saveDefaultFont(fontName);
            // Also re-apply to current window immediately if needed, or let renderer handle it.
            // For now, just save. Renderer should re-fetch or apply.
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error saving default font "${fontName}":`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('settings:get-global-setting', async (_, key) => {
        try {
            const value = await settingsManager.getGlobalSetting(key);
            return { success: true, value };
        } catch (error) {
            console.error(`[IPC] Error getting global setting "${key}":`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('settings:save-global-setting', async (event, { key, value }) => {
        try {
            // Check if the event sender still exists to prevent "Object has been destroyed" errors
            if (event.sender.isDestroyed()) {
                console.warn(`[IPC] Cannot save global setting "${key}": sender has been destroyed`);
                return { success: false, error: 'Sender window has been destroyed' };
            }
            
            await settingsManager.saveGlobalSetting(key, value);
            console.log(`[IPC] Successfully saved global setting "${key}" = "${value}"`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error saving global setting "${key}" to "${value}":`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('settings:get-model-details', async (_, modelId) => {
        try {
            const modelDetails = settingsManager.getModelById(modelId);
            if (!modelDetails) {
                console.error(`[IPC] settings:get-model-details: Model not found for ID: ${modelId}`);
                return { success: false, error: `Model not found for ID: ${modelId}` };
            }
            return { success: true, details: modelDetails };
        } catch (error) {
            console.error(`[IPC] Error in 'settings:get-model-details' handler for ID ${modelId}:`, error);
            return { success: false, error: error.message };
        }
    });

    // --- Window Control IPC Handler ---
    ipcMain.on('window-control', (event, action) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            console.warn(`[IPC] Cannot handle window-control action "${action}": mainWindow is destroyed or null`);
            return;
        }
        
        switch (action) {
            case 'minimize':
                mainWindow.minimize();
                break;
            case 'maximize':
                if (mainWindow.isMaximized()) {
                    mainWindow.unmaximize();
                } else {
                    mainWindow.maximize();
                }
                // Sending status back is handled by main.js 'maximize'/'unmaximize' events
                break;
            case 'close':
                mainWindow.close();
                break;
            default:
                console.warn(`[IPC] Unknown window-control action: ${action}`);
        }
    });

    // --- Personality Management IPC Handlers ---
    ipcMain.handle('get-context-sets', async () => {
        try {
            const contextSets = settingsManager.getContextSets();
            return { success: true, contextSets };
        } catch (error) {
            console.error('[IPC] Error getting context sets:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-prompt-content', async (_, promptId) => {
        try {
            const prompts = settingsManager.getPrompts();
            const prompt = prompts.find(p => p.id === promptId);
            
            if (!prompt) {
                return { success: false, error: 'Prompt not found' };
            }

            // Read the prompt file content
            const promptPath = path.resolve(prompt.path);
            if (!fs.existsSync(promptPath)) {
                return { success: false, error: 'Prompt file not found' };
            }

            const content = fs.readFileSync(promptPath, 'utf8');
            return { success: true, content };
        } catch (error) {
            console.error(`[IPC] Error getting prompt content for ${promptId}:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('save-personality', async (_, personalityData) => {
        try {
            console.log('[IPC] Saving personality:', personalityData.name);
            
            // Validate required fields
            if (!personalityData.name || !personalityData.modelId) {
                return { success: false, error: 'Name and model are required' };
            }

            let personalities = settingsManager.getPersonalities();
            let prompts = settingsManager.getPrompts();
            
            // Generate ID for new personality
            if (!personalityData.id) {
                personalityData.id = personalityData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                
                // Ensure unique ID
                let counter = 1;
                let baseId = personalityData.id;
                while (personalities.find(p => p.id === personalityData.id)) {
                    personalityData.id = `${baseId}-${counter}`;
                    counter++;
                }
            }

            // Create prompt file if there's prompt content
            let promptId = null;
            if (personalityData.promptContent && personalityData.promptContent.trim()) {
                promptId = `${personalityData.id}-prompt`;
                const promptPath = path.join(pathManager.getPromptsDir(), `${promptId}.md`);
                
                // Ensure prompt directory exists
                const promptDir = pathManager.getPromptsDir();
                if (!fs.existsSync(promptDir)) {
                    fs.mkdirSync(promptDir, { recursive: true });
                }
                
                // Write prompt file
                fs.writeFileSync(promptPath, personalityData.promptContent, 'utf8');
                
                // Add to prompts array if not already there
                const relativePath = path.relative(pathManager.isDevelopment() ? process.cwd() : pathManager.userDataPath, promptPath);
                if (!prompts.find(p => p.id === promptId)) {
                    prompts.push({
                        id: promptId,
                        name: `${personalityData.name} Prompt`,
                        path: relativePath
                    });
                }
            }

            // Create personality object
            const personality = {
                id: personalityData.id,
                name: personalityData.name,
                icon: personalityData.icon || 'src/renderer/media/reg.png',
                description: personalityData.description || '',
                promptId: promptId || 'vanilla-prompt',
                availableContextSetIds: personalityData.availableContextSetIds || [],
                defaultContextSetIds: personalityData.defaultContextSetIds || [],
                tools: personalityData.tools || [],
                modelId: personalityData.modelId,
                allowCustomInstructions: true,
                customInstructions: personalityData.customInstructions || '',
                disabled: false // New personalities are enabled by default
            };

            // Update or add personality
            const existingIndex = personalities.findIndex(p => p.id === personalityData.id);
            if (existingIndex >= 0) {
                personalities[existingIndex] = personality;
            } else {
                personalities.push(personality);
            }

            // Save to config
            await settingsManager.savePersonalities(personalities);
            await settingsManager.savePrompts(prompts);

            console.log(`[IPC] Successfully saved personality: ${personality.name} (${personality.id})`);
            return { success: true, personality };
        } catch (error) {
            console.error('[IPC] Error saving personality:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-personality', async (_, personalityId) => {
        try {
            console.log(`[IPC] Deleting personality: ${personalityId}`);
            
            let personalities = settingsManager.getPersonalities();
            const personality = personalities.find(p => p.id === personalityId);
            
            if (!personality) {
                return { success: false, error: 'Personality not found' };
            }

            // Remove personality from array
            personalities = personalities.filter(p => p.id !== personalityId);

            // Optionally clean up prompt file (be careful not to delete shared prompts)
            if (personality.promptId && personality.promptId.includes(personalityId)) {
                try {
                    const prompts = settingsManager.getPrompts();
                    const prompt = prompts.find(p => p.id === personality.promptId);
                    if (prompt) {
                        // Resolve path properly for both dev and production
                        let promptPath;
                        if (path.isAbsolute(prompt.path)) {
                            promptPath = prompt.path;
                        } else {
                            const basePath = pathManager.isDevelopment() ? process.cwd() : pathManager.userDataPath;
                            promptPath = path.join(basePath, prompt.path);
                        }
                        
                        if (fs.existsSync(promptPath)) {
                            fs.unlinkSync(promptPath);
                        }
                        
                        // Remove from prompts array
                        const updatedPrompts = prompts.filter(p => p.id !== personality.promptId);
                        await settingsManager.savePrompts(updatedPrompts);
                    }
                } catch (promptError) {
                    console.warn(`[IPC] Could not clean up prompt file for ${personalityId}:`, promptError);
                }
            }

            // Save updated personalities
            await settingsManager.savePersonalities(personalities);

            console.log(`[IPC] Successfully deleted personality: ${personalityId}`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error deleting personality ${personalityId}:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('toggle-personality-availability', async (_, { personalityId, enabled }) => {
        try {
            console.log(`[IPC] Toggling personality availability: ${personalityId} -> ${enabled}`);
            
            let personalities = settingsManager.getPersonalities();
            const personality = personalities.find(p => p.id === personalityId);
            
            if (!personality) {
                return { success: false, error: 'Personality not found' };
            }

            // Update disabled status
            personality.disabled = !enabled;

            // Save updated personalities
            await settingsManager.savePersonalities(personalities);

            console.log(`[IPC] Successfully toggled personality availability: ${personalityId} -> ${enabled ? 'enabled' : 'disabled'}`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error toggling personality availability for ${personalityId}:`, error);
            return { success: false, error: error.message };
        }
    });

    // --- File Management IPC Handlers ---
    ipcMain.handle('browse-context-files', async () => {
        try {
            console.log('[IPC] Opening file browser for context files');
            
            const supportedExtensions = fileConverter.getSupportedExtensions();
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Select Context Files',
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'Supported Files', extensions: supportedExtensions.map(ext => ext.substring(1)) },
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'PDF Files', extensions: ['pdf'] },
                    { name: 'Word Documents', extensions: ['docx'] },
                    { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
                    { name: 'CSV Files', extensions: ['csv'] },
                    { name: 'RTF Files', extensions: ['rtf'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled) {
                return { success: true, files: [] };
            }

            return { success: true, files: result.filePaths };
        } catch (error) {
            console.error('[IPC] Error browsing context files:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('browse-icon-file', async () => {
        try {
            console.log('[IPC] Opening file browser for icon selection');
            
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Select Icon File',
                properties: ['openFile'],
                filters: [
                    { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'] },
                    { name: 'PNG Files', extensions: ['png'] },
                    { name: 'JPEG Files', extensions: ['jpg', 'jpeg'] },
                    { name: 'SVG Files', extensions: ['svg'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled) {
                return { success: true, iconPath: null };
            }

            const selectedFile = result.filePaths[0];
            const fileName = path.basename(selectedFile);
            const fileExtension = path.extname(fileName);
            
            // Create a unique filename to avoid conflicts
            const timestamp = Date.now();
            const uniqueFileName = `${path.basename(fileName, fileExtension)}_${timestamp}${fileExtension}`;
            
            // Determine the icons directory
            const iconsDir = path.join(pathManager.getMediaDir(), 'icons');
            if (!fs.existsSync(iconsDir)) {
                fs.mkdirSync(iconsDir, { recursive: true });
            }
            
            const destinationPath = path.join(iconsDir, uniqueFileName);
            
            // Copy the file to the icons directory
            fs.copyFileSync(selectedFile, destinationPath);
            
            // Return the relative path from the renderer's perspective
            const relativePath = `media/icons/${uniqueFileName}`;
            
            console.log(`[IPC] Icon copied to: ${destinationPath}, relative path: ${relativePath}`);
            
            return { 
                success: true, 
                iconPath: relativePath,
                originalFileName: fileName
            };
        } catch (error) {
            console.error('[IPC] Error browsing/copying icon file:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('convert-and-add-context-files', async (_, filePaths) => {
        try {
            console.log(`[IPC] Converting ${filePaths.length} files to context`);
            
            const results = [];
            const errors = [];

            for (const filePath of filePaths) {
                console.log(`[IPC] Converting file: ${filePath}`);
                
                if (!fileConverter.isSupportedFile(filePath)) {
                    errors.push(`Unsupported file type: ${path.basename(filePath)}`);
                    continue;
                }

                const conversionResult = await fileConverter.convertFileToText(filePath);
                
                if (!conversionResult.success) {
                    errors.push(`Failed to convert ${path.basename(filePath)}: ${conversionResult.error}`);
                    continue;
                }

                const saveResult = await fileConverter.saveAsContextFile(
                    conversionResult.content,
                    path.basename(filePath)
                );

                if (!saveResult.success) {
                    errors.push(`Failed to save ${path.basename(filePath)}: ${saveResult.error}`);
                    continue;
                }

                results.push(saveResult.contextFile);
            }

            // Update context sets in settings if files were successfully converted
            if (results.length > 0) {
                try {
                    let contextSets = settingsManager.getContextSets();
                    
                    // Add new context files to the context sets
                    results.forEach(contextFile => {
                        contextSets.push({
                            id: contextFile.id,
                            name: contextFile.name,
                            path: contextFile.relativePath,
                            type: 'user-uploaded',
                            createdAt: contextFile.createdAt,
                            originalFile: contextFile.originalFile
                        });
                    });

                    await settingsManager.saveContextSets(contextSets);
                    console.log(`[IPC] Successfully added ${results.length} context files`);
                } catch (saveError) {
                    console.error('[IPC] Error saving context sets:', saveError);
                    errors.push('Failed to update context sets configuration');
                }
            }

            return {
                success: true,
                addedFiles: results,
                errors: errors.length > 0 ? errors : null,
                summary: `Successfully processed ${results.length} out of ${filePaths.length} files`
            };
        } catch (error) {
            console.error('[IPC] Error converting context files:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-context-file', async (_, contextFileId) => {
        try {
            console.log(`[IPC] Deleting context file: ${contextFileId}`);
            
            let contextSets = settingsManager.getContextSets();
            const contextFile = contextSets.find(cs => cs.id === contextFileId);
            
            if (!contextFile) {
                return { success: false, error: 'Context file not found' };
            }

            // Delete the actual file if it's a user-uploaded file
            if (contextFile.type === 'user-uploaded' && contextFile.path) {
                // Resolve path properly for both dev and production
                let fullPath;
                if (path.isAbsolute(contextFile.path)) {
                    fullPath = contextFile.path;
                } else {
                    const basePath = pathManager.isDevelopment() ? process.cwd() : pathManager.userDataPath;
                    fullPath = path.join(basePath, contextFile.path);
                }
                
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }

            // Remove from context sets
            contextSets = contextSets.filter(cs => cs.id !== contextFileId);
            await settingsManager.saveContextSets(contextSets);

            console.log(`[IPC] Successfully deleted context file: ${contextFileId}`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error deleting context file ${contextFileId}:`, error);
            return { success: false, error: error.message };
        }
    });

}

module.exports = { setupIpcHandlers };
