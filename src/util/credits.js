// credits.js - Manages monthly API credit usage using a local JSON file
const fs = require('fs');
const path = require('path');
const config = require('../../config');

const CREDITS_FILE = path.join(__dirname, '../../data/monthlyCredits.json');

/**
 * Loads credit usage data or initializes it if not present.
 */
function loadCredits() {
  if (!fs.existsSync(CREDITS_FILE)) {
    const initData = { used: 0, month: new Date().getMonth() };
    fs.writeFileSync(CREDITS_FILE, JSON.stringify(initData, null, 2));
    return initData;
  }
  return JSON.parse(fs.readFileSync(CREDITS_FILE));
}

/**
 * Saves updated credit data.
 * @param {Object} credits 
 */
function saveCredits(credits) {
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
}

/**
 * Adds usage and updates the JSON file.
 * @param {number} amount 
 */
function addCredits(amount) {
  const credits = loadCredits();
  const currentMonth = new Date().getMonth();
  if (credits.month !== currentMonth) {
    credits.used = 0;
    credits.month = currentMonth;
  }
  credits.used += amount;
  saveCredits(credits);
}

/**
 * Returns current usage percentage.
 */
function getUsage() {
  const credits = loadCredits();
  return (credits.used / config.MAX_CREDITS) * 100;
}

module.exports = { addCredits, getUsage };
