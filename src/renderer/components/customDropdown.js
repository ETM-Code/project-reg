// src/renderer/components/customDropdown.js

document.addEventListener('DOMContentLoaded', () => {
    const customSelector = document.getElementById('customModelSelector');
    const originalSelect = document.getElementById('modelSelector'); // The hidden original select
    const dropdownButton = document.getElementById('modelSelectorBtn');
    const dropdownButtonText = document.getElementById('modelSelectorBtnText');
    const dropdownPanel = document.getElementById('modelSelectorDropdown');
    const optionsContainer = document.getElementById('modelSelectorOptions');

    if (!customSelector || !originalSelect || !dropdownButton || !dropdownPanel || !optionsContainer || !dropdownButtonText) {
        console.error("CustomDropdown: One or more required elements not found.");
        return;
    }

    // --- Populate Custom Dropdown from Original Select ---
    const populateOptions = () => {
        optionsContainer.innerHTML = ''; // Clear existing options
        let selectedText = '';

        Array.from(originalSelect.options).forEach(option => {
            const optionElement = document.createElement('a');
            optionElement.href = '#'; // Use href='#' for link behavior
            optionElement.classList.add('custom-select-option');
            optionElement.textContent = option.textContent;
            optionElement.dataset.value = option.value;
            optionElement.setAttribute('role', 'menuitem');

            if (option.selected) {
                optionElement.classList.add('selected');
                selectedText = option.textContent; // Get text of initially selected option
            }

            optionElement.addEventListener('click', (e) => {
                e.preventDefault();
                selectOption(optionElement);
                closeDropdown();
            });

            optionsContainer.appendChild(optionElement);
        });

        // Set initial button text
        dropdownButtonText.textContent = selectedText || 'Select Model';
    };

    // --- Select Option Logic ---
    const selectOption = (selectedOptionElement) => {
        const value = selectedOptionElement.dataset.value;
        const text = selectedOptionElement.textContent;

        // Update hidden select value
        originalSelect.value = value;

        // Update button text
        dropdownButtonText.textContent = text;

        // Update selected class in custom options
        optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
            el.classList.remove('selected');
        });
        selectedOptionElement.classList.add('selected');

        // Optional: Dispatch a change event on the hidden select if other scripts rely on it
        originalSelect.dispatchEvent(new Event('change', { bubbles: true }));

        console.log(`CustomDropdown: Selected ${value}`);
    };

    // --- Toggle Dropdown ---
    const openDropdown = () => {
        dropdownPanel.classList.add('open');
        dropdownButton.setAttribute('aria-expanded', 'true');
        // Add event listener to close when clicking outside
        document.addEventListener('click', handleClickOutside, true); // Use capture phase
    };

    const closeDropdown = () => {
        dropdownPanel.classList.remove('open');
        dropdownButton.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', handleClickOutside, true);
    };

    const toggleDropdown = () => {
        if (dropdownPanel.classList.contains('open')) {
            closeDropdown();
        } else {
            openDropdown();
        }
    };

    // --- Handle Click Outside ---
    const handleClickOutside = (event) => {
        if (!customSelector.contains(event.target)) {
            closeDropdown();
        }
    };

    // --- Event Listeners ---
    dropdownButton.addEventListener('click', toggleDropdown);

    // Keyboard navigation (basic)
    dropdownButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleDropdown();
        } else if (e.key === 'Escape' && dropdownPanel.classList.contains('open')) {
            closeDropdown();
        }
    });

     optionsContainer.addEventListener('keydown', (e) => {
         if (e.key === 'Escape') {
             closeDropdown();
             dropdownButton.focus();
         }
         // Add ArrowUp/ArrowDown/Enter key handling here for better accessibility if needed
     });


    // --- Initialization ---
    populateOptions();
    // Set initial aria-expanded state
    dropdownButton.setAttribute('aria-expanded', 'false');

    console.log("CustomDropdown component initialized.");
});