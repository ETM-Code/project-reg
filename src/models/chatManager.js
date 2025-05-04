// src/models/chatManager.js - Unified chat manager for model switching and messaging
const geminiChatModel = require('./geminiChat');
const gptChatModel = require('./gptChat');
const { loadPrompt } = require('../util/promptLoader');  // (for potential use)
const { generateChatTitle } = require('./gptChat'); // Import title generation
const chatStorage = require('../services/chatStorage'); // Import chatStorage
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
    description: 'Appends a note to the user notes log. This should be used whenever the user says something that even MIGHT be useful to remember later',
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
   // User message is now added separately by appendUserMessage before calling this
   // We just need the latest message content for the API call itself in some cases (Gemini)
   // For GPT, the full history is passed anyway.
   const lastUserMessageContent = conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'user'
       ? conversationHistory[conversationHistory.length - 1].parts[0].text
       : message; // Fallback to original message if history is empty or last wasn't user

   if (currentModel.startsWith("gpt")) {
     // GPT uses the full history passed in
     // The 'message' parameter here isn't strictly needed by gptChatModel.sendMessageStream
     // as it rebuilds from history, but we pass it for consistency.
     // We pass the *current* conversation history.
     const stream = await gptChatModel.sendMessageStream(conversationHistory, lastUserMessageContent, toolDeclarations, currentModel);
     return stream;
   } else {
     // Ensure geminiChat is initialized
     if (!geminiChat) {
       console.warn("[chatManager.sendMessage] Gemini chat instance not found, re-initializing.");
       initialize(currentModel); // Re-initialize if null
     }
     // geminiChatModel.sendMessageStream now returns the stream directly.
     // Gemini's sendMessageStream takes the *new* message content.
     const stream = await geminiChatModel.sendMessageStream(geminiChat, lastUserMessageContent);
     if (!stream) { // Check if the stream itself is valid
       console.error("[chatManager.sendMessage] Failed to get stream from Gemini.");
       // Handle error appropriately - maybe return an empty stream or throw?
       // For now, let's throw to make the error explicit.
       throw new Error("Failed to get stream from Gemini model.");
     }
     // Return the stream directly
     return stream;
   }
}

// New function to add user message separately
function appendUserMessage(message) {
  const now = new Date();
  const timeDiff = conversationHistory.lastMessageTime ? Math.round((now - conversationHistory.lastMessageTime) / 1000) : 0;
  conversationHistory.lastMessageTime = now;
  const metadata = `Date: ${now.toLocaleDateString()} | Time: ${now.toLocaleTimeString()} | Since last msg: ${timeDiff}s\n`;
  const fullMessage = metadata + message;
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  conversationHistory.push({
    id: messageId,
    role: "user",
    parts: [{ text: fullMessage }]
  });
  return messageId; // Return the ID if needed elsewhere
}

// Modified: Now takes optional tool_calls from GPT response
async function appendModelResponse(responseText, toolCalls = null) { // Make async, add toolCalls param
  const messageData = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, // Add unique ID
    role: "model",
    parts: [{ text: responseText }]
  };

  // If GPT tool calls are present, add them to the message object
  if (toolCalls && currentModel.startsWith("gpt")) {
      messageData.tool_calls = toolCalls; // Store the raw tool_calls array from OpenAI
  }

  conversationHistory.push(messageData); // Push the potentially augmented messageData
  // Removed saveChat from here, will be called once at the end

  // Title generation check remains the same logic (based on history length)
  return conversationHistory.length === 2; // Return true if title gen should be triggered
}

