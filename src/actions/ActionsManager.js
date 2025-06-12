// ActionsManager.js - Central manager for registering and executing actions
const StartTimer = require('./StartTimer');
const MakeNote = require('./MakeNote');



// Store action classes to access static methods (like getSchema) and to instantiate
const actionClasses = {
  // Class keys here should ideally match the names used in personality config's `tools` array
  // e.g., "createNotification", "createAlarm", "startTimer"
  MakeNote,    // Assuming "MakeNote" or "makeNote"
  StartTimer      // Assuming "StartTimer" or "startTimer"
};

class ActionsManager {
  constructor() {
    this.actionInstances = {};
    // Map from internal/personality tool name (e.g., "createNotification") to schema name (e.g., "create_notification")
    this.actionNameToSchemaName = {};
    // Map from schema name (e.g., "create_notification") to Class Key (e.g., "CreateNotification")
    this.schemaNameToClassKey = {};

    for (const classKey in actionClasses) {
      const ActionClass = actionClasses[classKey];
      if (ActionClass && typeof ActionClass.getSchema === 'function') {
        try {
          this.actionInstances[classKey] = new ActionClass(); // Actions have no-arg constructors
          const schema = ActionClass.getSchema();
          if (schema && schema.name) {
            // Assuming classKey is the reference name (e.g., "CreateNotification")
            // This name should be consistent with what might be in `personality.tools` array.
            // For example, if personality.tools has "createNotification", then classKey should be "createNotification".
            // Let's assume for now the classKey itself (e.g. "CreateNotification") is what we use as the internal "action name".
            // If personality files use "createNotification" (camelCase), this map needs to reflect that.
            // For simplicity, let's assume personality files will use the schema name directly or a name that maps to classKey.
            // The prompt implies personality.tools will have "createNotification", "createAlarm", "startTimer".
            // So, the keys in `actionNameToSchemaName` should be these exact strings.
            // We need a way to link "createNotification" (from personality) to "CreateNotification" (classKey).
            // A common convention is to use the class name itself (or a camelCase version) as the key.
            // Let's make classKey the definitive internal key.
            // If personality.tools uses "createNotification", we need to map "createNotification" -> "create_notification".

            // Let's refine: the keys of `actionClasses` (e.g., "CreateNotification") are our internal identifiers.
            // `chatManager` will get tool names like "createNotification" from `personality.tools`.
            // It needs to convert "createNotification" to "create_notification" to pass to `getToolDeclarations`.
            // And `getToolDeclarations` needs to return schemas for those.
            // `execute` will be called with "create_notification".

            // Populate actionNameToSchemaName:
            // This map is used by chatManager to convert names from personality config (e.g., "startTimer")
            // to schema names (e.g., "start_timer") before calling getToolDeclarations.
            // The keys of this map should be the names as they appear in `config.json` `personality.tools`.
            // The values are the schema names.
            // We derive this from the schema itself. The classKey is our internal reference.
            // Example: if classKey is "StartTimer", and its schema.name is "start_timer".
            // If personality.tools has "startTimer", then actionNameToSchemaName["startTimer"] = "start_timer".
            // We need to decide on a consistent key for `actionNameToSchemaName`.
            // Let's assume the keys in `personality.tools` will be the `schema.name` directly for simplicity,
            // OR they will be a defined mapping. The prompt says:
            // `config.json` (personalities will need to be updated to include these new tools in their `tools` array, e.g., "createNotification", "createAlarm", "startTimer")
            // These look like camelCase or a direct name, not necessarily the schema name.
            // Let's assume these names ("createNotification") are the keys for `actionNameToSchemaName`.
            // The classKey (e.g. "CreateNotification") is the key for `actionInstances`.
            // `schemaNameToClassKey` maps `schema.name` to `classKey`.

            // For `actionNameToSchemaName`:
            // Key: name as in personality.tools (e.g., "createNotification")
            // Value: schema.name (e.g., "create_notification")
            // We need to establish this link. Let's assume the `classKey` (e.g. "CreateNotification")
            // can be transformed into the personality tool name (e.g. by lowercasing the first letter: "createNotification").
            let personalityToolName = classKey.charAt(0).toLowerCase() + classKey.slice(1);
            if (classKey === "StartTimer") personalityToolName = "startTimer"; // explicit for existing
            if (classKey === "CreateEvent") personalityToolName = "createEvent";
            if (classKey === "CheckEvents") personalityToolName = "checkEvents";
            if (classKey === "MakeNote") personalityToolName = "makeNote";
            if (classKey === "CreateNotification") personalityToolName = "createNotification";
            if (classKey === "CreateAlarm") personalityToolName = "createAlarm";


            this.actionNameToSchemaName[personalityToolName] = schema.name;
            this.schemaNameToClassKey[schema.name] = classKey;

          } else {
            console.warn(`[ActionsManager] Schema name missing for action class ${classKey}`);
          }
        } catch (error) {
          console.error(`[ActionsManager] Error processing action class ${classKey}:`, error);
        }
      } else {
        console.warn(`[ActionsManager] Action class ${classKey} does not have a static getSchema method or is invalid.`);
      }
    }
    // console.log('[ActionsManager] Initialized. actionNameToSchemaName:', this.actionNameToSchemaName);
    // console.log('[ActionsManager] schemaNameToClassKey:', this.schemaNameToClassKey);
  }

  /**
   * Executes an action by its schema name (e.g., 'create_notification').
   * @param {string} schemaName - The snake_case name of the action.
   * @param {Object} params - Parameters for the action.
   * @param {Object} executionContext - Context for the action's execute method (e.g., { chatManager }).
   */
  async execute(schemaName, params, executionContext) {
    const classKey = this.schemaNameToClassKey[schemaName];
    if (classKey && this.actionInstances[classKey]) {
      try {
        return await this.actionInstances[classKey].execute(params, executionContext);
      } catch (error) {
        console.error(`[ActionsManager] Error executing action ${classKey} (schema: ${schemaName}):`, error);
        return { success: false, error: `Action execution failed: ${error.message}` };
      }
    }
    console.error(`[ActionsManager] Action with schema name '${schemaName}' (mapped to classKey '${classKey}') not found.`);
    throw new Error(`Action ${schemaName} not found`);
  }

  /**
   * Retrieves the schema declarations for specified tools (or all tools if none specified).
   * @param {string[]} [requestedSchemaNames] - Optional array of snake_case tool names to retrieve schemas for.
   * @returns {object[]} An array of tool schema objects.
   */
  getToolDeclarations(requestedSchemaNames = null) {
    const declarations = [];
    const targetSchemaNames = requestedSchemaNames ? new Set(requestedSchemaNames) : null;

    // Iterate over actionClasses to access static getSchema method
    for (const classKey in actionClasses) {
      const ActionClass = actionClasses[classKey];
      if (ActionClass && typeof ActionClass.getSchema === 'function') {
        try {
          const schema = ActionClass.getSchema();
          if (schema && schema.name) {
            if (!targetSchemaNames || targetSchemaNames.has(schema.name)) {
              declarations.push(schema);
            }
          } else {
            console.warn(`[ActionsManager] Schema or schema name missing for action class ${classKey} during getToolDeclarations.`);
          }
        } catch (error) {
          console.error(`[ActionsManager] Error getting schema for ${classKey} in getToolDeclarations:`, error);
        }
      }
    }
    return declarations;
  }
}

// Export a single instance (singleton)
module.exports = new ActionsManager();
