const fs = require('fs').promises;
const path = require('path');

const CHATS_DIR = path.join(__dirname, '../../data/chats');
const VERSIONS_DIR = path.join(__dirname, '../../data/chat_versions'); // Directory for backups

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

  // Ensure the versions directory exists
  async ensureVersionsDirectory() {
    try {
      await fs.mkdir(VERSIONS_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating chat versions directory:', error);
    }
  }

  async saveChat(chatId, history, model) {
    console.log("Saved Chat")
    // This initial save might be overwritten shortly after by title generation
    await this.ensureChatsDirectory(); // Ensure directory exists before saving
    const chatData = {
      id: chatId,
      model,
      history,
      lastUpdated: Date.now(),
      title: this.generateDefaultTitle(history), // Use default initially
      titleGenerated: false // Flag to track AI title generation
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

  // Moved: New function specifically for updating title/flag after generation
  async updateChatTitle(chatId, title, history, model) {
    await this.ensureChatsDirectory();
    const chatData = {
      id: chatId,
      model, // Need model here too
      history, // Need history here too
      lastUpdated: Date.now(), // Update timestamp
      title: title,
      titleGenerated: true // Mark as generated
    };
     try {
      await fs.writeFile(
        path.join(CHATS_DIR, `${chatId}.json`),
        JSON.stringify(chatData)
      );
      return true;
    } catch (error) {
      console.error('Error updating chat title:', error);
      return false;
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
              title: data.title, // This will now be the potentially AI-generated title
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



  // Renamed to avoid confusion with AI generation
  generateDefaultTitle(history) {
    if (history.length === 0) return 'New Chat';
    const firstMessage = history[0].parts[0].text;
    return firstMessage.split('\n')[0].slice(0, 30) + '...';
  }

  // Moved: Function to back up the current chat state before editing
  async backupChatVersion(chatId) {
    await this.ensureVersionsDirectory(); // Make sure backup dir exists
    const sourcePath = path.join(CHATS_DIR, `${chatId}.json`);
    try {
      // Check if source file exists
      await fs.access(sourcePath);

      // Find the next available version number
      let version = 1;
      let destinationPath;
      do {
        destinationPath = path.join(VERSIONS_DIR, `${chatId}-v${version}.json`);
        try {
          await fs.access(destinationPath);
          version++; // File exists, try next version
        } catch (err) {
          break; // File doesn't exist, use this version number
        }
      } while (true);

      await fs.copyFile(sourcePath, destinationPath);
      console.log(`Backed up chat ${chatId} to version ${version}`);
      return true;
    } catch (error) {
      console.error(`Error backing up chat ${chatId}:`, error);
      return false; // Indicate backup failure
    }
  }

  async deleteChat(chatId) {
    const filePath = path.join(CHATS_DIR, `${chatId}.json`);
    try {
      await fs.unlink(filePath);
      console.log(`Deleted chat file: ${filePath}`);
      // Optionally, also delete backups from VERSIONS_DIR if needed
      // (Implementation for deleting backups omitted for simplicity)
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File already deleted or never existed, not necessarily an error in this context
        console.log(`Chat file not found for deletion (may already be deleted): ${filePath}`);
        return true; // Still consider it successful from the manager's perspective
      }
      console.error(`Error deleting chat file ${filePath}:`, error);
      return false;
    }
  }
}

module.exports = new ChatStorage();
