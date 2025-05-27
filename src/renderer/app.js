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
  let isStreaming = false; // Track if AI is currently streaming a response
  let currentStreamAbortController = null; // Controller to abort current stream
  const settingsManager = window.electronAPI.settingsManager; // Added for font settings

  // --- State for Timers, Alarms, Notifications ---
  let activeTimers = [];
  let activeAlarms = [];
  let timersAlarmsInterval = null;
  const TIMERS_ALARMS_FILE_CHECK_INTERVAL = 5000; // How often to re-fetch from files (e.g., if another instance changes them) - maybe too frequent
  const TIMERS_ALARMS_UI_UPDATE_INTERVAL = 1000; // How often to check and update UI for countdowns/triggering

  // --- End State ---

  // --- Apply Initial Font ---
  async function applyInitialFont() {
    try {
      // The IPC handler 'settings:get-font-settings' now directly returns the fontSettings object
      const fontSettings = await window.electronAPI.invoke('settings:get-font-settings');
      // Add comprehensive logging
      console.log('[App] Received fontSettings for initial apply:', JSON.stringify(fontSettings));

      if (fontSettings && fontSettings.defaultFont && Array.isArray(fontSettings.availableFonts)) {
        const defaultFontName = fontSettings.defaultFont;
        // Ensure availableFonts is not undefined before calling find
        const defaultFontObject = fontSettings.availableFonts.find(f => f.name === defaultFontName);

        if (defaultFontObject && defaultFontObject.cssName) {
          document.body.style.setProperty('--font-family-base', defaultFontObject.cssName);
          console.log(`[App] Initial font applied: ${defaultFontName} (${defaultFontObject.cssName})`);
        } else {
          console.warn(`[App] Default font '${defaultFontName}' not found in availableFonts or missing cssName. Using fallback.`);
          // Apply a very safe fallback if default isn't found
          document.body.style.setProperty('--font-family-base', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
        }
      } else {
        console.error('[App] Invalid or incomplete fontSettings received for initial apply. Using fallback.', fontSettings);
        document.body.style.setProperty('--font-family-base', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
      }
    } catch (error) {
      console.error('[App] Error applying initial font:', error);
      // Apply a very safe fallback on error
      document.body.style.setProperty('--font-family-base', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
    }
  }

  // --- Apply Theme ---
  function applyTheme(themeName) {
    // Remove existing theme classes
    document.body.classList.remove('theme-dark', 'theme-light');
    
    // Apply new theme class (only for dark and light, default has no class)
    if (themeName === 'dark') {
        document.body.classList.add('theme-dark');
    } else if (themeName === 'light') {
        document.body.classList.add('theme-light');
    }
    // For 'default' theme, no class is added (uses :root variables)
    
    console.log(`[App] Theme applied: ${themeName}`);
  }

  // --- Apply Initial Theme ---
  async function applyInitialTheme() {
    try {
      const result = await window.electronAPI.settingsManager.getGlobalSetting('theme');
      console.log(`[App] getGlobalSetting result:`, result);
      
      // Handle the result properly based on the IPC response format
      let currentTheme;
      if (result && result.success) {
        currentTheme = result.value;
      } else if (typeof result === 'string') {
        // Direct string value (older format)
        currentTheme = result;
      } else {
        console.warn('[App] Unexpected theme result format:', result);
        currentTheme = null;
      }
      
      const themeToApply = currentTheme || 'dark'; // Default to dark if not set
      console.log(`[App] Initial theme loaded: ${themeToApply} (from: ${currentTheme})`);
      applyTheme(themeToApply);
    } catch (error) {
      console.error('[App] Error loading initial theme:', error);
      // Apply default theme on error
      applyTheme('dark');
    }
  }

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

  // Expose theme function for settings modal
  window.applyTheme = applyTheme;

  // Expose functions for chat loading to update UI
  window.updateActivePersonalityDisplay = updateActivePersonalityDisplay;
  window.updateModelSelectorDisplay = (modelId) => {
    const modelSelector = document.getElementById('modelSelector');
    if (modelSelector && modelId) {
      modelSelector.value = modelId;
      // Trigger event to notify customDropdown.js to update display
      modelSelector.dispatchEvent(new CustomEvent('optionsUpdated', { bubbles: true }));
      console.log(`[App] Updated model selector to: ${modelId}`);
    }
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
    // If currently streaming, stop the stream instead
    if (isStreaming) {
      stopCurrentStream();
      return;
    }

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

    // Set streaming state before sending
    setStreamingState(true);

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
    
    // Create abort controller for this request
    currentStreamAbortController = new AbortController();
    
    window.electronAPI.sendMessage('chatMessage', { message, model });
  }

  function appendMessage(sender, text, index) {
    const bubbleElements = createBubble(sender, text, index);
    chatWindow.appendChild(bubbleElements.container);
    // Use the intelligent scroll function from chatHistory.js
    if (window.chatHistoryScrollToBottomIfAppropriate) {
      window.chatHistoryScrollToBottomIfAppropriate();
    }
  }

  // --- Helper function isScrolledToBottom is removed as its logic is now in chatHistory.js ---


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

      // Set streaming state for edit
      setStreamingState(true);

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

      // Create abort controller for edit request
      currentStreamAbortController = new AbortController();

      window.electronAPI.sendMessage('edit-message', {
          chatId: editingChatId,
          messageId: editingMessageId,
          newContent
      });

    } catch (error) {
      console.error("Error during saveEdit:", error);
      alert("An error occurred while trying to save the edit.");
      // Reset streaming state on error
      setStreamingState(false);
      currentStreamAbortController = null;
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
    // Use the intelligent scroll function from chatHistory.js
    if (window.chatHistoryScrollToBottomIfAppropriate) {
      window.chatHistoryScrollToBottomIfAppropriate();
    }
  });

  window.electronAPI.onMessage('streamFinalResponse', (data) => {
    removeInlineLoadingBubble();
    
    // Reset streaming state
    setStreamingState(false);
    currentStreamAbortController = null;
    
    if (typingBubble) {
        typingBubble.rawText = data.text;
        if (typingBubble.bubble) {
            typingBubble.bubble.innerHTML = marked.parse(data.text);
            // Call intelligent scroll after updating the bubble
            if (window.chatHistoryScrollToBottomIfAppropriate) {
              window.chatHistoryScrollToBottomIfAppropriate();
            }
        } else {
             console.warn("StreamFinalResponse: typingBubble.bubble is null.");
             appendMessage('bot', data.text); // Fallback, appendMessage will handle scroll
        }
        typingBubble = null;
    } else {
        console.log("StreamFinalResponse: No typing bubble, creating final message.");
        appendMessage('bot', data.text); // appendMessage will handle scroll
    }
    messageIndexCounter++; // Increment counter after full response
    if (window.hideLoadingIndicator) {
        window.hideLoadingIndicator();
    } else {
        console.warn("hideLoadingIndicator function not found.");
    }
  });

  window.electronAPI.onMessage('streamError', (data) => {
    console.error('[App] Stream error received:', data);
    
    // Reset streaming state on error
    setStreamingState(false);
    currentStreamAbortController = null;
    
    removeInlineLoadingBubble();
    if (window.hideLoadingIndicator) {
        window.hideLoadingIndicator();
    }
    
    // Show error message
    if (data.message) {
      appendMessage('system', `Error: ${data.message}`);
      messageIndexCounter++;
    }
    
    // Clean up typing bubble if it exists
    if (typingBubble) {
      typingBubble = null;
    }
  });

  window.electronAPI.onMessage('streamStopped', (data) => {
    console.log('[App] Stream stopped confirmation received');
    
    // Reset streaming state
    setStreamingState(false);
    currentStreamAbortController = null;
    
    removeInlineLoadingBubble();
    if (window.hideLoadingIndicator) {
        window.hideLoadingIndicator();
    }
    
    // Finalize any partial response
    if (typingBubble && typingBubble.rawText) {
      if (typingBubble.bubble) {
        typingBubble.bubble.innerHTML = marked.parse(typingBubble.rawText + '\n\n*[Response stopped by user]*');
      }
      typingBubble = null;
      messageIndexCounter++;
    }
  });

  window.electronAPI.onMessage('functionCallResponse', (data) => {
    // This channel might be deprecated if 'tool-execution-result' is used for tool UI effects.
    // For now, keep its original behavior of just logging the text.
    // The actual tool-specific UI updates (like showing a native notification)
    // will be handled by 'tool-execution-result'.
    appendMessage('bot', "Tool action processed. Result: " + data.text);
    messageIndexCounter++; // Increment after tool response
    removeInlineLoadingBubble();
     if (window.hideLoadingIndicator) {
         window.hideLoadingIndicator();
     } else {
         console.warn("hideLoadingIndicator function not found.");
     }
  });

  // Listener for results of tool executions, for UI side effects
  window.electronAPI.onMessage('tool-execution-result', (data) => {
    console.log('[App] Received tool-execution-result:', data);
    const { toolName, result, chatIdFromMain } = data; // Assuming main.js sends chatId

    if (result && result.success) {
        if (toolName === 'create_notification' && result.data) {
            const currentChatId = window.getCurrentChatId ? window.getCurrentChatId() : chatIdFromMain;
            if (!currentChatId) {
                console.error("[App] Cannot show notification: currentChatId is unavailable.");
                return;
            }
            console.log(`[App] Requesting native notification for chat ${currentChatId}: Title: ${result.data.title}, Body: ${result.data.body}`);
            window.electronAPI.sendMessage('show-native-notification', {
                title: result.data.title,
                body: result.data.body,
                chatId: currentChatId
            });
        } else if (toolName === 'create_alarm' || toolName === 'start_timer') {
            console.log(`[App] ${toolName} executed successfully. Reloading timers/alarms.`);
            loadTimersAndAlarms(); // Refresh UI
        }
        // Display success message from tool in chat (optional, could be part of model's next response)
        // appendMessage('system', `${toolName} successful: ${result.message}`);
    } else if (result && !result.success) {
        // Display error message from tool in chat (optional)
        // appendMessage('system', `Error with ${toolName}: ${result.error}`);
        console.error(`[App] Tool ${toolName} execution failed:`, result.error);
    }
  });

  window.electronAPI.onMessage('native-notification-clicked', (chatId) => {
    console.log(`[App] Native notification clicked, loading chat ID: ${chatId}`);
    if (window.loadChat && chatId) { // loadChat is from chatHistory.js
        window.loadChat(chatId);
    } else {
        console.warn('[App] window.loadChat function not available or chatId missing for notification click.');
    }
  });

  window.electronAPI.onMessage('show-in-app-notification-fallback', (data) => {
    console.log('[App] Showing in-app notification fallback:', data);
    showInAppAlert('info', data.title, data.body, data.chatId);
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
    // Use the intelligent scroll function from chatHistory.js
    if (window.chatHistoryScrollToBottomIfAppropriate) {
      window.chatHistoryScrollToBottomIfAppropriate();
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

  // --- Timer and Alarm UI & Logic ---
  const timersAlarmsContainer = document.getElementById('timersAlarmsContainer'); // Assuming this ID exists in index.html
  const inAppAlertsContainer = document.getElementById('inAppAlertsContainer'); // Assuming this ID exists

  async function loadTimersAndAlarms() {
    try {
        console.log('[App] Loading timers and alarms...');
        const [timersResult, alarmsResult] = await Promise.all([
            window.electronAPI.invoke('get-active-timers'),
            window.electronAPI.invoke('get-active-alarms')
        ]);

        activeTimers = timersResult.success ? timersResult.timers : [];
        activeAlarms = alarmsResult.success ? alarmsResult.alarms : [];

        console.log(`[App] Loaded ${activeTimers.length} active timers, ${activeAlarms.length} active alarms.`);
        renderTimersAndAlarmsUI();
    } catch (error) {
        console.error('[App] Error loading timers/alarms:', error);
        activeTimers = [];
        activeAlarms = [];
        renderTimersAndAlarmsUI(); // Render empty state
    }
  }

  function renderTimersAndAlarmsUI() {
    if (!timersAlarmsContainer) {
        console.warn('[App] timersAlarmsContainer not found in DOM.');
        return;
    }
    timersAlarmsContainer.innerHTML = ''; // Clear existing

    [...activeTimers, ...activeAlarms].forEach(item => {
        const isTimer = !!item.duration;
        const itemDiv = document.createElement('div');
        itemDiv.className = `p-2 mb-1 rounded text-xs ${isTimer ? 'bg-blue-100 dark:bg-blue-800' : 'bg-orange-100 dark:bg-orange-800'} border ${isTimer ? 'border-blue-300 dark:border-blue-600' : 'border-orange-300 dark:border-orange-600'}`;

        const labelSpan = document.createElement('span');
        labelSpan.textContent = `${item.label || (isTimer ? 'Timer' : 'Alarm')}: `;
        itemDiv.appendChild(labelSpan);

        const timeSpan = document.createElement('span');
        timeSpan.id = `${isTimer ? 'timer' : 'alarm'}-${item.id}-time`; // For dynamic updates
        itemDiv.appendChild(timeSpan);

        if (item.chatId && window.loadChat) {
            const goToChatBtn = document.createElement('button');
            goToChatBtn.textContent = 'Go to Chat';
            goToChatBtn.className = 'ml-2 px-1 py-0.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs';
            goToChatBtn.onclick = () => window.loadChat(item.chatId);
            itemDiv.appendChild(goToChatBtn);
        }

        const dismissBtn = document.createElement('button');
        dismissBtn.innerHTML = '&times;'; // '×'
        dismissBtn.className = 'ml-2 px-1 py-0.5 bg-red-200 dark:bg-red-700 hover:bg-red-300 dark:hover:bg-red-600 rounded text-xs font-bold';
        dismissBtn.title = "Dismiss";
        dismissBtn.onclick = async () => {
            try {
                if (isTimer) {
                    await window.electronAPI.invoke('dismiss-timer', item.id);
                } else {
                    await window.electronAPI.invoke('dismiss-alarm', item.id);
                }
                loadTimersAndAlarms(); // Refresh list
            } catch (error) {
                console.error(`[App] Error dismissing ${isTimer ? 'timer' : 'alarm'} ${item.id}:`, error);
            }
        };
        itemDiv.appendChild(dismissBtn);
        timersAlarmsContainer.appendChild(itemDiv);
    });
    updateTimersAndAlarmsDisplay(); // Initial display update
  }

  function updateTimersAndAlarmsDisplay() {
    activeTimers.forEach(timer => {
        const timeElement = document.getElementById(`timer-${timer.id}-time`);
        if (timeElement) {
            if (timer.triggered) {
                timeElement.textContent = 'Ended!';
                timeElement.closest('div').classList.add('opacity-50');
            } else {
                const endTime = timer.startTime + (timer.duration * 1000);
                const remaining = Math.max(0, endTime - Date.now());
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                timeElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                 if (remaining <= 0) { // Double check for immediate trigger if missed by checkTimersAndAlarms
                    checkTimersAndAlarms();
                }
            }
        }
    });

    activeAlarms.forEach(alarm => {
        const timeElement = document.getElementById(`alarm-${alarm.id}-time`);
        if (timeElement) {
            if (alarm.triggered) {
                timeElement.textContent = 'Triggered!';
                timeElement.closest('div').classList.add('opacity-50');
            } else {
                // Display target time
                let alarmTimeStr = alarm.time;
                try {
                    if (/^\d{2}:\d{2}$/.test(alarm.time)) { // HH:MM format
                        const [hours, minutes] = alarm.time.split(':');
                        const alarmDate = new Date();
                        alarmDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                        alarmTimeStr = alarmDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } else { // ISO string
                        alarmTimeStr = new Date(alarm.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month:'short' });
                    }
                } catch (e) { /* use original string if parse fails */ }
                timeElement.textContent = `at ${alarmTimeStr}`;
            }
        }
    });
  }


  async function checkTimersAndAlarms() {
    let changed = false;
    const now = Date.now();

    for (const timer of activeTimers) {
        if (timer.triggered) continue;
        const endTime = timer.startTime + (timer.duration * 1000);
        if (now >= endTime) {
            timer.triggered = true;
            changed = true;
            showInAppAlert('timer', 'Timer Ended!', `${timer.label || 'Your timer'} has finished.`, timer.chatId);
            try {
                await window.electronAPI.invoke('mark-timer-triggered', timer.id);
            } catch (error) {
                console.error(`[App] Error marking timer ${timer.id} as triggered:`, error);
            }
        }
    }

    for (const alarm of activeAlarms) {
        if (alarm.triggered) continue;
        let alarmTime;
        if (/^\d{2}:\d{2}$/.test(alarm.time)) { // HH:MM format
            const [hours, minutes] = alarm.time.split(':');
            alarmTime = new Date();
            alarmTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            // If alarm time for today has passed, set it for tomorrow (simple daily alarm)
            if (alarmTime.getTime() < now && (now - alarmTime.getTime()) > 60000 ) { // Check if it's significantly past
                 // This logic might need refinement for alarms set for "next HH:MM" vs specific date
            }
        } else { // ISO string
            alarmTime = new Date(alarm.time);
        }

        if (now >= alarmTime.getTime()) {
            alarm.triggered = true;
            changed = true;
            showInAppAlert('alarm', 'Alarm!', `${alarm.label || 'Your alarm'} is ringing.`, alarm.chatId);
            try {
                await window.electronAPI.invoke('mark-alarm-triggered', alarm.id);
            } catch (error) {
                console.error(`[App] Error marking alarm ${alarm.id} as triggered:`, error);
            }
        }
    }
    // Always update display for countdowns
    updateTimersAndAlarmsDisplay();
    if (changed) {
        // If a trigger happened, re-fetch to get the latest state from file (e.g. triggered status)
        // This might be redundant if mark-timer/alarm-triggered returns the updated list or if UI updates are sufficient
        // loadTimersAndAlarms();
    }
  }

  function showInAppAlert(type, title, message, chatId) {
    if (!inAppAlertsContainer) {
        console.warn('[App] inAppAlertsContainer not found in DOM.');
        return;
    }
    const alertId = `alert-${Date.now()}`;
    const alertDiv = document.createElement('div');
    alertDiv.id = alertId;
    alertDiv.className = `p-3 mb-2 rounded-md shadow-lg border ${type === 'timer' ? 'bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700' : 'bg-orange-50 dark:bg-orange-900 border-orange-300 dark:border-orange-700'} text-sm relative`;

    const titleEl = document.createElement('h4');
    titleEl.className = 'font-bold';
    titleEl.textContent = title;
    alertDiv.appendChild(titleEl);

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    alertDiv.appendChild(messageEl);

    if (chatId && window.loadChat) {
        const goToChatBtn = document.createElement('button');
        goToChatBtn.textContent = 'Go to Chat';
        goToChatBtn.className = 'mt-2 mr-2 px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs';
        goToChatBtn.onclick = () => {
            window.loadChat(chatId);
            alertDiv.remove();
        };
        alertDiv.appendChild(goToChatBtn);
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.className = 'mt-2 px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs';
    dismissBtn.onclick = () => alertDiv.remove();
    alertDiv.appendChild(dismissBtn);

    inAppAlertsContainer.appendChild(alertDiv);
    // Auto-dismiss after some time?
    setTimeout(() => {
        const stillExists = document.getElementById(alertId);
        if (stillExists) stillExists.remove();
    }, 30000); // 30 seconds
  }


  // --- Initial Setup ---
  // Apply initial theme and font
  await applyInitialTheme();
  await applyInitialFont();

  // Fetch config and populate model selector
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
    try {
      console.log('[App] Initializing personality selector component...');
      await personalitySelector.init(handleCurrentChatPersonalitySelect);
      console.log('[App] Personality selector initialized successfully');
      
      openPersonalitySelectorBtn.addEventListener('click', () => {
        personalitySelector.show();
      });
    } catch (error) {
      console.error('[App] Failed to initialize personality selector:', error);
      // Disable the button if initialization fails
      if (openPersonalitySelectorBtn) {
        openPersonalitySelectorBtn.disabled = true;
        openPersonalitySelectorBtn.title = 'Personality selector failed to load';
      }
    }
  } else {
    console.error("[App] Failed to initialize personality selector: Component or button not found.");
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

  // Load initial timers and alarms, and start checking interval
  await loadTimersAndAlarms();
  if (timersAlarmsInterval) clearInterval(timersAlarmsInterval);
  timersAlarmsInterval = setInterval(checkTimersAndAlarms, TIMERS_ALARMS_UI_UPDATE_INTERVAL);

  // --- Window Controls Logic ---
  const minimizeBtn = document.getElementById('minimizeBtn');
  const maximizeBtn = document.getElementById('maximizeBtn');
  const closeBtn = document.getElementById('closeBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      window.electronAPI.sendMessage('window-control', 'minimize');
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
      window.electronAPI.sendMessage('window-control', 'maximize');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.electronAPI.sendMessage('window-control', 'close');
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      console.log('[App] Settings button clicked!');
      const settingsModal = document.getElementById('settingsModal');
      console.log('[App] Settings modal element:', settingsModal);
      console.log('[App] Settings modal classes before:', settingsModal?.className);
      if (settingsModal) {
        settingsModal.style.display = 'flex'; // Assuming modal uses flex for layout
        settingsModal.style.visibility = 'visible'; // Ensure visibility
        settingsModal.style.opacity = '1'; // Ensure opacity
        
        // // Add debugging styles to ensure visibility
        // settingsModal.style.display = 'flex';
        // settingsModal.style.position = 'fixed';
        // settingsModal.style.top = '0';
        // settingsModal.style.left = '0';
        // settingsModal.style.width = '100vw';
        // settingsModal.style.height = '100vh';
        // settingsModal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        // settingsModal.style.zIndex = '9999';
        
        // console.log('[App] Settings modal classes after removing hidden:', settingsModal.className);
        // console.log('[App] Applied inline styles for debugging');
        // console.log('[App] Settings modal computed style display:', getComputedStyle(settingsModal).display);
        // console.log('[App] Settings modal computed style visibility:', getComputedStyle(settingsModal).visibility);
      } else {
        console.error('[App] Settings modal not found in DOM');
      }
    });
    console.log('[App] Settings button event listener added successfully');
  } else {
    console.error('[App] Settings button not found in DOM');
  }

  // Listen for maximized status from main process
  window.electronAPI.onMessage('window-maximized-status', (isMaximized) => {
    if (maximizeBtn) {
      const icon = maximizeBtn.querySelector('i');
      if (icon) {
        if (isMaximized) {
          icon.classList.remove('fa-window-maximize');
          icon.classList.add('fa-window-restore');
          maximizeBtn.setAttribute('aria-label', 'Restore');
        } else {
          icon.classList.remove('fa-window-restore');
          icon.classList.add('fa-window-maximize');
          maximizeBtn.setAttribute('aria-label', 'Maximize');
        }
      }
    }
  });

  console.log("[App] Frontend initialized.");

  // --- Streaming Control Functions ---
  function setStreamingState(streaming) {
    isStreaming = streaming;
    updateSendButtonState();
    
    // Disable/enable input fields during streaming
    userInput.disabled = streaming;
    if (expandedUserInput) {
      expandedUserInput.disabled = streaming;
    }
    
    // Disable expand button during streaming
    if (expandInputBtn) {
      expandInputBtn.disabled = streaming;
    }
  }

  function updateSendButtonState() {
    const buttons = [sendBtn, expandedSendBtn].filter(btn => btn);
    
    buttons.forEach(button => {
      if (isStreaming) {
        // Change to stop button
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
          </svg>
        `;
        button.title = "Stop Generation";
        button.classList.add('btn-stop');
        button.classList.remove('btn-primary');
      } else {
        // Change back to send button
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        `;
        button.title = isEditing ? "Save Edit" : "Send Message";
        button.classList.remove('btn-stop');
        button.classList.add('btn-primary');
      }
    });
  }

  function stopCurrentStream() {
    if (currentStreamAbortController) {
      console.log('[App] Stopping current stream...');
      currentStreamAbortController.abort();
      // Don't set to null yet - let the streamStopped event handler clean up
    }
    
    // Send stop message to main process
    window.electronAPI.sendMessage('stop-stream');
    
    // Don't reset streaming state here - let streamStopped event handler do it
    // Don't finalize partial response here - let streamStopped event handler do it
    
    console.log('[App] Stop request sent to main process');
  }
});
