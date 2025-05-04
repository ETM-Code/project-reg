// Load environment variables from .env file
require('dotenv').config();
// main.js - Main process entry point with unified chat manager, GPT and Gemini streaming with integrated tool calling

require('./dataInitializer');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const chatManager = require('./src/models/chatManager');
const { setupIpcHandlers } = require('./src/main/ipc'); // Import the setup function
const actionsManager = require('./src/actions/ActionsManager'); // Import ActionsManager
const { countTokens, cleanupEncoders } = require('./src/util/tiktokenCounter'); // Import tiktoken counter
const dailyTokenTracker = require('./src/services/dailyTokenTracker'); // Import the token tracker
const chatStorage = require('./src/services/chatStorage'); // Import chatStorage
const settingsManager = require('./src/config/settingsManager'); // Import SettingsManager

// Declare mainWindow at the module level
let mainWindow;

function createWindow() {
  // Assign the newly created window instance to the module-level variable
  mainWindow = new BrowserWindow({
    width: 1200, // Added width back
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));
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

  } catch (error) {
    console.error("Fatal Error during application startup:", error);
    // Optionally show an error dialog to the user
    // dialog.showErrorBox('Startup Error', `Failed to initialize application settings: ${error.message}`);
    app.quit(); // Quit if settings fail to load
  }
});

// REMOVED: chatManager.initialize("gpt-4o-mini"); - Will be initialized based on settings later

ipcMain.on('chatMessage', async (event, data) => {
  const { message } = data; // Removed 'model' - personality is managed internally
  // REMOVED: Logic to switch model based on 'model' parameter

  // --- Add User Message to History ---
  chatManager.appendUserMessage(message); // Add user message first

  try {
    let shouldGenerateTitle = false;
    let finalModelResponseText = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // --- Recursive function to handle model calls and tool execution ---
    async function handleModelInteraction() {
      const activeModel = chatManager.getActiveModelInstance();
      if (!activeModel) {
          throw new Error("No active model instance available.");
      }
      const modelType = activeModel.getImplementationType(); // 'gpt' or 'gemini'
      const modelName = activeModel.getModelName();

      // Get history *before* this call for token counting
      const historyBeforeCall = chatManager.getConversationHistory();

      // Call the active model instance
      const modelResult = await chatManager.sendMessageToModel();

      let responseBuffer = "";
      let detectedToolCalls = []; // Standardized: { id, name, arguments }
      let rawToolDataForHistory = null; // Store raw data for appendModelResponse if needed
      let responsePromise = modelResult.response; // For Gemini token counting

      // Process the stream
      for await (const chunk of modelResult.stream) {
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

            // Convert snake_case tool name from model to camelCase for ActionsManager
            const actionName = toolName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            console.log(`[main] Executing action '${actionName}' for tool '${toolName}' with args:`, parsedArgs);
            const result = await actionsManager.execute(actionName, parsedArgs);
            console.log(`[main] Tool '${toolName}' executed. Result:`, result);
            // Append tool result to history using the standardized function
            chatManager.appendToolResponseMessage(toolCallId, toolName, result);

          } catch (err) {
            console.error(`[main] Error executing tool '${toolName || 'unknown'}':`, err);
            const errorResult = { error: `Failed to execute tool ${toolName}: ${err.message}` };
            // Append error message as tool result
            chatManager.appendToolResponseMessage(toolCallId, toolName, errorResult);
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
    // Save the complete history, including personality ID
    const currentChatId = chatManager.getCurrentChatId();
    const currentHistory = chatManager.getConversationHistory();
    const currentPersonality = chatManager.getCurrentPersonalityConfig();
    const currentModel = chatManager.getActiveModelInstance();
    if (currentChatId && currentHistory && currentModel && currentPersonality) {
        await chatStorage.saveChat(
            currentChatId,
            currentHistory,
            currentModel.getModelName(), // Save specific model name
            currentPersonality.id // Save personality ID
        );
        console.log(`[main] Final conversation history saved for chat ${currentChatId} with personality ${currentPersonality.id}.`);
    } else {
        console.error("[main] Could not save chat history - missing critical information (chatId, history, model, or personality).");
    }


    // --- Trigger Title Generation (if marked earlier) ---
    if (shouldGenerateTitle) {
      console.log("[main] Triggering title generation...");
      const generatedTitle = await chatManager.triggerTitleGeneration(); // Uses active model instance now
      if (generatedTitle) {
        event.sender.send('chat-title-updated', { chatId: chatManager.getCurrentChatId(), newTitle: generatedTitle });
      }
    }

  } catch (error) {
    console.error("[main] Error during chat message processing:", error);
    // Send error back to renderer
    event.sender.send('streamError', { message: error.message || "An unknown error occurred." });
    // Ensure stream is considered "finished" even on error
    event.sender.send('streamFinalResponse', { text: "" }); // Send empty final response on error
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
