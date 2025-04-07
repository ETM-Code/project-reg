// app.js - Frontend logic with a model selector for sending messages

document.addEventListener('DOMContentLoaded', () => {
  const chatWindow = document.getElementById('chatWindow');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const modelSelector = document.getElementById('modelSelector'); // New selector for models

  // Handle SHIFT+ENTER for newline and ENTER (without Shift) to send
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  sendBtn.addEventListener('click', sendMessage);

  function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    userInput.value = '';
    appendMessage('user', message);
    // Read the selected model from the dropdown
    const model = modelSelector.value;
    // Send the message along with the selected model
    window.electronAPI.sendMessage('chatMessage', { message, model });
  }

  // Create and append a message bubble to the chat window
  function appendMessage(sender, text) {
    const bubble = createBubble(sender, text);
    chatWindow.appendChild(bubble.container);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  // Factory function to create a message bubble element
  function createBubble(sender, text) {
    const bubble = document.createElement('div');
    const container = document.createElement('div');
    const bubbleClasses = sender === 'user'
      ? 'bg-blue-100 self-end text-left'
      : 'bg-gray-200 self-start text-left';
    bubble.className = `w-fit max-w-3xl px-4 py-2 rounded-md whitespace-pre-wrap ${bubbleClasses}`;
    bubble.innerHTML = marked.parse(text);
    container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2`;
    container.appendChild(bubble);
    return { container, bubble, rawText: text };
  }

  // For streaming, maintain a temporary "typing" bubble for the AI response.
  let typingBubble = null;

  // Listen for partial responses to update the typing bubble in real time.
  window.electronAPI.onMessage('streamPartialResponse', (data) => {
    if (!typingBubble) {
      typingBubble = createBubble('bot', '');
      chatWindow.appendChild(typingBubble.container);
    }
    typingBubble.rawText += data.text;
    typingBubble.bubble.innerHTML = marked.parse(typingBubble.rawText);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  });

  // When the final response is received, finalize the bubble.
  window.electronAPI.onMessage('streamFinalResponse', (data) => {
    if (!typingBubble) {
      appendMessage('bot', data.text);
    } else {
      typingBubble.rawText = data.text;
      typingBubble.bubble.innerHTML = marked.parse(data.text);
      typingBubble = null;
    }
  });

  // Listen for tool function call responses and show them as a separate bubble.
  window.electronAPI.onMessage('functionCallResponse', (data) => {
    appendMessage('bot', "Tool executed: " + data.text);
  });
});
