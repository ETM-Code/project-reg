// src/models/chatManager.js - Manages chat state, personalities, and interaction with AI model implementations.
const OpenAI = require("openai"); // <-- Add OpenAI import
const settingsManager = require('../config/settingsManager');
const chatStorage = require('../services/chatStorage');
const AIModelInterface = require('./AIModelInterface'); // Import the interface definition
const GPTChat = require('./gptChat'); // Import the concrete GPT implementation
const GeminiChat = require('./geminiChat'); // Import the concrete Gemini implementation
const OpenAIReasoningChat = require('./openaiReasoningChat'); // Import the new reasoning implementation
const actionsManager = require('../actions/ActionsManager'); // Import ActionsManager instance
// Loaders are used by the model implementations now, not directly here.

const MAX_CHATS_TO_BATCH_PROCESS = 50; // Max chats to process in one batch run for title generation

// --- Dedicated Client for Title Generation ---
let titleGenClient = null;

// Lazy initialization function for title generation client
function initializeTitleGenClient() {
    if (titleGenClient) {
        return titleGenClient; // Already initialized
    }
    
    try {
        const openaiApiKey = settingsManager.getApiKey('openai') || process.env.OPENAI_API_KEY;
        if (openaiApiKey) {
            titleGenClient = new OpenAI({ apiKey: openaiApiKey });
            console.log("[ChatManager] Dedicated OpenAI client for title generation initialized.");
            return titleGenClient;
        } else {
            console.warn("[ChatManager] OpenAI API key not found. Title generation will be disabled.");
            return null;
        }
    } catch (error) {
        console.error("[ChatManager] Failed to initialize dedicated OpenAI client for title generation:", error);
        return null;
    }
}

// --- State Variables ---
let conversationHistory = [];
let currentChatId = null;
/** @type {AIModelInterface | null} */
let activeModelInstance = null;
/** @type {import('../config/settingsManager').Personality | null} */
let currentPersonalityConfig = null;
let currentReasoningContext = null; // State for reasoning context persistence
let pendingTimeSinceLastChatInfo = null; // Stores formatted string about time since last chat

