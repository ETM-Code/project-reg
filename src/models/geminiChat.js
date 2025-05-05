// src/models/geminiChat.js - Gemini integration using @google/genai, implementing AIModelInterface
const AIModelInterface = require('./AIModelInterface');
const settingsManager = require('../config/settingsManager');
const { loadPromptById } = require('../util/promptLoader');
const { loadContextFromIds } = require('../util/contextLoader'); // Updated import

// Import necessary components from @google/genai
const genai = require('@google/genai');
const GoogleGenerativeAI = genai.GoogleGenerativeAI;
// const HarmCategory = genai.HarmCategory; // Keep if safety settings are needed
// const HarmBlockThreshold = genai.HarmBlockThreshold; // Keep if safety settings are needed

class GeminiChat extends AIModelInterface {
  constructor() {
    super();
    this.genAI = null;
    this.modelName = null;
    this.apiKey = null;
    this.personality = null;
  }

  /**
   * @override
   * @param {import('./AIModelInterface').ModelInitializationConfig} config
   */
  initialize(config) {
    console.log(`[GeminiChat] Initializing with model: ${config.modelName}`);
    this.modelName = config.modelName;
    this.personality = config.personality;

    // 1. Try getting the API key from settingsManager
    let finalApiKey = settingsManager.getApiKey('gemini');

    // 2. If not found in settings, try the environment variable
    if (!finalApiKey) {
      console.log('[GeminiChat] Gemini API key not found in settings, checking environment variable...');
      finalApiKey = process.env.GEMINI_API_KEY;
    } else {
      console.log('[GeminiChat] Using Gemini API key from settings.');
    }

    // 3. Check if the API key is still missing after checking both sources
    if (!finalApiKey) {
      console.warn('[GeminiChat] Gemini API key is missing or empty in both settings (config.json) and the GEMINI_API_KEY environment variable.');
      return false; // Indicate initialization failure
    }

    // Store the final key if needed elsewhere (optional)
    // this.apiKey = finalApiKey;

    // 4. Initialize the client with the final key
    try {
      this.genAI = new GoogleGenerativeAI(finalApiKey);
      console.log("[GeminiChat] GoogleGenAI client initialized successfully.");
      return true; // Indicate successful initialization
    } catch (error) {
      console.error("[GeminiChat] Failed to initialize GoogleGenAI client (key might be invalid):", error);
      // Return false even if key was present but initialization failed for other reasons
      return false;
    }
  }

  /**
   * Transforms conversation history into the format expected by Gemini API.
   * @private
   * @param {Array<object>} conversationHistory - The internal history format.
   * @returns {Array<object>} History formatted for Gemini.
   */
  _transformHistory(conversationHistory) {
      // Gemini expects roles 'user', 'model', and 'function' (for tool responses)
      // It expects 'parts' to be an array.
      // Ensure tool calls ('functionCall') and responses ('functionResponse') are nested correctly.
      return conversationHistory.map(msg => {
          const newMsg = {
              role: msg.role === 'tool' ? 'function' : msg.role, // Map 'tool' role to 'function'
              parts: [],
          };

          if (msg.role === 'user') {
              newMsg.parts.push({ text: msg.parts[0]?.text || '' });
          } else if (msg.role === 'model') {
              // Model response might contain text and/or function calls
              if (msg.parts[0]?.text) {
                  newMsg.parts.push({ text: msg.parts[0].text });
              }
              // Check for Gemini's function call structure (might be directly on msg or within parts)
              // Assuming chatManager stores it consistently, e.g., msg.functionCall
              if (msg.functionCall) { // Adjust if chatManager stores it differently
                  newMsg.parts.push({ functionCall: msg.functionCall });
              } else if (msg.parts.some(p => p.functionCall)) {
                   // Handle cases where functionCall might be nested within parts by chatManager
                   msg.parts.forEach(part => {
                       if(part.functionCall) newMsg.parts.push({ functionCall: part.functionCall });
                   });
              }
          } else if (msg.role === 'tool') {
              // Gemini expects function responses under the 'function' role
              // Assuming chatManager stores the necessary info (name, response content)
              // The response content should be the result object from the tool execution
              newMsg.parts.push({
                  functionResponse: {
                      name: msg.name, // Tool name from chatManager history
                      response: msg.content, // Result object from chatManager history
                  }
              });
          }
          return newMsg;
      }).filter(msg => msg.parts.length > 0); // Remove messages with no parts
  }


