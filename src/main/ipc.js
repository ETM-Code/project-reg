const { ipcMain } = require('electron');
const chatStorage = require('../services/chatStorage');
const chatManager = require('../models/chatManager');

function setupIpcHandlers() {
    ipcMain.handle('list-chats', async () => {
        return await chatStorage.listChats();
    });

    ipcMain.handle('start-new-chat', async () => { 
        const chatId = chatManager.startNewChat();
        await chatStorage.saveChat(chatId, [], chatManager.currentModel());
        return chatId;
    });

    ipcMain.handle('load-chat', async (_, chatId) => {
        await chatManager.loadChat(chatId);
        return chatManager.getConversationHistory();
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
