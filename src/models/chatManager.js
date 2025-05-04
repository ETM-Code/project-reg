// src/models/chatManager.js - Manages chat state, personalities, and interaction with AI model implementations.
const settingsManager = require('../config/settingsManager');
const chatStorage = require('../services/chatStorage');
const AIModelInterface = require('./AIModelInterface'); // Import the interface definition
const GPTChat = require('./gptChat'); // Import the concrete GPT implementation
const GeminiChat = require('./geminiChat'); // Import the concrete Gemini implementation
const actionsManager = require('../actions/ActionsManager'); // Import ActionsManager instance
// Loaders are used by the model implementations now, not directly here.

// --- State Variables ---
let conversationHistory = [];
let currentChatId = null;
/** @type {AIModelInterface | null} */
let activeModelInstance = null;
/** @type {import('../config/settingsManager').Personality | null} */
let currentPersonalityConfig = null;

// --- Initialization and Personality Management ---

/**
 * Sets the active AI personality and initializes the corresponding model instance.
 * @param {string} personalityId - The ID of the personality to activate.
 * @throws {Error} If personality config is not found or model initialization fails.
 */
async function setActivePersonality(personalityId) {
  console.log(`[ChatManager] Setting active personality to: ${personalityId}`);
  const personality = settingsManager.getPersonalityById(personalityId);
  if (!personality) {
    throw new Error(`[ChatManager] Personality configuration not found for ID: ${personalityId}`);
  }
  currentPersonalityConfig = personality;

  // Determine model implementation type (e.g., 'gpt', 'gemini')
  const implementationType = personality.modelImplementation || settingsManager.getDefaults().modelImplementation;
  const modelName = personality.modelName || settingsManager.getDefaults().modelName;

  console.log(`[ChatManager] Using implementation: ${implementationType}, Model: ${modelName}`);

  // Instantiate the correct model class
  if (implementationType === 'gpt') {
    activeModelInstance = new GPTChat();
  } else if (implementationType === 'gemini') {
    activeModelInstance = new GeminiChat();
  } else {
    throw new Error(`[ChatManager] Unsupported model implementation type: ${implementationType}`);
  }

  // Prepare initialization config for the model instance
  const modelInitConfig = {
    // API key retrieval is handled within the model's initialize method using settingsManager
    modelName: modelName,
    personality: currentPersonalityConfig, // Pass full personality for context
    // prompt: settingsManager.getPromptById(currentPersonalityConfig.promptId), // Optionally pass resolved prompt/context
    // contextSet: settingsManager.getContextSetById(currentPersonalityConfig.contextSetId),
  };

  try {
    // Initialize the instance (this handles API key setup etc.)
    // The initialize method now returns true on success, false on failure (e.g., missing key)
    const initializationSuccess = activeModelInstance.initialize(modelInitConfig);

    if (initializationSuccess) {
      console.log(`[ChatManager] Active model instance (${implementationType}) initialized successfully for personality '${personalityId}'.`);
    } else {
      // Initialization failed, likely due to a missing API key (as handled in model classes)
      console.warn(`[ChatManager] Failed to initialize model for personality '${personalityId}'. Check API key environment variables or model configuration.`);
      // Set instance to null but DO NOT throw an error, allowing the app to continue
      activeModelInstance = null;
      // Also clear the personality config as it couldn't be fully activated
      currentPersonalityConfig = null;
    }
  } catch (error) {
    // Catch any other unexpected errors during instantiation or initialization
    console.error(`[ChatManager] Unexpected error during model initialization for personality '${personalityId}' (${implementationType}):`, error);
    activeModelInstance = null; // Ensure instance is null if init fails
    currentPersonalityConfig = null;
    throw error; // Re-throw unexpected initialization errors
  }
}

/**
 * Sets the active AI personality for the *current chat session only*.
 * Does not change the default saved in settings.
 * @param {string} personalityId - The ID of the personality to activate for the current session.
 * @throws {Error} If no chat is active, personality config is not found, or model initialization fails.
 */
async function setCurrentChatPersonality(personalityId) {
  console.log(`[ChatManager] Setting current chat session personality to: ${personalityId}`);
  // Reuse the existing logic to load the personality config and initialize the model
  // This will update currentPersonalityConfig and activeModelInstance for the session
  try {
    await setActivePersonality(personalityId);
    console.log(`[ChatManager] Current chat session personality successfully switched to ${personalityId}`);
    // Note: This change is temporary for the session. The default personality remains unchanged.
    // The correct personality ID should be saved with the chat history upon interaction.
  } catch (error) {
    console.error(`[ChatManager] Failed to switch current chat personality to ${personalityId}:`, error);
    // Re-throw the error to be handled by the IPC caller
    throw error;
  }
}

// --- Core Chat Interaction ---

/**
 * Sends the current conversation history to the active AI model.
 * @returns {Promise<import('./AIModelInterface').SendMessageResult>} Result object from the model instance.
 * @throws {Error} If no model is active or sending fails.
 */
