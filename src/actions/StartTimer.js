// StartTimer.js - Action to start a countdown timer
const ActionBase = require('./ActionBase');

class StartTimer extends ActionBase {
  /**
   * Starts a timer for the specified duration (in seconds).
   * When finished, logs a message (and could trigger sound/alert).
   * @param {Object} params - { duration }
   */
  async execute(params) {
    const { duration } = params;
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log("Timer finished!");
        resolve("Timer finished!");
      }, duration * 1000);
    });
  }

  /**
   * @override
   * @returns {{name: string, description: string, parameters: object}}
   */
  static getSchema() {
    return {
      name: 'start_timer',
      description: 'Starts a countdown timer for a specified duration in seconds.',
      parameters: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: 'Timer duration in seconds.' }
        },
        required: ['duration']
      }
    };
  }
}

module.exports = StartTimer;
