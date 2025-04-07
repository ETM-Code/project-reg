// promptLoader.js - Loads the main prompt from the prompt folder (supports .txt and .md)
const fs = require('fs');
const path = require('path');

function loadPrompt() {
  const promptDir = path.join(__dirname, '../../src/prompt');
  let files = fs.readdirSync(promptDir);
  // Use the first found .txt or .md file as the prompt
  let promptFile = files.find(f => f.endsWith('.txt') || f.endsWith('.md'));
  if (promptFile) {
    return fs.readFileSync(path.join(promptDir, promptFile), 'utf-8');
  }
  return '';
}

module.exports = { loadPrompt };