  /**
   * @override
   * @param {Array<object>} history
   * @param {string} message - The latest user message.
   * @param {import('./AIModelInterface').SendMessageOptions} [options]
   * @returns {Promise<import('./AIModelInterface').SendMessageResult>}
   */
  async sendMessageStream(history, message, options = {}) {
    if (!this.genAI) {
      throw new Error("[GeminiChat] GoogleGenAI client not initialized. Call initialize() first.");
    }

    // Determine System Prompt, Custom Instructions, and Context
    const promptIdToLoad = this.personality?.promptId; // Get the prompt ID
    console.log(`[GeminiChat sendMessageStream] Attempting to load prompt with ID: ${promptIdToLoad}`); // Log it
    const basePrompt = options.systemPromptOverride || loadPromptById(promptIdToLoad); // Use the variable
    const customInstructions = this.personality?.customInstructions || '';
    // Load context using the defaultContextSetIds from the personality config
    const contextText = options.contextOverride || loadContextFromIds(this.personality?.defaultContextSetIds || []); // Use defaultContextSetIds

    let finalSystemPromptContent = `USER CONTEXT:\n${contextText}\n\nSYSTEM PROMPT:\n${basePrompt}`;
    if (customInstructions.trim()) {
        finalSystemPromptContent += `\n\n--- Custom Instructions ---\n${customInstructions}`;
    }

    // Transform history
// --- Add Logging Here ---
    console.log("--- DEBUG: Prompt Components (Gemini) ---");
    console.log("Base Prompt ID:", this.personality?.promptId);
    console.log("Custom Instructions:", customInstructions);
    console.log("Context Set IDs:", this.personality?.defaultContextSetIds);
    console.log("Context Text:", contextText);
    console.log("Final System Instruction Content (before transform):", finalSystemPromptContent);
    // --- End Logging ---
    const geminiHistory = this._transformHistory(history);

    // Determine tools for this call (Gemini format)
    // Assuming tool declarations are stored in personality or passed via options
    // and are already in the format Gemini expects.
    const toolsForApi = options.tools || settingsManager.getPersonalityById(this.personality?.id)?.tools || [];
    // Convert tool names from chatManager format (e.g., MakeNote) to snake_case if needed by Gemini API
    const geminiTools = toolsForApi.map(tool => {
        if (typeof tool === 'string') { // If just names are provided by personality
             // Basic conversion, might need refinement based on actual tool structure
             const snakeCaseName = tool.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, '');
             // Need the full tool declaration structure here - this part requires knowing the expected format
             // Placeholder: Assuming the full declaration is needed, not just the name
             console.warn(`[GeminiChat] Tool '${tool}' needs full declaration structure for Gemini.`);
             // Find the full declaration (e.g., from chatManager's original list or a new config section)
             // This highlights a dependency - how are full tool schemas managed/accessed now?
             // For now, return a placeholder structure - THIS NEEDS TO BE FIXED
             return { name: snakeCaseName, description: `Action: ${tool}`, parameters: { type: "object", properties: {} } };
        }
        // If full declaration is already provided
        return tool;
    });


    console.log(`[GeminiChat] Sending message to ${this.modelName}. History length: ${geminiHistory.length}`);
     if (geminiTools.length > 0) {
        console.log(`[GeminiChat] Providing tools:`, JSON.stringify(geminiTools.map(t => t.name || t.functionDeclarations?.[0]?.name), null, 2)); // Log tool names
    }

    try {
      const modelInstance = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction: { parts: [{ text: finalSystemPromptContent }] }, // Use the combined prompt and context
        tools: geminiTools.length > 0 ? [{ functionDeclarations: geminiTools }] : undefined, // Wrap in expected structure
        toolConfig: geminiTools.length > 0 ? { functionCallingConfig: { mode: 'AUTO' } } : undefined,
        // Add safety settings if configured/needed
      });

      const chat = modelInstance.startChat({
        history: geminiHistory,
        // generationConfig: { temperature: 0.7 } // Add if needed
      });

      const result = await chat.sendMessageStream(message || ""); // Send message

      console.log("[GeminiChat] Stream obtained successfully.");
      // Gemini's result includes stream and response promise
      return { stream: result.stream, response: result.response };

    } catch (error) {
      console.error(`[GeminiChat] Error sending message or starting chat (${this.modelName}):`, error);
      // Log more details if helpful
      console.error(`[GeminiChat] History used:`, JSON.stringify(geminiHistory.slice(-2))); // Log last few history items
      console.error(`[GeminiChat] Tools used:`, JSON.stringify(geminiTools));
      throw error; // Re-throw the error
    }
  }

  /**
   * @override
   */
  getModelName() {
    return this.modelName;
  }

  /**
   * @override
   */
  getImplementationType() {
    return 'gemini';
  }
}

module.exports = GeminiChat;
