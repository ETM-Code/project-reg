// src/models/geminiChat.js - Gemini integration using @google/genai
const { GoogleGenAI } = require('@google/genai');
const { loadPrompt } = require('../../src/util/promptLoader');
const { loadContext } = require('../../src/util/contextLoader');
const config = require('../../config');

let geminiChat = null;

const genai = require('@google/genai'); // Import the whole module
const GoogleGenerativeAI = genai.GoogleGenerativeAI; // Access constructor as property
const HarmCategory = genai.HarmCategory; // Access HarmCategory
const HarmBlockThreshold = genai.HarmBlockThreshold; // Access HarmBlockThreshold

function initialize(conversationHistory, toolDeclarations, modelName = "gemini-1.5-flash-latest") { // Updated default model
  const systemPrompt = loadPrompt();
  const contextText = loadContext();
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY); // Use the accessed constructor

  const model = genAI.getGenerativeModel({
      model: modelName,
      // Pass system instruction and tools directly to getGenerativeModel
      systemInstruction: {
          // Structure system instruction correctly if needed (e.g., as parts)
          // Assuming simple string works based on some examples, adjust if needed
          parts: [{ text: systemPrompt + "\n" + contextText }]
      },
      tools: toolDeclarations, // Pass tool declarations array directly
      toolConfig: { // Pass tool config directly (Gemini specific)
          functionCallingConfig: { mode: 'AUTO' } // Mode often uppercase
      },
      // Optional: Add safety settings if needed
      // safetySettings: [
      //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      //   // ... other categories
      // ]
  });

  console.log(`[geminiChat] Initializing model ${modelName} with tools and system prompt.`);

  // Start chat with history
  try {
      geminiChat = model.startChat({
          // Filter history for Gemini compatibility if needed, though it should handle user/model/function roles
          // Ensure the format matches what startChat expects.
          // The structure added in chatManager.appendToolResponseMessage should be compatible.
          history: conversationHistory,
          // generationConfig can be added here if needed (temperature, maxOutputTokens, etc.)
          // generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
      });

      if (!geminiChat) {
          console.error("[geminiChat] Failed to initialize Gemini chat session (startChat returned null/undefined).");
          return null;
      }
      console.log("[geminiChat] Gemini chat initialized successfully via startChat.");
      return geminiChat;

  } catch (error) {
      console.error("[geminiChat] Error during model.startChat:", error);
      // Log details that might be helpful
      console.error("[geminiChat] Model Name:", modelName);
      console.error("[geminiChat] History Length:", conversationHistory?.length);
      console.error("[geminiChat] Tool Declarations Count:", toolDeclarations?.length);
      return null; // Return null on error
  }
}

async function sendMessageStream(chat, message) {
  if (!chat) {
      console.error("[geminiChat.sendMessageStream] Chat session is not initialized.");
      throw new Error("Gemini chat session not initialized.");
  }
  // Pass the message string directly.
  console.log(`[geminiChat.sendMessageStream] Sending message: "${message?.substring(0, 100)}..."`);
  try {
      // Ensure message is not null or undefined
      const messageToSend = message || "";
      const stream = await chat.sendMessageStream(messageToSend);
      console.log("[geminiChat.sendMessageStream] Stream obtained successfully.");
      return stream; // Return the stream directly
  } catch (error) {
      console.error("[geminiChat.sendMessageStream] Error sending message:", error);
      // Re-throw or handle as appropriate for the application flow
      throw error;
  }
}

module.exports = { initialize, sendMessageStream };
