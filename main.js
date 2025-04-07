// main.js - Main process entry point with unified chat manager, GPT and Gemini streaming with integrated tool calling

require('./dataInitializer');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const chatManager = require('./src/models/chatManager');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, 'src/renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
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
    const stream = await chatManager.sendMessage(message);
    let responseBuffer = "";
    let currentFunctionCall = null; // For accumulating GPT function call deltas
    let toolPlaceholderInserted = false;

    for await (const chunk of stream) {
      if (chatManager.currentModel().startsWith("gpt")) {
        // GPT streaming: chunks come in choices[].delta
        if (chunk.choices && chunk.choices[0].delta) {
          const delta = chunk.choices[0].delta;
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
      } else {
        // Gemini streaming
        // Check if the chunk has an explicit functionCall property…
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

    // Process any accumulated function call (applies to both GPT and Gemini)
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
    // Send final response and update conversation history.
    event.sender.send('streamFinalResponse', { text: responseBuffer });
    chatManager.appendModelResponse(responseBuffer);
  } catch (error) {
    event.sender.send('streamFinalResponse', { text: "Error: " + error.message });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
