// src/renderer/components/customDropdown.js

/**
 * Initializes a custom dropdown component based on a hidden select element.
 * Creates the button and options panel dynamically within the container.
 *
 * @param {string} containerId - The ID of the main container div where the custom dropdown will be built.
 * @param {string} hiddenSelectId - The ID of the hidden <select> element that holds the options and value.
 * @param {string} [buttonClasses='custom-select-button'] - CSS classes for the dropdown button.
 * @param {string} [dropdownPanelClasses='custom-select-panel'] - CSS classes for the dropdown panel.
 * @param {string} [optionClasses='custom-select-option'] - CSS classes for each option link.
 * @param {string} [defaultButtonText='Select an option'] - Default text for the button if no option is selected.
 * @param {function} [onSelectCallback=null] - Optional callback function executed when an option is selected. Passes the selected value.
 * @returns {object|null} An object with methods to interact with the dropdown, or null if initialization fails.
 */
function initializeCustomDropdown(
    containerId,
    hiddenSelectId,
    buttonClasses = 'custom-select-button inline-flex items-center justify-between w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500', // Example default classes
    dropdownPanelClasses = 'custom-select-panel origin-top-right absolute right-0 mt-2 w-full rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none hidden z-20 max-h-60 overflow-y-auto custom-scrollbar', // Example default classes
    optionClasses = 'custom-select-option block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900', // Example default classes
    defaultButtonText = 'Select an option',
    onSelectCallback = null
) {
    const container = document.getElementById(containerId);
    const originalSelect = document.getElementById(hiddenSelectId);

    if (!container || !originalSelect) {
        console.error(`CustomDropdown Init Error: Container ('${containerId}') or hidden select ('${hiddenSelectId}') not found.`);
        return null;
    }

    // Clear container in case of re-initialization
    container.innerHTML = '';

    // --- Create Dropdown Elements ---
    const dropdownButton = document.createElement('button');
    dropdownButton.id = `${containerId}-button`; // Assign dynamic ID
    dropdownButton.type = 'button';
    dropdownButton.className = buttonClasses; // Apply provided classes
    dropdownButton.setAttribute('aria-haspopup', 'listbox');
    dropdownButton.setAttribute('aria-expanded', 'false');

    const dropdownButtonText = document.createElement('span');
    dropdownButtonText.id = `${containerId}-button-text`; // Dynamic ID
    dropdownButtonText.className = 'truncate'; // Add truncate class
    dropdownButtonText.textContent = defaultButtonText; // Set default text initially

    const dropdownIcon = document.createElement('svg');
    dropdownIcon.className = 'ml-2 -mr-1 h-5 w-5 text-gray-400'; // Example icon classes
    dropdownIcon.xmlns = "http://www.w3.org/2000/svg";
    dropdownIcon.viewBox = "0 0 20 20";
    dropdownIcon.fill = "currentColor";
    dropdownIcon.setAttribute("aria-hidden", "true");
    dropdownIcon.innerHTML = '<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />';

    dropdownButton.appendChild(dropdownButtonText);
    dropdownButton.appendChild(dropdownIcon);

    const dropdownPanel = document.createElement('div');
    dropdownPanel.id = `${containerId}-panel`; // Dynamic ID
    dropdownPanel.className = dropdownPanelClasses; // Apply provided classes
    dropdownPanel.setAttribute('role', 'listbox');
    dropdownPanel.setAttribute('aria-labelledby', dropdownButton.id);

    const optionsContainer = document.createElement('div');
    optionsContainer.id = `${containerId}-options`; // Dynamic ID
    optionsContainer.className = 'py-1'; // Basic padding for options container
    optionsContainer.setAttribute('role', 'none');

    dropdownPanel.appendChild(optionsContainer);
    container.appendChild(dropdownButton);
    container.appendChild(dropdownPanel);

    // --- Dropdown State & Logic ---
    let isOpen = false;

    const populateOptions = () => {
        optionsContainer.innerHTML = '';
        let selectedText = '';
        let hasSelection = false;

        Array.from(originalSelect.options).forEach(option => {
            const optionElement = document.createElement('a');
            optionElement.href = '#';
            optionElement.className = optionClasses; // Apply provided classes
            optionElement.textContent = option.textContent;
            optionElement.dataset.value = option.value;
            optionElement.setAttribute('role', 'option'); // Use 'option' role

            if (option.selected) {
                optionElement.classList.add('selected');
                optionElement.setAttribute('aria-selected', 'true');
                selectedText = option.textContent;
                hasSelection = true;
            } else {
                 optionElement.setAttribute('aria-selected', 'false');
            }

            optionElement.addEventListener('click', (e) => {
                e.preventDefault();
                selectOption(optionElement);
                closeDropdown();
            });

            optionsContainer.appendChild(optionElement);
        });

        dropdownButtonText.textContent = hasSelection ? selectedText : defaultButtonText;
        if (hasSelection) {
             originalSelect.value = originalSelect.querySelector('option[selected]')?.value || originalSelect.options[0]?.value; // Ensure hidden select reflects initial state
        }
    };

    const selectOption = (selectedOptionElement) => {
        const value = selectedOptionElement.dataset.value;
        const text = selectedOptionElement.textContent;

        originalSelect.value = value;
        dropdownButtonText.textContent = text;

        optionsContainer.querySelectorAll('[role="option"]').forEach(el => {
            el.classList.remove('selected');
            el.setAttribute('aria-selected', 'false');
        });
        selectedOptionElement.classList.add('selected');
        selectedOptionElement.setAttribute('aria-selected', 'true');

        originalSelect.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`CustomDropdown (${containerId}): Selected ${value}`);

        if (typeof onSelectCallback === 'function') {
            try {
                onSelectCallback(value);
            } catch (error) {
                console.error(`CustomDropdown (${containerId}): Error in onSelectCallback:`, error);
            }
        }
    };

    const openDropdown = () => {
        if (isOpen) return;
        dropdownPanel.classList.remove('hidden');
        dropdownButton.setAttribute('aria-expanded', 'true');
        isOpen = true;
        document.addEventListener('click', handleClickOutside, true);
    };

    const closeDropdown = () => {
        if (!isOpen) return;
        dropdownPanel.classList.add('hidden');
        dropdownButton.setAttribute('aria-expanded', 'false');
        isOpen = false;
        document.removeEventListener('click', handleClickOutside, true);
    };

    const toggleDropdown = (event) => {
        event.stopPropagation();
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    };

    const handleClickOutside = (event) => {
        if (!container.contains(event.target)) {
            closeDropdown();
        }
    };

    // --- Event Listeners ---
    dropdownButton.addEventListener('click', toggleDropdown);
    dropdownButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDropdown(e); }
        else if (e.key === 'Escape' && isOpen) { closeDropdown(); }
        // Basic arrow key support could be added here to focus options
    });
    optionsContainer.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeDropdown(); dropdownButton.focus(); }
        // Arrow key navigation within options would go here
    });

    // --- Initialization ---
    populateOptions(); // Initial population based on potentially empty select
    console.log(`CustomDropdown component initialized for container '${containerId}'.`);

    // Listen for external updates to the hidden select's options
    originalSelect.addEventListener('optionsUpdated', () => {
        console.log(`CustomDropdown (${containerId}): Received 'optionsUpdated' event. Repopulating visual options.`);
        populateOptions(); // Re-populate visual dropdown
    });

    // Return API
    return {
        populateOptions,
        getSelectedValue: () => originalSelect.value,
        setSelectedValue: (value) => {
            const optionElement = optionsContainer.querySelector(`[data-value="${value}"]`);
            if (optionElement) {
                selectOption(optionElement);
            } else {
                console.warn(`CustomDropdown (${containerId}): Value "${value}" not found.`);
            }
        },
        open: openDropdown,
        close: closeDropdown,
        toggle: toggleDropdown,
        buttonElement: dropdownButton,
        panelElement: dropdownPanel
    };
}

