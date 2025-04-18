// app.js - Frontend logic with a model selector for sending messages

document.addEventListener('DOMContentLoaded', async () => { // Make listener async
  const chatWindow = document.getElementById('chatWindow');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const modelSelector = document.getElementById('modelSelector'); // New selector for models
  const tokenCounterDisplay = document.getElementById('tokenCounterDisplay'); // Get token counter element

  // Initial chat loading/starting is now handled by chatHistory.js

  let messageIndexCounter = 0; // Counter for assigning indices to new user messages

  // State for editing
  let isEditing = false;
  let editingIndex = null;
  let editingOriginalText = null;

  // --- Token Counter Logic ---
  function updateTokenDisplay(usageData) {
    // Display total tokens
    if (tokenCounterDisplay && usageData && typeof usageData.total === 'number') {
      const total = usageData.total.toLocaleString();
      tokenCounterDisplay.textContent = `Today's Tokens: ${total}`;
    } else {
      tokenCounterDisplay.textContent = "Today's Tokens: N/A";
      console.warn("Received invalid token usage data or element not found:", usageData);
    }
  }

  // --- End Token Counter Logic ---

  // Expose a function to reset the counter when a chat is loaded
  window.resetAppMessageCounter = (historyLength) => {
    console.log(`Resetting message index counter based on loaded history length: ${historyLength}`);
    // Approximate user message count for next index. Still imperfect.
    // A better approach would be to track the actual last user message index.
    messageIndexCounter = Math.ceil(historyLength / 2);
  };

  // Handle SHIFT+ENTER for newline and ENTER (without Shift) to send
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isEditing) {
        saveEdit(); // Save edit on Enter when editing
      } else {
        sendMessage(); // Send new message otherwise
      }
    }
  });
  // sendBtn.addEventListener('click', sendMessage); // Replaced by handleSendOrSave
  sendBtn.addEventListener('click', handleSendOrSave); // Use combined handler

  // Combined handler for Send/Save Edit button
  function handleSendOrSave() {
    if (isEditing) {
      saveEdit();
    } else {
      sendMessage();
    }
  }

  function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    userInput.value = '';
    // Assign index before sending. NOTE: This index might not match history if loaded.
    // A robust solution needs mapping or getting index from backend.
    const currentIndex = messageIndexCounter;
    appendMessage('user', message, currentIndex);
    messageIndexCounter++; // Increment for the next user message

    // Read the selected model from the dropdown
    const model = modelSelector.value;
    // Send the message along with the selected model
    window.electronAPI.sendMessage('chatMessage', { message, model });
  }

  // Create and append a message bubble to the chat window
  function appendMessage(sender, text, index) { // Receive index
    const bubbleElements = createBubble(sender, text, index); // Get elements
    chatWindow.appendChild(bubbleElements.container);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    // Incrementing counter is handled in sendMessage now
  }

  // Factory function to create a message bubble element
  function createBubble(sender, text, index) { // Receive index
    const bubble = document.createElement('div');
    const container = document.createElement('div');
    container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2 relative group`; // Add relative/group
    container.dataset.messageIndex = index; // Store index

    const bubbleClasses = sender === 'user'
      ? 'bg-blue-100 text-left'
      : 'bg-gray-200 text-left';
    bubble.className = `w-fit max-w-3xl px-4 py-2 rounded-md whitespace-pre-wrap ${bubbleClasses}`;
    bubble.innerHTML = marked.parse(text); // Render markdown

    container.appendChild(bubble);

    // Add Edit button for user messages (only if index is valid)
    if (sender === 'user' && index !== undefined && index >= 0) {
      const editBtn = document.createElement('button');
      editBtn.textContent = '✏️';
      editBtn.className = 'absolute top-0 right-full mr-1 p-0.5 text-xs bg-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity'; // Position left
      editBtn.onclick = (e) => {
          e.stopPropagation(); // Prevent potential container clicks
          handleEditClick(index, text, container);
      };
      container.appendChild(editBtn);
    }

    return { container, bubble, rawText: text };
  }

  // Function to handle edit button clicks
  async function handleEditClick(messageIndex, currentText, messageContainerElement) {
    if (isEditing) {
        // If already editing, perhaps cancel the previous edit first
        cancelEdit();
    }

    isEditing = true;
    editingIndex = messageIndex;
    editingOriginalText = currentText; // Store original text if needed for comparison

    userInput.value = currentText; // Populate input area
    userInput.focus();
    sendBtn.textContent = "Save Edit"; // Change button text
    // sendBtn.onclick = handleSendOrSave; // Ensure button calls the correct handler (already set)

    // Optionally add a cancel button
    addCancelButton();

    console.log(`Editing mode activated for index: ${messageIndex}`);
  }

  // Function to save the edited message
  async function saveEdit() {
    const newContent = userInput.value.trim();

    // Maybe add check: if (newContent === editingOriginalText) { cancelEdit(); return; }

    try {
      // Get the currently active chat ID from the backend
      const chatId = await window.electronAPI.invoke('get-current-chat-id');
      if (!chatId) {
          alert("Error: Could not determine the current chat ID. Please select a chat first.");
          return;
      }

      console.log(`Requesting edit for chat ${chatId}, index ${editingIndex}`); // Use editingIndex here
      const result = await window.electronAPI.invoke('edit-message', { chatId, messageIndex: editingIndex, newContent });

      if (result.success) {
        const editedMessageContainer = chatWindow.querySelector(`div[data-message-index="${editingIndex}"]`);
        console.log("Edit successful in backend. Updating UI and resubmitting:", result.messageToResubmit);

        // --- Update UI ---
        // 1. Remove all message containers visually after the edited one
        let elementToRemove = messageContainerElement.nextElementSibling;
        while (elementToRemove) {
          const nextElement = elementToRemove.nextElementSibling;
          chatWindow.removeChild(elementToRemove);
          elementToRemove = nextElement;
        }

        // 2. Update the edited message bubble's displayed content
        const bubbleDiv = editedMessageContainer?.querySelector('div:not(button)'); // Find the bubble div itself
         if(bubbleDiv) {
             bubbleDiv.innerHTML = marked.parse(newContent);
         }
        // Update rawText if needed, though it's mainly for the initial click handler
        // messageContainerElement.rawText = trimmedNewContent; // This won't work directly

        // 3. Reset the message index counter based on the truncated history length
        // This assumes user messages are roughly half the history. More robust mapping needed ideally.
        messageIndexCounter = Math.ceil(result.truncatedHistory.length / 2);


        // --- Resubmit ---
        // 4. Resubmit the edited message using the existing mechanism
        const model = modelSelector.value;
        console.log(`Resubmitting edited message to model ${model}: ${result.messageToResubmit}`);
        window.electronAPI.sendMessage('chatMessage', { message: result.messageToResubmit, model });

      } else {
        console.error("Edit failed in backend:", result.error);
        alert(`Failed to edit message: ${result.error}`);
      }
    } catch (error) {
      console.error("Error during edit IPC call:", error);
      alert("An error occurred while trying to edit the message.");
    }

    // Reset editing state regardless of success/failure of backend call
    cancelEdit(); // Use cancelEdit to clean up UI
  }

  // Function to cancel the editing state
  function cancelEdit() {
    isEditing = false;
    editingIndex = null;
    editingOriginalText = null;
    userInput.value = ""; // Clear input area
    sendBtn.textContent = "Send"; // Restore button text
    // sendBtn.onclick = handleSendOrSave; // Restore original handler logic if needed (already set)
    removeCancelButton(); // Remove cancel button if it exists
    console.log("Editing mode cancelled.");
  }

  // Helper to add a cancel button
  function addCancelButton() {
      removeCancelButton(); // Ensure no duplicates
      const cancelButton = document.createElement('button');
      cancelButton.textContent = "Cancel Edit";
      cancelButton.id = "cancelEditBtn";
      cancelButton.className = "ml-2 bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-xs";
      cancelButton.onclick = cancelEdit;
      // Append next to send button or input area
      sendBtn.parentNode.insertBefore(cancelButton, sendBtn.nextSibling);
  }

  // Helper to remove the cancel button
  function removeCancelButton() {
      const cancelButton = document.getElementById('cancelEditBtn');
      if (cancelButton) {
          cancelButton.parentNode.removeChild(cancelButton);
      }
  }

  // For streaming, maintain a temporary "typing" bubble for the AI response.
  let typingBubble = null;

  // Listen for partial responses to update the typing bubble in real time.
  window.electronAPI.onMessage('streamPartialResponse', (data) => {
    if (!typingBubble) {
      // Assign a temporary or invalid index for bot messages during streaming
      typingBubble = createBubble('bot', '', -1);
      chatWindow.appendChild(typingBubble.container);
      // Increment counter for the *pair* after model response is complete
    }
    typingBubble.rawText += data.text;
    typingBubble.bubble.innerHTML = marked.parse(typingBubble.rawText);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  });

  // When the final response is received, finalize the bubble.
  window.electronAPI.onMessage('streamFinalResponse', (data) => {
    if (!typingBubble) {
      // Assign index based on counter *after* response is final
      // This indexing is still problematic for loaded chats.
      appendMessage('bot', data.text, messageIndexCounter); // Assign index here?
      messageIndexCounter++; // Increment after model response
    } else {
      typingBubble.rawText = data.text;
      typingBubble.bubble.innerHTML = marked.parse(data.text);
      typingBubble = null;
    }
  });

  // Listen for tool function call responses and show them as a separate bubble.
  window.electronAPI.onMessage('functionCallResponse', (data) => {
    // Assign index based on counter *after* response is final
    appendMessage('bot', "Tool executed: " + data.text, messageIndexCounter); // Assign index here?
     messageIndexCounter++; // Increment after model response (including tool calls)
});

// --- Initialize Token Counter ---
// Request initial token count on load
try {
  const initialUsage = await window.electronAPI.invoke('get-initial-token-usage');
  updateTokenDisplay(initialUsage);
} catch (error) {
  console.error("Error fetching initial token usage:", error);
  updateTokenDisplay(null); // Show N/A on error
}
window.electronAPI.onMessage('token-usage-updated', updateTokenDisplay); // Listen for updates
});
