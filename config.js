// config.js - Loads environment variables using dotenv
require('dotenv').config();

module.exports = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GPT4O_API_KEY: process.env.GPT4O_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
  MAX_CREDITS: process.env.MAX_CREDITS ? parseInt(process.env.MAX_CREDITS) : 1000
};
