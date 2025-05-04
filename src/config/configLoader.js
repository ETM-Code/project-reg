const fs = require('fs').promises;
const path = require('path');

// Construct the absolute path to config.json in the project root
const configPath = path.join(__dirname, '..', '..', 'config.json'); // Adjust path relative to src/config

/**
 * Loads the configuration from config.json.
 * @returns {Promise<object>} A promise that resolves with the configuration object.
 * @throws {Error} If the file cannot be read or parsed.
 */
async function loadConfig() {
  try {
    console.log(`Attempting to load configuration from: ${configPath}`);
    const rawData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(rawData);
    console.log('Configuration loaded successfully.');
    return config;
  } catch (error) {
    console.error(`Error loading configuration from ${configPath}:`, error);
    if (error.code === 'ENOENT') {
      throw new Error(`Configuration file not found at ${configPath}. Please ensure config.json exists in the project root.`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`Error parsing configuration file ${configPath}. Please check for JSON syntax errors.`);
    } else {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }
}

module.exports = { loadConfig };