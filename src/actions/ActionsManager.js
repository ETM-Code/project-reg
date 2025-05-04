// ActionsManager.js - Central manager for registering and executing actions
const CreateEvent = require('./CreateEvent');
const CheckEvents = require('./CheckEvents');
const StartTimer = require('./StartTimer');
const MakeNote = require('./MakeNote');

// Store action classes, not instances, to access static methods
const actionClasses = {
  CreateEvent,
  CheckEvents,
  StartTimer,
  MakeNote
};

// Map camelCase names used internally to snake_case names used in schemas/APIs
// MOVED: actionNameToSchemaName is now an instance property defined in the constructor.

// Reverse map for convenience (can remain at module level if only used internally, or move too if needed externally)
// Let's keep it here for now as it doesn't seem accessed externally.
const _internalActionNameToSchemaName = { // Use temporary name to avoid conflict if needed elsewhere
    createEvent: 'create_event',
    checkEvents: 'check_events',
    startTimer: 'start_timer',
    makeNote: 'make_note'
};
const schemaNameToActionName = Object.fromEntries(
    Object.entries(_internalActionNameToSchemaName).map(([k, v]) => [v, k])
);


class ActionsManager {
  constructor() {
    // Map camelCase names used internally to snake_case names used in schemas/APIs
    this.actionNameToSchemaName = {
        createEvent: 'create_event',
        checkEvents: 'check_events',
        startTimer: 'start_timer',
        makeNote: 'make_note'
    };

    // Instantiate actions for execution
    this.actionInstances = {
      createEvent: new CreateEvent(),
      checkEvents: new CheckEvents(),
      startTimer: new StartTimer(),
      makeNote: new MakeNote()
    };
  }

  /**
   * Executes an action by its internal camelCase name.
   * @param {string} actionName - The camelCase name (e.g., 'createEvent').
   * @param {Object} params
   */
  async execute(actionName, params) {
    if (this.actionInstances[actionName]) {
      return await this.actionInstances[actionName].execute(params);
    }
    throw new Error(`Action ${actionName} not found`);
  }

  /**
   * Retrieves the schema declarations for specified tools (or all tools if none specified).
   * Uses the snake_case names expected by AI APIs.
   * @param {string[]} [toolNames] - Optional array of snake_case tool names to retrieve schemas for.
   * @returns {object[]} An array of tool schema objects.
   */
  getToolDeclarations(toolNames = null) {
    const declarations = [];
    const targetSchemaNames = toolNames ? new Set(toolNames) : null;

    for (const [className, actionClass] of Object.entries(actionClasses)) {
        if (typeof actionClass.getSchema === 'function') {
            try {
                const schema = actionClass.getSchema();
                // Check if we need to filter by name
                if (!targetSchemaNames || targetSchemaNames.has(schema.name)) {
                    declarations.push(schema);
                }
            } catch (error) {
                console.error(`[ActionsManager] Error getting schema for ${className}:`, error);
            }
        } else {
             console.warn(`[ActionsManager] Action class ${className} does not implement static getSchema().`);
        }
    }
    return declarations;
  }
}

module.exports = new ActionsManager();
