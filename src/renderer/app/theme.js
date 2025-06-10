// src/renderer/app/theme.js

export function applyTheme(themeName) {
  document.body.classList.remove('theme-dark', 'theme-light');
  if (themeName === 'dark') {
    document.body.classList.add('theme-dark');
  } else if (themeName === 'light') {
    document.body.classList.add('theme-light');
  }
  console.log(`[App] Theme applied: ${themeName}`);
}

export async function applyInitialTheme() {
  try {
    const result = await window.electronAPI.settingsManager.getGlobalSetting('theme');
    let currentTheme;
    if (result && result.success) {
      currentTheme = result.value;
    } else if (typeof result === 'string') {
      currentTheme = result;
    } else {
      console.warn('[App] Unexpected theme result format:', result);
      currentTheme = null;
    }
    const themeToApply = currentTheme || 'dark';
    console.log(`[App] Initial theme loaded: ${themeToApply}`);
    applyTheme(themeToApply);
  } catch (error) {
    console.error('[App] Error loading initial theme:', error);
    applyTheme('dark');
  }
}