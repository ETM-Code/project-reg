/**
 * @typedef {import('../config/settingsManager').Personality} Personality
 * @typedef {import('../config/settingsManager').Prompt} Prompt
 * @typedef {import('../config/settingsManager').ContextSet} ContextSet
 */

/**
 * @typedef {object} ModelInitializationConfig
 * @property {string} apiKey - The API key for the specific model service.
 * @property {string} modelName - The specific model identifier (e.g., 'gpt-4o-mini', 'gemini-1.5-flash-latest').
 * @property {Personality} [personality] - The full personality configuration (optional, for context).
 * @property {Prompt} [prompt] - The resolved prompt configuration (optional, for context).
 * @property {ContextSet} [contextSet] - The resolved context set configuration (optional, for context).
 * // Add any other model-specific initialization options here
 */

/**
 * @typedef {object} SendMessageOptions
 * @property {Array<object>} [tools] - Tool declarations specific to this call (if applicable).
 * @property {string} [systemPromptOverride] - Optional system prompt to override the default for this call.
 * @property {string} [contextOverride] - Optional context string to override the default for this call.
 * // Add other per-message options as needed
 */

/**
 * @typedef {object} SendMessageResult
 * @property {AsyncGenerator<object, void, unknown> | object} stream - The stream iterator (e.g., from OpenAI or Google GenAI) or the complete response object if not streaming.
 * @property {Promise<object>} [response] - Optional promise that resolves with the full aggregated response (useful for Gemini).
 */

/**
 * Abstract base class / Interface definition for AI Model implementations.
 * Concrete models (e.g., GeminiChat, GPTChat) should implement these methods.
 */
class AIModelInterface {
  /**
   * Initializes the model instance with necessary configuration.
   * This should set up the API client for the specific model.
   * @param {ModelInitializationConfig} config - Configuration object containing API key, model name, etc.
   * @throws {Error} If initialization fails (e.g., missing API key).
   */
  initialize(config) {
    throw new Error("Method 'initialize(config)' must be implemented by subclasses.");
  }

  /**
   * Sends the conversation history and the latest message to the AI model and returns a stream.
   * @param {Array<object>} history - The conversation history in the format expected by the specific model's API.
   * @param {string} message - The latest user message to send.
   * @param {SendMessageOptions} [options] - Optional parameters like tools, overrides.
   * @returns {Promise<SendMessageResult>} A promise resolving to an object containing the stream and potentially a response promise.
   * @throws {Error} If the message sending fails.
   */
  async sendMessageStream(history, message, options) {
    throw new Error("Method 'sendMessageStream(history, message, options)' must be implemented by subclasses.");
  }

  /**
   * Generates a title for a chat based on the initial messages (optional).
   * @param {Array<object>} history - The conversation history, typically the first user message and the first model response.
   * @returns {Promise<string|null>} A promise resolving to the generated title or null if not supported/failed.
   */
  async generateTitle(history) {
    console.warn("Method 'generateTitle(history)' not implemented by default.");
    return null; // Default implementation returns null
  }

  /**
   * Returns the specific model name identifier (e.g., 'gpt-4o-mini') used by this instance.
   * @returns {string}
   */
  getModelName() {
      throw new Error("Method 'getModelName()' must be implemented by subclasses.");
  }

   /**
   * Returns the implementation type identifier (e.g., 'gpt', 'gemini').
   * @returns {string}
   */
  getImplementationType() {
      throw new Error("Method 'getImplementationType()' must be implemented by subclasses.");
  }
}

module.exports = AIModelInterface;