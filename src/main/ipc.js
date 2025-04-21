const { ipcMain } = require('electron');
const chatStorage = require('../services/chatStorage');
const chatManager = require('../models/chatManager');

function setupIpcHandlers(mainWindow) { // Accept mainWindow
    ipcMain.handle('list-chats', async () => {
        return await chatStorage.listChats();
    });

    ipcMain.handle('start-new-chat', async () => {
        const { newChatId, deletedChatId } = await chatManager.startNewChat(); // Get both IDs
        // Save the new chat (even if empty initially)
        await chatStorage.saveChat(newChatId, [], chatManager.currentModel());
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
        // Ensure the correct chat is loaded
        if (chatManager.getCurrentChatId() !== chatId) {
             if (!chatManager.getCurrentChatId() || chatManager.getCurrentChatId() !== chatId) {
                console.warn(`[IPC Edit] Attempting to edit message in non-active chat ${chatId}. Current: ${chatManager.getCurrentChatId()}`);
                // Send error back via webContents if possible
                if (mainWindow) {
                    mainWindow.webContents.send('streamFinalResponse', { text: `Error: Cannot edit message in a non-active chat.` });
                }
                return; // Stop processing
            }
        }

        try {
            // Call the updated chatManager function which returns a stream/result object or an error object
            const chatResult = await chatManager.editMessage(messageId, newContent); // Pass messageId

            // Check if the edit itself failed (e.g., messageId not found)
            if (chatResult && chatResult.error) {
                console.error(`[IPC Edit] Edit failed for message ID ${messageId}. Error: ${chatResult.error}`);
                if (mainWindow) {
                    mainWindow.webContents.send('streamFinalResponse', { text: `Error: ${chatResult.error}` });
                }
                return; // Stop processing
            }

            // --- Stream Processing Logic (adapted from main.js chatMessage handler) ---
            let responseBuffer = "";
            let currentFunctionCall = null;
            let toolPlaceholderInserted = false;
            let lastGptChunk = null;
            let geminiResponsePromise = null;
            let streamIterator = null;
            const currentModel = chatManager.currentModel(); // Get current model

            if (currentModel.startsWith("gpt")) {
                streamIterator = chatResult; // GPT returns the stream directly
                for await (const chunk of streamIterator) {
                    if (chunk.choices && chunk.choices[0].delta) {
                        const delta = chunk.choices[0].delta;
                        if (delta.function_call) {
                            // Handle function call accumulation (same as chatMessage)
                            if (!currentFunctionCall) { currentFunctionCall = { name: delta.function_call.name || "", arguments: "" }; }
                            if (delta.function_call.arguments) { currentFunctionCall.arguments += delta.function_call.arguments; }
                            if (!toolPlaceholderInserted) { responseBuffer += "[TOOL_RESULT]"; toolPlaceholderInserted = true; }
                            continue;
                        }
                        if (delta.content) {
                            responseBuffer += delta.content;
                            if (mainWindow) mainWindow.webContents.send('streamPartialResponse', { text: delta.content });
                        }
                    }
                    lastGptChunk = chunk;
                }
            } else { // Assuming Gemini
                streamIterator = chatResult.stream;
                geminiResponsePromise = chatResult.response;
                for await (const chunk of streamIterator) {
                    if (chunk.functionCall) {
                        currentFunctionCall = chunk.functionCall; continue;
                    }
                    if (chunk.nonTextParts && chunk.nonTextParts.functionCall) {
                         currentFunctionCall = chunk.nonTextParts.functionCall; continue;
                    }
                    if (chunk.text) {
                        responseBuffer += chunk.text;
                         if (mainWindow) mainWindow.webContents.send('streamPartialResponse', { text: chunk.text });
                    }
                }
            }

            // Handle function call execution if detected (same as chatMessage)
            if (currentFunctionCall) {
                try {
                    const actionsManager = require('../actions/ActionsManager');
                    const toolName = currentFunctionCall.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
                    let parsedArgs = currentModel.startsWith("gpt") ? JSON.parse(currentFunctionCall.arguments) : currentFunctionCall.args;
                    const result = await actionsManager.execute(toolName, parsedArgs);
                    responseBuffer = responseBuffer.replace("[TOOL_RESULT]", JSON.stringify(result));
                } catch (err) {
                    console.error("[IPC Edit] Error executing tool:", err);
                    responseBuffer = responseBuffer.replace("[TOOL_RESULT]", "[Error executing tool]");
                }
                currentFunctionCall = null;
            }

            // Send final response text
            if (mainWindow) mainWindow.webContents.send('streamFinalResponse', { text: responseBuffer });

            // --- Token Counting Logic (adapted from main.js chatMessage handler) ---
            // Note: Input token counting after edit might be less accurate as history is truncated.
            // We'll count based on the state *after* truncation.
            let inputTokens = 0;
            let outputTokens = 0;
            const truncatedHistory = chatManager.getConversationHistory(); // History after edit
            const historyTextForInputCount = JSON.stringify(truncatedHistory);

            if (currentModel.startsWith("gpt")) {
                try {
                    // Input count based on truncated history (might not include the edited message itself depending on implementation)
                    inputTokens = countTokens(currentModel, historyTextForInputCount);
                    outputTokens = countTokens(currentModel, responseBuffer);
                    console.log(`[IPC Edit] GPT Token Usage (tiktoken) - Input (approx after edit): ${inputTokens}, Output: ${outputTokens}`);
                } catch (error) { console.error("[IPC Edit] Error counting GPT tokens:", error); }
            } else if (geminiResponsePromise) {
                const aggregatedResponse = await geminiResponsePromise;
                if (aggregatedResponse && aggregatedResponse.usageMetadata) {
                    inputTokens = aggregatedResponse.usageMetadata.promptTokenCount || 0;
                    outputTokens = aggregatedResponse.usageMetadata.candidatesTokenCount || 0;
                    console.log(`[IPC Edit] Gemini Token Usage - Input: ${inputTokens}, Output: ${outputTokens}`);
                } else { console.warn("[IPC Edit] Could not find Gemini token usage data."); }
            }

            // Update daily token count
            if (inputTokens > 0 || outputTokens > 0) {
                await dailyTokenTracker.updateTodaysUsage(inputTokens, outputTokens);
                console.log(`[IPC Edit] Updated daily token usage: Input=${inputTokens}, Output=${outputTokens}`);
            }
            // --- End Token Counting Logic ---

            // Append model response to history AFTER potentially getting tokens
            // No need to check for title generation after an edit
            await chatManager.appendModelResponse(responseBuffer);

        } catch (error) {
            console.error("[IPC Edit] Error processing edit message stream:", error);
            if (mainWindow) {
                 mainWindow.webContents.send('streamFinalResponse', { text: "Error processing edit: " + error.message });
            }
        }
    });

    // Handler to get the currently active chat ID from the manager
    ipcMain.handle('get-current-chat-id', () => {
        return chatManager.getCurrentChatId();
    });
}

module.exports = { setupIpcHandlers };
