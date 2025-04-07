// dataInitializer.js - Ensures the data folder and required files are created on first run
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');

// List of files that need to exist with their default content
const files = [
  {
    name: 'monthlyCredits.json',
    defaultContent: JSON.stringify({ used: 0, month: new Date().getMonth() }, null, 2)
  },
  {
    name: 'events.json',
    defaultContent: JSON.stringify([], null, 2)
  },
  {
    name: 'finishedEvents.json',
    defaultContent: JSON.stringify([], null, 2)
  },
  {
    name: 'notes.txt',
    defaultContent: ''
  },
  {
    name: 'archivedNotes.json',
    defaultContent: JSON.stringify([], null, 2)
  }
];

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// For each file, create it if it doesn't exist
files.forEach(file => {
  const filePath = path.join(dataDir, file.name);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, file.defaultContent);
  }
});
