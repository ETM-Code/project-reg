// voice.js - Provides text-to-speech (TTS) and speech-to-text (STT) functions
const axios = require('axios');
const config = require('../../config');

/**
 * Converts text to speech using ElevenLabs API.
 * Falls back to browser speech synthesis on failure.
 * @param {string} text - Text to be spoken.
 */
async function textToSpeech(text) {
  try {
    const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${config.ELEVENLABS_VOICE_ID}`, {
      text
    }, {
      headers: {
        'xi-api-key': config.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });
    // Play the returned audio using the browser's Audio API
    const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audio.play();
  } catch (error) {
    console.error("ElevenLabs TTS failed, falling back to local TTS.", error);
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Starts speech recognition using the Web Speech API.
 * @param {function} callback - Called with transcribed text.
 */
function startSpeechRecognition(callback) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error("SpeechRecognition API not supported in this browser.");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    callback(transcript);
  };
  recognition.onerror = (error) => console.error("Speech recognition error:", error);
  recognition.start();
}

module.exports = { textToSpeech, startSpeechRecognition };
