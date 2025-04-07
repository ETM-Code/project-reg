const { ipcMain } = require('electron');
const chatStorage = require('../services/chatStorage');
const chatManager = require('../models/chatManager');

function setupIpcHandlers() {
    ipcMain.handle('list-chats', async () => {
        return await chatStorage.listChats();
    });

    ipcMain.handle('new-chat', async () => {
        const chatId = chatManager.startNewChat();
        await chatStorage.saveChat(chatId, [], chatManager.currentModel());
        return chatId;
    });

    ipcMain.handle('load-chat', async (_, chatId) => {
        await chatManager.loadChat(chatId);
        return chatManager.getConversationHistory();
    });
}

module.exports = { setupIpcHandlers };
