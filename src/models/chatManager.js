// src/models/chatManager.js - Unified chat manager for model switching and messaging
const geminiChatModel = require('./geminiChat');
const gptChatModel = require('./gptChat');
const { loadPrompt } = require('../util/promptLoader');  // (for potential use)
const toolDeclarations = [
  {
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
  },
  {
    name: 'check_events',
    description: 'Searches for events based on given criteria.',
    parameters: {
      type: 'object',
      properties: {
        criteria: { type: 'string', description: 'Search criteria such as date, type, or tag.' }
      },
      required: ['criteria']
    }
  },
  {
    name: 'start_timer',
    description: 'Starts a countdown timer for a specified duration in seconds.',
    parameters: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: 'Timer duration in seconds.' }
      },
      required: ['duration']
    }
  },
  {
    name: 'make_note',
    description: 'Appends a note to the user notes log, archiving older notes if token limits are exceeded.',
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'The note text to add.' }
      },
      required: ['note']
    }
  }
];

module.exports = toolDeclarations;

  
let currentModel = "gpt-4o-mini"; // Default model
let conversationHistory = [];
let geminiChat = null; // Instance for Gemini
let openaiClient = null; // Instance for GPT
let currentChatId = null;

function initialize(modelName) {
  currentModel = modelName;
  if (modelName.startsWith("gpt")) {
    openaiClient = gptChatModel.initialize(modelName);
    geminiChat = null;
  } else {
    geminiChat = geminiChatModel.initialize(conversationHistory, toolDeclarations, modelName);
    openaiClient = null;
  }
}

async function sendMessage(message) {
  // Add metadata to the message
  const now = new Date();
  const timeDiff = conversationHistory.lastMessageTime ? Math.round((now - conversationHistory.lastMessageTime) / 1000) : 0;
  conversationHistory.lastMessageTime = now;
  const metadata = `Date: ${now.toLocaleDateString()} | Time: ${now.toLocaleTimeString()} | Since last msg: ${timeDiff}s\n`;
  const fullMessage = metadata + message;
  conversationHistory.push({
    role: "user",
    parts: [{ text: fullMessage }]
  });
  
  if (currentModel.startsWith("gpt")) {
    const stream = await gptChatModel.sendMessageStream(conversationHistory, fullMessage, toolDeclarations, currentModel);
    return stream;
  } else {
    const stream = await geminiChatModel.sendMessageStream(geminiChat, fullMessage);
    return stream;
  }
}

function appendModelResponse(responseText) {
  conversationHistory.push({
    role: "model",
    parts: [{ text: responseText }]
  });
}

function currentModelFunc() {
  return currentModel;
}

function getConversationHistory() {
  return conversationHistory;
}

function startNewChat() {
  conversationHistory = [];
  currentChatId = Date.now().toString();
  return currentChatId;
}

function editMessage(messageIndex, newContent) {
  if (messageIndex >= 0 && messageIndex < conversationHistory.length) {
    conversationHistory[messageIndex].parts[0].text = newContent;
    // Truncate history after edited message to maintain consistency
    conversationHistory = conversationHistory.slice(0, messageIndex + 1);
  }
}

function getCurrentChatId() {
  return currentChatId;
}

async function loadChat(chatId) {
  const loaded = await chatStorage.loadChat(chatId);
  if (loaded) {
    conversationHistory = loaded.history;
    currentModel = loaded.model;
    currentChatId = chatId;
    initialize(currentModel);
  }
}

module.exports = { 
  initialize, 
  sendMessage, 
  appendModelResponse, 
  currentModel: currentModelFunc, 
  toolDeclarations,
  startNewChat,
  editMessage,
  getCurrentChatId,
  loadChat,
  getConversationHistory 
};
