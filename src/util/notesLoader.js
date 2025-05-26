// notesLoader.js - Loads the content of the notes file specified in the configuration.
const fs = require('fs');
const path = require('path');
const settingsManager = require('../config/settingsManager'); // Import settingsManager

/**
 * Loads the content of the notes file.
 * The path is determined by settingsManager, pointing to the user data directory.
 * @returns {string} The content of the notes file, or an empty string if not found or an error occurs.
 */
function loadNotes() {
  try {
    // Get the absolute path to notes.txt from settingsManager (resolved to userData)
    const notesFilePath = settingsManager.getPaths().notesFile;
    
    if (!notesFilePath) {
        console.warn('[notesLoader] Notes file path not found in configuration.');
        return '';
    }

    console.log(`[notesLoader] Attempting to load notes from: ${notesFilePath}`);

    if (fs.existsSync(notesFilePath)) {
      return fs.readFileSync(notesFilePath, 'utf-8');
    } else {
      // This might happen if dataInitializer failed or the file was deleted.
      console.warn(`[notesLoader] Notes file not found at path: ${notesFilePath}`);
      // dataInitializer should have created it, so maybe return empty string is okay.
      return '';
    }
  } catch (error) {
    console.error(`[notesLoader] Error loading notes file:`, error);
    return ''; // Return empty string on error
  }
}

module.exports = { loadNotes };
