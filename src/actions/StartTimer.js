// StartTimer.js - Action to start a countdown timer
const ActionBase = require('./ActionBase');
const fs = require('fs');
const path = require('path');
const pathManager = require('../util/pathManager');

const TIMERS_FILE_PATH = pathManager.getTimersPath();

// Ensure the data directory and timers.json file exist
function initializeTimerFile() {
    try {
        const dataDir = pathManager.getDataDir();
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(TIMERS_FILE_PATH)) {
            fs.writeFileSync(TIMERS_FILE_PATH, JSON.stringify([]), 'utf8');
        }
    } catch (error) {
        console.error('[StartTimer] Failed to initialize timer file:', error);
    }
}

class StartTimer extends ActionBase {
    constructor() {
        super();
        // name and schema are defined by static getSchema now
    }

    static getSchema() {
        return {
            name: 'start_timer',
            description: 'Starts a countdown timer for a specified duration in seconds. The UI will manage the countdown and trigger.',
            parameters: {
                type: 'object',
                properties: {
                    duration: {
                        type: 'number',
                        description: 'Timer duration in seconds.',
                    },
                    label: {
                        type: 'string',
                        description: 'An optional label for the timer.'
                    }
                },
                required: ['duration'],
            },
        };
    }

    // Context will be passed by ActionsManager to execute
    async execute(params, context) {
        // Initialize file if needed
        initializeTimerFile();
        
        const { duration, label } = params;
        let currentChatId = null;

        try {
            if (context && context.chatManager && typeof context.chatManager.getCurrentChatId === 'function') {
                currentChatId = context.chatManager.getCurrentChatId();
            } else if (context && typeof context.getCurrentChatId === 'function') { // Check context directly for flexibility
                currentChatId = context.getCurrentChatId();
            } else {
                console.warn('StartTimer: Could not retrieve currentChatId from context.');
                 // Depending on strictness, could return an error if chatId is essential
            }

            if (typeof duration !== 'number' || duration <= 0) {
                return {
                    success: false,
                    error: 'Invalid duration. Must be a positive number of seconds.',
                };
            }

            const timers = JSON.parse(fs.readFileSync(TIMERS_FILE_PATH, 'utf8'));
            const newTimer = {
                id: `timer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, // Unique ID
                duration, // in seconds
                label: label || `Timer (${duration}s)`,
                startTime: Date.now(), // Record start time for countdown calculation in frontend
                chatId: currentChatId,
                createdAt: new Date().toISOString(),
                triggered: false, // For frontend to manage
            };
            timers.push(newTimer);
            fs.writeFileSync(TIMERS_FILE_PATH, JSON.stringify(timers, null, 2), 'utf8');

            return {
                success: true,
                message: `Timer started for ${duration} seconds${label ? ' with label "' + label + '"' : ''}.`,
                data: newTimer
            };
        } catch (error) {
            console.error('Error starting timer:', error);
            return {
                success: false,
                error: `Failed to start timer: ${error.message}`,
            };
        }
    }
}

module.exports = StartTimer;