async function sendMessageToModel() {
   if (!activeModelInstance || !currentPersonalityConfig) {
     throw new Error("[ChatManager] No active model instance or personality configured. Cannot send message.");
   }

   // Retrieve tool schemas based on the personality configuration
   const toolNamesFromPersonality = currentPersonalityConfig.tools || [];
   let toolSchemas = [];
   if (toolNamesFromPersonality.length > 0) {
       // Convert internal camelCase names (from personality config) to snake_case for schema lookup
       const schemaToolNames = toolNamesFromPersonality.map(name => actionsManager.actionNameToSchemaName[name] || name); // Fallback if mapping missing
       console.log(`[ChatManager] Requesting schemas for tools: ${schemaToolNames.join(', ')}`);
       toolSchemas = actionsManager.getToolDeclarations(schemaToolNames);
       console.log(`[ChatManager] Retrieved ${toolSchemas.length} tool schemas.`);
   }

   const options = {
       tools: toolSchemas, // Pass the actual schemas retrieved from ActionsManager
       // No overrides by default, model implementation will load defaults
   };

   console.log(`[ChatManager] Sending history (length ${conversationHistory.length}) to ${activeModelInstance.getImplementationType()}:${activeModelInstance.getModelName()}`);

   try {
       // Pass current history. The model instance handles transformation and API call.
       // The 'message' parameter to sendMessageStream is effectively null/ignored here,
       // as the history already contains the last user message appended by appendUserMessage.
       const result = await activeModelInstance.sendMessageStream(conversationHistory, null, options);
       return result;
   } catch (error) {
       console.error(`[ChatManager] Error during sendMessageStream for ${activeModelInstance.getImplementationType()}:`, error);
       throw error; // Re-throw to be handled by the caller (e.g., main.js IPC handler)
   }
}

// --- History Management ---

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
/**
 * Appends a response from the AI model to the history.
 * @param {string} responseText - The text content of the response.
 * @param {object} [rawToolData] - Optional raw tool call data returned by the model (e.g., tool_calls for GPT). Stored for potential use in history transformation.
 * @returns {boolean} True if this is the first model response (triggering title generation).
 */
function appendModelResponse(responseText, rawToolData = null) {
  const messageData = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    role: "model",
    parts: [{ text: responseText }],
    // Store raw tool data if provided, model implementation decides how to use it
    rawToolData: rawToolData
  };

  conversationHistory.push(messageData);
  console.log(`[ChatManager] Appended model response. History length: ${conversationHistory.length}`);

  // Title generation check: triggered if history now contains exactly one user and one model message.
  const userMessages = conversationHistory.filter(m => m.role === 'user').length;
  const modelMessages = conversationHistory.filter(m => m.role === 'model').length;
  return userMessages === 1 && modelMessages === 1;
}

/**
 * Appends the result of a tool execution to the history using a standardized format.
 * @param {string} toolCallId - The original ID of the tool call from the model (if available).
 * @param {string} toolName - The name of the tool/function that was called.
 * @param {object} result - The result returned by the tool execution.
 */
function appendToolResponseMessage(toolCallId, toolName, result) {
    console.log(`[ChatManager] Appending tool response for ${toolName} (Call ID: ${toolCallId})`);

    // Standardized internal format
    const toolResponseEntry = {
        id: `tool_${toolName}_${Date.now()}`, // Unique internal ID
        role: "tool",
        name: toolName, // The function name that was called
        content: result, // The actual result object/value
        toolCallId: toolCallId // Store the original model's tool call ID if available (e.g., for GPT)
    };

    conversationHistory.push(toolResponseEntry);
    console.log(`[ChatManager] Appended tool response. History length: ${conversationHistory.length}`);
}

// --- Getters ---

function getActiveModelInstance() {
  return activeModelInstance;
}

function getCurrentPersonalityConfig() {
    return currentPersonalityConfig;
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
  // Check and potentially delete the previous chat if empty
  const previousChatId = currentChatId;
  const previousHistory = [...conversationHistory];
  const deletedChatId = await checkAndDeleteEmptyChat(previousChatId, previousHistory);

  // Reset state for the new chat
  conversationHistory = [];
  currentChatId = Date.now().toString();
  activeModelInstance = null; // Clear the model instance
  currentPersonalityConfig = null;

  try {
    // Initialize with the default personality from settings
    const defaultPersonalityId = settingsManager.getDefaults().personalityId;
    if (!defaultPersonalityId) {
      console.error("[ChatManager] Default personality ID not found in settings.");
      // Handle error - maybe default to first available personality?
      const personalities = settingsManager.getPersonalities();
      if (personalities.length > 0) {
          await setActivePersonality(personalities[0].id);
      } else {
          throw new Error("No default or available personalities found in configuration.");
      }
    } else {
        await setActivePersonality(defaultPersonalityId);
    }
    console.log(`[ChatManager] Started new chat ${currentChatId} with personality ${currentPersonalityConfig?.id}`);
    return { newChatId: currentChatId, deletedChatId: deletedChatId };
  } catch (error) {
      console.error("[ChatManager] Failed to initialize default personality for new chat:", error);
      // Return IDs but indicate potential issue?
      return { newChatId: currentChatId, deletedChatId: deletedChatId, error: error.message };
  }
}

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
    // Need to save personality ID as well
    await chatStorage.saveChat(
        currentChatId,
        conversationHistory,
        activeModelInstance?.getModelName() || 'unknown', // Get model name from instance
        currentPersonalityConfig?.id // Get personality ID
    );

    // 5. Trigger model response using the active instance and truncated history
    console.log(`[ChatManager.editMessage] Edit successful for ${messageId}. Triggering model response.`);
    try {
        // Call the refactored method, which uses the active instance
        const result = await sendMessageToModel();
        // Return the result object (contains stream/response promise)
        return result;
    } catch (error) {
        console.error(`[ChatManager.editMessage] Error triggering model response after edit:`, error);
        // Return an error structure
        return { error: `Failed to get model response after edit: ${error.message}` };
    }
  }
  console.error(`[chatManager.editMessage] Message ID ${messageId} not found in history.`); // Log failure
  // Return null or an error object if the edit itself failed (message not found)
  // Returning null might be ambiguous; let's return an error structure consistent with model failures
  return { error: `Message ID ${messageId} not found.` }; // Indicate edit failure clearly
}

