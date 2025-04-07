// MakeNote.js - Action to append a note while ensuring the token limit is not exceeded
const ActionBase = require('./ActionBase');
const fs = require('fs');
const path = require('path');
const { numTokensFromString } = require('../util/tokenCounter');

const NOTES_FILE = path.join(__dirname, '../../data/notes.txt');
const MAX_TOKENS = 100000;

// Initialize notes file if missing
if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, '');

class MakeNote extends ActionBase {
  /**
   * Appends a note and archives older notes if token count exceeds limit.
   * @param {Object} params - { noteText }
   */
  async execute(params) {
    const { noteText } = params;
    let existingNotes = fs.readFileSync(NOTES_FILE, 'utf-8');
    const totalTokens = numTokensFromString(existingNotes + noteText);
    if (totalTokens > MAX_TOKENS) {
      archiveNotes(existingNotes);
      existingNotes = '';
    }
    fs.appendFileSync(NOTES_FILE, `\n${noteText}`);
    return { status: 'Note added' };
  }
}

function archiveNotes(notes) {
  const archiveFile = path.join(__dirname, '../../data/archivedNotes.json');
  let archived = fs.existsSync(archiveFile)
    ? JSON.parse(fs.readFileSync(archiveFile))
    : [];
  archived.push({ archivedAt: new Date().toISOString(), notes });
  fs.writeFileSync(archiveFile, JSON.stringify(archived, null, 2));
  fs.writeFileSync(path.join(__dirname, '../../data/notes.txt'), '');
}

module.exports = MakeNote;
