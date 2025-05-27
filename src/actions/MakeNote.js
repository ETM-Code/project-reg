// MakeNote.js - Updated to use "note" parameter and trim its value
const ActionBase = require('./ActionBase');
const fs = require('fs');
const path = require('path');
const { numTokensFromString } = require('../util/tokenCounter');
const pathManager = require('../util/pathManager');

const NOTES_FILE = pathManager.getNotesPath();
const MAX_TOKENS = 100000;

// Initialize notes file if missing
function initializeNotesFile() {
  try {
    const dataDir = pathManager.getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(NOTES_FILE)) {
      fs.writeFileSync(NOTES_FILE, '');
    }
  } catch (error) {
    console.error('[MakeNote] Failed to initialize notes file:', error);
  }
}

class MakeNote extends ActionBase {
  async execute(params) {
    // Initialize file if needed
    initializeNotesFile();
    
    // Extract and trim the note value
    const note = params.note ? params.note.trim() : "";
    console.log("MakeNote received note:", note);
    let existingNotes = fs.readFileSync(NOTES_FILE, 'utf-8');
    const timestamp = new Date().toISOString();
    const noteWithTimestamp = `[${timestamp}] ${note}`;
    const totalTokens = numTokensFromString(existingNotes + noteWithTimestamp);
    if (totalTokens > MAX_TOKENS) {
      archiveNotes(existingNotes);
      existingNotes = '';
    }
    // Append a newline if existingNotes is not empty, then the note
    const contentToAppend = existingNotes.length > 0 ? `\n${noteWithTimestamp}` : noteWithTimestamp;
    fs.appendFileSync(NOTES_FILE, contentToAppend);
    return { status: 'Note added with timestamp' };
  }

  /**
   * @override
   * @returns {{name: string, description: string, parameters: object}}
   */
  static getSchema() {
    return {
      name: 'make_note',
      description: 'Appends a note to the user notes log. This should be used whenever the user says something that even MIGHT be useful to remember later',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'The note text to add.' }
        },
        required: ['note']
      }
    };
  }
}

function archiveNotes(notes) {
  const archiveFile = pathManager.getArchivedNotesPath();
  let archived = fs.existsSync(archiveFile)
    ? JSON.parse(fs.readFileSync(archiveFile))
    : [];
  archived.push({ archivedAt: new Date().toISOString(), notes });
  fs.writeFileSync(archiveFile, JSON.stringify(archived, null, 2));
  fs.writeFileSync(NOTES_FILE, '');
}

module.exports = MakeNote;
