const fs = require('fs').promises;
const path = require('path');
const settingsManager = require('../config/settingsManager'); // Import settingsManager

// REMOVED: Hardcoded paths CHATS_DIR and VERSIONS_DIR

class ChatStorage {
  constructor() {
    // REMOVED: this.ensureChatsDirectory(); - Directories ensured on demand
  }

  // Helper to get configured paths, ensuring settings are loaded
  _getPaths() {
    return settingsManager.getPaths(); // Assumes settingsManager is initialized
  }

  // Helper to ensure a directory exists
  async _ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.error(`Error creating directory ${dirPath}:`, error);
      throw error; // Re-throw to indicate failure
    }
  }


  async saveChat(chatId, history, model, personalityId) { // Add personalityId parameter
    console.log(`Saving Chat: ${chatId} with personality: ${personalityId}`);
    const paths = this._getPaths();
    const chatsDir = paths.chats;
    if (!chatsDir) throw new Error("Chats directory path not configured.");

    await this._ensureDirectoryExists(chatsDir); // Ensure directory exists before saving

    const chatData = {
      id: chatId,
      model,
      personalityId, // Save the personality ID
      history,
      lastUpdated: Date.now(),
      title: this.generateDefaultTitle(history), // Use default initially
      titleGenerated: false // Flag to track AI title generation
    };

    try {
      await fs.writeFile(
        path.join(chatsDir, `${chatId}.json`),
        JSON.stringify(chatData, null, 2) // Add formatting
      );
      console.log(`Chat ${chatId} saved successfully.`);
      return true;
    } catch (error) {
      console.error('Error saving chat:', error);
      return false;
    }
  }



  async loadChat(chatId) {
    const paths = this._getPaths();
    const chatsDir = paths.chats;
    if (!chatsDir) {
        console.error("Chats directory path not configured.");
        return null;
    }
    const filePath = path.join(chatsDir, `${chatId}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') { // Log error only if it's not "file not found"
        console.error(`Error loading chat ${chatId} from ${filePath}:`, error);
      }
      return null;
    }
  }

  // Updated function signature to include personalityId
  async updateChatTitle(chatId, title, history, model, personalityId) { // Add personalityId parameter
    const paths = this._getPaths();
    const chatsDir = paths.chats;
    if (!chatsDir) throw new Error("Chats directory path not configured.");

    await this._ensureDirectoryExists(chatsDir); // Ensure directory exists

    const chatData = {
      id: chatId,
      model, // Need model here too
      personalityId, // Save personality ID on title update too
      history, // Need history here too
      lastUpdated: Date.now(), // Update timestamp
      title: title,
      titleGenerated: true // Mark as generated
    };
     try {
      await fs.writeFile(
        path.join(chatsDir, `${chatId}.json`),
        JSON.stringify(chatData, null, 2) // Add formatting
      );
      return true;
    } catch (error) {
      console.error(`Error updating chat title for ${chatId}:`, error);
      return false;
    }
  }

  async listChats() {
    const paths = this._getPaths();
    const chatsDir = paths.chats;
    if (!chatsDir) {
        console.error("Chats directory path not configured.");
        return [];
    }

    try {
      await this._ensureDirectoryExists(chatsDir); // Ensure dir exists before reading
      const files = await fs.readdir(chatsDir);
      const chats = await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(async file => {
            const data = await this.loadChat(file.replace('.json', ''));
            // Handle case where loadChat returns null (e.g., file deleted between readdir and load)
            if (!data) return null;
            return {
              id: data.id,
              title: data.title, // This will now be the potentially AI-generated title
              lastUpdated: data.lastUpdated
            };
          })
      );
      // Filter out null entries and sort
      return chats.filter(chat => chat !== null).sort((a, b) => b.lastUpdated - a.lastUpdated);
    } catch (error) {
      console.error('Error loading chat:', error);
      return null;
    }
  }

  // Renamed to avoid confusion with AI generation

  // Renamed to avoid confusion with AI generation
  generateDefaultTitle(history) {
    if (history.length === 0) return 'New Chat';
    const firstMessage = history[0].parts[0].text;
    return firstMessage.split('\n')[0].slice(0, 30) + '...';
  }

  // Moved: Function to back up the current chat state before editing
  async backupChatVersion(chatId) {
    const paths = this._getPaths();
    const chatsDir = paths.chats;
    const versionsDir = paths.chatVersions; // Use configured versions path
    if (!chatsDir || !versionsDir) {
        throw new Error("Chats or chat versions directory path not configured.");
    }

    await this._ensureDirectoryExists(versionsDir); // Make sure backup dir exists

    const sourcePath = path.join(chatsDir, `${chatId}.json`);
    try {
      // Check if source file exists
      await fs.access(sourcePath);

      // Find the next available version number
      let version = 1;
      let destinationPath;
      do {
        destinationPath = path.join(versionsDir, `${chatId}-v${version}.json`);
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
    const paths = this._getPaths();
    const chatsDir = paths.chats;
    if (!chatsDir) {
        console.error("Chats directory path not configured. Cannot delete chat.");
        return false;
    }
    const filePath = path.join(chatsDir, `${chatId}.json`);
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
