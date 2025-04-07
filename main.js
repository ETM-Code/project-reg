// main.js - Main process entry point
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
      contextIsolation: true
    }
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
chatManager.initialize("gemini-2.0-flash");

ipcMain.on('chatMessage', async (event, data) => {
  const { message, model } = data;
  if (model && model !== chatManager.currentModel()) {
    chatManager.initialize(model);
  }
  try {
    const stream = await chatManager.sendMessage(message);
    let responseBuffer = "";
    for await (const chunk of stream) {
      if (chatManager.currentModel().startsWith("gpt")) {
        // For GPT, we check if the streamed delta includes a function call.
        if (chunk.choices && chunk.choices[0].delta) {
          const delta = chunk.choices[0].delta;
          if (delta.function_call) {
            console.log("GPT function call detected:", delta.function_call);
            const actionsManager = require('./src/actions/ActionsManager');
            try {
              const result = await actionsManager.execute(
                delta.function_call.name,
                JSON.parse(delta.function_call.arguments || "{}")
              );
              event.sender.send('functionCallResponse', { text: JSON.stringify(result) });
            } catch (err) {
              event.sender.send('functionCallResponse', { text: "Error executing tool: " + err.message });
            }
            continue;
          }
          if (delta.content) {
            responseBuffer += delta.content;
            event.sender.send('streamPartialResponse', { text: delta.content });
          }
        }
      } else {
        // For Gemini models
        if (chunk.functionCall) {
          console.log("Gemini function call detected:", chunk.functionCall);
          const actionsManager = require('./src/actions/ActionsManager');
          try {
            const result = await actionsManager.execute(chunk.functionCall.name, chunk.functionCall.args);
            event.sender.send('functionCallResponse', { text: JSON.stringify(result) });
          } catch (err) {
            event.sender.send('functionCallResponse', { text: "Error executing tool: " + err.message });
          }
          continue;
        }
        if (chunk.text) {
          responseBuffer += chunk.text;
          event.sender.send('streamPartialResponse', { text: chunk.text });
        }
      }
    }
    event.sender.send('streamFinalResponse', { text: responseBuffer });
    chatManager.appendModelResponse(responseBuffer);
  } catch (error) {
    event.sender.send('streamFinalResponse', { text: "Error: " + error.message });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
