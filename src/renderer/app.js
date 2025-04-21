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
  let editingChatId = null; // Add chatId state for editing
  let editingMessageId = null; // Changed from editingIndex
  let editingOriginalText = null;
  let editingContainerElement = null; // Store the container being edited

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
 
    // Show loading indicator (sets state) and create inline bubble
    if (window.showLoadingIndicator) {
        window.showLoadingIndicator();
        createInlineLoadingBubble(); // Create the visual indicator
    } else {
        console.warn("showLoadingIndicator function not found.");
    }
 
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
  // NOTE: This function creates bubbles for *new* messages.
  // Edit buttons for these might need messageId added later if immediate editing is required.
  // For now, editing relies on buttons added by chatHistory.js for loaded messages.
  function createBubble(sender, text, messageId = null) { // Accept optional messageId
    const bubble = document.createElement('div');
    const container = document.createElement('div');
    container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2 relative group`; // Add relative/group
    if (messageId) {
        container.dataset.messageId = messageId; // Store messageId if provided
    }

    // Use CSS variables for bubble backgrounds
    const bubbleBgVar = sender === 'user' ? 'var(--user-bubble-bg)' : 'var(--bot-bubble-bg)';
    const bubbleTextVar = sender === 'user' ? 'var(--user-bubble-text)' : 'var(--bot-bubble-text)';
    // Add fade-in animation class
    bubble.className = `w-fit max-w-3xl px-4 py-2 rounded-lg whitespace-pre-wrap text-left shadow-sm fade-in`; // Use rounded-lg, add shadow, add fade-in
    bubble.style.backgroundColor = bubbleBgVar;
    bubble.style.color = bubbleTextVar; // Apply specific text color
    // Render markdown *after* potentially adding the button
    // container.appendChild(bubble); // Append bubble later

    // Add Edit button for user messages (only if messageId is valid)
    // This primarily applies when re-rendering or if ID is known immediately
    if (sender === 'user' && messageId) {
      const editBtn = document.createElement('button');
      // Use SVG Icon and improved Tailwind classes (consistent with chatHistory.js)
      editBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
        </svg>
      `;
      // Style edit button - use bubble text color for consistency
      editBtn.className = 'absolute top-1.5 left-1.5 p-1 text-[var(--user-bubble-text)]/60 hover:text-[var(--user-bubble-text)] bg-[var(--user-bubble-bg)]/50 hover:bg-[var(--user-bubble-bg)]/75 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200'; // Adjust position slightly
      editBtn.title = "Edit message"; // Add tooltip
      editBtn.dataset.messageId = messageId; // Store ID on button
      editBtn.dataset.rawText = text; // Store raw text on button
      editBtn.onclick = (e) => {
          e.stopPropagation(); // Prevent potential container clicks
          // Use the globally exposed handler - Requires chatId!
          // NOTE: createBubble doesn't have chatId readily available for *new* messages.
          // This button likely won't work correctly for messages created by createBubble
          // unless chatId is passed or retrieved differently here.
          // For now, it primarily ensures visual consistency if IDs *were* added later.
          if (window.handleAppEditClick && editingChatId) { // Check if editingChatId is available (might not be for new messages)
             window.handleAppEditClick(editingChatId, messageId, text, container);
          } else {
             console.warn("Cannot edit new message immediately: chatId missing or handler unavailable.");
             // Optionally disable or hide the button if chatId is missing
          }
      };
      // Prepend button INSIDE the bubble, not the container
      bubble.prepend(editBtn);
    }

    // Render markdown content AFTER potentially adding the button
    bubble.innerHTML = marked.parse(text) + bubble.innerHTML; // Prepend existing button HTML if it exists

    // Append the bubble (which now contains the button if applicable) to the container
    container.appendChild(bubble);

    return { container, bubble, rawText: text };
  }

  // Function to handle edit button clicks (now accepts chatId and messageId)
  // Expose globally for chatHistory.js
  window.handleAppEditClick = async function(chatId, messageId, currentText, messageContainerElement) {
    if (isEditing) {
        // If already editing, cancel the previous edit first
        cancelEdit();
    }

    isEditing = true;
    editingChatId = chatId; // Store chatId
    editingMessageId = messageId; // Store messageId
    editingOriginalText = currentText; // Store original text
    editingContainerElement = messageContainerElement; // Store the container

    userInput.value = currentText; // Populate input area
    userInput.focus();
    sendBtn.textContent = "Save Edit"; // Change button text
    // sendBtn.onclick = handleSendOrSave; // Ensure button calls the correct handler (already set)

    // Optionally add a cancel button
    addCancelButton();

    console.log(`Editing mode activated for chat ID: ${chatId}, message ID: ${messageId}`);
  }

  // Function to save the edited message
  async function saveEdit() {
    const newContent = userInput.value.trim();

    // Check for all necessary editing state variables
    if (!editingChatId || !editingMessageId || !editingContainerElement) {
        console.error("Save Edit called without active editing state (chatId, messageId, or element missing).");
        cancelEdit(); // Reset state
        return;
    }

    try {
      console.log(`Sending edit request for chat ${editingChatId}, message ID ${editingMessageId}`);

      // --- Update UI Immediately ---
      // 1. Remove all message containers visually *after* the edited one.
      //    This gives immediate feedback that history is truncated.
      let elementToRemove = editingContainerElement.nextElementSibling;
      while (elementToRemove) {
        const nextElement = elementToRemove.nextElementSibling;
        chatWindow.removeChild(elementToRemove);
        elementToRemove = nextElement;
      }

      // 2. Update the edited message bubble's displayed content.
      //    Use the clean text for display (strip metadata).
      const metadataRegex = /^Date: \d{1,2}\/\d{1,2}\/\d{4} \| Time: \d{1,2}:\d{2}:\d{2} \| Since last msg: \d+s\n/;
      const cleanNewContent = newContent.replace(metadataRegex, '');
      const bubbleDiv = editingContainerElement.querySelector('div:not(button)'); // Find the bubble div itself
      if(bubbleDiv) {
          bubbleDiv.innerHTML = marked.parse(cleanNewContent); // Use the latest clean content
          // Update the raw text stored on the button (keep original metadata structure if user didn't change it)
          const editBtn = editingContainerElement.querySelector('button[data-message-id]');
          if (editBtn) {
              editBtn.dataset.rawText = newContent; // Store potentially edited full content
          }
      }
      // --- End Immediate UI Update ---


      // Show loading indicator (sets state) and create inline bubble for edit
      if (window.showLoadingIndicator) {
          window.showLoadingIndicator(); // Message parameter is ignored now
          createInlineLoadingBubble(); // Create the visual indicator
      } else {
          console.warn("showLoadingIndicator function not found.");
      }
 
      // Send edit request using sendMessage (backend will handle stream)
      window.electronAPI.sendMessage('edit-message', {
          chatId: editingChatId,
          messageId: editingMessageId,
          newContent // Send the full new content (potentially including metadata)
      });

      // No need to handle result here, stream listeners will update UI with model response

    } catch (error) {
      // Catch errors during immediate UI update or sending message
      console.error("Error during saveEdit:", error);
      alert("An error occurred while trying to save the edit.");
    }

    // Reset editing state regardless of success/failure of backend call
    cancelEdit(); // Use cancelEdit to clean up UI
  }

  // Function to cancel the editing state
  function cancelEdit() {
    isEditing = false;
    editingChatId = null; // Reset chatId
    editingMessageId = null; // Reset messageId
    editingOriginalText = null;
    editingContainerElement = null; // Reset container
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
      // Use component class for cancel button (adjusting padding/size)
      cancelButton.className = "btn btn-secondary ml-2 text-xs py-1 px-3"; // Example using btn-secondary, adjust as needed
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
  let loadingBubbleElement = null; // Reference to the inline loading bubble

  // Listen for partial responses to update the typing bubble in real time.
  window.electronAPI.onMessage('streamPartialResponse', (data) => {
    // Remove inline loading bubble as soon as the first chunk arrives
    removeInlineLoadingBubble(); // Call the helper function

    if (!typingBubble) {
      // Create the actual bot message bubble
      typingBubble = createBubble('bot', ''); // Start empty
      chatWindow.appendChild(typingBubble.container);
    }
    // Append text and render
    typingBubble.rawText += data.text;
    // Ensure the bubble element exists before setting innerHTML
    if (typingBubble && typingBubble.bubble) {
        typingBubble.bubble.innerHTML = marked.parse(typingBubble.rawText);
    } else {
        console.warn("StreamPartialResponse: typingBubble or typingBubble.bubble is null, cannot render partial response.");
    }
    chatWindow.scrollTop = chatWindow.scrollHeight;
    // Note: hideLoadingIndicator (state reset) happens on final response
  });

  // When the final response is received, finalize the bubble.
  window.electronAPI.onMessage('streamFinalResponse', (data) => {
    // Ensure loading bubble is removed if it somehow persisted
    removeInlineLoadingBubble(); // Call the helper function

    if (typingBubble) {
        // Finalize the streamed bubble
        typingBubble.rawText = data.text; // Use final complete text
        // Ensure the bubble element exists before setting innerHTML
        if (typingBubble.bubble) {
            typingBubble.bubble.innerHTML = marked.parse(data.text);
        } else {
             console.warn("StreamFinalResponse: typingBubble.bubble is null, cannot render final response in existing bubble.");
             // Fallback: create a new bubble if the old one is gone somehow
             appendMessage('bot', data.text);
        }
        // Add messageId if available in data (optional)
        // if (data.messageId) typingBubble.container.dataset.messageId = data.messageId;
        typingBubble = null; // Reset typing bubble reference
    } else {
        // If no streaming occurred (e.g., error, short response, or function call was last)
        // create a final bubble directly.
        // This case might happen if only a functionCallResponse was received before this.
        console.log("StreamFinalResponse: No typing bubble existed, creating final message.");
        appendMessage('bot', data.text); // Add messageId if available
    }

    // Increment counter *after* model response is complete
    messageIndexCounter++;

    // Hide loading indicator state
    if (window.hideLoadingIndicator) {
        window.hideLoadingIndicator();
    } else {
        console.warn("hideLoadingIndicator function not found.");
    }
  });

  // Listen for tool function call responses and show them as a separate bubble.
  window.electronAPI.onMessage('functionCallResponse', (data) => {
    // Append tool message - no messageId available here either
    appendMessage('bot', "Tool executed: " + data.text);
     messageIndexCounter++; // Increment after model response (including tool calls)

     // Ensure loading bubble is removed if it somehow persisted
     removeInlineLoadingBubble(); // Call the helper function

     // Hide loading indicator state
     if (window.hideLoadingIndicator) {
         window.hideLoadingIndicator();
     } else {
         console.warn("hideLoadingIndicator function not found.");
     }
});

// --- Helper functions for inline loading bubble ---
function createInlineLoadingBubble() {
    removeInlineLoadingBubble(); // Ensure only one exists

    const container = document.createElement('div');
    container.className = 'flex justify-start mb-2 relative group loading-bubble-container'; // Bot alignment + specific class

    const bubble = document.createElement('div');
    // Use bot bubble styles but add spinner
    bubble.className = 'w-fit max-w-3xl px-3 py-2 rounded-lg whitespace-pre-wrap text-left shadow-sm flex items-center space-x-2'; // Adjusted padding
    bubble.style.backgroundColor = 'var(--bot-bubble-bg)';
    bubble.style.color = 'var(--bot-bubble-text)';

    // Spinner element
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner w-4 h-4 border-2 border-t-[var(--accent-color)] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin flex-shrink-0'; // Added flex-shrink-0

    bubble.appendChild(spinner);
    container.appendChild(bubble);

    chatWindow.appendChild(container);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    loadingBubbleElement = container; // Store reference
}

function removeInlineLoadingBubble() {
    if (loadingBubbleElement) {
        // Optional: Add a fade-out animation before removing
        loadingBubbleElement.classList.add('fade-out-fast'); // Assuming fade-out-fast is defined in animations.css
        setTimeout(() => {
             // Check parentNode before removing, in case it was already removed by other logic
             if (loadingBubbleElement && loadingBubbleElement.parentNode === chatWindow) {
                chatWindow.removeChild(loadingBubbleElement);
             }
             loadingBubbleElement = null; // Clear reference after potential timeout
        }, 200); // Match animation duration
    } else {
         // Ensure reference is cleared if element was already gone or never created
         loadingBubbleElement = null;
    }
}

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
