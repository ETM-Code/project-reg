// CheckEvents.js - Action to search and filter calendar events from local JSON storage
const ActionBase = require('./ActionBase');
const fs = require('fs');
const path = require('path');

const EVENTS_FILE = path.join(__dirname, '../../data/events.json');

class CheckEvents extends ActionBase {
  /**
   * Searches for events based on provided criteria.
   * @param {Object} criteria - e.g., { typeTag, date }
   * @returns {Array} Matching events (max 100)
   */
  async execute(criteria) {
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
  }
}

module.exports = CheckEvents;
