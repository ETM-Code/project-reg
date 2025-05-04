// CreateEvent.js - Action to create a calendar event using Google Calendar API and local JSON storage
const ActionBase = require('./ActionBase');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const EVENTS_FILE = path.join(__dirname, '../../data/events.json');
const FINISHED_EVENTS_FILE = path.join(__dirname, '../../data/finishedEvents.json');

// Initialize events files if missing
if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(FINISHED_EVENTS_FILE)) fs.writeFileSync(FINISHED_EVENTS_FILE, JSON.stringify([], null, 2));

class CreateEvent extends ActionBase {
  /**
   * Creates an event.
   * @param {Object} params - { date, typeTag, importanceTag, reminder (optional) }
   */
  async execute(params) {
    const { date, typeTag, importanceTag, reminder } = params;
    // Stub: Insert integration with Google Calendar API here using proper OAuth2 flows.
    const newEvent = { date, typeTag, importanceTag, reminder, createdAt: new Date().toISOString() };

    // Save event to events.json
    let events = JSON.parse(fs.readFileSync(EVENTS_FILE));
    events.push(newEvent);
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));

    // Archive events older than 1 day
    const now = new Date();
    const updatedEvents = events.filter(event => (now - new Date(event.date)) <= 24 * 60 * 60 * 1000);
    const finishedEvents = events.filter(event => (now - new Date(event.date)) > 24 * 60 * 60 * 1000);
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(updatedEvents, null, 2));

    let archived = JSON.parse(fs.readFileSync(FINISHED_EVENTS_FILE));
    archived = archived.concat(finishedEvents);
    fs.writeFileSync(FINISHED_EVENTS_FILE, JSON.stringify(archived, null, 2));

    return newEvent;
  }

  /**
   * @override
   * @returns {{name: string, description: string, parameters: object}}
   */
  static getSchema() {
    return {
      name: 'create_event', // Keep snake_case for API consistency
      description: 'Creates a new event in Google Calendar with a specified date and title.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date of the event in YYYY-MM-DD format.' },
          title: { type: 'string', description: 'Title or description of the event.' }
          // Note: The execute method uses typeTag, importanceTag, reminder - schema needs update if these are AI-provided
        },
        required: ['date', 'title'] // Adjust required fields based on actual usage
      }
    };
  }
}

module.exports = CreateEvent;