// New function to append tool/function call results
async function appendToolResponseMessage(toolCallId, toolName, result) {
    console.log(`[chatManager] Appending tool response for ${toolName} (ID: ${toolCallId})`);
    let toolResponseEntry;

    if (currentModel.startsWith("gpt")) {
        // GPT format: Requires role 'tool' and tool_call_id
        toolResponseEntry = {
            id: `tool_${toolCallId}_${Date.now()}`, // Unique ID for the tool response
            role: "tool",
            tool_call_id: toolCallId, // Link to the specific tool call
            name: toolName, // Function name
            content: JSON.stringify(result) // Result must be a string
        };
    } else {
        // Gemini format: Requires role 'function' and parts structure
        toolResponseEntry = {
            id: `func_${toolName}_${Date.now()}`, // Unique ID for the function response
            role: "function", // Gemini uses 'function' role for results
            parts: [{
                functionResponse: {
                    name: toolName,
                    response: {
                        // The actual result content goes here. Gemini expects an object.
                        // Ensure 'result' is structured appropriately if it's not already.
                        // If 'result' is just a string, wrap it: { content: result }
                        // If 'result' is already an object, use it directly.
                        // Let's assume 'result' is the final object payload.
                        name: toolName, // Include name again inside response for clarity/consistency
                        content: result // Assuming result is the object/value expected
                    }
                }
            }]
        };
    }

    conversationHistory.push(toolResponseEntry);
    // No need to save here, save happens once at the end of the interaction in main.js
}

function currentModelFunc() {
  return currentModel;
}

function getConversationHistory() {
  return conversationHistory;
}

// Helper function to check and delete empty chats
async function checkAndDeleteEmptyChat(chatId, history) {
  if (chatId && history && history.length <= 1) {
    console.log(`[chatManager] Chat ${chatId} has ${history.length} messages. Attempting deletion.`);
    const deleted = await chatStorage.deleteChat(chatId);
    if (deleted) { // If deletion was successful
      console.log(`[chatManager] Successfully deleted empty chat ${chatId}.`);
      // Return the chatId so the caller (ipc handler) can notify the renderer
      return chatId;
    } else {
      console.error(`[chatManager] Failed to delete empty chat ${chatId}.`);
    }
  }
  return null; // Return null if no deletion occurred or failed
}

async function startNewChat() {
  // Check the *previous* chat before starting a new one
  const previousChatId = currentChatId;
  const previousHistory = [...conversationHistory]; // Make a copy
  // Check and delete the previous chat if it was empty
  const deletedChatId = await checkAndDeleteEmptyChat(previousChatId, previousHistory);
  // Note: The actual notification needs to happen in the IPC handler

  // Proceed with starting the new chat
  conversationHistory = [];
  currentChatId = Date.now().toString();
  // Re-initialize the model for the new chat context (important if model instances hold state)
  if (currentModel) {
      initialize(currentModel);
  }
  return { newChatId: currentChatId, deletedChatId: deletedChatId }; // Return both IDs
}

// Modify editMessage to use messageId
async function editMessage(messageId, newContent) {
  const messageIndex = conversationHistory.findIndex(msg => msg.id === messageId);
  console.log(`[chatManager.editMessage] Received ID: ${messageId}. Found index: ${messageIndex}. History length: ${conversationHistory.length}`); // Keep log

  if (messageIndex !== -1) { // Check if message was found
    // 1. Backup the current version before editing (Optional but good practice)
    // await chatStorage.backupChatVersion(currentChatId); // Keep or remove based on need

    // 2. Update the content of the target message
    if (conversationHistory[messageIndex].role !== 'user') {
        console.error(`[chatManager.editMessage] Attempted to edit non-user message ID: ${messageId}`);
        // Return an object indicating failure
        return { success: false, error: 'Cannot edit non-user messages.' };
    }
    // Ensure parts exists and has at least one element
    if (!conversationHistory[messageIndex].parts || conversationHistory[messageIndex].parts.length === 0) {
        conversationHistory[messageIndex].parts = [{ text: newContent }];
    } else {
        conversationHistory[messageIndex].parts[0].text = newContent;
    }


    // 3. Truncate history *after* the edited message
    conversationHistory = conversationHistory.slice(0, messageIndex + 1);

    // 4. Save the truncated history (this becomes the new "current" state)
    await chatStorage.saveChat(currentChatId, conversationHistory, currentModel); // Save truncated history

    // 5. Trigger model response with the edited content and truncated history
    console.log(`[chatManager.editMessage] Edit successful for ${messageId}. Triggering model response.`);
    // We use the 'newContent' which already includes metadata if it was present during edit.
    // The model's sendMessageStream function expects the *last* message content.
    if (currentModel.startsWith("gpt")) {
        const stream = await gptChatModel.sendMessageStream(conversationHistory, newContent, toolDeclarations, currentModel);
        // Return the stream directly (or wrap in a success object if needed by IPC)
        return stream; // Assuming IPC handler expects the stream for GPT
    } else {
      // Ensure geminiChat is initialized
      if (!geminiChat) {
        console.warn("[chatManager.editMessage] Gemini chat instance not found, re-initializing.");
        initialize(currentModel); // Re-initialize if null
      }
      // geminiChatModel.sendMessageStream now returns the stream directly.
      const stream = await geminiChatModel.sendMessageStream(geminiChat, newContent);
      if (!stream) { // Check if the stream itself is valid
        console.error("[chatManager.editMessage] Failed to get stream from Gemini on edit.");
        throw new Error("Failed to get stream from Gemini model during edit.");
      }
      // Return the stream directly
      return stream;
    }
    // Note: We are returning the stream directly now.
    // The stream/result object now signifies success and contains the model's response flow.
  }
  console.error(`[chatManager.editMessage] Message ID ${messageId} not found in history.`); // Log failure
  // Return null or an error object if the edit itself failed (message not found)
  // Returning null might be ambiguous; let's return an error structure consistent with model failures
  return { error: `Message ID ${messageId} not found.` }; // Indicate edit failure clearly
}

