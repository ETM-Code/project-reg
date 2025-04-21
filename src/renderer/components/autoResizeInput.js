// src/renderer/components/autoResizeInput.js

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('userInput');

  if (!textarea) {
    console.error("AutoResizeInput: Textarea element with ID 'userInput' not found.");
    return;
  }

  // Function to adjust textarea height
  const adjustHeight = () => {
    // Temporarily shrink height to get accurate scrollHeight
    textarea.style.height = 'auto';
    // Set height based on scroll height, respecting CSS max-height
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  // Adjust height on input event
  textarea.addEventListener('input', adjustHeight);

  // Adjust height on initial load in case there's pre-filled text (e.g., during editing)
  // Use a small timeout to ensure layout is stable
  setTimeout(adjustHeight, 50);

  // Also adjust height if the window is resized (though less common for textareas)
  window.addEventListener('resize', adjustHeight);

  // --- Handle Enter/Shift+Enter specifically for resizing ---
  // We need to ensure the height recalculates *after* the newline is added
  // or *before* the message is sent (cleared).
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow default behavior (newline) and recalculate height shortly after
        setTimeout(adjustHeight, 10);
      } else {
        // Prevent default (sending message is handled in app.js)
        // Reset height *before* app.js clears the textarea
        // Use setTimeout to ensure this runs after the keydown but before send
        setTimeout(() => {
          textarea.style.height = 'auto'; // Reset to base height
        }, 0);
      }
    }
  });

  // Ensure height resets when editing is cancelled (input cleared in app.js)
  // We can listen for the 'Cancel Edit' button click or create a custom event if needed,
  // but simply resetting on focus might be sufficient if the input is always cleared.
  // Let's add a reset on focus as a simple approach.
  textarea.addEventListener('focus', () => {
      // If the textarea is empty on focus (likely after send/cancel), reset height.
      if (textarea.value === '') {
          textarea.style.height = 'auto';
      } else {
          // If it has content (e.g., starting edit), adjust height
          adjustHeight();
      }
  });


  console.log("AutoResizeInput initialized for #userInput.");
});