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
}

module.exports = StartTimer;
