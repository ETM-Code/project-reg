const fs = require('fs').promises;
const path = require('path');

const CHATS_DIR = path.join(__dirname, '../../data/chats');

class ChatStorage {
  constructor() {
    this.ensureChatsDirectory();
  }

  async ensureChatsDirectory() {
    try {
      await fs.mkdir(CHATS_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating chats directory:', error);
    }
  }

  async saveChat(chatId, history, model) {
    const chatData = {
      id: chatId,
      model,
      history,
      lastUpdated: Date.now(),
      title: this.generateChatTitle(history)
    };

    try {
      await fs.writeFile(
        path.join(CHATS_DIR, `${chatId}.json`),
        JSON.stringify(chatData)
      );
      return true;
    } catch (error) {
      console.error('Error saving chat:', error);
      return false;
    }
  }

  async loadChat(chatId) {
    try {
      const data = await fs.readFile(
        path.join(CHATS_DIR, `${chatId}.json`),
        'utf8'
      );
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading chat:', error);
      return null;
    }
  }

  async listChats() {
    try {
      const files = await fs.readdir(CHATS_DIR);
      const chats = await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(async file => {
            const data = await this.loadChat(file.replace('.json', ''));
            return {
              id: data.id,
              title: data.title,
              lastUpdated: data.lastUpdated
            };
          })
      );
      return chats.sort((a, b) => b.lastUpdated - a.lastUpdated);
    } catch (error) {
      console.error('Error listing chats:', error);
      return [];
    }
  }

  generateChatTitle(history) {
    if (history.length === 0) return 'New Chat';
    const firstMessage = history[0].parts[0].text;
    return firstMessage.split('\n')[0].slice(0, 30) + '...';
  }
}

module.exports = new ChatStorage();
