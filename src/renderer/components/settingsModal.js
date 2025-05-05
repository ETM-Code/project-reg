

// src/renderer/components/settingsModal.js

document.addEventListener('DOMContentLoaded', () => {
  console.log('[SettingsModal] DOMContentLoaded event fired.'); // Log 1: Script start
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const themeSelector = document.getElementById('themeSelector');
  const personalitySelectorContainer = document.getElementById('personalitySelectorContainer');
  const personalitySelector = document.getElementById('personalitySelector'); // Hidden select
  const body = document.body;
  // New UI elements for personality details
  const personalityDetailsContainer = document.getElementById('personalityDetailsContainer');
  const personalityDescription = document.getElementById('personalityDescription');
  const contextSetsContainer = document.getElementById('contextSetsContainer');
  const customInstructionsContainer = document.getElementById('customInstructionsContainer');
  const customInstructionsTextarea = document.getElementById('customInstructionsTextarea');
  const savePersonalitySettingsBtn = document.getElementById('savePersonalitySettingsBtn');
  let currentEditingPersonalityId = null; // To store the ID of the personality being edited
  let isModalOpen = false; // Explicit state variable for the modal

  // API Key Elements
  const openaiApiKeyInput = document.getElementById('openaiApiKeyInput');
  const saveOpenaiApiKeyBtn = document.getElementById('saveOpenaiApiKeyBtn');
  const geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
  const saveGeminiApiKeyBtn = document.getElementById('saveGeminiApiKeyBtn');

  // Model Settings Elements
  const globalModelSelector = document.getElementById('globalModelSelector');
  const reasoningEffortGroup = document.getElementById('reasoningEffortGroup');
  const reasoningEffortSelector = document.getElementById('reasoningEffortSelector');


  if (!settingsBtn || !settingsModal || !closeSettingsBtn || !themeSelector || !personalitySelectorContainer || !personalitySelector || !personalityDetailsContainer || !personalityDescription || !contextSetsContainer || !customInstructionsContainer || !customInstructionsTextarea || !savePersonalitySettingsBtn || !openaiApiKeyInput || !saveOpenaiApiKeyBtn || !geminiApiKeyInput || !saveGeminiApiKeyBtn || !globalModelSelector || !reasoningEffortGroup || !reasoningEffortSelector) {
    console.error("SettingsModal: One or more required UI elements not found (including API key and Model elements).");
    // Be more specific in a real scenario about which element is missing
    return;
  }
  console.log('[SettingsModal] Required elements found.'); // Log 2: Elements found

  const THEME_STORAGE_KEY = 'app-theme';

  // Function to apply theme class to body
  const applyTheme = (theme) => {
    body.classList.remove('theme-light', 'theme-dark'); // Remove existing theme classes
    if (theme === 'light') {
      body.classList.add('theme-light');
    } else if (theme === 'dark') {
      body.classList.add('theme-dark');
    }
    // 'default' theme doesn't need a class, as :root variables apply
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    // Update selector to match applied theme
    themeSelector.value = theme;
    console.log(`Theme applied: ${theme}`);
  };

  // Load saved theme on startup
  const loadSavedTheme = () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'default'; // Default to 'default'
    applyTheme(savedTheme);
  };

  // --- API Key Management ---

  // Function to load API keys from main process
  const loadApiKeys = async () => {
    console.log("[SettingsModal] Requesting API keys...");
    if (window.electronAPI && window.electronAPI.invoke) {
        try {
            const keys = await window.electronAPI.invoke('get-api-keys');
            if (keys && !keys.error) {
                openaiApiKeyInput.value = keys.openai || '';
                geminiApiKeyInput.value = keys.gemini || '';
                console.log("[SettingsModal] API keys loaded into inputs.");
            } else {
                console.error("[SettingsModal] Failed to get API keys:", keys?.error || 'Unknown error');
                // Optionally display an error to the user
            }
        } catch (error) {
            console.error("[SettingsModal] Error invoking get-api-keys:", error);
            // Optionally display an error to the user
        }
    } else {
        console.error("[SettingsModal] electronAPI.invoke not available. Cannot load API keys.");
        // Disable inputs or show error
        openaiApiKeyInput.disabled = true;
        geminiApiKeyInput.disabled = true;
        saveOpenaiApiKeyBtn.disabled = true;
        saveGeminiApiKeyBtn.disabled = true;
    }
  };

  // Function to handle saving an API key
  const handleSaveApiKey = async (provider, key, buttonElement) => {
      console.log(`[SettingsModal] Attempting to save API key for ${provider}...`);
      const originalButtonText = buttonElement.textContent;
      buttonElement.textContent = 'Saving...';
      buttonElement.disabled = true;

      if (window.electronAPI && window.electronAPI.invoke) {
          try {
              const result = await window.electronAPI.invoke('save-api-key', { provider, key });
              if (result && result.success) {
                  console.log(`[SettingsModal] API key for ${provider} saved successfully.`);
                  buttonElement.textContent = 'Saved!';
                  buttonElement.classList.add('bg-green-500', 'hover:bg-green-600');
                  setTimeout(() => {
                      buttonElement.textContent = originalButtonText;
                      buttonElement.disabled = false;
                      buttonElement.classList.remove('bg-green-500', 'hover:bg-green-600');
                  }, 2000);
              } else {
                  console.error(`[SettingsModal] Failed to save API key for ${provider}:`, result?.error || 'Unknown error');
                  buttonElement.textContent = 'Error!';
                  buttonElement.classList.add('bg-red-500', 'hover:bg-red-600');
                   setTimeout(() => {
                      buttonElement.textContent = originalButtonText;
                      buttonElement.disabled = false;
                      buttonElement.classList.remove('bg-red-500', 'hover:bg-red-600');
                  }, 3000);
                  alert(`Error saving ${provider} key: ${result?.error || 'Unknown error'}`);
              }
          } catch (error) {
              console.error(`[SettingsModal] Error invoking save-api-key for ${provider}:`, error);
              buttonElement.textContent = 'Error!';
              buttonElement.classList.add('bg-red-500', 'hover:bg-red-600');
              setTimeout(() => {
                  buttonElement.textContent = originalButtonText;
                  buttonElement.disabled = false;
                  buttonElement.classList.remove('bg-red-500', 'hover:bg-red-600');
              }, 3000);
              alert(`An unexpected error occurred while saving the ${provider} key: ${error.message}`);
          }
      } else {
          console.error("[SettingsModal] electronAPI.invoke not available. Cannot save API key.");
          alert("Error: Cannot communicate with the main process to save settings.");
          buttonElement.textContent = originalButtonText; // Revert button text
          buttonElement.disabled = false;
      }
  };

  // --- Model Settings Management ---

  // Function to show/hide reasoning effort based on model ID
  const updateReasoningEffortVisibility = (modelId) => {
    // Simple check based on naming convention (adjust if needed)
    const isReasoningModel = modelId && (modelId.startsWith('o4') || modelId.startsWith('o3'));
    if (isReasoningModel) {
      reasoningEffortGroup.classList.remove('hidden');
      console.log(`[SettingsModal] Showing reasoning effort for model: ${modelId}`);
    } else {
      reasoningEffortGroup.classList.add('hidden');
      console.log(`[SettingsModal] Hiding reasoning effort for model: ${modelId}`);
    }
  };

  // Function to save a specific setting via IPC
  const saveModelSetting = async (key, value) => {
    console.log(`[SettingsModal] Attempting to save setting: ${key} = ${value}`);
    if (window.electronAPI && window.electronAPI.invoke) {
      try {
        const result = await window.electronAPI.invoke('save-setting', { key, value });
        if (result && result.success) {
          console.log(`[SettingsModal] Setting saved successfully: ${key} = ${value}`);
          // Optional: Add brief visual feedback if needed
        } else {
          console.error(`[SettingsModal] Failed to save setting ${key}:`, result?.error || 'Unknown error');
          // Optional: Show error to user
        }
      } catch (error) {
        console.error(`[SettingsModal] Error invoking save-setting for ${key}:`, error);
        // Optional: Show error to user
      }
    } else {
      console.error("[SettingsModal] electronAPI.invoke not available. Cannot save setting.");
      // Optional: Show error to user
    }
  };


  // Function to load model settings from main process
  const loadModelSettings = async () => {
    console.log("[SettingsModal] Requesting model settings...");
    if (window.electronAPI && window.electronAPI.invoke) {
      try {
        // Assuming 'get-settings' returns { availableModels: [{id, name}], defaultModel, reasoningEffort }
        const settings = await window.electronAPI.invoke('get-settings');
        if (settings && !settings.error) {
          console.log("[SettingsModal] Received settings:", settings);

          // Populate Model Selector
          globalModelSelector.innerHTML = ''; // Clear existing options (like "Loading...")
          if (settings.availableModels && settings.availableModels.length > 0) {
            settings.availableModels.forEach(model => {
              const option = document.createElement('option');
              option.value = model.id;
              // Use name if available, otherwise fallback to id
              option.textContent = model.name || model.id;
              globalModelSelector.appendChild(option);
            });
          } else {
             const option = document.createElement('option');
             option.value = '';
             option.textContent = 'No models available';
             option.disabled = true;
             globalModelSelector.appendChild(option);
          }

          // Set current selections
          globalModelSelector.value = settings.defaultModel || '';
          reasoningEffortSelector.value = settings.reasoningEffort || 'medium'; // Default to medium if not set

          // Update visibility of reasoning effort dropdown
          updateReasoningEffortVisibility(globalModelSelector.value);

          console.log("[SettingsModal] Model settings loaded and UI updated.");

        } else {
          console.error("[SettingsModal] Failed to get model settings:", settings?.error || 'Unknown error');
          globalModelSelector.innerHTML = '<option value="" disabled>Error loading models</option>';
        }
      } catch (error) {
        console.error("[SettingsModal] Error invoking get-settings:", error);
        globalModelSelector.innerHTML = '<option value="" disabled>Error loading models</option>';
      }
    } else {
      console.error("[SettingsModal] electronAPI.invoke not available. Cannot load model settings.");
      globalModelSelector.innerHTML = '<option value="" disabled>Error loading models</option>';
    }
  };


  // --- Event Listeners ---

  // Toggle modal visibility using explicit state variable
  settingsBtn.addEventListener('click', () => {
    console.log('[SettingsModal] settingsBtn clicked!');
    const currentModalElement = document.getElementById('settingsModal'); // Still need reference to modify
    if (!currentModalElement) {
        console.error('[SettingsModal] Could not find #settingsModal element inside click handler!');
        return;
    }

    if (isModalOpen) {
      // If state is open, close it
      currentModalElement.classList.remove('open');
      isModalOpen = false;
      console.log('[SettingsModal] State was open, now closing. isModalOpen =', isModalOpen);
    } else {
      // If state is closed, open it and load data
      currentModalElement.classList.add('open');
      isModalOpen = true;
      console.log('[SettingsModal] State was closed, now opening. isModalOpen =', isModalOpen);
      // Load data only when opening
      loadApiKeys();
      loadModelSettings();
    }
     console.log(`[SettingsModal] Modal final state based on variable: ${isModalOpen ? 'open' : 'closed'}.`);
  });

  // Close modal function - MUST also update the state variable
  const closeModal = () => {
      const currentModalElement = document.getElementById('settingsModal'); // Get fresh reference
      if (currentModalElement) {
          currentModalElement.classList.remove('open'); // Remove 'open' class to hide and transition out
      }
      isModalOpen = false; // Update state variable
      console.log('[SettingsModal] closeModal called. isModalOpen =', isModalOpen);
  }
  // Add listener to the dedicated close button in the header/footer
  closeSettingsBtn.addEventListener('click', closeModal);

  // Add listener to the generic close button in the footer (added in index.html)
  // Find the button within the modal footer if it exists
  const footerCloseButton = settingsModal.querySelector('.modal-footer .btn-secondary');
  if (footerCloseButton && footerCloseButton.textContent === 'Close') {
      footerCloseButton.addEventListener('click', closeModal);
  }


  // Close modal if clicking the background overlay (#settingsModal)
  settingsModal.addEventListener('click', (event) => {
      // The event target should be the overlay div itself (#settingsModal)
      if (event.target.id === 'settingsModal') {
          closeModal();
      }
  });


  // Change theme
  themeSelector.addEventListener('change', (event) => {
    applyTheme(event.target.value);
  });

  // Change Default Model
  globalModelSelector.addEventListener('change', (event) => {
    const selectedModelId = event.target.value;
    console.log(`[SettingsModal] Default model changed to: ${selectedModelId}`);
    updateReasoningEffortVisibility(selectedModelId);
    saveModelSetting('defaultModel', selectedModelId);
    // If the selected model is NOT a reasoning model, maybe save the default effort? Or leave it as is?
    // Let's leave it for now, it only applies when a reasoning model is active.
  });

  // Change Reasoning Effort
  reasoningEffortSelector.addEventListener('change', (event) => {
    const selectedEffort = event.target.value;
    console.log(`[SettingsModal] Reasoning effort changed to: ${selectedEffort}`);
    saveModelSetting('reasoningEffort', selectedEffort);
  });


  // --- Initial Load ---
  loadSavedTheme();
  // Don't load model settings here, wait for modal open

  // --- Personality Settings Logic ---

  // Function to display fetched personality details in the UI
  const displayPersonalityDetails = (details) => {
    console.log("[SettingsModal] Displaying details for:", details.id, details);
    currentEditingPersonalityId = details.id; // Store the ID

    // Display description
    personalityDescription.textContent = details.description || 'No description available.';

    // Display context sets
    contextSetsContainer.innerHTML = ''; // Clear previous checkboxes
    if (details.availableContextSetIds && details.availableContextSetIds.length > 0) {
      details.availableContextSetIds.forEach(setId => {
        const div = document.createElement('div');
        div.className = 'checkbox-group'; // Use the new group class

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `context-set-${setId}`;
        checkbox.value = setId;
        checkbox.checked = details.defaultContextSetIds.includes(setId);
        // Apply Tailwind classes directly or rely on CSS rule for input[type="checkbox"] inside #settingsModal
        // checkbox.className = 'h-4 w-4 rounded border-[var(--input-border-color)] text-[var(--primary-color)] focus:ring-[var(--primary-color)] focus:ring-offset-0 cursor-pointer';

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = setId; // Display the ID as the label
        // Apply Tailwind classes directly or rely on CSS rule for label inside .checkbox-group
        // label.className = 'ml-2 block text-sm font-normal text-[var(--foreground-color)]';

        div.appendChild(checkbox);
        div.appendChild(label);
        contextSetsContainer.appendChild(div);
      });
    } else {
      contextSetsContainer.textContent = 'No context sets available for this personality.';
    }

    // Display custom instructions
    if (details.allowCustomInstructions) {
      customInstructionsContainer.classList.remove('hidden');
      customInstructionsTextarea.value = details.customInstructions || '';
      customInstructionsTextarea.disabled = false;
    } else {
      customInstructionsContainer.classList.add('hidden');
      customInstructionsTextarea.value = '';
      customInstructionsTextarea.disabled = true;
    }

    // Update save button
    savePersonalitySettingsBtn.textContent = `Save Settings for ${details.name}`;
    savePersonalitySettingsBtn.disabled = false;

    // Show the details container
    personalityDetailsContainer.classList.remove('hidden');
  };

  // Function to handle selection change in the settings modal's personality dropdown
  const handleSettingsPersonalityChange = async (selectedId) => {
      console.log(`[SettingsModal] Personality selected: ${selectedId}`);
      if (!selectedId) {
          personalityDetailsContainer.classList.add('hidden'); // Hide details if no selection
          currentEditingPersonalityId = null;
          savePersonalitySettingsBtn.disabled = true;
          return;
      }
      try {
          // Use the exposed API from preload script
          if (window.electronAPI && window.electronAPI.invoke) {
              console.log(`[SettingsModal] Fetching details for ${selectedId}...`);
              const details = await window.electronAPI.invoke('get-personality-details', selectedId);
              if (details) {
                  displayPersonalityDetails(details);
              } else {
                  console.error(`[SettingsModal] No details received for personality ID: ${selectedId}`);
                  personalityDetailsContainer.classList.add('hidden');
                  currentEditingPersonalityId = null;
                  savePersonalitySettingsBtn.disabled = true;
                  // Optionally show an error message to the user
              }
          } else {
              console.error("[SettingsModal] electronAPI.invoke not available. Cannot fetch personality details.");
              // Handle error - maybe disable the feature or show a message
          }
      } catch (error) {
          console.error(`[SettingsModal] Error fetching personality details for ${selectedId}:`, error);
          personalityDetailsContainer.classList.add('hidden');
          currentEditingPersonalityId = null;
          savePersonalitySettingsBtn.disabled = true;
          // Optionally show an error message to the user
      }
  };


  // Function to populate and initialize the custom personality dropdown
  // This is called by app.js after fetching personalities initially
  window.updatePersonalityDropdown = (personalities, currentDefaultId) => {
    console.log("[SettingsModal] Updating personality dropdown. Count:", personalities.length, "Default ID:", currentDefaultId);
    // Check if the container element and the initialize function exist
    if (!personalitySelectorContainer || !window.initializeCustomDropdown) {
        console.error("[SettingsModal] Cannot update dropdown: container element or initialize function missing.");
        // Clear container and show error message or disable
        personalitySelectorContainer.innerHTML = '<p class="text-red-500 text-sm">Error loading personality selector.</p>';
        personalityDetailsContainer.classList.add('hidden');
        savePersonalitySettingsBtn.disabled = true;
        return;
    }
     // Ensure the hidden select exists, otherwise log error but maybe proceed if dropdown can handle it
    if (!personalitySelector) {
         console.error("[SettingsModal] Hidden personality select element (#personalitySelector) not found. Dropdown might malfunction.");
         // Depending on initializeCustomDropdown robustness, might still attempt init
    }


    // Clear existing hidden options (important before populating)
    if (personalitySelector) {
        personalitySelector.innerHTML = '';
    } else {
        // If hidden select is missing, we cannot proceed with populating it.
        // The initializeCustomDropdown might still create the UI but it won't have options.
         console.error("[SettingsModal] Cannot populate hidden select options as #personalitySelector is missing.");
         // Optionally clear the container and show an error state
         personalitySelectorContainer.innerHTML = '<p class="text-red-500 text-sm">Error: Configuration issue (missing select).</p>';
         return; // Stop if the hidden select is crucial
    }


    // Populate hidden select options
    personalities.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name; // Assuming personality object has 'id' and 'name'
        if (p.id === currentDefaultId) {
            option.selected = true;
        }
        personalitySelector.appendChild(option);
    });

    // Initialize the custom dropdown UI component using the new function signature
    // It will create the button and panel inside 'personalitySelectorContainer'
    window.initializeCustomDropdown(
        'personalitySelectorContainer', // ID of the container
        'personalitySelector',          // ID of the hidden select
        // Provide appropriate CSS classes (can be customized or use defaults)
        'custom-select-button select-base focus:ring-1 w-full', // Example classes for the button
        'custom-select-panel origin-top-right absolute right-0 mt-2 w-full rounded-md shadow-lg bg-[var(--content-bg-color)] ring-1 ring-black ring-opacity-5 focus:outline-none hidden z-30 max-h-48 overflow-y-auto custom-scrollbar border border-[var(--border-color-soft)]', // Example classes for the panel (increased z-index)
        'custom-select-option block px-4 py-2 text-sm text-[var(--foreground-color)] hover:bg-[var(--content-bg-color-alt)]', // Example classes for options
        'Select Personality',           // Default button text
        handleSettingsPersonalityChange // Callback function when selection changes
    );

    // Trigger initial load of details for the currently selected personality in the dropdown
    const initiallySelectedId = personalitySelector.value;
    if (initiallySelectedId) {
        handleSettingsPersonalityChange(initiallySelectedId);
    } else {
        personalityDetailsContainer.classList.add('hidden'); // Hide if nothing selected initially
        savePersonalitySettingsBtn.disabled = true;
    }

    console.log("[SettingsModal] Personality dropdown initialized/updated.");
  };

  // Initial population attempt (if app.js loads personalities before this runs)
  // This might run before app.js fetches, so the updatePersonalityDropdown exposed above is crucial
  const initialPersonalities = window.getAvailablePersonalities ? window.getAvailablePersonalities() : [];
  const initialDefaultId = window.getCurrentDefaultPersonalityId ? window.getCurrentDefaultPersonalityId() : null;
  if (initialPersonalities.length > 0) {
      console.log("[SettingsModal] Populating dropdown with initially available data.");
      window.updatePersonalityDropdown(initialPersonalities, initialDefaultId);
  } else {
      console.log("[SettingsModal] No initial personalities found, waiting for app.js update.");
      // Display a loading state *if* initializeCustomDropdown wasn't called yet
      // (e.g., if personalities array was empty initially)
      // The new initializeCustomDropdown handles the button creation, so we just ensure
      // the container shows something sensible if it remains empty.
      if (personalitySelectorContainer.innerHTML.trim() === '') {
           personalitySelectorContainer.innerHTML = '<p class="text-sm text-[var(--foreground-color-muted)]">Loading personalities...</p>';
      }
      personalityDetailsContainer.classList.add('hidden'); // Hide details section initially or while loading
      savePersonalitySettingsBtn.disabled = true; // Disable save button initially
    }

  // --- Save Button Logic ---
  savePersonalitySettingsBtn.addEventListener('click', async () => {
    if (!currentEditingPersonalityId) {
      console.error("[SettingsModal] No personality selected to save settings for.");
      // Optionally show user feedback
      return;
    }

    // Gather selected context sets
    const selectedContextSetIds = Array.from(contextSetsContainer.querySelectorAll('input[type="checkbox"]:checked'))
                                     .map(checkbox => checkbox.value);

    // Gather custom instructions (only if the textarea is enabled/visible)
    let customInstructions = null;
    if (!customInstructionsContainer.classList.contains('hidden')) {
        customInstructions = customInstructionsTextarea.value;
    }

    const updatedSettings = {
      defaultContextSetIds: selectedContextSetIds,
      customInstructions: customInstructions,
    };

    console.log(`[SettingsModal] Saving settings for ${currentEditingPersonalityId}:`, updatedSettings);

    try {
      if (window.electronAPI && window.electronAPI.invoke) {
        const result = await window.electronAPI.invoke('save-personality-settings', {
          personalityId: currentEditingPersonalityId,
          updatedSettings: updatedSettings
        });

        if (result && result.success) {
          console.log(`[SettingsModal] Settings saved successfully for ${currentEditingPersonalityId}.`);
          // Optional: Show a temporary success message to the user
          const originalText = savePersonalitySettingsBtn.textContent;
          savePersonalitySettingsBtn.textContent = 'Saved!';
          savePersonalitySettingsBtn.classList.add('bg-green-500', 'hover:bg-green-600'); // Indicate success
          setTimeout(() => {
            savePersonalitySettingsBtn.textContent = originalText;
            savePersonalitySettingsBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
          }, 2000); // Revert after 2 seconds
        } else {
          console.error(`[SettingsModal] Failed to save settings for ${currentEditingPersonalityId}:`, result ? result.error : 'Unknown error');
          // Optional: Show an error message to the user
          alert(`Error saving settings: ${result?.error || 'Unknown error'}`);
        }
      } else {
        console.error("[SettingsModal] electronAPI.invoke not available. Cannot save settings.");
        alert("Error: Cannot communicate with the main process to save settings.");
      }
    } catch (error) {
      console.error(`[SettingsModal] Error calling save-personality-settings IPC for ${currentEditingPersonalityId}:`, error);
      alert(`An unexpected error occurred while saving settings: ${error.message}`);
    }
  });

  // --- End Personality Settings Logic ---

  // --- API Key Save Button Listeners ---
  saveOpenaiApiKeyBtn.addEventListener('click', () => {
      handleSaveApiKey('openai', openaiApiKeyInput.value, saveOpenaiApiKeyBtn);
  });

  saveGeminiApiKeyBtn.addEventListener('click', () => {
      handleSaveApiKey('gemini', geminiApiKeyInput.value, saveGeminiApiKeyBtn);
  });

  console.log("SettingsModal component initialized.");
});