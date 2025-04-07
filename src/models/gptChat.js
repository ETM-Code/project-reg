// src/models/gptChat.js - GPT integration using OpenAI's API
const OpenAI = require("openai");
const { loadPrompt } = require('../util/promptLoader');
const { loadContext } = require('../util/contextLoader');
const { loadNotes } = require('../util/notesLoader');
const config = require('../../config');

let openaiClient = null;

function initialize(modelName) {
  let apiKey;
  if (modelName === "gpt-4o") {
    apiKey = config.GPT4O_API_KEY;
  } else if (modelName === "gpt-4o-mini") {
    apiKey = config.GPT4O_MINI_API_KEY;
  } else {
    apiKey = config.GPT4O_API_KEY;
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function transformHistoryForGPT(conversationHistory) {
  const systemPrompt = loadPrompt();
  const contextText = loadContext();
  const notes = loadNotes();
  const messages = [];
  // Use a developer message to persist system instructions
  messages.push({
    role: "developer",
    content: "SYSTEM PROMPT: " + systemPrompt + "\n" + "USER CONTEXT: " + contextText + "\n" + "NOTES: " + notes
  });
  for (const msg of conversationHistory) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.parts[0].text });
    } else if (msg.role === "model") {
      messages.push({ role: "assistant", content: msg.parts[0].text });
    }
  }
  return messages;
}

async function sendMessageStream(conversationHistory, message, toolDeclarations, modelName) {
  const messages = transformHistoryForGPT(conversationHistory);
  try {
    const stream = await openaiClient.chat.completions.create({
      model: modelName,
      messages: messages,
      functions: toolDeclarations, // Provide function declarations for GPT tool calling
      stream: true
    });
    return stream;
  } catch (error) {
    throw error;
  }
}

module.exports = { initialize, transformHistoryForGPT, sendMessageStream };