// New function to handle the title generation logic
async function triggerTitleGeneration() {
  if (!activeModelInstance) {
      console.warn("[ChatManager] Cannot generate title, no active model instance.");
      return null;
  }
  if (conversationHistory.length < 2) {
      console.log("[ChatManager] History too short for title generation.");
      return null;
  }

  // Avoid regenerating if already done
  const chatData = await chatStorage.loadChat(currentChatId);
  if (chatData && chatData.titleGenerated) {
    console.log(`[ChatManager] Title already generated for chat ${currentChatId}`);
    return null;
  }

  // Pass only the relevant part of history (first user, first model)
  const historyForTitle = conversationHistory.slice(0, 2);

  try {
      const generatedTitle = await activeModelInstance.generateTitle(historyForTitle);

      if (generatedTitle) {
        console.log(`[ChatManager] Generated title for chat ${currentChatId}: ${generatedTitle}`);
        // Save the updated title and mark as generated
        // Ensure updateChatTitle saves the current personality ID as well
        await chatStorage.updateChatTitle(
            currentChatId,
            generatedTitle,
            conversationHistory, // Save full current history
            activeModelInstance.getModelName(), // Save specific model name used
            currentPersonalityConfig?.id // Pass the personality ID
        );
        return generatedTitle;
      }
  } catch (error) {
      console.error("[ChatManager] Error during title generation:", error);
  }
  return null; // Return null if generation failed or not supported (e.g., try block finished without returning title)
} // Closes triggerTitleGeneration function

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
    conversationHistory = loaded.history || []; // Ensure history is an array
    currentChatId = chatId;
    activeModelInstance = null; // Clear previous instance
    currentPersonalityConfig = null;

    // Determine personality to load - MUST be saved in chat file
    const personalityId = loaded.personalityId; // Assuming chatStorage saves this
    if (!personalityId) {
        console.warn(`[ChatManager] Chat ${chatId} loaded but has no personalityId. Falling back to default.`);
        // Fallback to default personality
        const defaultPersonalityId = settingsManager.getDefaults().personalityId;
        if (!defaultPersonalityId) {
            console.error("[ChatManager] Default personality ID not found for fallback.");
            return { success: false, deletedChatId: deletedChatId, error: "Missing personalityId in chat and no default configured." };
        }
        try {
            await setActivePersonality(defaultPersonalityId);
        } catch (error) {
             return { success: false, deletedChatId: deletedChatId, error: `Failed to set default personality: ${error.message}` };
        }
    } else {
        try {
            await setActivePersonality(personalityId);
        } catch (error) {
            console.error(`[ChatManager] Failed to set personality ${personalityId} for loaded chat ${chatId}:`, error);
            // Fallback to default? Or return error?
             return { success: false, deletedChatId: deletedChatId, error: `Failed to set personality ${personalityId}: ${error.message}` };
        }
    }

    console.log(`[ChatManager] Successfully loaded chat ${chatId} with personality ${currentPersonalityConfig?.id}`);
    return { success: true, history: conversationHistory, deletedChatId: deletedChatId };
  } else {
    console.error(`[ChatManager] Failed to load chat ${chatId}.`);
    // Handle failure: maybe load default state or notify user?
    // For now, just return false.
    return { success: false, deletedChatId: deletedChatId }; // Indicate failure, but still return potentially deleted ID
   }
}

module.exports = {
  setActivePersonality, // Renamed from initialize
  appendUserMessage,
  sendMessageToModel, // Renamed from sendMessage
  appendModelResponse,
  appendToolResponseMessage,
  getActiveModelInstance, // Renamed from currentModel
  getCurrentPersonalityConfig, // New getter
  startNewChat,
  editMessage,
  getCurrentChatId,
  loadChat,
  getConversationHistory,
  triggerTitleGeneration,
  checkAndDeleteEmptyChat, // Keep helper exported if needed by IPC layer
  setCurrentChatPersonality // Export the new function
  // REMOVED: toolDeclarations export
};
