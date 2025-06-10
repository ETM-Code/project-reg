// src/models/gptChat.js - GPT implementation using OpenAI's API, implementing AIModelInterface
const OpenAI = require("openai");
const AIModelInterface = require('./AIModelInterface');
const settingsManager = require('../config/settingsManager');
const { loadPromptById } = require('../util/promptLoader');
const { loadContextFromIds } = require('../util/contextLoader'); // Updated import

class GPTChat extends AIModelInterface {
  constructor() {
    super();
    this.openaiClient = null;
    this.modelName = null;
    this.apiKey = null;
    this.personality = null; // Store the personality config used during init
  }

  /**
   * @override
   * @param {import('./AIModelInterface').ModelInitializationConfig} config
   */
  initialize(config) {
    console.log(`[GPTChat] Initializing with model ID: ${config.modelId}`); // Use config.modelId
    this.modelName = config.modelId; // Use config.modelId
    this.personality = config.personality; // Store for later use if needed

    // 1. Try getting the API key from settingsManager
    let finalApiKey = settingsManager.getApiKey('openai');

    // 2. If not found in settings, try the environment variable
    if (!finalApiKey) {
      console.log('[GPTChat] OpenAI API key not found in settings, checking environment variable...');
      finalApiKey = process.env.OPENAI_API_KEY;
    } else {
      console.log('[GPTChat] Using OpenAI API key from settings.');
    }

    // 3. Check if the API key is still missing after checking both sources
    if (!finalApiKey) {
      console.warn('[GPTChat] OpenAI API key is missing or empty in both settings (config.json) and the OPENAI_API_KEY environment variable.');
      return false; // Indicate initialization failure
    }

    // Store the final key if needed elsewhere (optional)
    // this.apiKey = finalApiKey;

    // 4. Initialize the client with the final key
    try {
        this.openaiClient = new OpenAI({ apiKey: finalApiKey });
        console.log("[GPTChat] OpenAI client initialized successfully.");
        return true; // Indicate successful initialization
    } catch (error) {
        console.error("[GPTChat] Failed to initialize OpenAI client (key might be invalid):", error);
        // Return false even if key was present but initialization failed for other reasons
        return false;
    }
  }

  /**
   * Transforms conversation history into the format expected by OpenAI API.
   * @private
   * @param {Array<object>} conversationHistory - The internal history format.
   * @param {string} systemPrompt - The system prompt content.
   * @param {string} contextText - The context content.
   * @returns {Array<object>} Messages formatted for OpenAI.
   */
  _transformHistory(conversationHistory, finalSystemPrompt, contextText) {
    const messages = [];

    // Use a system message for core instructions and context
    messages.push({
      role: "system",
      content: `USER CONTEXT:\n${contextText}\n\nSYSTEM PROMPT:\n${finalSystemPrompt}` // Use the combined prompt
    });

    // Append the conversation history
    for (const msg of conversationHistory) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.parts[0].text });
      } else if (msg.role === "model") {
        // Check if the model message includes tool_calls (GPT format)
        if (msg.rawToolData && msg.rawToolData.length > 0) { // Check msg.rawToolData
          messages.push({ role: "assistant", content: msg.parts[0].text || null, tool_calls: msg.rawToolData }); // Use msg.rawToolData
        } else {
          messages.push({ role: "assistant", content: msg.parts[0].text });
        }
      } else if (msg.role === "tool") {
        // Add tool responses to the history for GPT
        messages.push({ role: "tool", tool_call_id: msg.toolCallId, name: msg.name, content: JSON.stringify(msg.content) }); // Use msg.toolCallId for the value
      }
    }
    return messages;
  }

  /**
   * @override
   * @param {Array<object>} history
   * @param {string} message - The latest user message (not directly used here as history includes it).
   * @param {import('./AIModelInterface').SendMessageOptions} [options]
   * @returns {Promise<import('./AIModelInterface').SendMessageResult>}
   */
  async sendMessageStream(history, message, options = {}) {
    if (!this.openaiClient) {
      throw new Error("[GPTChat] OpenAI client not initialized. Call initialize() first.");
    }

    // Determine System Prompt, Custom Instructions, and Context
    const promptIdToLoad = this.personality?.promptId; // Get the prompt ID
    console.log(`[GPTChat sendMessageStream] Attempting to load prompt with ID: ${promptIdToLoad}`); // Log it
    const basePrompt = options.systemPromptOverride || loadPromptById(promptIdToLoad); // Use the variable
    const customInstructions = this.personality?.customInstructions || '';
    let finalSystemPrompt = basePrompt;

    if (customInstructions.trim()) {
        finalSystemPrompt += `\n\n--- Custom Instructions ---\n${customInstructions}`;
    }

    // Load context using the defaultContextSetIds from the personality config
    const contextText = options.contextOverride || loadContextFromIds(this.personality?.defaultContextSetIds || []); // Use defaultContextSetIds

    // Transform history using the combined prompt and context
// --- Add Logging Here ---
    // console.log("--- DEBUG: Prompt Components ---");
    // console.log("Base Prompt Content:", basePrompt);
    // console.log("Custom Instructions:", customInstructions);
    // console.log("Context Text:", contextText);
    // console.log("Final System Prompt (before transform):", finalSystemPrompt);
    // --- End Logging ---
    const messages = this._transformHistory(history, finalSystemPrompt, contextText);

    // Determine tools for this call
    const toolsForApi = options.tools?.map(tool => ({ type: "function", function: tool })) || [];

    // console.log(`[GPTChat] Sending messages to ${this.modelName}:`, JSON.stringify(messages, null, 2));
    // if (toolsForApi.length > 0) {
    //     console.log(`[GPTChat] Providing tools:`, JSON.stringify(toolsForApi, null, 2));
    // }

    try {
      const stream = await this.openaiClient.chat.completions.create({
        model: this.modelName,
        messages: messages,
        tools: toolsForApi.length > 0 ? toolsForApi : undefined, // Only include if tools exist
        tool_choice: toolsForApi.length > 0 ? "auto" : undefined, // Only include if tools exist
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.4
      }, {
        signal: options.abortSignal // Pass abort signal to OpenAI client
      });
      // GPT stream is directly usable
      return { stream };
    } catch (error) {
      console.error(`[GPTChat] Error calling OpenAI API (${this.modelName}):`, error);
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
    return 'gpt';
  }
}

module.exports = GPTChat;
