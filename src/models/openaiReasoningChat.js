const { OpenAI } = require('openai');
const AIModelInterface = require('./AIModelInterface');
const { updateTodaysUsage } = require('../services/dailyTokenTracker'); // Correct import name
const settingsManager = require('../config/settingsManager'); // Import settingsManager to get API key

/**
 * @typedef {import('./AIModelInterface').ModelInitializationConfig} ModelInitializationConfig
 * @typedef {import('./AIModelInterface').SendMessageOptions} SendMessageOptions
 * @typedef {import('./AIModelInterface').SendMessageResult} SendMessageResult
 */

class OpenAIReasoningChat extends AIModelInterface {
  /** @type {OpenAI} */
  client;
  /** @type {string} */
  modelName; // Changed from modelId
  /** @type {object} */
  modelConfig; // Store the full model config
  /** @type {import('../config/settingsManager').Personality} */
  personality; // Store personality

  /**
   * Initializes the OpenAI Reasoning model instance using config passed from ChatManager.
   * @param {object} config - Configuration object containing modelId, modelConfig, personality.
   * @returns {boolean} True if initialization is successful, false otherwise.
   */
  initialize(config) {
    // Check for required API key
    const apiKey = settingsManager.getApiKey('openai') || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[OpenAIReasoningChat] OpenAI API key not found. Set OPENAI_API_KEY in environment or settings.");
      return false; // Indicate failure
    }
    if (!config.modelId || !config.modelConfig || !config.personality) {
        throw new Error("modelId, modelConfig, and personality are required for OpenAIReasoningChat initialization.");
    }
    this.client = new OpenAI({ apiKey: apiKey });
    
    // Convert modelId to modelName (the actual model name for the API)
    this.modelName = config.modelConfig.name || config.modelId;
    this.modelConfig = config.modelConfig;
    this.personality = config.personality;
    console.log(`[OpenAIReasoningChat] Initialized with model name: ${this.modelName}`);
    return true; // Indicate success
  }

  /**
   * Sends the conversation history and message to the OpenAI Responses API.
   * Note: The Responses API does not inherently support streaming like Chat Completions.
   * This method returns the complete response object, adapted to the SendMessageResult structure.
   * @param {Array<object>} history - Conversation history (needs formatting for 'input').
   * @param {string} message - The latest user message.
   * @param {SendMessageOptions} [options={}] - Optional parameters.
   * @returns {Promise<SendMessageResult>} A promise resolving to the response object.
   * @throws {Error} If the API call fails.
   */
  async sendMessageStream(history, message, options = {}) {
    if (!this.client) {
      throw new Error("OpenAI client not initialized. Call initialize() first.");
    }

    // --- Format messages for OpenAI Chat Completions API ---
    // Reasoning models (o1-mini, o3-mini) use the standard chat completions API
    // but with specific parameter restrictions and message formatting
    const messages = [];
    
    for (const historyItem of history) {
      if (historyItem.role === 'user') {
        messages.push({
          role: 'user',
          content: historyItem.parts?.[0]?.text || historyItem.content || ''
        });
      } else if (historyItem.role === 'model' || historyItem.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: historyItem.parts?.[0]?.text || historyItem.content || ''
        });
      } else if (historyItem.role === 'system') {
        // For reasoning models, system messages should be converted to developer messages
        // but for compatibility, we'll include them as system messages
        messages.push({
          role: 'system',
          content: historyItem.parts?.[0]?.text || historyItem.content || ''
        });
      }
    }

    // Add the current message
    messages.push({
      role: 'user',
      content: message
    });

    console.log(`[OpenAIReasoningChat] Formatted ${messages.length} messages for reasoning API`);

    try {
      // Reasoning models only support specific parameters
      const apiParams = {
        model: this.modelName,
        messages: messages,
        stream: true,
        max_completion_tokens: options.maxTokens || this.maxTokens || 4000
      };

      // Add reasoning effort if specified (only for supported models)
      if (options.reasoningEffort) {
        apiParams.reasoning_effort = options.reasoningEffort;
      }

      const stream = await this.client.chat.completions.create(apiParams);

      return stream;
    } catch (error) {
      console.error("[OpenAIReasoningChat] Error creating reasoning stream:", error);
      throw error;
    }
  }

  /**
   * Generates a title for a chat (not implemented for this model type yet).
   * @param {Array<object>} history - Conversation history.
   * @returns {Promise<string|null>} Always returns null.
   */
  async generateTitle(history) {
    console.warn("generateTitle(history) not implemented for OpenAIReasoningChat.");
    return null;
  }

  /**
   * Returns the specific model ID identifier.
   * @returns {string}
   */
  getModelName() { // Match interface
    if (!this.modelName) {
        throw new Error("Model ID not set. Call initialize() first.");
    }
    return this.modelName;
  }

   /**
   * Returns the implementation type identifier.
   * @returns {string}
   */
  getImplementationType() {
    return 'openai-reasoning';
  }
}

module.exports = OpenAIReasoningChat;