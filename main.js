// Load environment variables from .env file
require('dotenv').config();
// main.js - Main process entry point with unified chat manager, GPT and Gemini streaming with integrated tool calling

require('./dataInitializer');
const { app, BrowserWindow, ipcMain, Notification } = require('electron'); // Added Notification
const path = require('path');
const pathManager = require('./src/util/pathManager'); // Initialize path manager first
const chatManager = require('./src/models/chatManager');
const { setupIpcHandlers } = require('./src/main/ipc'); // Import the setup function
// actionsManager is used by chatManager, no need to import here directly unless for other purposes.
const { countTokens, cleanupEncoders } = require('./src/util/tiktokenCounter'); // Import tiktoken counter
const dailyTokenTracker = require('./src/services/dailyTokenTracker'); // Import the token tracker
const chatStorage = require('./src/services/chatStorage'); // Import chatStorage
const settingsManager = require('./src/config/settingsManager'); // Import SettingsManager

// Import shared stream state
const { streamState } = require('./src/main/streamState');

// Declare mainWindow at the module level
let mainWindow;

function createWindow() {
  // Assign the newly created window instance to the module-level variable
  mainWindow = new BrowserWindow({
    width: 1200, // Added width back
    height: 800,
    frame: false, // Added to remove the top bar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  // Send initial maximized state
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) { // Ensure mainWindow still exists
      mainWindow.webContents.send('window-maximized-status', mainWindow.isMaximized());
    }
  });

  // Listen for maximize and unmaximize events to update renderer
  mainWindow.on('maximize', () => {
    if (mainWindow) { // Ensure mainWindow still exists
      mainWindow.webContents.send('window-maximized-status', true);
    }
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow) { // Ensure mainWindow still exists
      mainWindow.webContents.send('window-maximized-status', false);
    }
  });
}

