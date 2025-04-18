// main.js - Main process entry point with unified chat manager, GPT and Gemini streaming with integrated tool calling

require('./dataInitializer');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const chatManager = require('./src/models/chatManager');
const { setupIpcHandlers } = require('./src/main/ipc'); // Import the setup function
const { countTokens, cleanupEncoders } = require('./src/util/tiktokenCounter'); // Import tiktoken counter
const dailyTokenTracker = require('./src/services/dailyTokenTracker'); // Import the token tracker
const dotenv = require('dotenv');

// Determine the correct path to the .env file
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env') // Path when packaged
  : path.join(__dirname, '.env');             // Path in development

// Load the .env file
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error("Error loading .env file:", result.error);
  // Optionally, handle the error more gracefully, e.g., show a dialog
  // For now, we'll just log it. The OpenAI client will throw its own error later if the key is missing.
} else {
  console.log(".env file loaded successfully from:", envPath);
  // console.log("Loaded environment variables:", result.parsed); // Optional: Log loaded vars for debugging
}

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

app.whenReady().then(() => {
  createWindow();
  global.mainWindow = mainWindow; // Assign the module-level variable to global for other modules
  setupIpcHandlers(mainWindow); // Pass mainWindow to the setup function
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Initialize with default model
chatManager.initialize("gpt-4o-mini");

ipcMain.on('chatMessage', async (event, data) => {
  const { message, model } = data;
  if (model && model !== chatManager.currentModel()) {
    chatManager.initialize(model);
  }
  try {
    // --- Prepare for Token Counting (Approximate GPT Input) ---
    const currentHistory = chatManager.getConversationHistory(); // Get history *before* adding new user message
    const historyTextForInputCount = JSON.stringify(currentHistory); // Simple string representation for counting
    // --- End Preparation ---

    // sendMessage returns stream for GPT, { stream, response } for Gemini
    const chatResult = await chatManager.sendMessage(message);
    let responseBuffer = "";
    let currentFunctionCall = null; // For accumulating GPT function call deltas
    let toolPlaceholderInserted = false;
    let lastGptChunk = null; // To store the last chunk for GPT usage data
    let geminiResponsePromise = null; // To store the Gemini response promise
    let streamIterator = null; // To store the stream iterator

    if (chatManager.currentModel().startsWith("gpt")) {
      streamIterator = chatResult; // GPT returns the stream directly
      for await (const chunk of streamIterator) {
        // GPT streaming: chunks come in choices[].delta
        if (chunk.choices && chunk.choices[0].delta) {
          const delta = chunk.choices[0].delta; // Corrected: Access delta correctly
          if (delta.function_call) {
            if (!currentFunctionCall) {
              currentFunctionCall = {
                name: delta.function_call.name || "",
                arguments: ""
              };
              console.log("GPT function call detected:", currentFunctionCall);
            }
            if (delta.function_call.arguments) {
              currentFunctionCall.arguments += delta.function_call.arguments;
              console.log("GPT function call delta:", delta.function_call.arguments);
            }
            if (!toolPlaceholderInserted) {
              responseBuffer += "[TOOL_RESULT]";
              toolPlaceholderInserted = true;
            }
            continue; // Skip processing text when accumulating function call deltas.
          }
          if (delta.content) {
            responseBuffer += delta.content;
            event.sender.send('streamPartialResponse', { text: delta.content });
          }
        }
        lastGptChunk = chunk; // Store the last chunk
      }
    } else {
      streamIterator = chatResult.stream; // Gemini returns { stream, response }
      geminiResponsePromise = chatResult.response; // Store the promise
      for await (const chunk of streamIterator) {
        // Gemini streaming
        if (chunk.functionCall) {
          console.log("Gemini function call detected:", chunk.functionCall);
          currentFunctionCall = chunk.functionCall;
          continue;
        }
        // ...or if the chunk has nonTextParts containing a function call.
        if (chunk.nonTextParts && chunk.nonTextParts.functionCall) {
          console.log("Gemini nonTextParts function call detected:", chunk.nonTextParts.functionCall);
          currentFunctionCall = chunk.nonTextParts.functionCall;
          continue;
        }
        if (chunk.text) {
          responseBuffer += chunk.text;
          event.sender.send('streamPartialResponse', { text: chunk.text });
        }
      }
    }

    if (currentFunctionCall) {
      try {
        const actionsManager = require('./src/actions/ActionsManager');
        // Convert snake_case to camelCase (e.g., "make_note" -> "makeNote")
        const toolName = currentFunctionCall.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        let parsedArgs;
        if (chatManager.currentModel().startsWith("gpt")) {
          parsedArgs = JSON.parse(currentFunctionCall.arguments);
        } else {
          parsedArgs = currentFunctionCall.args;
        }
        const result = await actionsManager.execute(toolName, parsedArgs);
        console.log("Tool executed:", result);
        // Replace the placeholder with the tool result if present
        responseBuffer = responseBuffer.replace("[TOOL_RESULT]", JSON.stringify(result));
      } catch (err) {
        console.error("Error executing tool:", err);
        responseBuffer = responseBuffer.replace("[TOOL_RESULT]", "[Error executing tool]");
      }
      currentFunctionCall = null;
    }

    // Send final response text
    event.sender.send('streamFinalResponse', { text: responseBuffer });

    // --- Token Counting Logic ---
    let inputTokens = 0;
    let outputTokens = 0;

    if (chatManager.currentModel().startsWith("gpt")) {
      // Use tiktoken for GPT
      try {
        // Approximate input: count original message + stringified history before message
        inputTokens = countTokens(model, message) + countTokens(model, historyTextForInputCount);
        // Count output from the final response buffer
        outputTokens = countTokens(model, responseBuffer);
        console.log(`GPT Token Usage (tiktoken) - Input (approx): ${inputTokens}, Output: ${outputTokens}`);
      } catch (error) {
        console.error("Error counting tokens with tiktoken:", error);
      }
    } else if (geminiResponsePromise) {
      const aggregatedResponse = await geminiResponsePromise;
      if (aggregatedResponse && aggregatedResponse.usageMetadata) {
        inputTokens = aggregatedResponse.usageMetadata.promptTokenCount || 0;
        outputTokens = aggregatedResponse.usageMetadata.candidatesTokenCount || 0; // Sum across candidates if needed
        console.log(`Gemini Token Usage - Input: ${inputTokens}, Output: ${outputTokens}`);
      } else {
        console.warn("Could not find token usage data in the Gemini aggregated response.");
      }
    }

    // Update daily token count
    if (inputTokens > 0 || outputTokens > 0) {
      await dailyTokenTracker.updateTodaysUsage(inputTokens, outputTokens);
      console.log(`Updated daily token usage: Input=${inputTokens}, Output=${outputTokens}`);
    }
    // --- End Token Counting Logic ---

    // Append model response to history AFTER potentially getting tokens
    const shouldGenerateTitle = await chatManager.appendModelResponse(responseBuffer); // Check return value

    // Trigger title generation if needed
    if (shouldGenerateTitle) {
      const generatedTitle = await chatManager.triggerTitleGeneration();
      if (generatedTitle) {
        // Notify renderer about the updated title
        event.sender.send('chat-title-updated', { chatId: chatManager.getCurrentChatId(), newTitle: generatedTitle });
      }
    }
  } catch (error) {
    event.sender.send('streamFinalResponse', { text: "Error: " + error.message });
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
