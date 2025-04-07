// main.js - Main process with multi-turn conversation, system instruction, and tool declarations

require('./dataInitializer'); // Ensure data folder/files exist
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { loadPrompt } = require('./src/util/promptLoader');
const { loadContext } = require('./src/util/contextLoader');
const { addCredits } = require('./src/util/credits');
const { numTokensFromString } = require('./src/util/tokenCounter');
const config = require('./config'); // Contains GEMINI_API_KEY, etc.

// Global chat object and conversation history
let chat = null;
let conversationHistory = []; // Will store user/model messages
let lastMessageTime = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.loadFile(path.join(__dirname, 'src/renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Initialize the Gemini chat with system instruction & tools.
// We now pass your life coach prompt and context via the config.systemInstruction,
// and we also define a sample tool (e.g. create_event). You can add more tools similarly.
function initializeChat() {
  const systemPrompt = loadPrompt();     // e.g. "You are a stern life coach..."
  const contextText = loadContext();       // Additional user context

  // Example: define a tool for creating events.
  const createEventFn = {
    name: 'create_event',
    description: 'Creates a new event in Google Calendar with a specified date and title.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date of the event in YYYY-MM-DD format.' },
        title: { type: 'string', description: 'Title or description of the event.' }
      },
      required: ['date', 'title']
    }
  };
  // (Additional tool declarations like check_events, start_timer, and make_note can be added here.)

  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  // Start with an empty conversation history; system instructions are passed via config.
  conversationHistory = [];
  chat = ai.chats.create({
    model: 'gemini-2.0-flash',
    history: conversationHistory,
    config: {
      systemInstruction: systemPrompt + "\n" + contextText,
      tools: [{
        functionDeclarations: [createEventFn /*, checkEventsFn, startTimerFn, makeNoteFn */]
      }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'auto'  // or 'any'/'none' based on your preference
        }
      }
    }
  });
}

initializeChat();

// Multi-turn chat handling
ipcMain.on('chatMessage', async (event, data) => {
  const { message } = data;

  // Calculate time metadata
  const now = new Date();
  const timeDiff = lastMessageTime ? Math.round((now - lastMessageTime) / 1000) : 0;
  lastMessageTime = now;
  const metadata = `Date: ${now.toLocaleDateString()} | Time: ${now.toLocaleTimeString()} | Since last msg: ${timeDiff}s\n`;
  const fullMessage = metadata + message;

  // Append the user message to the conversation history
  conversationHistory.push({
    role: 'user',
    parts: [{ text: fullMessage }]
  });

  // Calculate token usage and update credits
  const conversationText = conversationHistory
    .map(msg => msg.parts.map(part => part.text).join('\n'))
    .join('\n');
  const tokens = numTokensFromString(conversationText);
  addCredits(tokens);

  // Stream the model's response
  try {
    const stream = await chat.sendMessageStream({ message: fullMessage });
    let responseBuffer = '';
    // Send partial chunks using a dedicated event
    for await (const chunk of stream) {
      responseBuffer += chunk.text;
      event.sender.send('streamPartialResponse', { text: chunk.text });
    }
    // When finished, send a final event with the complete response
    event.sender.send('streamFinalResponse', { text: responseBuffer });
    // Append the model response to the conversation history
    conversationHistory.push({
      role: 'model',
      parts: [{ text: responseBuffer }]
    });
  } catch (error) {
    event.sender.send('streamFinalResponse', { text: "Error: " + error.message });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
