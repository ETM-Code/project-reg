// src/models/geminiChat.js - Gemini integration using @google/genai
const { GoogleGenAI } = require('@google/genai');
const { loadPrompt } = require('../../src/util/promptLoader');
const { loadContext } = require('../../src/util/contextLoader');
const config = require('../../config');

let geminiChat = null;

function initialize(conversationHistory, toolDeclarations, modelName = "gemini-2.0-flash") {
  const systemPrompt = loadPrompt();
  const contextText = loadContext();
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  geminiChat = ai.chats.create({
    model: modelName,
    history: conversationHistory,
    config: {
      systemInstruction: systemPrompt + "\n" + contextText,
      tools: [{
        functionDeclarations: toolDeclarations
      }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'auto'
        }
      }
    }
  });
  return geminiChat;
}

async function sendMessageStream(chat, message) {
  return chat.sendMessageStream({ message });
}

module.exports = { initialize, sendMessageStream };
