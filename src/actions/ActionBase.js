// ActionBase.js - Abstract class for all actions to enforce a common interface
class ActionBase {
    constructor() {
      if (new.target === ActionBase) {
        throw new TypeError("Cannot instantiate ActionBase directly");
      }
    }
  
    /**
     * Execute the action.
     * @param {Object} params - Parameters for the action.
     */
    async execute(params) {
      throw new Error("Execute method must be implemented by subclass.");
    }
  }
  
  module.exports = ActionBase;
  