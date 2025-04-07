// contextLoader.js - Loads all context files (.txt or .md) from the context folder
const fs = require('fs');
const path = require('path');

function loadNotes() {
  const contextDir = path.join(__dirname, '../../data');
  let contextFiles = fs.readdirSync(contextDir);
  let contextText = '';
  contextFiles.forEach(file => {
    if (file.endsWith('.txt') || file.endsWith('.md')) {
      contextText += fs.readFileSync(path.join(contextDir, file), 'utf-8') + "\n";
    }
  });
  return contextText;
}

module.exports = { loadNotes };
