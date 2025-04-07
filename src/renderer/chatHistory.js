const { ipcRenderer } = require('electron');

class ChatHistoryUI {
    constructor() {
        this.chatList = document.getElementById('chatList');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.setupEventListeners();
        this.loadChatList();
    }

    setupEventListeners() {
        this.newChatBtn.addEventListener('click', () => this.createNewChat());
    }

    async loadChatList() {
        const chats = await ipcRenderer.invoke('list-chats');
        this.renderChatList(chats);
    }

    renderChatList(chats) {
        this.chatList.innerHTML = '';
        chats.forEach(chat => {
            const chatElement = document.createElement('div');
            chatElement.className = 'p-3 hover:bg-gray-700 cursor-pointer';
            chatElement.textContent = chat.title;
            chatElement.addEventListener('click', () => this.loadChat(chat.id));
            this.chatList.appendChild(chatElement);
        });
    }

    async createNewChat() {
        await ipcRenderer.invoke('new-chat');
        window.dispatchEvent(new Event('newChat'));
        this.loadChatList();
    }

    async loadChat(chatId) {
        const messages = await ipcRenderer.invoke('load-chat', chatId);
        window.dispatchEvent(new CustomEvent('chatLoaded', {
            detail: { messages }
        }));
        this.loadChatList(); // Refresh the list
    }
}

new ChatHistoryUI();
