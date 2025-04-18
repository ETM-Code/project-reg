// src/services/dailyTokenTracker.js
const fs = require('fs').promises;
const path = require('path');

const usageDir = path.join(__dirname, '..', '..', 'data', 'token_usage');
const getTodaysDateString = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

const ensureUsageDirExists = async () => {
    try {
        await fs.access(usageDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(usageDir, { recursive: true });
        } else {
            throw error;
        }
    }
};

const getTodaysFilePath = () => {
    return path.join(usageDir, `${getTodaysDateString()}.json`);
};

const readTodaysUsage = async () => {
    await ensureUsageDirExists();
    const filePath = getTodaysFilePath();
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
    await ensureUsageDirExists();
    const filePath = getTodaysFilePath();
    const currentUsage = await readTodaysUsage();

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