// MakeNote.js - Updated to use "note" parameter and trim its value
const ActionBase = require('./ActionBase');
const fs = require('fs');
const path = require('path');
const { numTokensFromString } = require('../util/tokenCounter');

const NOTES_FILE = path.join(__dirname, '../../data/notes.txt');
const MAX_TOKENS = 100000;

if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, '');

class MakeNote extends ActionBase {
  async execute(params) {
    // Extract and trim the note value
    const note = params.note ? params.note.trim() : "";
    console.log("MakeNote received note:", note);
    let existingNotes = fs.readFileSync(NOTES_FILE, 'utf-8');
    const totalTokens = numTokensFromString(existingNotes + note);
    if (totalTokens > MAX_TOKENS) {
      archiveNotes(existingNotes);
      existingNotes = '';
    }
    fs.appendFileSync(NOTES_FILE, `\n${note}`);
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
