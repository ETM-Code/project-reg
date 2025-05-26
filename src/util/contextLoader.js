// contextLoader.js - Loads context from files specified by contextSetIds in the configuration, including special handling for notes.
const fs = require('fs');
const path = require('path');
const settingsManager = require('../config/settingsManager'); // Import settingsManager
const { loadNotes } = require('../util/notesLoader'); // Import notes loader
const { app } = require('electron'); // Import app

const CONTEXT_SEPARATOR = "\n\n---\n\n"; // Define a clear separator

/**
 * Loads and concatenates the content from all sources specified by an array of context set IDs.
 * Handles regular context sets and the special "notes" ID.
 * @param {string[]} contextSetIds - An array of IDs for the context sets to load (must match IDs in config.json or be "notes").
 * @returns {string} The concatenated content of all sources, or an empty string if no valid IDs are provided or an error occurs.
 */
function loadContextFromIds(contextSetIds) {
  if (!Array.isArray(contextSetIds) || contextSetIds.length === 0) {
    console.warn('[contextLoader] No contextSetIds provided.');
    return '';
  }

  let combinedContext = '';
  const appRoot = app.getAppPath(); // Use app root path

  try {
    contextSetIds.forEach(id => {
      let contextPart = '';
      if (id === 'notes') {
        // Handle special "notes" ID
        try {
          const notesContent = loadNotes();
          if (notesContent) {
            contextPart = `Notes Context:\n${notesContent}`;
            console.log(`[contextLoader] Loaded notes context.`);
          } else {
            console.warn(`[contextLoader] No content returned from loadNotes().`);
          }
        } catch (notesError) {
          console.error(`[contextLoader] Error loading notes context:`, notesError);
        }
      } else {
        // Handle regular context set ID
        const contextSetConfig = settingsManager.getContextSetById(id);
        if (!contextSetConfig || !Array.isArray(contextSetConfig.paths) || contextSetConfig.paths.length === 0) {
          console.warn(`[contextLoader] Context set configuration not found or invalid for ID: ${id}`);
          return; // Skip this ID
        }

        let setContent = '';
        contextSetConfig.paths.forEach(relativePath => {
          // Resolve context file paths relative to the application root
          // relativePath is like "src/context/myContext.md"
          const absoluteContextPath = path.resolve(appRoot, relativePath);
          console.log(`[contextLoader] Attempting to load context file: ${absoluteContextPath} for set ID: ${id}`);

          try {
            if (fs.existsSync(absoluteContextPath)) {
              setContent += fs.readFileSync(absoluteContextPath, 'utf-8') + "\n\n"; // Add separator within the set
            } else {
              console.warn(`[contextLoader] Context file not found at path: ${absoluteContextPath} for set ID: ${id}`);
            }
          } catch (fileError) {
            console.error(`[contextLoader] Error reading context file ${absoluteContextPath}:`, fileError);
          }
        });
        if (setContent) {
           contextPart = `Context Set (${id}):\n${setContent.trim()}`;
        }
      }

      // Append the loaded part with a separator if it's not the first part and has content
      if (contextPart) {
        if (combinedContext) {
          combinedContext += CONTEXT_SEPARATOR;
        }
        combinedContext += contextPart;
      }
    });

  } catch (error) {
    console.error(`[contextLoader] Error processing contextSetIds:`, error);
    return ''; // Return empty string on general error
  }

  return combinedContext.trim(); // Trim final whitespace
}

module.exports = { loadContextFromIds }; // Export the updated function name
