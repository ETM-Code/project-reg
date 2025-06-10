// src/renderer/app/font.js

export async function applyInitialFont() {
  try {
    const fontSettings = await window.electronAPI.invoke('settings:get-font-settings');
    console.log('[App] Received fontSettings for initial apply:', JSON.stringify(fontSettings));

    if (fontSettings && fontSettings.defaultFont && Array.isArray(fontSettings.availableFonts)) {
      const defaultFontName = fontSettings.defaultFont;
      const defaultFontObject = fontSettings.availableFonts.find(f => f.name === defaultFontName);

      if (defaultFontObject && defaultFontObject.cssName) {
        document.body.style.setProperty('--font-family-base', defaultFontObject.cssName);
        console.log(`[App] Initial font applied: ${defaultFontName} (${defaultFontObject.cssName})`);
      } else {
        console.warn(`[App] Default font '${defaultFontName}' not found in availableFonts or missing cssName. Using fallback.`);
        document.body.style.setProperty('--font-family-base', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
      }
    } else {
      console.error('[App] Invalid or incomplete fontSettings received for initial apply. Using fallback.', fontSettings);
      document.body.style.setProperty('--font-family-base', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
    }
  } catch (error) {
    console.error('[App] Error applying initial font:', error);
    document.body.style.setProperty('--font-family-base', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
  }
}