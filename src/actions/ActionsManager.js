// ActionsManager.js - Central manager for registering and executing actions
const CreateEvent = require('./CreateEvent');
const CheckEvents = require('./CheckEvents');
const StartTimer = require('./StartTimer');
const MakeNote = require('./MakeNote');

class ActionsManager {
  constructor() {
    this.actions = {
      createEvent: new CreateEvent(),
      checkEvents: new CheckEvents(),
      startTimer: new StartTimer(),
      makeNote: new MakeNote()
    };
  }

  /**
   * Executes an action by name with the given parameters.
   * @param {string} actionName 
   * @param {Object} params 
   */
  async execute(actionName, params) {
    if (this.actions[actionName]) {
      return await this.actions[actionName].execute(params);
    }
    throw new Error(`Action ${actionName} not found`);
  }
}

module.exports = new ActionsManager();
