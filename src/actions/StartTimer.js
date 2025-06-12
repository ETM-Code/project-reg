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
            description: 'Starts a countdown timer for a specified duration in seconds. The timer will appear in the chat and provide visual and audio notifications when it completes.',
            parameters: {
                type: 'object',
                properties: {
                    duration: {
                        type: 'number',
                        description: 'Timer duration in seconds. Minimum 1 second, maximum 86400 seconds (24 hours).',
                        minimum: 1,
                        maximum: 86400
                    },
                    label: {
                        type: 'string',
                        description: 'An optional descriptive label for the timer (e.g., "Tea brewing", "Meeting reminder", "Break time").',
                        maxLength: 100
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

            if (typeof duration !== 'number' || duration <= 0 || duration > 86400) {
                return {
                    success: false,
                    error: 'Invalid duration. Must be between 1 second and 24 hours (86400 seconds).',
                };
            }

            const timers = JSON.parse(fs.readFileSync(TIMERS_FILE_PATH, 'utf8'));
            const timerLabel = label && label.trim() ? label.trim() : `Timer (${this.formatDuration(duration)})`;
            
            const newTimer = {
                id: `timer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, // Unique ID
                duration, // in seconds
                label: timerLabel,
                startTime: Date.now(), // Record start time for countdown calculation in frontend
                chatId: currentChatId,
                createdAt: new Date().toISOString(),
                triggered: false, // For frontend to manage
            };
            timers.push(newTimer);
            fs.writeFileSync(TIMERS_FILE_PATH, JSON.stringify(timers, null, 2), 'utf8');

            const formattedDuration = this.formatDuration(duration);
            const successMessage = this.generateSuccessMessage(timerLabel, formattedDuration, duration);

            return {
                success: true,
                message: successMessage,
                data: {
                    ...newTimer,
                    formattedDuration,
                    endTime: new Date(Date.now() + duration * 1000).toLocaleTimeString()
                }
            };
        } catch (error) {
            console.error('Error starting timer:', error);
            return {
                success: false,
                error: `Failed to start timer: ${error.message}`,
            };
        }
    }

    // Helper method to format duration in a human-readable way
    formatDuration(seconds) {
        if (seconds < 60) {
            return `${seconds} second${seconds !== 1 ? 's' : ''}`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            if (remainingSeconds === 0) {
                return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
            } else {
                return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
            }
        } else {
            const hours = Math.floor(seconds / 3600);
            const remainingMinutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = seconds % 60;
            
            let result = `${hours} hour${hours !== 1 ? 's' : ''}`;
            if (remainingMinutes > 0) {
                result += ` and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
            }
            if (remainingSeconds > 0 && remainingMinutes === 0) {
                result += ` and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
            }
            return result;
        }
    }

    // Generate a contextual success message
    generateSuccessMessage(label, formattedDuration, duration) {
        const endTime = new Date(Date.now() + duration * 1000);
        const endTimeStr = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Create engaging messages based on common timer uses
        const commonTimerMessages = {
            'tea': `🍵 Perfect! Your tea timer is set for ${formattedDuration}. I'll let you know when it's ready to steep!`,
            'coffee': `☕ Coffee timer started! ${formattedDuration} until your perfect brew is ready.`,
            'cooking': `👨‍🍳 Kitchen timer activated! ${formattedDuration} until your dish is done.`,
            'break': `⏰ Break time timer set for ${formattedDuration}. Enjoy your well-deserved rest!`,
            'meeting': `📅 Meeting reminder set! You'll be notified in ${formattedDuration}.`,
            'workout': `💪 Workout timer ready! ${formattedDuration} of exercise time ahead.`,
            'study': `📚 Study session timer set for ${formattedDuration}. Focus time!`,
            'meditation': `🧘 Meditation timer started. ${formattedDuration} of mindfulness ahead.`,
            'pomodoro': `🍅 Pomodoro timer activated! ${formattedDuration} of focused work time.`
        };

        // Check if the label contains any keywords for personalized messages
        const lowerLabel = label.toLowerCase();
        for (const [keyword, message] of Object.entries(commonTimerMessages)) {
            if (lowerLabel.includes(keyword)) {
                return `${message}\n\n⏰ **Timer Details:**\n- Label: ${label}\n- Duration: ${formattedDuration}\n- Will complete at: ${endTimeStr}\n\nA timer widget has been added to this chat and will update in real-time. You'll receive both visual and audio notifications when the timer completes.`;
            }
        }

        // Default message for custom or unrecognized timers
        return `✅ **Timer Started Successfully!**\n\n⏰ **Timer Details:**\n- Label: ${label}\n- Duration: ${formattedDuration}\n- Will complete at: ${endTimeStr}\n\nA timer widget has been added to this chat and will countdown in real-time. You'll receive both visual and audio notifications when the timer completes. The timer will also appear in your sidebar for quick access.`;
    }
}

module.exports = StartTimer;
