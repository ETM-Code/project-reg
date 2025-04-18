// src/util/tiktokenCounter.js
const { encoding_for_model, get_encoding } = require('tiktoken');

// Cache encoders to avoid re-initialization cost
const encoderCache = new Map();

function getEncoder(modelName) {
    if (encoderCache.has(modelName)) {
        return encoderCache.get(modelName);
    }

    try {
        // Use encoding_for_model for OpenAI models.
        // Add fallbacks or specific mappings if needed.
        // For Gemini or other non-OpenAI models, tiktoken won't work directly.
        // We might need a different approach or library for them, or rely on their API response if available.
        // For now, this focuses on OpenAI models compatible with tiktoken.
        if (modelName.startsWith('gpt')) {
             // Map common variations if necessary, though encoding_for_model handles many.
             // e.g., if you used "gpt-4.1-mini", map it to a known base like "gpt-4" if needed.
             // Let's assume encoding_for_model handles the provided names for now.
            const encoder = encoding_for_model(modelName);
            encoderCache.set(modelName, encoder);
            return encoder;
        } else {
            // Attempt a generic encoding like 'cl100k_base' as a fallback,
            // but this might not be accurate for non-GPT models.
            // Or return null/throw error if model is not supported by tiktoken.
            console.warn(`Model ${modelName} not directly supported by tiktoken's encoding_for_model. Using cl100k_base as fallback.`);
            if (!encoderCache.has('cl100k_base')) {
                 const fallbackEncoder = get_encoding('cl100k_base');
                 encoderCache.set('cl100k_base', fallbackEncoder);
            }
            return encoderCache.get('cl100k_base');
        }
    } catch (error) {
        console.error(`Failed to get encoding for model ${modelName}:`, error);
        // Fallback to a default encoder if specific one fails
         if (!encoderCache.has('cl100k_base')) {
             try {
                const fallbackEncoder = get_encoding('cl100k_base');
                encoderCache.set('cl100k_base', fallbackEncoder);
             } catch (fallbackError) {
                 console.error("Failed to get fallback cl100k_base encoding:", fallbackError);
                 return null; // Cannot proceed without any encoder
             }
         }
         return encoderCache.get('cl100k_base');
    }
}

function countTokens(modelName, text) {
    if (!text) return 0; // Handle empty or null text

    const encoder = getEncoder(modelName);
    if (!encoder) {
        console.error(`Could not get a valid encoder for model ${modelName}. Cannot count tokens.`);
        return 0; // Or throw an error, depending on desired behavior
    }

    try {
        const tokens = encoder.encode(text);
        return tokens.length;
    } catch (error) {
        console.error(`Error encoding text for model ${modelName}:`, error);
        return 0; // Return 0 on encoding error
    }
    // Note: We are NOT calling encoder.free() here because we are caching encoders.
    // If memory becomes an issue, a more sophisticated cache eviction strategy or
    // freeing encoders after each use (sacrificing performance) would be needed.
}

// Optional: Function to clean up encoders if the application closes
function cleanupEncoders() {
    for (const encoder of encoderCache.values()) {
        try {
            encoder.free();
        } catch (e) {
            console.error("Error freeing encoder:", e);
        }
    }
    encoderCache.clear();
    console.log("Cleaned up tiktoken encoders.");
}


module.exports = {
    countTokens,
    cleanupEncoders // Export cleanup if needed for app shutdown hooks
};