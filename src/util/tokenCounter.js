// tokenCounter.js - Uses @dqbd/tiktoken for token counting
const { encoding_for_model } = require('@dqbd/tiktoken');

/**
 * Returns the number of tokens in a text string.
 * @param {string} message 
 * @returns {number} Token count.
 */
function numTokensFromString(message) {
  const encoder = encoding_for_model('gpt-3.5-turbo');
  const tokens = encoder.encode(message);
  encoder.free();
  return tokens.length;
}

/**
 * Decodes tokens back to a string.
 * @param {Uint32Array} tokens 
 * @returns {string} Decoded text.
 */
function decodeTokens(tokens) {
  const encoder = encoding_for_model('gpt-3.5-turbo');
  const words = encoder.decode(tokens);
  encoder.free();
  return new TextDecoder().decode(words);
}

module.exports = { numTokensFromString, decodeTokens };
