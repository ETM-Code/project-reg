// src/services/dailyTokenTracker.js
const fs = require('fs').promises;
const path = require('path');
const settingsManager = require('../config/settingsManager'); // Import settingsManager

// REMOVED: Hardcoded usageDir constant

const getTodaysDateString = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// Helper to get configured token usage path
const _getTokenUsageDir = () => {
    const paths = settingsManager.getPaths(); // Assumes settingsManager is initialized
    if (!paths || !paths.tokenUsage) {
        console.error("Token usage directory path not configured.");
        // Fallback or throw error? For now, let's throw to make misconfiguration obvious.
        throw new Error("Token usage directory path not configured in settings.");
    }
    return paths.tokenUsage;
};

// Helper to ensure the directory exists
const _ensureUsageDirExists = async (dirPath) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        console.error(`Error creating token usage directory ${dirPath}:`, error);
        throw error; // Re-throw
    }
};

const _getTodaysFilePath = () => {
    const usageDir = _getTokenUsageDir();
    return path.join(usageDir, `${getTodaysDateString()}.json`);
};

const readTodaysUsage = async () => {
    const usageDir = _getTokenUsageDir();
    await _ensureUsageDirExists(usageDir); // Ensure directory exists before reading
    const filePath = _getTodaysFilePath();
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const usage = JSON.parse(data);
        // Basic validation
        if (typeof usage.input === 'number' && typeof usage.output === 'number' && typeof usage.total === 'number') {
            return usage;
        }
        console.warn(`Invalid data found in ${filePath}, resetting.`);
        return { input: 0, output: 0, total: 0 };
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist for today, which is normal
            return { input: 0, output: 0, total: 0 };
        }
        console.error(`Error reading token usage file ${filePath}:`, error);
        // Return default on other errors to avoid breaking functionality
        return { input: 0, output: 0, total: 0 };
    }
};

const updateTodaysUsage = async (inputTokens, outputTokens) => {
    if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number' || inputTokens < 0 || outputTokens < 0) {
        console.error('Invalid token counts provided for update:', inputTokens, outputTokens);
        return;
    }
    const usageDir = _getTokenUsageDir();
    await _ensureUsageDirExists(usageDir); // Ensure directory exists before writing
    const filePath = _getTodaysFilePath();
    const currentUsage = await readTodaysUsage(); // readTodaysUsage now ensures dir exists

    currentUsage.input += inputTokens;
    currentUsage.output += outputTokens;
    currentUsage.total = currentUsage.input + currentUsage.output;

    try {
        await fs.writeFile(filePath, JSON.stringify(currentUsage, null, 2), 'utf-8');
        // Notify renderer process about the update
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
             global.mainWindow.webContents.send('token-usage-updated', currentUsage);
        }
    } catch (error) {
        console.error(`Error writing token usage file ${filePath}:`, error);
    }
};

// Function to be called from the main process to get the initial count
const getInitialUsage = async () => {
    return await readTodaysUsage();
}

module.exports = {
    readTodaysUsage,
    updateTodaysUsage,
    getInitialUsage
};