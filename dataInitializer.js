// dataInitializer.js - Ensures the data folder and required files are created on first run
const fs = require('fs');
const path = require('path');
const { app } = require('electron'); // Import app

// Get the user data path and define the main data directory within it
const userDataPath = app.getPath('userData');
const dataDir = path.join(userDataPath, 'data');

// Define paths for subdirectories needed
const chatsDir = path.join(dataDir, 'chats');
const tokenUsageDir = path.join(dataDir, 'token_usage');

// List of files that need to exist with their default content (paths are relative to dataDir)
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

// Create data directory and subdirectories if they don't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true }); // Use recursive to handle potential parent creation
  console.log(`Created data directory at: ${dataDir}`);
}
if (!fs.existsSync(chatsDir)) {
  fs.mkdirSync(chatsDir, { recursive: true });
  console.log(`Created chats directory at: ${chatsDir}`);
}
if (!fs.existsSync(tokenUsageDir)) {
  fs.mkdirSync(tokenUsageDir, { recursive: true });
  console.log(`Created token_usage directory at: ${tokenUsageDir}`);
}


// For each file, create it if it doesn't exist within the correct dataDir
files.forEach(file => {
  const filePath = path.join(dataDir, file.name); // Path is now relative to the userData/data dir
  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, file.defaultContent);
      console.log(`Created default file: ${filePath}`);
    } catch (error) {
      console.error(`Failed to create default file ${filePath}:`, error);
      // Decide if this is critical enough to halt the app
    }
  }
});
