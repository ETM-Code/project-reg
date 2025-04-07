// gemini.js - Gemini 2.0 streaming integration using @google/genai
const { GoogleGenAI } = require('@google/genai');
const config = require('../../config');

const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

/**
 * Generates a streaming chat response using multi-turn conversation.
 * @param {Array} history - Chat history array.
 * @param {string} message - New user message.
 * @returns {AsyncGenerator} Async generator yielding response chunks.
 */
async function* generateChatStream(history, message) {
  const chat = ai.chats.create({
    model: 'gemini-2.0-flash',
    history: history
  });
  const stream = await chat.sendMessageStream({ message });
  for await (const chunk of stream) {
    yield chunk;
  }
}

/**
 * Generates a streaming response with a system instruction.
 * @param {string} message - User message.
 * @param {string} systemInstruction - System prompt.
 * @returns {AsyncGenerator} Async generator yielding response chunks.
 */
async function* generateContentStream(message, systemInstruction) {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.0-flash',
    contents: message,
    config: { systemInstruction }
  });
  for await (const chunk of stream) {
    yield chunk;
  }
}

module.exports = { generateChatStream, generateContentStream };