// New function to handle the title generation logic
async function triggerTitleGeneration() {
  if (conversationHistory.length < 2) return null; // Need at least two messages

  // Avoid regenerating if already done (check storage first)
  const chatData = await chatStorage.loadChat(currentChatId);
  if (chatData && chatData.titleGenerated) {
    console.log(`Title already generated for chat ${currentChatId}`);
    return null;
  }

  const firstUserMsg = conversationHistory[0]?.parts[0]?.text;
  const firstModelMsg = conversationHistory[1]?.parts[0]?.text;

  if (!firstUserMsg || !firstModelMsg) return null;

  const generatedTitle = await generateChatTitle(firstUserMsg, firstModelMsg);

  if (generatedTitle) {
    console.log(`Generated title for chat ${currentChatId}: ${generatedTitle}`);
    await chatStorage.updateChatTitle(currentChatId, generatedTitle, conversationHistory, currentModel);
    return generatedTitle; // Return the title if successful
  }
  return null; // Return null if generation failed
}

function getCurrentChatId() {
  return currentChatId;
}

async function loadChat(chatId) {
  // Check the *previous* chat before loading a new one
  const previousChatId = currentChatId;
  const previousHistory = [...conversationHistory]; // Make a copy
  // Don't delete if we are trying to load the *same* chat again
  let deletedChatId = null;
  if (previousChatId && previousChatId !== chatId) { // Ensure previousChatId exists
      deletedChatId = await checkAndDeleteEmptyChat(previousChatId, previousHistory);
  }

  // Proceed with loading the chat
  const loaded = await chatStorage.loadChat(chatId);
  if (loaded) {
    conversationHistory = loaded.history;
    currentModel = loaded.model;
    currentChatId = chatId;
    initialize(currentModel); // Re-initialize model with loaded history/context
    return { success: true, history: conversationHistory, deletedChatId: deletedChatId }; // Return success, history, and potentially deleted ID
  } else {
    console.error(`[chatManager] Failed to load chat ${chatId}.`);
    // Handle failure: maybe load default state or notify user?
    // For now, just return false.
    return { success: false, deletedChatId: deletedChatId }; // Indicate failure, but still return potentially deleted ID
   }
}

module.exports = {
  initialize,
  appendUserMessage, // Export new function
  sendMessage,
  appendModelResponse,
  appendToolResponseMessage, // Export new function
  currentModel: currentModelFunc,
  toolDeclarations,
  startNewChat,
  editMessage,
  getCurrentChatId,
  loadChat,
  getConversationHistory,
  triggerTitleGeneration
};
