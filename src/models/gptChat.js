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
  } else if (modelName === "gpt-4.1-nano") { // Add nano model
    apiKey = config.GPT41_NANO_API_KEY; // Assuming this key exists in config
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

  // Use a system message for core instructions and context
  messages.push({
    role: "system",
    content: `USER CONTEXT: ${contextText}\nNOTES: ${notes}\nSYSTEM PROMPT: ${systemPrompt}`
  });

  // Append the conversation history
  for (const msg of conversationHistory) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.parts[0].text });
    } else if (msg.role === "model") {
      // Check if the model message includes tool_calls (GPT format)
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push({ role: "assistant", content: msg.parts[0].text || null, tool_calls: msg.tool_calls }); // content can be null if only tool calls
      } else {
        messages.push({ role: "assistant", content: msg.parts[0].text });
      }
    } else if (msg.role === "tool") {
      // Add tool responses to the history for GPT
      messages.push({ role: "tool", tool_call_id: msg.tool_call_id, name: msg.name, content: msg.content });
    }
  }
  return messages;
}

async function sendMessageStream(conversationHistory, message, toolDeclarations, modelName) {
  const messages = transformHistoryForGPT(conversationHistory);
  console.log("[gptChat] Sending messages to OpenAI:", JSON.stringify(messages, null, 2)); // Log messages being sent
  try {
    const stream = await openaiClient.chat.completions.create({
      model: modelName,
      messages: messages,
      // Map toolDeclarations to the format expected by the 'tools' parameter
      tools: toolDeclarations.map(tool => ({ type: "function", function: tool })),
      tool_choice: "auto", // Let the model decide whether to use tools
      stream: true,
      temperature: 0.9,        // Adds unpredictability and boldness
      top_p: 0.95,             // Samples from a wider token pool for a more human-like feel
      frequency_penalty: 0.2,  // Reins in repetition without killing energy
      presence_penalty: 0.4    // Encourages new ideas and prevents safe, generic answers
    });
    return stream;
  } catch (error) {
    console.error("[gptChat] Error calling OpenAI API:", error); // Log the specific error
    throw error; // Re-throw the error to be caught by the caller
  }
}

module.exports = { initialize, transformHistoryForGPT, sendMessageStream, generateChatTitle }; // Export new function

async function generateChatTitle(firstUserMessage, firstModelResponse) {
  if (!openaiClient) {
    // Ensure client is initialized, potentially with a default or specific key for nano
    initialize("gpt-4.1-nano");
  }
  const titlePrompt = `Based on the following first user message and first model response, generate a very concise title (5 words maximum) for this chat session. Only return the title text, nothing else.

User: ${firstUserMessage}
Model: ${firstModelResponse}

Title:`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4.1-nano", // Use the specific nano model
      messages: [{ role: "user", content: titlePrompt }],
      temperature: 0.5, // Lower temperature for more focused title generation
      max_tokens: 20, // Limit token usage for title
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error generating chat title:", error);
    return null; // Return null on error
  }
}
