// CheckEvents.js - Action to search and filter calendar events from local JSON storage
const ActionBase = require('./ActionBase');
const fs = require('fs');
const path = require('path');
const pathManager = require('../util/pathManager');

const EVENTS_FILE = pathManager.getEventsPath();

class CheckEvents extends ActionBase {
  /**
   * Searches for events based on provided criteria.
   * @param {Object} criteria - e.g., { typeTag, date }
   * @returns {Array} Matching events (max 100)
   */
  async execute(criteria) {
    try {
      // Ensure events file exists
      if (!fs.existsSync(EVENTS_FILE)) {
        const dataDir = pathManager.getDataDir();
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(EVENTS_FILE, JSON.stringify([], null, 2));
        return []; // Return empty array if file was just created
      }
      
      let events = JSON.parse(fs.readFileSync(EVENTS_FILE));
      for (const key in criteria) {
        events = events.filter(event => event[key] === criteria[key]);
      }
      // Return null if events exceed 100
      if (events.length > 100) {
        return null;
      }
      // Limit result to 100 events
      return events.slice(0, 100);
    } catch (error) {
      console.error('[CheckEvents] Error reading events file:', error);
      return [];
    }
  }

  /**
   * @override
   * @returns {{name: string, description: string, parameters: object}}
   */
  static getSchema() {
    return {
      name: 'check_events',
      description: 'Searches for events based on given criteria.',
      parameters: {
        type: 'object',
        properties: {
          // Note: The execute method iterates over keys in criteria.
          // The schema should reflect the *expected* criteria fields for the AI.
          // Let's assume 'criteria' is a general search string for simplicity,
          // matching the original schema. Refine if specific fields are needed.
          criteria: { type: 'string', description: 'Search criteria such as date, type, or tag.' }
        },
        required: ['criteria']
      }
    };
  }
}

module.exports = CheckEvents;
