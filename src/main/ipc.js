const { ipcMain } = require('electron');
const chatStorage = require('../services/chatStorage');
const chatManager = require('../models/chatManager');
const settingsManager = require('../config/settingsManager'); // Import settingsManager
const dailyTokenTracker = require('../services/dailyTokenTracker'); // Added for token tracking
const { countTokens } = require('../util/tokenCounter'); // Added for token counting

function setupIpcHandlers(mainWindow) { // Accept mainWindow
    ipcMain.handle('list-chats', async () => {
        return await chatStorage.listChats();
    });

    ipcMain.handle('start-new-chat', async () => {
        const { newChatId, deletedChatId, error } = await chatManager.startNewChat(); // Get result object
        // REMOVED: Explicit saveChat call here. Let the first interaction save it.
        // Notify renderer if a previous chat was deleted
        if (deletedChatId && mainWindow) {
            console.log(`[IPC] Notifying renderer of deleted chat: ${deletedChatId}`);
            mainWindow.webContents.send('chat-deleted', deletedChatId);
        }
        return newChatId; // Return the ID of the newly started chat
    });

    ipcMain.handle('load-chat', async (_, chatId) => {
        const { success, history, deletedChatId } = await chatManager.loadChat(chatId); // Get result object
        // Notify renderer if a previous chat was deleted during the load process
        if (deletedChatId && mainWindow) {
             console.log(`[IPC] Notifying renderer of deleted chat: ${deletedChatId}`);
             mainWindow.webContents.send('chat-deleted', deletedChatId);
        }
        if (success) {
            return history; // Return the history of the loaded chat on success
        } else {
            // Handle load failure - maybe return null or throw an error?
            // Returning null for now, renderer should handle this.
            console.error(`[IPC] Failed to load chat ${chatId} in chatManager.`);
            return null;
        }
    });

    // Handler for editing a message (changed to ipcMain.on for streaming)
    ipcMain.on('edit-message', async (event, { chatId, messageId, newContent }) => { // Use messageId
        // Ensure the correct chat is loaded AND the ID is valid before proceeding
        const currentChatIdFromManager = chatManager.getCurrentChatId();
        if (!currentChatIdFromManager || typeof currentChatIdFromManager !== 'string') {
            console.error(`[IPC Edit] Invalid or missing currentChatId ('${currentChatIdFromManager}') in chatManager when trying to edit.`);
            if (mainWindow) mainWindow.webContents.send('streamError', { message: "Error: Chat session not fully initialized. Cannot edit message." });
            return; // Stop processing
        }
        if (currentChatIdFromManager !== chatId) {
            console.warn(`[IPC Edit] Attempting to edit message in non-active chat ${chatId}. Current: ${currentChatIdFromManager}`);
            if (mainWindow) mainWindow.webContents.send('streamError', { message: `Error: Cannot edit message in a non-active chat.` });
            return; // Stop processing
        }

        try {
            // Call the refactored chatManager function which returns a result object or an error object
            const modelResult = await chatManager.editMessage(messageId, newContent); // Pass messageId (chatId is implicitly the one checked above)

            // Check if the edit itself failed (e.g., messageId not found) or if model response failed
            if (modelResult && modelResult.error) {
                console.error(`[IPC Edit] Edit or model response failed for message ID ${messageId}. Error: ${modelResult.error}`);
                if (mainWindow) {
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
                 if (mainWindow) mainWindow.webContents.send('streamError', { message: "Internal error: Model instance lost after edit." });
                 return;
            }
            const modelType = activeModel.getImplementationType();
            const modelName = activeModel.getModelName();

            // Process the stream
            for await (const chunk of modelResult.stream) {
                // Use same stream processing logic as in main.js's chatMessage handler
                if (modelType === 'gpt') {
                    if (chunk.choices && chunk.choices[0].delta) {
                        const delta = chunk.choices[0].delta;
                        if (delta.content) {
                            responseBuffer += delta.content;
                            if (mainWindow) mainWindow.webContents.send('streamPartialResponse', { text: delta.content });
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
                                if (mainWindow) mainWindow.webContents.send('streamPartialResponse', { text: part.text });
                            }
                            if (part.functionCall) {
                                detectedToolCalls.push({ id: `gemini_call_${Date.now()}_${detectedToolCalls.length}`, name: part.functionCall.name, arguments: part.functionCall.args });
                            }
                        }
                    } else if (chunk.text) {
                        responseBuffer += chunk.text;
                        if (mainWindow) mainWindow.webContents.send('streamPartialResponse', { text: chunk.text });
                    }
                }
            } // End stream processing

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
            if (mainWindow) mainWindow.webContents.send('streamFinalResponse', { text: responseBuffer });

            // --- Final Save ---
            // Saving the history after the full interaction (including model response) should happen centrally.
            // Let's trigger a save here for the edit flow completion.
            const currentChatId = chatManager.getCurrentChatId();
            const currentHistory = chatManager.getConversationHistory();
            const currentPersonality = chatManager.getCurrentPersonalityConfig();
            if (currentChatId && currentHistory && activeModel && currentPersonality) {
                await chatStorage.saveChat(
                    currentChatId,
                    currentHistory,
                    activeModel.getModelName(),
                    currentPersonality.id
                );
                console.log(`[IPC Edit] History saved for chat ${currentChatId} after edit completion.`);
            } else {
                 console.error("[IPC Edit] Could not save history after edit - missing info.");
            }


        } catch (error) {
            console.error("[IPC Edit] Error processing edit message stream:", error);
            if (mainWindow) {
                 mainWindow.webContents.send('streamError', { message: "Error processing edit: " + error.message });
                 mainWindow.webContents.send('streamFinalResponse', { text: "" }); // Ensure stream ends
            }
        }
    });

    // Handler to get the currently active chat ID from the manager
    ipcMain.handle('get-current-chat-id', () => {
        return chatManager.getCurrentChatId();
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
    ipcMain.handle('set-current-chat-personality', async (_, personalityId) => {
        try {
            // Call a new function in chatManager to handle the temporary switch
            await chatManager.setCurrentChatPersonality(personalityId);
            console.log(`[IPC] Current chat session personality temporarily set to: ${personalityId}`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Error setting current chat personality to ${personalityId}:`, error);
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

}

module.exports = { setupIpcHandlers };
