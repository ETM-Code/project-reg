// src/renderer/components/settingsModal.js

document.addEventListener('DOMContentLoaded', () => {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const themeSelector = document.getElementById('themeSelector');
  const body = document.body;

  if (!settingsBtn || !settingsModal || !closeSettingsBtn || !themeSelector) {
    console.error("SettingsModal: One or more required elements not found.");
    return;
  }

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

  // --- Event Listeners ---

  // Open modal
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    settingsModal.classList.add('fade-in'); // Optional fade-in
  });

  // Close modal
  const closeModal = () => {
      // Optional fade-out can be added here with a timeout before hiding
      settingsModal.classList.add('hidden');
      settingsModal.classList.remove('fade-in');
  }
  closeSettingsBtn.addEventListener('click', closeModal);

  // Close modal if clicking outside the content area
  settingsModal.addEventListener('click', (event) => {
      // Check if the click target is the modal background itself
      if (event.target === settingsModal) {
          closeModal();
      }
  });


  // Change theme
  themeSelector.addEventListener('change', (event) => {
    applyTheme(event.target.value);
  });

  // --- Initial Load ---
  loadSavedTheme();

  console.log("SettingsModal component initialized.");
});