app.whenReady().then(async () => { // Make async
  try {
    await settingsManager.initializeSettings(); // Initialize settings first
    console.log("Settings initialized successfully.");

    createWindow();
    global.mainWindow = mainWindow; // Assign the module-level variable to global for other modules
    setupIpcHandlers(mainWindow); // Pass mainWindow to the setup function

    // Initialize chatManager with the default personality
    const defaultPersonalityId = settingsManager.getDefaults().personalityId;
    if (defaultPersonalityId) {
        await chatManager.setActivePersonality(defaultPersonalityId);
        console.log(`[Main] ChatManager initialized with default personality: ${defaultPersonalityId}`);
    } else {
        // Handle case where no default personality is set - maybe load the first available?
        const personalities = settingsManager.getPersonalities();
        if (personalities.length > 0) {
            await chatManager.setActivePersonality(personalities[0].id);
            console.warn(`[Main] No default personality set. Initialized with first available: ${personalities[0].id}`);
        } else {
             throw new Error("No default or available personalities found in configuration. Cannot initialize ChatManager.");
        }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Listen for title updates from chatStorage (e.g., after batch generation)
    if (chatStorage && chatStorage.emitter) {
      chatStorage.emitter.on('title-updated', ({ chatId, newTitle, lastUpdated, modelId, personalityId }) => {
        if (mainWindow) {
          console.log(`[Main] Forwarding title-updated event from chatStorage to renderer for chat ${chatId}: "${newTitle}"`);
          // The renderer's onTitleUpdate expects (chatId, newTitle)
          // We can also send lastUpdated if the renderer wants to refresh that too.
          mainWindow.webContents.send('title-updated', { chatId, newTitle, lastUpdated });
        }
      });
    } else {
        console.error("[Main] chatStorage or chatStorage.emitter not available to set up 'title-updated' listener.");
    }

    // Call batch title generation on startup
    // Ensure chatManager is fully initialized before calling this
    if (chatManager.batchCheckAndGenerateTitles) {
        console.log("[Main] Triggering batchCheckAndGenerateTitles on startup.");
        // No need to await this, let it run in the background
        chatManager.batchCheckAndGenerateTitles().catch(err => {
            console.error("[Main] Error during initial batchCheckAndGenerateTitles:", err);
        });
    }


  } catch (error) {
    console.error("Fatal Error during application startup:", error);
    // Optionally show an error dialog to the user
    // dialog.showErrorBox('Startup Error', `Failed to initialize application settings: ${error.message}`);
    app.quit(); // Quit if settings fail to load
  }
});

// REMOVED: chatManager.initialize("gpt-4o-mini"); - Will be initialized based on settings later

ipcMain.on('chatMessage', async (event, data) => {
  const { message, model } = data; // Now we'll use both message and model
  
  // Create abort controller for this request
  streamState.currentAbortController = new AbortController();
  const abortSignal = streamState.currentAbortController.signal;

  // --- ENSURE WE HAVE AN ACTIVE CHAT ---
  let currentChatId = chatManager.getCurrentChatId();
  console.log(`[main] chatMessage received. Current chat ID: ${currentChatId} (type: ${typeof currentChatId}). Model: ${model}`);
  
  // If a specific model is requested and it's different from the current active model, switch temporarily
  if (model) {
    try {
      const currentModel = chatManager.getActiveModelInstance();
      const currentModelName = currentModel ? currentModel.getModelName() : null;
      
      if (currentModelName !== model) {
        console.log(`[main] Switching from model ${currentModelName} to ${model} for this chat session`);
        await chatManager.setCurrentChatModel(model);
        
        // Notify renderer of the model change
        const updatedPersonality = chatManager.getCurrentPersonalityConfig();
        const updatedModel = chatManager.getActiveModelInstance();
        
        if (mainWindow && updatedPersonality && updatedModel) {
          mainWindow.webContents.send('chat-personality-updated', {
            personalityId: updatedPersonality.originalPersonalityId || updatedPersonality.id,
            personalityName: updatedPersonality.name,
            modelId: updatedModel.getModelName()
          });
          console.log(`[main] Notified renderer of model change to: ${updatedModel.getModelName()}`);
        }
      }
    } catch (error) {
      console.error(`[main] Failed to switch to model ${model}:`, error);
      event.sender.send('streamError', { message: `Failed to switch to model ${model}: ${error.message}` });
      return;
    }
  }
  
  if (!currentChatId || typeof currentChatId !== 'string') {
    console.log(`[main] No active chat found. Starting new chat before processing message.`);
    try {
      const { newChatId, deletedChatId, error } = await chatManager.startNewChat();
      if (error) {
        console.error(`[main] Failed to start new chat: ${error}`);
        event.sender.send('streamError', { message: `Failed to start new chat: ${error}` });
        return;
      }
      currentChatId = newChatId;
      console.log(`[main] Successfully started new chat: ${currentChatId}`);
      
      // Get the personality and model that was set for the new chat
      const newChatPersonality = chatManager.getCurrentPersonalityConfig();
      const newChatModel = chatManager.getActiveModelInstance();
      
      // Notify renderer of the personality and model being used
      if (mainWindow && newChatPersonality && newChatModel) {
        mainWindow.webContents.send('chat-personality-updated', { 
          personalityId: newChatPersonality.id,
          personalityName: newChatPersonality.name,
          modelId: newChatModel.getModelName()
        });
        console.log(`[main] Notified renderer of new chat personality: ${newChatPersonality.name}`);
      }
      
      // Notify renderer of deleted chat if any
      if (deletedChatId && mainWindow) {
        console.log(`[main] Notifying renderer of deleted chat: ${deletedChatId}`);
        mainWindow.webContents.send('chat-deleted', deletedChatId);
      }
    } catch (error) {
      console.error(`[main] Exception starting new chat: ${error}`);
      event.sender.send('streamError', { message: `Failed to start new chat: ${error.message}` });
      return;
    }
  }

  // --- Add User Message to History ---
  chatManager.appendUserMessage(message); // Add user message first

  // --- IMMEDIATE SAVE: Check if this is the first user message and save immediately ---
  try {
    const currentChatIdAfterAppend = chatManager.getCurrentChatId();
    const currentHistory = chatManager.getConversationHistory();
    const currentPersonality = chatManager.getCurrentPersonalityConfig();
    const currentModel = chatManager.getActiveModelInstance();
    
    console.log(`[main] After append - Chat ID: ${currentChatIdAfterAppend} (type: ${typeof currentChatIdAfterAppend}), History length: ${currentHistory.length}`);
    
    // Check if this is the first user message (indicating a new chat that needs immediate saving)
    const userMessages = currentHistory.filter(m => m.role === 'user').length;
    const isFirstUserMessage = userMessages === 1;
    
    if (isFirstUserMessage && currentChatIdAfterAppend && typeof currentChatIdAfterAppend === 'string' && currentModel && currentPersonality) {
      console.log(`[main] First user message detected. Saving chat ${currentChatIdAfterAppend} immediately.`);
      
      // Save the chat with just the user message
      await chatStorage.saveChat(
        currentChatIdAfterAppend,
        currentHistory,
        currentModel.getModelName(),
        currentPersonality.id
      );
      
      // Notify the renderer immediately so the chat appears in the sidebar
      if (mainWindow) {
        console.log(`[main] Notifying renderer of newly created chat: ${currentChatIdAfterAppend}`);
        mainWindow.webContents.send('new-chat-saved', { 
          id: currentChatIdAfterAppend, 
          title: chatStorage.generateDefaultTitle(currentHistory), 
          lastUpdated: Date.now(),
          personalityId: currentPersonality?.id // Make optional with optional chaining
        });
      }
      
      console.log(`[main] Chat ${currentChatIdAfterAppend} saved immediately after first user message.`);
    } else {
      console.log(`[main] Immediate save conditions not met. isFirst: ${isFirstUserMessage}, chatId: ${currentChatIdAfterAppend}, model: ${!!currentModel}, personality: ${!!currentPersonality}`);
    }
  } catch (error) {
    console.error("[main] Error during immediate save after first user message:", error);
    // Continue with the AI interaction even if immediate save fails
  }

  try {
    let shouldGenerateTitle = false;
    let finalModelResponseText = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // --- Recursive function to handle model calls and tool execution ---
    async function handleModelInteraction() {
      // Check if request was aborted before starting
      if (abortSignal.aborted) {
        console.log('[Main] Request aborted before model interaction');
        return;
      }

      const activeModel = chatManager.getActiveModelInstance();
      if (!activeModel) {
          throw new Error("No active model instance available.");
      }
      const modelType = activeModel.getImplementationType(); // 'gpt' or 'gemini'
      const modelName = activeModel.getModelName();

      // Get history *before* this call for token counting
      const historyBeforeCall = chatManager.getConversationHistory();

      // Call the active model instance with abort signal
      const modelResult = await chatManager.sendMessageToModel({ abortSignal });

      let responseBuffer = "";
      let detectedToolCalls = []; // Standardized: { id, name, arguments }
      let rawToolDataForHistory = null; // Store raw data for appendModelResponse if needed
      let responsePromise = modelResult.response; // For Gemini token counting

      // Process the stream with abort signal checking
      try {
        for await (const chunk of modelResult.stream) {
          // Check if request was aborted during streaming
          if (abortSignal.aborted) {
            console.log('[Main] Stream aborted during processing');
            break;
          }

          if (modelType === 'gpt') {
            if (chunk.choices && chunk.choices[0].delta) {
              const delta = chunk.choices[0].delta;
              if (delta.content) {
                responseBuffer += delta.content;
                event.sender.send('streamPartialResponse', { text: delta.content });
              }
              // Accumulate GPT tool calls
              if (delta.tool_calls) {
                rawToolDataForHistory = rawToolDataForHistory || []; // Initialize if first tool chunk
                for (const toolCallDelta of delta.tool_calls) {
                  if (toolCallDelta.index != null) {
                    const index = toolCallDelta.index;
                    if (!rawToolDataForHistory[index]) {
                      rawToolDataForHistory[index] = { id: null, type: 'function', function: { name: '', arguments: '' } };
                    }
                    if (toolCallDelta.id) rawToolDataForHistory[index].id = toolCallDelta.id;
                    if (toolCallDelta.function?.name) rawToolDataForHistory[index].function.name += toolCallDelta.function.name;
                    if (toolCallDelta.function?.arguments) rawToolDataForHistory[index].function.arguments += toolCallDelta.function.arguments;
                  }
                }
              }
            }
            // Handle potential usage data in GPT stream (less common for streaming)
            if (chunk.usage) console.log("GPT Usage Data (Stream Chunk):", chunk.usage);

          } else if (modelType === 'gemini') {
            // Check for function calls first (simpler structure)
            if (chunk.functionCall) {
              console.log("Gemini function call detected (direct):", chunk.functionCall);
              // Standardize format
              detectedToolCalls.push({
                  id: `gemini_call_${Date.now()}_${detectedToolCalls.length}`, // Generate an ID
                  name: chunk.functionCall.name,
                  arguments: chunk.functionCall.args // Gemini provides args as object
              });
              continue; // Skip text processing
            }
            // Check within candidates/parts (more complex structure)
            if (chunk.candidates && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
              for (const part of chunk.candidates[0].content.parts) {
                if (part.text) {
                  responseBuffer += part.text;
                  event.sender.send('streamPartialResponse', { text: part.text });
                }
                if (part.functionCall) {
                  console.log("Gemini function call detected (in parts):", part.functionCall);
                  detectedToolCalls.push({
                      id: `gemini_call_${Date.now()}_${detectedToolCalls.length}`,
                      name: part.functionCall.name,
                      arguments: part.functionCall.args
                  });
                }
              }
            } else if (chunk.text) { // Handle simpler text chunks
              responseBuffer += chunk.text;
              event.sender.send('streamPartialResponse', { text: chunk.text });
            }
          }
        } // End stream processing loop
      } catch (error) {
        if (error.name === 'AbortError' || abortSignal.aborted) {
          console.log('[Main] Stream processing aborted');
          return; // Exit gracefully on abort
        }
        throw error; // Re-throw other errors
      }

      // Check if aborted after stream processing
      if (abortSignal.aborted) {
        console.log('[Main] Request aborted after stream processing');
        return;
      }

      // Finalize detected tool calls for GPT
      if (modelType === 'gpt' && rawToolDataForHistory) {
          detectedToolCalls = rawToolDataForHistory
              .filter(tc => tc && tc.id && tc.function.name) // Ensure complete
              .map(tc => ({
                  id: tc.id,
                  name: tc.function.name,
                  arguments: tc.function.arguments // Arguments are still string here
              }));
          console.log("GPT Detected Tool Calls (Finalized):", JSON.stringify(detectedToolCalls));
      } else if (modelType === 'gemini') {
          console.log("Gemini Detected Tool Calls (Finalized):", JSON.stringify(detectedToolCalls));
      }


      // --- Append Model Response to History ---
      const isFirstModelResponse = chatManager.appendModelResponse(responseBuffer, rawToolDataForHistory);
      if (isFirstModelResponse) {
          shouldGenerateTitle = true;
      }
      finalModelResponseText = responseBuffer;

      // --- Token Counting ---
      let currentInputTokens = 0;
      let currentOutputTokens = 0;

      if (modelType === "gpt") {
          try {
              const historyText = JSON.stringify(historyBeforeCall); // Use history *before* the call
              currentInputTokens = countTokens(modelName, historyText); // Approx input
              currentOutputTokens = countTokens(modelName, responseBuffer); // Output
              console.log(`GPT Token Usage (tiktoken) - Input (approx): ${currentInputTokens}, Output: ${currentOutputTokens}`);
          } catch (error) { console.error("Error counting GPT tokens:", error); }
      } else if (modelType === "gemini" && responsePromise) {
          try {
              const aggregatedResponse = await responsePromise;
              if (aggregatedResponse && aggregatedResponse.usageMetadata) {
                  currentInputTokens = aggregatedResponse.usageMetadata.promptTokenCount || 0;
                  currentOutputTokens = aggregatedResponse.usageMetadata.candidatesTokenCount || 0;
                  console.log(`Gemini Token Usage - Input: ${currentInputTokens}, Output: ${currentOutputTokens}`);
              } else { console.warn("No Gemini token usage data found in aggregated response."); }
          } catch (error) { console.error("Error getting Gemini token usage from response promise:", error); }
      }
      totalInputTokens += currentInputTokens;
      totalOutputTokens += currentOutputTokens;

      // --- Handle Tool Calls ---
      if (detectedToolCalls.length > 0) {
        console.log(`[main] Processing ${detectedToolCalls.length} tool calls...`);
        for (const toolCall of detectedToolCalls) {
          let toolName = toolCall.name;
          let parsedArgs;
          let toolCallId = toolCall.id; // Use the ID from the standardized structure

          try {
            // Parse arguments if they are a string (likely from GPT)
            if (typeof toolCall.arguments === 'string') {
                parsedArgs = JSON.parse(toolCall.arguments);
            } else {
                parsedArgs = toolCall.arguments; // Assume object (from Gemini)
            }

            // toolName is already the schema_name (e.g., "create_notification")
            // chatManager.executeToolAndAppendResponse handles calling actionsManager.execute
            // and appending the response.
            console.log(`[main] Requesting execution for tool '${toolName}' (ID: ${toolCall.id}) with args:`, parsedArgs);

            const toolExecutionResult = await chatManager.executeToolAndAppendResponse(
                toolCall.id, // Pass the original tool call ID
                toolName,    // Pass the schema_name
                parsedArgs
            );

            console.log(`[main] Tool '${toolName}' execution processed by chatManager. Result:`, toolExecutionResult);

            // Send the result to the renderer so it can handle UI side effects (e.g., showing native notification)
            if (mainWindow) {
                mainWindow.webContents.send('tool-execution-result', {
                    toolName: toolName, // schema_name
                    result: toolExecutionResult, // { success: boolean, data?: any, error?: string, message?: string }
                    chatIdFromMain: chatManager.getCurrentChatId() // Send current chat ID for context
                });
            }

          } catch (err) {
            console.error(`[main] Error parsing arguments or initiating tool execution for '${toolName || 'unknown'}':`, err);
            const errorResult = { success: false, error: `Failed to process tool ${toolName}: ${err.message}` };
            if (toolCall && toolCall.id && toolName) {
                 chatManager.appendToolResponseMessage(toolCall.id, toolName, errorResult);
            }
            // Also send this error to renderer if it's a setup/parsing error before tool execution
            if (mainWindow) {
                mainWindow.webContents.send('tool-execution-result', {
                    toolName: toolName || 'unknown_tool',
                    result: errorResult,
                    chatIdFromMain: chatManager.getCurrentChatId()
                });
            }
          }
        }
        // Re-prompt the model
        await handleModelInteraction();
      }
      // --- No more tool calls needed ---
    } // --- End of handleModelInteraction ---

    // --- Start the interaction loop ---
    await handleModelInteraction();

    // --- Interaction finished ---
    console.log("[main] Model interaction complete.");
    event.sender.send('streamFinalResponse', { text: finalModelResponseText });

    // --- Final Token Update & History Save ---
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      await dailyTokenTracker.updateTodaysUsage(totalInputTokens, totalOutputTokens);
      console.log(`[main] Updated total daily token usage: Input=${totalInputTokens}, Output=${totalOutputTokens}`);
    }
    
    // --- Final Save (Updated with History) ---
    const finalChatId = chatManager.getCurrentChatId();
    const finalHistory = chatManager.getConversationHistory();
    const finalPersonality = chatManager.getCurrentPersonalityConfig();
    const finalModel = chatManager.getActiveModelInstance();
    
    console.log(`[main] Final save attempt - Chat ID: ${finalChatId} (type: ${typeof finalChatId}), History length: ${finalHistory?.length}, Model: ${!!finalModel}, Personality: ${!!finalPersonality}`);
    
    // Always attempt to save the updated history after AI interaction
    if (finalChatId && typeof finalChatId === 'string' && finalHistory && finalModel && finalPersonality) {
        await chatStorage.saveChat(
            finalChatId,
            finalHistory,
            finalModel.getModelName(),
            finalPersonality.id
        );
        console.log(`[main] Final conversation history saved for chat ${finalChatId} with personality ${finalPersonality.id}.`);

        // Note: We no longer send 'new-chat-saved' here since it was already sent immediately after first message
        // The chat should already be visible in the sidebar from the immediate save
    } else {
        // Log if required info is missing
        console.error("[main] Could not save final chat history - missing required information.");
        console.error(`[main] Debug info: chatId='${finalChatId}' (type: ${typeof finalChatId}), history=${!!finalHistory}, model=${!!finalModel}, personality=${!!finalPersonality}`);
    }

    // --- Attempt Title Generation (if not already done) ---
    const titleCheckChatId = chatManager.getCurrentChatId();
    if (titleCheckChatId && typeof titleCheckChatId === 'string') {
        try {
            const chatData = await chatStorage.loadChat(titleCheckChatId);
            // Check if chat exists and title hasn't been generated yet
            if (chatData && !chatData.titleGenerated) {
                console.log(`[main] Chat ${titleCheckChatId} needs title. Triggering generation...`);
                const generatedTitle = await chatManager.triggerTitleGeneration(); // Centralized logic
                if (generatedTitle) {
                    // Send update to renderer immediately
                    event.sender.send('chat-title-updated', { chatId: titleCheckChatId, newTitle: generatedTitle });
                    console.log(`[main] Title generated and renderer notified for chat ${titleCheckChatId}.`);
                } else {
                     console.log(`[main] Title generation attempt for ${titleCheckChatId} did not return a title.`);
                }
            } else if (!chatData) {
                 console.warn(`[main] Could not load chat data for ${titleCheckChatId} to check title generation status.`);
            } else {
                 // console.log(`[main] Title already generated for chat ${titleCheckChatId}. Skipping generation.`);
            }
        } catch (error) {
            console.error(`[main] Error during title generation check/trigger for chat ${titleCheckChatId}:`, error);
        }
    } else {
         console.warn(`[main] Cannot check/trigger title generation: Invalid chat ID: ${titleCheckChatId} (type: ${typeof titleCheckChatId})`);
    }

  } catch (error) {
    // Check if error is due to abort
    if (error.name === 'AbortError' || streamState.currentAbortController?.signal.aborted) {
      console.log("[main] Chat message processing aborted by user");
      // Send abort confirmation to renderer
      event.sender.send('streamStopped', { message: 'Stream stopped by user' });
      return; // Exit gracefully
    }
    
    console.error("[main] Error during chat message processing:", error);
    // Send error back to renderer
    event.sender.send('streamError', { message: error.message || "An unknown error occurred." });
    // Ensure stream is considered "finished" even on error
    event.sender.send('streamFinalResponse', { text: "" }); // Send empty final response on error
  } finally {
    // Clean up abort controller
    streamState.currentAbortController = null;
  }
});

// Add cleanup hook for tiktoken encoders on app quit
app.on('will-quit', () => {
  cleanupEncoders();
});

// Handler to get initial token usage for the day
ipcMain.handle('get-initial-token-usage', async () => {
  return await dailyTokenTracker.getInitialUsage();
});

// --- IPC for Native Notifications ---
ipcMain.on('show-native-notification', (event, data) => {
  const { title, body, chatId } = data;
  if (!mainWindow) {
    console.error("[Main] Cannot show notification, mainWindow is not available.");
    return;
  }
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.on('click', () => {
      console.log(`[Main] Native notification clicked for chat ID: ${chatId}`);
      mainWindow.webContents.send('native-notification-clicked', chatId);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    });
    notification.show();
  } else {
    console.warn("[Main] Native notifications not supported on this system.");
    // Optionally, send a fallback message to the renderer to display an in-app notification
    mainWindow.webContents.send('show-in-app-notification-fallback', { title, body, chatId });
  }
});

ipcMain.on('open-external-url', (event, url) => {
  console.log(`[Main] Opening external URL: ${url}`);
  require('electron').shell.openExternal(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
