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
  modelId; // Changed from modelName
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
    const apiKey = settingsManager.getApiKey('openai'); // Get API key via settingsManager
    if (!apiKey) {
      console.error("OpenAI API key not found in settings. Cannot initialize OpenAIReasoningChat.");
      return false; // Indicate failure
    }
    if (!config.modelId || !config.modelConfig || !config.personality) {
        throw new Error("modelId, modelConfig, and personality are required for OpenAIReasoningChat initialization.");
    }
    this.client = new OpenAI({ apiKey: apiKey });
    this.modelId = config.modelId;
    this.modelConfig = config.modelConfig;
    this.personality = config.personality;
    console.log(`[OpenAIReasoningChat] Initialized with model ID: ${this.modelId}`);
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

    // --- Format Input (Placeholder - Needs proper history transformation) ---
    // TODO: Implement proper history transformation based on OpenAI Responses API requirements
    // This likely involves iterating through `history` and creating the correct input structure.
    // For now, using a simplified approach assuming the last message is the primary input.
    const lastUserMessage = history.length > 0 ? history[history.length - 1].parts[0].text : (message || '');
    const formattedInput = [{ type: 'text', text: lastUserMessage }];

    // --- Prepare API Parameters ---
    const apiParams = {
      model: this.modelId, // Use modelId
      input: formattedInput,
      // Use default reasoning params from config, fallback to medium
      reasoning: this.modelConfig.defaultParams?.reasoning || { effort: "medium" },
      // Pass reasoning context if provided by ChatManager
      ...(options.reasoning && { reasoning: options.reasoning }),
    };

    if (options.max_output_tokens) {
        apiParams.max_output_tokens = options.max_output_tokens;
    }
    // Add other options if needed (e.g., reasoning summary, encryption)

    try {
      console.log(`Calling OpenAI Responses API with model: ${this.modelId}`);
      const response = await this.client.responses.create(apiParams);
      // console.log("OpenAI Responses API raw response:", response); // Optional: Keep for debugging if needed

      // --- Process Response ---
      // Extract output text (assuming structure, adjust if needed)
      const outputText = response.output && response.output.length > 0 && response.output[0].type === 'text'
        ? response.output[0].text
        : '';

      // Check for incomplete response
      const isIncomplete = response.status === "incomplete";
      const incompleteReason = isIncomplete ? response.incomplete_details?.reason : null;

      // Reasoning context is now managed by ChatManager based on rawResponse.reasoning
      // No need to store it locally in this class anymore.

      // Track token usage using the updated function
      if (response.usage) {
        const inputTokens = response.usage.input_tokens || 0;
        const outputTokens = response.usage.output_tokens || 0;
        // Extract reasoning tokens specifically
        const reasoningTokens = response.usage.output_tokens_details?.reasoning_tokens || 0;

        updateTodaysUsage(
          inputTokens,
          outputTokens,
          reasoningTokens // Pass reasoning tokens
        );
        console.log(`[OpenAIReasoningChat] Tokens - Input: ${inputTokens}, Output: ${outputTokens}, Reasoning: ${reasoningTokens}`);
      }

      // Adapt response to SendMessageResult structure
      // Since it's not a stream, we put the processed data directly.
      // The 'stream' property will hold the result object.
      const result = {
        outputText: outputText,
        isComplete: !isIncomplete,
        incompleteReason: incompleteReason,
        usage: response.usage,
        // Include raw response or other details if needed by ChatManager
        rawResponse: response
      };

      // The interface expects 'stream' to be an AsyncGenerator or object.
      // We return the complete result object here.
      return {
          stream: result,
          // No separate response promise needed as the call is synchronous
      };

    } catch (error) {
      console.error("Error calling OpenAI Responses API:", error);
      throw new Error(`OpenAI API request failed: ${error.message}`);
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
  getModelId() { // Renamed method
    if (!this.modelId) {
        throw new Error("Model ID not set. Call initialize() first.");
    }
    return this.modelId;
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