// Helper function to format time difference
function formatTimeDifference(ms) {
  // This function is called only if ms > 10 minutes
  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  let days = Math.floor(hours / 24);

  minutes %= 60; // Remainder minutes
  hours %= 24;   // Remainder hours

  const parts = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);

  if (parts.length === 0) {
    // Should be unlikely if ms > 10 minutes, but as a fallback.
    return `(System: Last chat session was over 10 minutes ago)\n`;
  }
  return `(System: Last chat session was ${parts.join(', ')} ago)\n`;
}

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

  // Get model configuration using modelId
  const modelId = personality.modelId || settingsManager.getDefaults().modelId;
  if (!modelId) {
      throw new Error(`[ChatManager] Personality ${personalityId} has no modelId and no default modelId is set.`);
  }
  const modelConfig = settingsManager.getModelById(modelId);
  if (!modelConfig) {
      throw new Error(`[ChatManager] Model configuration not found for ID: ${modelId}`);
  }

  const implementationType = modelConfig.implementation;
  console.log(`[ChatManager] Using implementation: ${implementationType}, Model ID: ${modelId}`);

  // Instantiate the correct model class based on implementation type
  if (implementationType === 'gpt') {
    activeModelInstance = new GPTChat();
  } else if (implementationType === 'gemini') {
    activeModelInstance = new GeminiChat();
  } else if (implementationType === 'openai-reasoning') {
    activeModelInstance = new OpenAIReasoningChat();
  } else {
    throw new Error(`[ChatManager] Unsupported model implementation type: ${implementationType}`);
  }

  // Prepare initialization config for the model instance
  const modelInitConfig = {
    // API key retrieval is handled within the model's initialize method using settingsManager
    modelId: modelId, // Pass modelId
    modelConfig: modelConfig, // Pass the full model config object
    personality: currentPersonalityConfig, // Pass full personality for context
    // defaultParams: modelConfig.defaultParams, // Pass default params if needed by model
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

/**
 * Sets the model for the *current chat session only* by temporarily changing the personality.
 * Does not change the default saved in settings.
 * @param {string} modelId - The ID of the model to activate for the current session.
 * @throws {Error} If model config is not found or model initialization fails.
 */
async function setCurrentChatModel(modelId) {
  console.log(`[ChatManager] Setting current chat session model to: ${modelId}`);
  
  // Get the model configuration
  const modelConfig = settingsManager.getModelById(modelId);
  if (!modelConfig) {
    throw new Error(`[ChatManager] Model configuration not found for ID: ${modelId}`);
  }
  
  // Create a temporary personality config that uses this model
  const currentPersonality = currentPersonalityConfig || settingsManager.getPersonalityById(settingsManager.getDefaults().personalityId);
  if (!currentPersonality) {
    throw new Error(`[ChatManager] No current personality available to override model for`);
  }
  
  // Create a temporary personality with the new model
  const tempPersonalityConfig = {
    ...currentPersonality,
    modelId: modelId,
    // Keep original ID but mark as temporary
    originalPersonalityId: currentPersonality.id
  };
  
  // Save current personality reference
  currentPersonalityConfig = tempPersonalityConfig;
  
  try {
    // Initialize the new model instance
    const implementationType = modelConfig.implementation;
    console.log(`[ChatManager] Switching to implementation: ${implementationType}, Model ID: ${modelId}`);

    // Instantiate the correct model class based on implementation type
    if (implementationType === 'gpt') {
      activeModelInstance = new GPTChat();
    } else if (implementationType === 'gemini') {
      activeModelInstance = new GeminiChat();
    } else if (implementationType === 'openai-reasoning') {
      activeModelInstance = new OpenAIReasoningChat();
    } else {
      throw new Error(`[ChatManager] Unsupported model implementation type: ${implementationType}`);
    }

    // Initialize with the new model config
    const modelInitConfig = {
      modelId: modelId,
      modelConfig: modelConfig,
      personality: tempPersonalityConfig,
    };

    const initializationSuccess = activeModelInstance.initialize(modelInitConfig);

    if (initializationSuccess) {
      console.log(`[ChatManager] Successfully switched to model ${modelId} (${implementationType}) for current chat session`);
    } else {
      throw new Error(`[ChatManager] Failed to initialize model ${modelId}`);
    }
  } catch (error) {
    console.error(`[ChatManager] Failed to switch current chat model to ${modelId}:`, error);
    // Reset to previous state on failure
    if (currentPersonality.originalPersonalityId) {
      try {
        await setActivePersonality(currentPersonality.originalPersonalityId);
      } catch (resetError) {
        console.error(`[ChatManager] Failed to reset to original personality after model switch failure:`, resetError);
      }
    }
    throw error;
  }
}

// --- Core Chat Interaction ---

/**
 * Sends the current conversation history to the active AI model.
 * @returns {Promise<import('./AIModelInterface').SendMessageResult>} Result object from the model instance.
 * @throws {Error} If no model is active or sending fails.
 */
async function sendMessageToModel(options = {}) {
   if (!activeModelInstance || !currentPersonalityConfig) {
     throw new Error("[ChatManager] No active model instance or personality configured. Cannot send message.");
   }

   // Extract abort signal from options
   const { abortSignal, ...otherOptions } = options;

   // Retrieve tool schemas based on the personality configuration
   const toolNamesFromPersonality = currentPersonalityConfig.tools || []; // These are names like "createNotification"
   let toolSchemas = [];

   if (toolNamesFromPersonality.length > 0) {
       // Convert personality tool names (e.g., "createNotification") to schema_names (e.g., "create_notification")
       // using the map from actionsManager.
       const schemaToolNames = toolNamesFromPersonality.map(name => {
           const schemaName = actionsManager.actionNameToSchemaName[name];
           if (!schemaName) {
               console.warn(`[ChatManager] No schema name mapping found in ActionsManager for tool: ${name}. Using name directly.`);
               return name; // Fallback to using the name directly if no mapping
           }
           return schemaName;
       }).filter(name => name); // Filter out any undefined if a mapping was missing and we chose to skip

       if (schemaToolNames.length > 0) {
           console.log(`[ChatManager] Requesting schemas for resolved tool schema names: ${schemaToolNames.join(', ')}`);
           toolSchemas = actionsManager.getToolDeclarations(schemaToolNames);
           console.log(`[ChatManager] Retrieved ${toolSchemas.length} tool schemas.`);
       } else {
           console.log(`[ChatManager] No valid schema names resolved from personality tools.`);
       }
   }

   const modelOptions = {
       tools: toolSchemas.length > 0 ? toolSchemas : undefined, // Pass schemas, or undefined if none
       abortSignal: abortSignal, // Pass abort signal to model
       ...otherOptions // Spread any other options
   };

   // Add reasoning context if applicable
   if (activeModelInstance instanceof OpenAIReasoningChat && currentReasoningContext) {
       console.log("[ChatManager] Adding reasoning context to request.");
       modelOptions.reasoning = currentReasoningContext;
       currentReasoningContext = null; // Consume context after adding it
   }

   console.log(`[ChatManager] Sending history (length ${conversationHistory.length}) to ${activeModelInstance.getImplementationType()}:${activeModelInstance.getModelName()}`); // Use getModelName()

   try {
       // Pass current history. The model instance handles transformation and API call.
       const result = await activeModelInstance.sendMessageStream(conversationHistory, null, modelOptions);

       // Store reasoning context from response if applicable
       if (activeModelInstance instanceof OpenAIReasoningChat && result.rawResponse?.reasoning) {
           console.log("[ChatManager] Storing reasoning context from response.");
           currentReasoningContext = result.rawResponse.reasoning;
       } else {
           // Clear context if the model didn't return any (or wasn't a reasoning model)
           // This prevents stale context from being used if the model type changes mid-chat (unlikely but possible)
           currentReasoningContext = null;
       }

       return result;
   } catch (error) {
       console.error(`[ChatManager] Error during sendMessageStream for ${activeModelInstance.getImplementationType()}:`, error);
       throw error; // Re-throw to be handled by the caller (e.g., main.js IPC handler)
   }
}

// --- History Management ---

function appendUserMessage(message) {
  let userMessageContent = message;
  let prefixContent = "";

  // Check if this is the first user message of the current session
  const isFirstUserMessageInSession = conversationHistory.filter(m => m.role === 'user').length === 0;

  if (pendingTimeSinceLastChatInfo && isFirstUserMessageInSession) {
    prefixContent = pendingTimeSinceLastChatInfo; // This already includes "(System: ...)\n"
    pendingTimeSinceLastChatInfo = null; // Consume it
  }

  const now = new Date();
  // timeDiffSinceLastInternalMsg is for time since last message *in this current chat session*
  const timeDiffSinceLastInternalMsg = conversationHistory.lastMessageTime ? Math.round((now - conversationHistory.lastMessageTime) / 1000) : 0;
  conversationHistory.lastMessageTime = now; // Update for next message in this chat

  const metadata = `Date: ${now.toLocaleDateString()} | Time: ${now.toLocaleTimeString()} | Since last msg: ${timeDiffSinceLastInternalMsg}s\n`;
  // Construct fullMessage: system prefix (if any), then metadata, then the user's actual message
  const fullMessage = prefixContent + metadata + userMessageContent;

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
 * @param {string} toolName - The name of the tool/function that was called (schema_name).
 * @param {object} result - The result returned by the tool execution.
 */
function appendToolResponseMessage(toolCallId, toolName, result) { // toolName here is schema_name
    console.log(`[ChatManager] Appending tool response for ${toolName} (Call ID: ${toolCallId})`);

    // Standardized internal format
    const toolResponseEntry = {
        id: `tool_${toolName.replace(/_/g, '-')}_${Date.now()}`, // Unique internal ID, make it more filename friendly
        role: "tool", // This role is specific to how some models expect tool results (e.g., Gemini)
                      // For OpenAI, the role is 'tool' and content is stringified JSON of the result,
                      // and it needs a `tool_call_id`.
                      // The model interface's `transformToolResponsesForModel` should handle this.
        name: toolName, // The schema_name of the function that was called
        content: result, // The actual result object/value from action.execute()
        toolCallId: toolCallId // Store the original model's tool call ID
    };

    conversationHistory.push(toolResponseEntry);
    console.log(`[ChatManager] Appended tool response. History length: ${conversationHistory.length}`);
}


/**
 * Executes a tool call and appends the result to history.
 * This is a new helper function to be called from the main IPC handler.
 * @param {string} toolCallId - The ID of the tool call.
 * @param {string} toolName - The schema_name of the tool to execute.
 * @param {object} toolParams - The parameters for the tool.
 * @returns {Promise<object>} The result of the tool execution.
 */
async function executeToolAndAppendResponse(toolCallId, toolName, toolParams) {
    console.log(`[ChatManager] Attempting to execute tool: ${toolName} with ID: ${toolCallId}`);
    try {
        // Provide chatManager itself as part of the execution context
        const executionContext = {
            chatManager: {
                getCurrentChatId: getCurrentChatId // Expose specific methods needed by actions
                // Add other chatManager methods if actions require them
            }
            // Add other context parts if necessary
        };

        const result = await actionsManager.execute(toolName, toolParams, executionContext);
        appendToolResponseMessage(toolCallId, toolName, result); // result is {success: boolean, ...}
        return result; // Return the direct result from the action
    } catch (error) {
        console.error(`[ChatManager] Error executing tool ${toolName}:`, error);
        const errorResult = { success: false, error: error.message || "Tool execution failed" };
        appendToolResponseMessage(toolCallId, toolName, errorResult);
        return errorResult; // Return an error structure
    }
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
  const previousChatId = currentChatId;
  const previousHistory = [...conversationHistory]; // Copy of the history of the chat we are leaving

  // Store current session personality before clearing state
  const currentSessionPersonalityId = currentPersonalityConfig?.id;

  // Calculate time since last message of previous chat
  pendingTimeSinceLastChatInfo = null; // Reset before calculation
  if (previousChatId && previousHistory.length > 0) {
    const lastMessageOfPreviousChat = previousHistory[previousHistory.length - 1];
    // Ensure the ID format is as expected and contains a timestamp
    // Message IDs are like: msg_1678886400000_randomstring or tool_toolName_1678886400000
    let lastMessageTimestamp;

    if (lastMessageOfPreviousChat.id) {
        const idParts = lastMessageOfPreviousChat.id.split('_');
        if (lastMessageOfPreviousChat.id.startsWith('msg_') && idParts.length >= 2) {
            lastMessageTimestamp = parseInt(idParts[1], 10);
        } else if (lastMessageOfPreviousChat.id.startsWith('tool_') && idParts.length >= 3) {
            lastMessageTimestamp = parseInt(idParts[idParts.length -1], 10); // Timestamp is usually last for tool responses
        } else if (lastMessageOfPreviousChat.id.startsWith('model_') && idParts.length >=2) { // Assuming model responses might also have timestamps in ID like msg_
            lastMessageTimestamp = parseInt(idParts[1], 10);
        }
    }


    if (lastMessageTimestamp && !isNaN(lastMessageTimestamp)) {
        const currentTime = Date.now();
        const timeDifferenceMs = currentTime - lastMessageTimestamp;
        const TEN_MINUTES_MS = 10 * 60 * 1000;

        if (timeDifferenceMs > TEN_MINUTES_MS) {
            pendingTimeSinceLastChatInfo = formatTimeDifference(timeDifferenceMs);
            console.log(`[ChatManager] Storing time since last chat: ${pendingTimeSinceLastChatInfo.trim()}`);
        }
    } else {
        console.warn("[ChatManager] Could not parse timestamp from last message ID of previous chat:", lastMessageOfPreviousChat.id);
    }
  }

  const deletedChatId = await checkAndDeleteEmptyChat(previousChatId, previousHistory);

  // Reset state for the new chat
  conversationHistory = [];
  currentChatId = Date.now().toString(); // This is used for the chat *file name*, not individual messages
  activeModelInstance = null; // Clear the model instance
  currentPersonalityConfig = null;
  currentReasoningContext = null; // Reset reasoning context for new chat
  // conversationHistory.lastMessageTime is implicitly reset as conversationHistory is a new array

  try {
    // Preserve current session personality if available, otherwise use default
    let personalityIdToUse = currentSessionPersonalityId;
    
    if (!personalityIdToUse) {
      personalityIdToUse = settingsManager.getDefaults().personalityId;
      if (!personalityIdToUse) {
        console.error("[ChatManager] No session or default personality ID found.");
        const personalities = settingsManager.getPersonalities();
        if (personalities.length > 0) {
            personalityIdToUse = personalities[0].id;
        } else {
            throw new Error("No session, default, or available personalities found in configuration.");
        }
      }
    }
    
    console.log(`[ChatManager] Starting new chat with personality: ${personalityIdToUse} (preserved from session: ${!!currentSessionPersonalityId})`);
    await setActivePersonality(personalityIdToUse);
    
    console.log(`[ChatManager] Started new chat ${currentChatId} with personality ${currentPersonalityConfig?.id}`);
    return { newChatId: currentChatId, deletedChatId: deletedChatId };
  } catch (error) {
      console.error("[ChatManager] Failed to initialize personality for new chat:", error);
      return { newChatId: currentChatId, deletedChatId: deletedChatId, error: error.message };
  }
}

async function editMessage(messageId, newContent, options = {}) {
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
    if (!currentChatId || typeof currentChatId !== 'string') {
        console.error(`[ChatManager.editMessage] Invalid currentChatId ('${currentChatId}') before saving.`);
        // Return an error structure consistent with other failures
        return { error: `Cannot save edit, chat ID is invalid.` };
    }
    // Ensure activeModelInstance and currentPersonalityConfig are valid too, although less likely to be the root cause here
    await chatStorage.saveChat(
        currentChatId,
        conversationHistory,
        activeModelInstance?.getModelName() || 'unknown', // Use getModelName()
        currentPersonalityConfig?.id // Get personality ID
    );

    // 5. Trigger model response using the active instance and truncated history
    console.log(`[ChatManager.editMessage] Edit successful for ${messageId}. Triggering model response.`);
    try {
        // Call the refactored method, which uses the active instance, and pass options (including abort signal)
        const result = await sendMessageToModel(options);
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

async function triggerTitleGeneration(chatIdToGenerateFor = null) {
    const effectiveChatId = chatIdToGenerateFor || currentChatId;

    if (!effectiveChatId || typeof effectiveChatId !== 'string') {
        console.warn(`[ChatManager] Title generation skipped: Invalid effectiveChatId ('${effectiveChatId}').`);
        return null;
    }

    // Initialize title generation client lazily
    const titleClient = initializeTitleGenClient();
    if (!titleClient) {
        console.warn("[ChatManager] Title generation skipped: OpenAI client for titles not initialized (missing API key?).");
        return null;
    }

    let chatToProcess; // Will hold { title, titleGenerated, modelId, personalityId } from loaded/current chat
    let historyForPrompt;
    let modelIdToSaveWith;
    let personalityIdToSaveWith;
    let fullHistoryToSave;

    if (chatIdToGenerateFor) {
        // Batch mode or specific chat ID provided
        const loadedChat = await chatStorage.loadChat(effectiveChatId); // chatStorage.loadChat returns full chat object
        if (!loadedChat || !loadedChat.history) {
            console.warn(`[ChatManager] Title generation for ${effectiveChatId} skipped: Could not load chat data or history.`);
            return null;
        }
        chatToProcess = loadedChat; // Contains .title, .titleGenerated, .modelId, .personalityId, .history
        historyForPrompt = loadedChat.history;
        
        // Handle missing modelId/personalityId with fallbacks for older chats
        const defaults = settingsManager.getDefaults();
        const availablePersonalities = settingsManager.getPersonalities();
        
        // Debug logging to see what we have
        console.log(`[ChatManager] Debug - Chat ${effectiveChatId} loaded data:`, {
            modelId: loadedChat.modelId,
            model: loadedChat.model,
            personalityId: loadedChat.personalityId,
            hasHistory: !!loadedChat.history
        });
        
        modelIdToSaveWith = loadedChat.modelId || loadedChat.model || defaults.modelId || defaults.defaultModel;
        personalityIdToSaveWith = loadedChat.personalityId || defaults.personalityId || (availablePersonalities.length > 0 ? availablePersonalities[0].id : 'reg-lifecoach');
        
        // Debug logging for fallbacks
        console.log(`[ChatManager] Debug - Fallback values:`, {
            modelIdToSaveWith,
            personalityIdToSaveWith,
            defaultsModelId: defaults.modelId,
            defaultsDefaultModel: defaults.defaultModel,
            defaultsPersonalityId: defaults.personalityId
        });
        
        fullHistoryToSave = loadedChat.history;
    } else {
        // Current chat mode
        if (!currentChatId || conversationHistory.length < 1) { // Allow title gen even with only one message for prompt
            console.log("[ChatManager] Title generation (current chat) skipped: History too short or no current chat.");
            return null;
        }
        const currentChatStoredData = await chatStorage.loadChat(effectiveChatId);
        if (!currentChatStoredData) {
            console.warn(`[ChatManager] Title generation (current chat) skipped: Could not load stored data for ${effectiveChatId}.`);
            return null;
        }
        chatToProcess = currentChatStoredData; // Contains .title, .titleGenerated from storage
        historyForPrompt = conversationHistory; // Use live history for prompt
        modelIdToSaveWith = activeModelInstance?.getModelName();
        personalityIdToSaveWith = currentPersonalityConfig?.id;
        fullHistoryToSave = conversationHistory; // Save the live full history
    }

    if (!modelIdToSaveWith || !personalityIdToSaveWith) {
        console.error(`[ChatManager] Title generation for ${effectiveChatId}: Cannot save title, missing modelId ('${modelIdToSaveWith}') or personalityId ('${personalityIdToSaveWith}'). This is critical for data integrity.`);
        return null;
    }
    
    const placeholderTitle = `Chat from ${new Date(parseInt(effectiveChatId)).toLocaleString()}`;
    // Ensure titleGenerated is explicitly checked
    const isTitleActuallyGenerated = typeof chatToProcess.titleGenerated === 'boolean' ? chatToProcess.titleGenerated : false;

    if (isTitleActuallyGenerated && chatToProcess.title !== placeholderTitle) {
        console.log(`[ChatManager] Title for chat ${effectiveChatId} ("${chatToProcess.title}") already generated and is not placeholder. Skipping.`);
        return chatToProcess.title;
    }
    if (isTitleActuallyGenerated && chatToProcess.title === placeholderTitle) {
        console.log(`[ChatManager] Title for chat ${effectiveChatId} is a placeholder ("${chatToProcess.title}"). Attempting regeneration.`);
    }
     if (historyForPrompt.length < 1) {
         console.warn(`[ChatManager] Title generation for ${effectiveChatId} skipped: History for prompt is empty.`);
         return null;
    }

    const firstUserMessage = historyForPrompt.find(m => m.role === 'user')?.parts[0]?.text || '';
    const firstModelResponse = historyForPrompt.find(m => m.role === 'model')?.parts[0]?.text || '';

    let promptContent = "";
    if (firstUserMessage) promptContent += `User: ${firstUserMessage.substring(0, 300)}\n`;
    if (firstModelResponse) promptContent += `Model: ${firstModelResponse.substring(0, 300)}\n`;

    if (!promptContent.trim()) {
        console.warn(`[ChatManager] Title generation for ${effectiveChatId} skipped: No content for prompt from user/model messages.`);
        return null;
    }

    const titlePrompt = `Based on the following conversation snippet, generate a very concise title (5 words maximum) for this chat session. Only return the title text, nothing else.\n\n${promptContent}\nTitle:`;
    const titleModelToUse = "gpt-4.1-nano";

    try {
        console.log(`[ChatManager] Requesting title generation for ${effectiveChatId} using model ${titleModelToUse}`);
        const response = await titleClient.chat.completions.create({
            model: titleModelToUse,
            messages: [{ role: "user", content: titlePrompt }],
            temperature: 0.5,
            max_tokens: 20,
        });
        let generatedTitle = response.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
        generatedTitle = generatedTitle.replace(/\.$/, "").trim(); // Remove trailing period and re-trim

        if (generatedTitle && generatedTitle.length > 0 && generatedTitle.toLowerCase() !== "error" && generatedTitle.toLowerCase() !== "null") {
            console.log(`[ChatManager] Generated title for chat ${effectiveChatId}: "${generatedTitle}"`);
            
            await chatStorage.updateChatTitle(
                effectiveChatId,
                generatedTitle,
                fullHistoryToSave,
                modelIdToSaveWith,
                personalityIdToSaveWith
            );
            // chatStorage.updateChatTitle handles setting titleGenerated: true and emitting event
            return generatedTitle;
        } else {
            console.warn(`[ChatManager] Title generation for ${effectiveChatId} resulted in an empty or invalid title: "${generatedTitle}". Original prompt content: ${promptContent.substring(0,100)}`);
            return null;
        }
    } catch (error) {
        console.error(`[ChatManager] Error during title generation for ${effectiveChatId}:`, error);
        return null;
    }
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
    conversationHistory = loaded.history || []; // Ensure history is an array
    currentChatId = chatId;
    activeModelInstance = null; // Clear previous instance
    currentPersonalityConfig = null;
    currentReasoningContext = null; // Reset reasoning context on load

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

async function batchCheckAndGenerateTitles() {
    console.log("[ChatManager] Starting batch check for title generation.");
    try {
        const allChatsMeta = await chatStorage.listChats(); // Expects { id, title, lastUpdated, titleGenerated, modelId, personalityId }
        if (!allChatsMeta || allChatsMeta.length === 0) {
            console.log("[ChatManager] batchCheck: No chats found to process.");
            return;
        }

        const chatsNeedingTitle = [];
        for (const chatMeta of allChatsMeta) {
            const placeholderTitle = `Chat from ${new Date(parseInt(chatMeta.id)).toLocaleString()}`;
            const isTitleEffectivelyGenerated = typeof chatMeta.titleGenerated === 'boolean' ? chatMeta.titleGenerated : false;

            if (!chatMeta.title || !isTitleEffectivelyGenerated || chatMeta.title === placeholderTitle) {
                // For older chats missing modelId or personalityId, we'll provide fallbacks during title generation
                // instead of skipping them entirely
                chatsNeedingTitle.push(chatMeta);
            }
        }

        if (chatsNeedingTitle.length === 0) {
            console.log("[ChatManager] batchCheck: No chats require title generation/update after filtering.");
            return;
        }

        // listChats should already sort by lastUpdated descending.
        console.log(`[ChatManager] batchCheck: Found ${chatsNeedingTitle.length} chats potentially needing title. Processing up to ${MAX_CHATS_TO_BATCH_PROCESS}.`);

        let processedCount = 0;
        for (const chatMeta of chatsNeedingTitle.slice(0, MAX_CHATS_TO_BATCH_PROCESS)) { // Process only a slice
            console.log(`[ChatManager] batchCheck: Attempting title generation for chat ${chatMeta.id} (Last updated: ${new Date(chatMeta.lastUpdated).toLocaleString()}). Current title: "${chatMeta.title}", Generated flag: ${chatMeta.titleGenerated}`);
            try {
                const newTitle = await triggerTitleGeneration(chatMeta.id); // This will load the full chat data
                if (newTitle) {
                    console.log(`[ChatManager] batchCheck: Successfully generated/updated title for chat ${chatMeta.id} to "${newTitle}".`);
                }
            } catch (error) {
                console.error(`[ChatManager] batchCheck: Error processing chat ${chatMeta.id} for title generation:`, error);
            }
            processedCount++;
        }
        console.log(`[ChatManager] batchCheck: Finished. Processed ${processedCount} chats.`);
    } catch (error) {
        console.error("[ChatManager] batchCheck: Critical error during batch title processing:", error);
    }
}

/**
 * Sets the default personality for new chats and saves it to settings.
 * @param {string} personalityId - The ID of the personality to set as default.
 * @throws {Error} If personality config is not found or settings save fails.
 */
async function setDefaultPersonality(personalityId) {
  console.log(`[ChatManager] Setting default personality to: ${personalityId}`);
  
  // Validate that the personality exists
  const personality = settingsManager.getPersonalityById(personalityId);
  if (!personality) {
    throw new Error(`[ChatManager] Personality configuration not found for ID: ${personalityId}`);
  }
  
  try {
    // Save to settings manager
    await settingsManager.saveGlobalSetting('personalityId', personalityId);
    console.log(`[ChatManager] Default personality saved to settings: ${personalityId}`);
    
    // Also update the current personality for immediate effect
    await setActivePersonality(personalityId);
    
  } catch (error) {
    console.error(`[ChatManager] Failed to save default personality ${personalityId}:`, error);
    throw error;
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
  batchCheckAndGenerateTitles, // Export the new function
  checkAndDeleteEmptyChat, // Keep helper exported if needed by IPC layer
  setCurrentChatPersonality, // Export the new function
  executeToolAndAppendResponse, // Export the new helper
  setDefaultPersonality, // Export the new function
  setCurrentChatModel // Export the new function
  // REMOVED: toolDeclarations export
};