// Make the function globally available
window.initializeCustomDropdown = initializeCustomDropdown;

// --- Initialize the Model Selector on DOMContentLoaded ---
// Note: This assumes the necessary HTML elements (container, hidden select) exist in index.html
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the model selector using the new generic function
    // We need to provide the specific IDs from index.html
    window.initializeCustomDropdown(
        'customModelSelector', // The container where the button/panel will be created
        'modelSelector',       // The ID of the hidden select element
        // Using default classes for button, panel, options
        'custom-select-button inline-flex items-center justify-between w-full rounded-md border border-transparent px-3 py-1 bg-white/10 text-[var(--header-text-color)]/90 hover:bg-white/20 focus:outline-none focus:ring-1 focus:ring-white/50 text-sm transition-colors', // Classes for the button
        'origin-top-left absolute left-0 mt-1 w-56 rounded-md shadow-lg bg-[var(--content-bg-color)] ring-1 ring-black ring-opacity-5 focus:outline-none hidden z-20 border border-[var(--border-color-soft)] max-h-60 overflow-y-auto custom-scrollbar', // Classes for the panel
        'custom-select-option block px-4 py-2 text-sm text-[var(--foreground-color)] hover:bg-[var(--chat-list-hover-bg)]', // Classes for options
        'Select Model'         // Default text for the model selector button
        // No specific onSelectCallback needed here for the model selector based on current code
    );

    // Note: The original script had specific IDs like 'modelSelectorBtn', 'modelSelectorBtnText', etc.
    // The refactored function now *creates* these elements dynamically inside the container.
    // Ensure the HTML structure for 'customModelSelector' and 'modelSelector' is correct.
});