// streamState.js - Shared stream state between main.js and ipc.js
// This avoids circular dependency issues

const streamState = {
  currentAbortController: null
};

module.exports = { streamState }; 