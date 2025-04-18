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

    // Handler for editing a message
    ipcMain.handle('edit-message', async (event, { chatId, messageId, newContent }) => { // Use messageId
        // Ensure the correct chat is loaded (though editMessage should operate on the current one)
        // Note: chatManager.editMessage operates on the in-memory history,
        // so loading might not be strictly necessary if the UI ensures the correct chat is active.
        // However, adding a check or load provides robustness.
        if (chatManager.getCurrentChatId() !== chatId) {
            // Consider if loading here is the right approach or if the UI should guarantee active chat.
            // For now, assume chatManager holds the active chat state correctly.
            // await chatManager.loadChat(chatId); // Potentially load if needed
            if (!chatManager.getCurrentChatId() || chatManager.getCurrentChatId() !== chatId) {
                console.warn(`Attempting to edit message in non-active chat ${chatId}. Current: ${chatManager.getCurrentChatId()}`);
                // Decide how to handle this - error out or load the chat? Let's error for now.
                return { success: false, error: "Cannot edit message in a non-active chat." };
            }
        }


        const editedContent = await chatManager.editMessage(messageId, newContent); // Pass messageId

        if (editedContent) {
            // Return the truncated history and the edited content to the renderer
            // The renderer will then need to trigger the resubmission flow
            console.log(`Edit successful for message ID ${messageId}. Returning truncated history and message: ${editedContent}`);
            return { success: true, truncatedHistory: chatManager.getConversationHistory(), messageToResubmit: editedContent };
        } else {
            console.error(`Edit failed for message ID ${messageId}.`);
            return { success: false, error: "Failed to edit message or index invalid." };
        }
    });

    // Handler to get the currently active chat ID from the manager
    ipcMain.handle('get-current-chat-id', () => {
        return chatManager.getCurrentChatId();
    });
}

module.exports = { setupIpcHandlers };
