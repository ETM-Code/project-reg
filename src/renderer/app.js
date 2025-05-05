// app.js - Frontend logic with model and personality selectors
// Import the personality selector component
import { personalitySelector } from './components/personalitySelector.js';

document.addEventListener('DOMContentLoaded', async () => { // Make listener async
  const chatWindow = document.getElementById('chatWindow');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  // We only need the hidden select here, custom dropdown elements are handled by its own script
  // const modelSelector = document.getElementById('modelSelector'); // Will get inside populateModelSelector
  const tokenCounterDisplay = document.getElementById('tokenCounterDisplay'); // Get token counter element
  const openPersonalitySelectorBtn = document.getElementById('openPersonalitySelectorBtn'); // Get personality selector trigger button
  const personalityNameElement = document.getElementById('active-personality-name'); // Get personality name display element

  // --- Dynamic Input Elements ---
  const expandInputBtn = document.getElementById('expandInputBtn');
  const inputOverlay = document.getElementById('inputOverlay');
  const inputOverlayBackdrop = document.getElementById('inputOverlayBackdrop');
  const expandedInputContainer = document.getElementById('expandedInputContainer');
  const closeExpandedInputBtn = document.getElementById('closeExpandedInputBtn');
  const expandedInputTarget = document.getElementById('expandedInputTarget');
  const expandedUserInput = document.getElementById('expandedUserInput'); // New modal textarea
  const expandedSendBtn = document.getElementById('expandedSendBtn'); // New modal send button
  const chatInputArea = document.getElementById('chatInputArea'); // Original container for input + expand btn
  // const inputWrapper = userInput.parentElement; // No longer moving the wrapper
  // const originalInputParent = chatInputArea; // No longer moving the wrapper

  // --- State ---
  let availablePersonalities = [];
  let currentDefaultPersonalityId = null; // ID of the personality used for NEW chats
  let currentActivePersonalityName = 'Loading...'; // Name of the currently displayed personality
  let config = null; // Store fetched config
  let messageIndexCounter = 0; // Counter for assigning indices to new user messages
  let isEditing = false;
  let editingChatId = null;
  let editingMessageId = null;
  let editingOriginalText = null;
  let editingContainerElement = null;
  let typingBubble = null;
  let loadingBubbleElement = null;
  let isInputExpanded = false; // Track expanded state
  // --- End State ---

  // --- Fetch Config ---
  async function fetchConfig() {
    try {
      console.log("[App] Fetching configuration...");
      // Assume preload.js exposes 'get-config' which returns { availableModels: [...], defaults: { modelId: '...' } }
      config = await window.electronAPI.invoke('get-config');
      if (!config || config.error || !config.availableModels || !config.defaults) {
        console.error("[App] Error fetching or invalid config structure:", config?.error || "Invalid data received");
        config = null; // Reset on error
        modelSelectorBtnText.textContent = 'Error Models'; // Update button text on error
        if (modelSelector) modelSelector.disabled = true; // Disable selector on error
      } else {
        console.log("[App] Config fetched successfully.");
        // Call directly, without setTimeout
        populateModelSelector(config.availableModels, config.defaults.modelId);
      }
    } catch (error) {
      console.error("[App] Exception fetching config:", error);
      config = null;
      // Attempt to disable the hidden select on error
      const selectorElement = document.getElementById('modelSelector');
      if (selectorElement) selectorElement.disabled = true;
      // We don't directly control the button text anymore, customDropdown handles it
    }
  }

  // --- Populate Model Selector (Hidden Select Only) ---
  function populateModelSelector(availableModels, defaultModelId) {
    const modelSelector = document.getElementById('modelSelector'); // Get the hidden select

    if (!modelSelector) {
      console.error("[App] Cannot populate model selector: Hidden select element '#modelSelector' not found.");
      return;
    }
    if (!availableModels) {
       console.error("[App] Cannot populate model selector: availableModels data is missing.");
       modelSelector.disabled = true;
       return;
    }

    // Clear existing options
    modelSelector.innerHTML = '';
    let foundDefault = false;

    availableModels.forEach(model => {
      // Validate model object structure
      if (!model || typeof model.id !== 'string' || typeof model.name !== 'string') {
          console.warn("[App] Skipping invalid model entry in config:", model);
          return; // Skip this invalid entry
      }

      // Create option for hidden select
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      modelSelector.appendChild(option);

      // Check if this is the default model
      if (model.id === defaultModelId) {
        option.selected = true;
        foundDefault = true;
      }
    });

    // If defaultModelId from config wasn't found, select the first available model as fallback
    if (!foundDefault && availableModels.length > 0 && availableModels[0].id) {
        console.warn(`[App] Default model ID "${defaultModelId}" not found in availableModels. Falling back to first model: "${availableModels[0].id}".`);
        defaultModelId = availableModels[0].id;
        // Ensure the corresponding option is marked selected
        const firstOption = modelSelector.querySelector(`option[value="${defaultModelId}"]`);
        if (firstOption) firstOption.selected = true;
    } else if (availableModels.length === 0) {
        console.warn("[App] No available models found in config.");
        modelSelector.disabled = true; // Disable if no models
    }

    // Set the hidden select's value to the determined default (or first)
    // This ensures the value is correct even if the default wasn't initially found
    if (availableModels.length > 0) {
        modelSelector.value = defaultModelId;
        modelSelector.disabled = false;
    }

    console.log(`[App] Hidden model selector populated. Selected value: ${modelSelector.value}`);

    // Trigger custom event to notify customDropdown.js to update
    console.log("[App] Dispatching 'optionsUpdated' event on #modelSelector.");
    modelSelector.dispatchEvent(new CustomEvent('optionsUpdated', { bubbles: true }));
  }

  // --- Token Counter Logic ---
  function updateTokenDisplay(usageData) {
    if (tokenCounterDisplay && usageData && typeof usageData.total === 'number') {
      const total = usageData.total.toLocaleString();
      tokenCounterDisplay.textContent = `Today's Tokens: ${total}`;
    } else {
      tokenCounterDisplay.textContent = "Today's Tokens: N/A";
      console.warn("Received invalid token usage data or element not found:", usageData);
    }
  }

  // --- Personality Management ---
  async function fetchPersonalities() {
    try {
      console.log("[App] Fetching personalities...");
      const result = await window.electronAPI.invoke('get-personalities');
      if (result && !result.error) {
        availablePersonalities = result.personalities || [];
        currentDefaultPersonalityId = result.currentPersonalityId;
        console.log(`[App] Fetched ${availablePersonalities.length} personalities. Default ID: ${currentDefaultPersonalityId}`);
        const defaultPersonality = availablePersonalities.find(p => p.id === currentDefaultPersonalityId);
        updateActivePersonalityDisplay(defaultPersonality ? defaultPersonality.name : 'Unknown');
        if (window.updatePersonalityDropdown) {
          window.updatePersonalityDropdown(availablePersonalities, currentDefaultPersonalityId);
        }
      } else {
        console.error("[App] Error fetching personalities:", result?.error || "Unknown error");
        availablePersonalities = [];
        currentDefaultPersonalityId = null;
        updateActivePersonalityDisplay('Error');
      }
    } catch (error) {
      console.error("[App] Exception fetching personalities:", error);
      availablePersonalities = [];
      currentDefaultPersonalityId = null;
      updateActivePersonalityDisplay('Error');
    }
  }

  async function handlePersonalityChange(selectedId) {
    try {
      console.log(`[App] Setting default personality to: ${selectedId}`);
      const result = await window.electronAPI.invoke('set-active-personality', selectedId);
      if (result && result.success) {
        currentDefaultPersonalityId = selectedId;
        console.log(`[App] Default personality successfully updated to ${selectedId}`);
        // Update header display immediately (optional, could wait for re-fetch)
        const selectedPersonality = availablePersonalities.find(p => p.id === selectedId);
         if (selectedPersonality) updateActivePersonalityDisplay(selectedPersonality.name);
      } else {
        console.error("[App] Failed to set default personality:", result?.error || "Unknown error");
        alert(`Failed to set personality: ${result?.error || 'Unknown error'}`);
        if (window.updatePersonalityDropdown) {
             window.updatePersonalityDropdown(availablePersonalities, currentDefaultPersonalityId); // Revert UI
        }
      }
    } catch (error) {
      console.error("[App] Exception setting personality:", error);
      alert(`Error setting personality: ${error.message}`);
       if (window.updatePersonalityDropdown) {
           window.updatePersonalityDropdown(availablePersonalities, currentDefaultPersonalityId); // Revert UI
       }
    }
  }

  window.getAvailablePersonalities = () => availablePersonalities;
  window.getCurrentDefaultPersonalityId = () => currentDefaultPersonalityId;
  window.handleAppPersonalityChange = handlePersonalityChange;

  // --- Active Personality Display Update ---
  function updateActivePersonalityDisplay(newName) {
    if (personalityNameElement) {
      currentActivePersonalityName = newName || 'Unknown';
      personalityNameElement.textContent = currentActivePersonalityName;
      console.log(`[App] Active personality display updated to: ${currentActivePersonalityName}`);
    } else {
      console.error("[App] Cannot update personality display: element 'active-personality-name' not found.");
    }
  }

  // --- Current Chat Personality Selection ---
  async function handleCurrentChatPersonalitySelect(selectedId) {
    try {
      console.log(`[App] Setting current chat personality to: ${selectedId}`);
      const result = await window.electronAPI.invoke('set-current-chat-personality', selectedId);
      if (result && result.success) {
        console.log(`[App] Current chat personality successfully set to ${selectedId}`);
        const selectedPersonality = availablePersonalities.find(p => p.id === selectedId);
        updateActivePersonalityDisplay(selectedPersonality ? selectedPersonality.name : 'Unknown');
      } else {
        console.error("[App] Failed to set current chat personality:", result?.error || "Unknown error");
        alert(`Failed to switch personality for this chat: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("[App] Exception setting current chat personality:", error);
      alert(`Error switching personality: ${error.message}`);
    }
  }

  // Expose function to reset counter
  window.resetAppMessageCounter = (historyLength) => {
    console.log(`Resetting message index counter based on loaded history length: ${historyLength}`);
    messageIndexCounter = Math.ceil(historyLength / 2);
  };

  // --- Event Listeners ---
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendOrSave();
    }
    // Close overlay on Escape key press (from original input)
    if (e.key === 'Escape' && isInputExpanded) {
        closeExpandedInput();
    }
  });
  sendBtn.addEventListener('click', handleSendOrSave);

  // Add listeners for the *expanded* input as well
  if (expandedUserInput) {
      expandedUserInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendOrSave();
          }
          // Close overlay on Escape key press (from expanded input)
          if (e.key === 'Escape' && isInputExpanded) {
              closeExpandedInput();
          }
      });
  } else {
      console.error("Expanded user input element not found.");
  }
  if (expandedSendBtn) {
      expandedSendBtn.addEventListener('click', handleSendOrSave);
  } else {
      console.error("Expanded send button element not found.");
  }

  // --- Message Handling ---
  function handleSendOrSave() {
    const sourceInput = isInputExpanded ? expandedUserInput : userInput;
    const message = sourceInput.value.trim();

    if (!message) return; // Don't do anything if message is empty

    if (isEditing && !isInputExpanded) { // Only allow saving edits from the original input for now
      saveEdit(message); // Pass message to saveEdit
    } else if (!isEditing) {
      sendMessage(message); // Pass message to sendMessage
    } else if (isEditing && isInputExpanded) {
        console.warn("Cannot save edits from expanded view. Please close the expanded view first.");
        // Optionally provide user feedback here
        return; // Prevent sending/closing
    }

    // Clear the input that was used
    sourceInput.value = '';

    // Close expanded view after sending/saving if it was open
    if (isInputExpanded) {
        closeExpandedInput();
    }
  }

  // Modified sendMessage to accept the message content
  function sendMessage(message) {
    // Message trimming and validation already happened in handleSendOrSave
    if (!modelSelector || modelSelector.disabled) return; // Don't send if selector disabled

    const currentIndex = messageIndexCounter;
    appendMessage('user', message, currentIndex); // Pass index
    messageIndexCounter++;

    if (window.showLoadingIndicator) {
        window.showLoadingIndicator();
        createInlineLoadingBubble();
    } else {
        console.warn("showLoadingIndicator function not found.");
    }

    const model = modelSelector.value; // Read selected model from the hidden select
    console.log(`[App] Sending message with model: ${model}`);
    window.electronAPI.sendMessage('chatMessage', { message, model });
  }

  function appendMessage(sender, text, index) {
    const bubbleElements = createBubble(sender, text, index);
    chatWindow.appendChild(bubbleElements.container);
    // Only scroll down if already near the bottom
    if (isScrolledToBottom(chatWindow)) {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
  }

  // --- Helper function to check scroll position ---
  function isScrolledToBottom(element, threshold = 10) {
      // Check if the scroll height is greater than the client height (i.e., is there actually a scrollbar?)
      const hasScrollbar = element.scrollHeight > element.clientHeight;
      if (!hasScrollbar) {
          return true; // If no scrollbar, it's effectively "at the bottom"
      }
      // Check if scrolled within the threshold of the bottom
      return element.scrollHeight - element.scrollTop <= element.clientHeight + threshold;
  }
  // --- End Helper ---


  function createBubble(sender, text, messageId = null) {
    const bubble = document.createElement('div');
    const container = document.createElement('div');
    container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2 relative group`;
    if (messageId) {
        container.dataset.messageId = messageId;
    }

    const bubbleBgVar = sender === 'user' ? 'var(--user-bubble-bg)' : 'var(--bot-bubble-bg)';
    const bubbleTextVar = sender === 'user' ? 'var(--user-bubble-text)' : 'var(--bot-bubble-text)';
    bubble.className = `w-fit max-w-3xl px-4 py-2 rounded-lg whitespace-pre-wrap text-left shadow-sm fade-in`;
    bubble.style.backgroundColor = bubbleBgVar;
    bubble.style.color = bubbleTextVar;

    let buttonHtml = ''; // Store button HTML separately

    if (sender === 'user' && messageId) {
      // Create button HTML string
      buttonHtml = `
        <button class="absolute top-1.5 left-1.5 p-1 text-[var(--user-bubble-text)]/60 hover:text-[var(--user-bubble-text)] bg-[var(--user-bubble-bg)]/50 hover:bg-[var(--user-bubble-bg)]/75 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 edit-button"
                title="Edit message"
                data-message-id="${messageId}"
                data-raw-text="${escapeHtml(text)}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
        </button>
      `;
      // Note: onclick is added globally later or handled by chatHistory.js
    }

    // Render markdown content and prepend button HTML
    bubble.innerHTML = buttonHtml + marked.parse(text);
    container.appendChild(bubble);

    // Add click listener for edit button *after* it's in the DOM (if created here)
    // This might be redundant if chatHistory.js adds its own listeners
    const editBtn = bubble.querySelector('.edit-button');
    if (editBtn) {
        editBtn.onclick = (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const id = btn.dataset.messageId;
            const rawText = btn.dataset.rawText;
            // Requires chatId, which isn't available when creating *new* bubbles here.
            // Rely on chatHistory.js to add functional buttons to loaded messages.
            if (window.handleAppEditClick && window.getCurrentChatId) { // Check for global handler and chatId getter
                const currentChatId = window.getCurrentChatId();
                if (currentChatId) {
                    window.handleAppEditClick(currentChatId, id, rawText, container);
                } else {
                    console.warn("Edit clicked, but currentChatId is not available.");
                }
            } else {
                console.warn("Edit clicked, but handleAppEditClick or getCurrentChatId is not available.");
            }
        };
    }


    return { container, bubble, rawText: text };
  }

  // Helper to escape HTML for data attributes
  function escapeHtml(unsafe) {
      if (!unsafe) return '';
      return unsafe
           .replace(/&/g, "&")
           .replace(/</g, "<")
           .replace(/>/g, ">")
           .replace(/"/g, '"') // Use single quotes for the replacement string
           .replace(/'/g, "&#039;");
   }

  // --- Editing Logic ---
  window.handleAppEditClick = async function(chatId, messageId, currentText, messageContainerElement) {
    if (isEditing) {
        cancelEdit();
    }
    isEditing = true;
    editingChatId = chatId;
    editingMessageId = messageId;
    editingOriginalText = currentText;
    editingContainerElement = messageContainerElement;
    userInput.value = currentText;
    userInput.focus();
    sendBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
    `; // Change button to checkmark icon
    sendBtn.title = "Save Edit"; // Add tooltip
    addCancelButton();
    console.log(`Editing mode activated for chat ID: ${chatId}, message ID: ${messageId}`);
  }

  // Modified saveEdit to accept the new content
  async function saveEdit(newContent) {
    // newContent is already trimmed from handleSendOrSave
    if (!editingChatId || !editingMessageId || !editingContainerElement) {
        console.error("Save Edit called without active editing state.");
        cancelEdit(); // Still call cancelEdit to reset state
        return;
    }

    try {
      console.log(`Sending edit request for chat ${editingChatId}, message ID ${editingMessageId}`);

      // --- Immediate UI Update ---
      let elementToRemove = editingContainerElement.nextElementSibling;
      while (elementToRemove) {
        const nextElement = elementToRemove.nextElementSibling;
        chatWindow.removeChild(elementToRemove);
        elementToRemove = nextElement;
      }

      const metadataRegex = /^Date: \d{1,2}\/\d{1,2}\/\d{4} \| Time: \d{1,2}:\d{2}:\d{2} \| Since last msg: \d+s\n/;
      const cleanNewContent = newContent.replace(metadataRegex, '');
      const bubbleDiv = editingContainerElement.querySelector('div:not(button)');
      if(bubbleDiv) {
          // Re-add button HTML before parsing markdown
          const buttonHtml = `
            <button class="absolute top-1.5 left-1.5 p-1 text-[var(--user-bubble-text)]/60 hover:text-[var(--user-bubble-text)] bg-[var(--user-bubble-bg)]/50 hover:bg-[var(--user-bubble-bg)]/75 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 edit-button"
                    title="Edit message"
                    data-message-id="${editingMessageId}"
                    data-raw-text="${escapeHtml(newContent)}">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
            </button>
          `;
          bubbleDiv.innerHTML = buttonHtml + marked.parse(cleanNewContent);
          // Re-attach listener to the new button
          const editBtn = bubbleDiv.querySelector('.edit-button');
           if (editBtn) {
               editBtn.onclick = (e) => {
                   e.stopPropagation();
                   if (window.handleAppEditClick && window.getCurrentChatId) {
                       const currentChatId = window.getCurrentChatId();
                       if (currentChatId) {
                           window.handleAppEditClick(currentChatId, editingMessageId, newContent, editingContainerElement);
                       } else { console.warn("Edit clicked, but currentChatId is not available."); }
                   } else { console.warn("Edit clicked, but handler/chatId unavailable."); }
               };
           }
      }
      // --- End Immediate UI Update ---


      if (window.showLoadingIndicator) {
          window.showLoadingIndicator();
          createInlineLoadingBubble();
      } else {
          console.warn("showLoadingIndicator function not found.");
      }

      window.electronAPI.sendMessage('edit-message', {
          chatId: editingChatId,
          messageId: editingMessageId,
          newContent
      });

    } catch (error) {
      console.error("Error during saveEdit:", error);
      alert("An error occurred while trying to save the edit.");
    }
    cancelEdit(); // Reset editing state
  }

  function cancelEdit() {
    isEditing = false;
    editingChatId = null;
    editingMessageId = null;
    editingOriginalText = null;
    editingContainerElement = null;
    userInput.value = "";
    // Restore original send button icon/text
    sendBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        </svg>
    `;
    sendBtn.title = "Send Message"; // Restore tooltip
    removeCancelButton();
    console.log("Editing mode cancelled.");
  }

  function addCancelButton() {
      removeCancelButton();
      const cancelButton = document.createElement('button');
      cancelButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      `; // Use X icon
      cancelButton.id = "cancelEditBtn";
      cancelButton.className = "btn btn-secondary p-2 ml-2"; // Adjust styling as needed
      cancelButton.title = "Cancel Edit";
      cancelButton.onclick = cancelEdit;
      sendBtn.parentNode.insertBefore(cancelButton, sendBtn.nextSibling);
  }

  function removeCancelButton() {
      const cancelButton = document.getElementById('cancelEditBtn');
      if (cancelButton) {
          cancelButton.parentNode.removeChild(cancelButton);
      }
  }

  // --- Streaming Handlers ---
  window.electronAPI.onMessage('streamPartialResponse', (data) => {
    removeInlineLoadingBubble();
    if (!typingBubble) {
      typingBubble = createBubble('bot', '');
      chatWindow.appendChild(typingBubble.container);
    }
    typingBubble.rawText += data.text;
    if (typingBubble && typingBubble.bubble) {
        typingBubble.bubble.innerHTML = marked.parse(typingBubble.rawText);
    } else {
        console.warn("StreamPartialResponse: typingBubble or bubble is null.");
    }
    // Only scroll down if already near the bottom
    if (isScrolledToBottom(chatWindow)) {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
  });

  window.electronAPI.onMessage('streamFinalResponse', (data) => {
    removeInlineLoadingBubble();
    if (typingBubble) {
        typingBubble.rawText = data.text;
        if (typingBubble.bubble) {
            typingBubble.bubble.innerHTML = marked.parse(data.text);
        } else {
             console.warn("StreamFinalResponse: typingBubble.bubble is null.");
             appendMessage('bot', data.text); // Fallback
        }
        typingBubble = null;
    } else {
        console.log("StreamFinalResponse: No typing bubble, creating final message.");
        appendMessage('bot', data.text);
    }
    messageIndexCounter++; // Increment counter after full response
    if (window.hideLoadingIndicator) {
        window.hideLoadingIndicator();
    } else {
        console.warn("hideLoadingIndicator function not found.");
    }
  });

  window.electronAPI.onMessage('functionCallResponse', (data) => {
    appendMessage('bot', "Tool executed: " + data.text);
    messageIndexCounter++; // Increment after tool response
    removeInlineLoadingBubble();
     if (window.hideLoadingIndicator) {
         window.hideLoadingIndicator();
     } else {
         console.warn("hideLoadingIndicator function not found.");
     }
  });

  // --- Listener for newly saved chats ---
  window.electronAPI.onMessage('new-chat-saved', (chatData) => {
    console.log(`[App] Received new-chat-saved event for chat ID: ${chatData.id}`);
    // Assuming chatHistory.js exposes a function to add items to the list
    if (window.addChatToHistoryList) {
      window.addChatToHistoryList(chatData); // Pass { id, title, lastUpdated }
    } else {
      console.warn("[App] window.addChatToHistoryList function not found. Cannot update history UI dynamically.");
      // As a fallback, maybe trigger a full refresh?
      // if (window.loadChatHistory) window.loadChatHistory();
    }
  });

  // --- Inline Loading Bubble Helpers ---
  function createInlineLoadingBubble() {
    removeInlineLoadingBubble();
    const container = document.createElement('div');
    container.className = 'flex justify-start mb-2 relative group loading-bubble-container';
    const bubble = document.createElement('div');
    bubble.className = 'w-fit max-w-3xl px-3 py-2 rounded-lg whitespace-pre-wrap text-left shadow-sm flex items-center space-x-2';
    bubble.style.backgroundColor = 'var(--bot-bubble-bg)';
    bubble.style.color = 'var(--bot-bubble-text)';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner w-4 h-4 border-2 border-t-[var(--accent-color)] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin flex-shrink-0';
    bubble.appendChild(spinner);
    container.appendChild(bubble);
    chatWindow.appendChild(container);
    // Only scroll down if already near the bottom
    if (isScrolledToBottom(chatWindow)) {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
    loadingBubbleElement = container;
  }
  function removeInlineLoadingBubble() {
    if (loadingBubbleElement) {
        loadingBubbleElement.classList.add('fade-out-fast');
        setTimeout(() => {
             if (loadingBubbleElement && loadingBubbleElement.parentNode === chatWindow) {
                chatWindow.removeChild(loadingBubbleElement);
             }
             loadingBubbleElement = null;
        }, 200);
    } else {
         loadingBubbleElement = null;
    }
  }

  // --- Dynamic Input Area Logic ---
  // --- Dynamic Input Area Logic (Revised) ---
  function openExpandedInput() {
    if (!inputOverlay || !expandedUserInput || !chatInputArea || isInputExpanded) {
        console.error("[App] openExpandedInput: Pre-check failed. Elements:", {inputOverlay, expandedUserInput, chatInputArea}, "Expanded:", isInputExpanded);
        return;
    }
    console.log("[App] Expanding input area...");

    // 1. Copy content from original to expanded
    expandedUserInput.value = userInput.value;

    // 2. Hide original input area using Tailwind 'hidden' class
    console.log("[App] Hiding chatInputArea:", chatInputArea);
    chatInputArea.classList.add('hidden');

    // 3. Show overlay with transitions by removing/adding Tailwind classes
    console.log("[App] Making overlay visible. Elements:", {inputOverlay, inputOverlayBackdrop, expandedInputContainer});
    inputOverlay.classList.remove('invisible', 'opacity-0', 'scale-95');
    inputOverlay.classList.add('opacity-100', 'scale-100'); // Add final state classes
    inputOverlayBackdrop.classList.remove('opacity-0');
    inputOverlayBackdrop.classList.add('opacity-100'); // Make backdrop visible
    expandedInputContainer.classList.remove('scale-95'); // Scale up the container
    expandedInputContainer.classList.add('scale-100');
    // Enable pointer events when visible
    inputOverlay.style.pointerEvents = 'auto';

    // 4. Focus the expanded textarea after transition
    setTimeout(() => {
        expandedUserInput.focus();
        // Optional: Trigger resize/scroll adjustment if needed for expanded view
        // expandedUserInput.dispatchEvent(new Event('input'));
    }, 300); // Match CSS transition duration

    isInputExpanded = true;
  }

  function closeExpandedInput() {
    if (!inputOverlay || !expandedUserInput || !chatInputArea || !isInputExpanded) {
        console.error("[App] closeExpandedInput: Pre-check failed. Elements:", {inputOverlay, expandedUserInput, chatInputArea}, "Expanded:", isInputExpanded);
        return;
    }
    console.log("[App] Closing expanded input area...");

    // 1. Copy content back from expanded to original (optional, maybe only on send?)
    // Let's copy it back for consistency when closing via Esc/backdrop
    userInput.value = expandedUserInput.value;

    // 2. Hide overlay with transitions by adding/removing Tailwind classes
    inputOverlay.classList.remove('opacity-100', 'scale-100'); // Remove final state classes
    inputOverlay.classList.add('invisible', 'opacity-0', 'scale-95'); // Add initial hidden state classes
    inputOverlayBackdrop.classList.remove('opacity-100'); // Hide backdrop
    inputOverlayBackdrop.classList.add('opacity-0');
    expandedInputContainer.classList.remove('scale-100'); // Scale down the container
    expandedInputContainer.classList.add('scale-95');
    // Disable pointer events when hidden
    inputOverlay.style.pointerEvents = 'none';

    // 3. Show original input area by removing Tailwind 'hidden' class
    console.log("[App] Showing chatInputArea:", chatInputArea);
    chatInputArea.classList.remove('hidden');

    // 4. Clear expanded input
    expandedUserInput.value = '';

    // 5. Focus the original textarea after transition (optional)
    setTimeout(() => {
        userInput.focus();
        // Trigger resize calculation on original input
        userInput.dispatchEvent(new Event('input'));
    }, 300); // Match CSS transition duration

    isInputExpanded = false;
  }

  // --- Initial Setup ---
  // Fetch config and populate model selector FIRST
  await fetchConfig();

  // Then fetch personalities
  await fetchPersonalities();

  // Initialize Token Counter Display
  try {
    const initialUsage = await window.electronAPI.invoke('get-initial-token-usage');
    updateTokenDisplay(initialUsage);
  } catch (error) {
    console.error("Error fetching initial token usage:", error);
    updateTokenDisplay(null);
  }
  window.electronAPI.onMessage('token-usage-updated', updateTokenDisplay);

  // Initialize Personality Selector Component
  if (personalitySelector && openPersonalitySelectorBtn) {
    personalitySelector.init(handleCurrentChatPersonalitySelect);
    openPersonalitySelectorBtn.addEventListener('click', () => {
      personalitySelector.show();
    });
  } else {
    console.error("Failed to initialize personality selector: Component or button not found.");
  }

  // NOTE: Assuming customDropdown.js initializes itself and handles clicks
  // Add listeners for expand/close buttons
  if (expandInputBtn) {
      expandInputBtn.addEventListener('click', openExpandedInput);
  } else {
      console.error("Expand input button not found.");
  }
  if (closeExpandedInputBtn) {
      closeExpandedInputBtn.addEventListener('click', closeExpandedInput);
  } else {
      console.error("Close expanded input button not found.");
  }
  // Add listener to backdrop click to close
  inputOverlayBackdrop.addEventListener('click', closeExpandedInput);

  console.log("[App] Frontend initialized.");
});
