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

    /**
     * Returns the schema definition for this action, used for AI tool/function calling.
     * Must be implemented by subclasses as a static method.
     * @returns {{name: string, description: string, parameters: object}}
     */
    static getSchema() {
        // This static method should be overridden by concrete action subclasses
        throw new Error("Static method 'getSchema()' must be implemented by subclasses.");
    }
  }
  
  module.exports = ActionBase;
  