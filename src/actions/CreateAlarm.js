const ActionBase = require('./ActionBase');
const fs = require('fs');
const path = require('path');

const ALARMS_FILE_PATH = path.join(__dirname, '..', '..', 'data', 'alarms.json');

// Ensure the data directory and alarms.json file exist
const dataDir = path.dirname(ALARMS_FILE_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(ALARMS_FILE_PATH)) {
    fs.writeFileSync(ALARMS_FILE_PATH, JSON.stringify([]), 'utf8');
}

class CreateAlarm extends ActionBase {
    constructor() {
        super();
        // name and schema are defined by static getSchema now
    }

    static getSchema() {
        return {
            name: 'create_alarm',
            description: 'Sets an alarm for a specific time. The UI will manage triggering it.',
            parameters: {
                type: 'object',
                properties: {
                    time: {
                        type: 'string',
                        description: 'The time for the alarm in HH:MM format (24-hour) or a future ISO 8601 datetime string.',
                    },
                    label: {
                        type: 'string',
                        description: 'An optional label for the alarm.',
                    },
                },
                required: ['time'],
            },
        };
    }

    // Context will be passed by ActionsManager to execute
    async execute(params, context) {
        const { time, label } = params;
        let currentChatId = null;

        try {
            if (context && context.chatManager && typeof context.chatManager.getCurrentChatId === 'function') {
                currentChatId = context.chatManager.getCurrentChatId();
            } else if (context && typeof context.getCurrentChatId === 'function') { // Check context directly for flexibility
                currentChatId = context.getCurrentChatId();
            } else {
                console.warn('CreateAlarm: Could not retrieve currentChatId from context.');
                // Depending on strictness, could return an error if chatId is essential for all alarms
            }

            if (!time) {
                return {
                    success: false,
                    error: 'Missing time for alarm.',
                };
            }

            // Basic validation for time format (HH:MM or ISO 8601)
            // This is a simple check; more robust validation might be needed.
            const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z?([+-]\d{2}:\d{2})?$/;
            const hhmmRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

            if (!iso8601Regex.test(time) && !hhmmRegex.test(time)) {
                 return {
                    success: false,
                    error: 'Invalid time format. Please use HH:MM (24-hour) or ISO 8601 format.',
                };
            }


            const alarms = JSON.parse(fs.readFileSync(ALARMS_FILE_PATH, 'utf8'));
            const newAlarm = {
                id: `alarm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, // Unique ID
                time,
                label: label || 'Alarm',
                chatId: currentChatId, // Store chatId for linking
                createdAt: new Date().toISOString(),
                triggered: false, // For frontend to manage
            };
            alarms.push(newAlarm);
            fs.writeFileSync(ALARMS_FILE_PATH, JSON.stringify(alarms, null, 2), 'utf8');

            return {
                success: true,
                message: `Alarm set for ${time}${label ? ' with label "' + label + '"' : ''}.`,
                data: newAlarm
            };
        } catch (error) {
            console.error('Error creating alarm:', error);
            return {
                success: false,
                error: `Failed to create alarm: ${error.message}`,
            };
        }
    }
}

module.exports = CreateAlarm;