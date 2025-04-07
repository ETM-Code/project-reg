// app.js - Frontend logic handling multi-line input, sending messages, and rendering separate bubbles for each turn with Markdown

document.addEventListener('DOMContentLoaded', () => {
  const chatWindow = document.getElementById('chatWindow');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');

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
    // Create a new bubble for the user's message
    appendMessage('user', message);
    // Send the message to the main process
    window.electronAPI.sendMessage('chatMessage', { message });
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
      ? 'bg-blue-100 self-end text-right'
      : 'bg-gray-200 self-start text-left';
    bubble.className = `w-fit max-w-3xl px-4 py-2 rounded-md whitespace-pre-wrap ${bubbleClasses}`;
    bubble.innerHTML = marked.parse(text);
    container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2`;
    container.appendChild(bubble);
    return { container, bubble, rawText: text };
  }

  // For streaming, we'll maintain a temporary "typing" bubble for the AI response.
  let typingBubble = null;

  // Listen for partial responses to update the typing bubble in real time.
  window.electronAPI.onMessage('streamPartialResponse', (data) => {
    if (!typingBubble) {
      // Create a new bubble for the AI message if none exists
      typingBubble = createBubble('bot', '');
      chatWindow.appendChild(typingBubble.container);
    }
    // Append the partial text (maintaining a raw text buffer)
    typingBubble.rawText += data.text;
    typingBubble.bubble.innerHTML = marked.parse(typingBubble.rawText);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  });

  // When the final response is received, finalize the bubble.
  window.electronAPI.onMessage('streamFinalResponse', (data) => {
    if (!typingBubble) {
      // If no typing bubble exists, simply create a new bubble
      appendMessage('bot', data.text);
    } else {
      // Replace the content of the typing bubble with the complete text
      typingBubble.rawText = data.text;
      typingBubble.bubble.innerHTML = marked.parse(data.text);
      // Optionally remove any "typing" indicator styling here
      typingBubble = null;
    }
  });
});
