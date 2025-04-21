// src/renderer/chatHistory.js

document.addEventListener('DOMContentLoaded', () => {
  const chatListDiv = document.getElementById('chatList');
  const newChatBtn = document.getElementById('newChatBtn');
  const chatWindow = document.getElementById('chatWindow'); // Need access to clear/repopulate

  let currentChatId = null; // Keep track of the currently loaded chat

  // Function to clear the main chat window
  function clearChatWindow() {
    chatWindow.innerHTML = '';
    // Potentially reset any state in app.js related to the current conversation
  }

  // Function to render messages (simplified, might need adjustment based on app.js)
  // NOTE: This duplicates logic from app.js's appendMessage/createBubble.
  // Ideally, this rendering logic should be shared/refactored.
  function renderMessage(sender, text, index, messageId, chatId) { // Add chatId parameter
     const bubble = document.createElement('div');
     const container = document.createElement('div');
     // Ensure container has relative and group for absolute positioning and hover effect of button
     container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2 relative group`;
     container.dataset.messageId = messageId; // Store messageId
     // container.dataset.messageIndex = index; // Store index (optional, might remove if ID is primary)

     // Use CSS variables for bubble backgrounds
     const bubbleBgVar = sender === 'user' ? 'var(--user-bubble-bg)' : 'var(--bot-bubble-bg)';
     const bubbleTextVar = sender === 'user' ? 'var(--user-bubble-text)' : 'var(--bot-bubble-text)';
     const alignmentClass = sender === 'user' ? 'self-end' : 'self-start';
     // Use rounded-lg, add shadow, consistent with app.js (no fade-in needed for loaded history)
     bubble.className = `w-fit max-w-3xl px-4 py-2 rounded-lg whitespace-pre-wrap text-left ${alignmentClass} relative group shadow-sm`;
     bubble.style.backgroundColor = bubbleBgVar;
     bubble.style.color = bubbleTextVar; // Apply specific text color

    // --- Strip Metadata ---
    // Corrected Regex to match the 24-hour format observed (e.g., "Date: 18/4/2025 | Time: 13:37:06 | Since last msg: 0s\n")
    const metadataRegex = /^Date: \d{1,2}\/\d{1,2}\/\d{4} \| Time: \d{1,2}:\d{2}:\d{2} \| Since last msg: \d+s\n/;
    const cleanText = text.replace(metadataRegex, '');
    // --- End Strip Metadata ---

    // Use marked.parse if available globally or import/require it
    // Set innerHTML *after* potentially adding the button, using cleanText
    let bubbleContent = typeof marked !== 'undefined' ? marked.parse(cleanText) : cleanText.replace(/\n/g, '<br>');

    // Add Edit button *inside* the bubble for user messages
    if (sender === 'user' && messageId && chatId) { // Check chatId too
      const editBtn = document.createElement('button');
      // Keep absolute positioning, remove opacity-0, add z-10 for debugging visibility
      editBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
        </svg>
      `;
      // Restore opacity-0 and group-hover:opacity-100 for hover effect
      // Style edit button using variables (consistent with app.js) - use bubble text color
      editBtn.className = 'absolute top-1.5 left-1.5 z-10 p-1 text-[var(--user-bubble-text)]/60 hover:text-[var(--user-bubble-text)] bg-[var(--user-bubble-bg)]/50 hover:bg-[var(--user-bubble-bg)]/75 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200'; // Adjust position slightly
      editBtn.title = "Edit message"; // Add tooltip
      editBtn.dataset.messageId = messageId; // Store ID on button
      // Store the *original* text (with metadata) for editing, but display clean text
      editBtn.dataset.rawText = text;

      // Attach onclick listener directly to the element
      editBtn.onclick = (e) => {
           e.stopPropagation(); // Prevent potential container clicks
           // Call the globally exposed handler from app.js
           if (window.handleAppEditClick) {
               // Pass chatId, messageId, rawText, and the container element
               window.handleAppEditClick(chatId, messageId, text, container); // Pass chatId
           } else {
               console.error("Edit handler (window.handleAppEditClick) not found!");
               alert("Error: Cannot initiate edit.");
           }
       }; // End of editBtn.onclick
       // Set bubble content first
       bubble.innerHTML = bubbleContent;
       // Prepend the actual button *element* to the bubble
       bubble.prepend(editBtn);
     } else {
       // If not adding button, just set the content
       bubble.innerHTML = bubbleContent;
     }

     container.appendChild(bubble); // Append bubble (which now contains button if applicable)
     chatWindow.appendChild(container);
  }

  // Function to load and display the list of saved chats
  async function loadChatList() {
    try {
      const chats = await window.electronAPI.invoke('list-chats');
      chatListDiv.innerHTML = ''; // Clear existing list
      if (chats && chats.length > 0) {
        chats.forEach(chat => {
          const chatItem = document.createElement('div');
          // Use component class for chat list items
          chatItem.className = 'chat-list-item-base';
          chatItem.textContent = chat.title || `Chat ${chat.id}`; // Use title or ID
          chatItem.dataset.chatId = chat.id; // Store chat ID
          chatItem.addEventListener('click', () => loadChat(chat.id));
          chatListDiv.appendChild(chatItem);
        });
      } else {
        chatListDiv.innerHTML = '<p class="text-xs text-gray-500">No saved chats.</p>';
      }
    } catch (error) {
      console.error('Failed to load chat list:', error);
      chatListDiv.innerHTML = '<p class="text-xs text-red-500">Error loading chats.</p>';
    }
  }

  // Function to load a specific chat's history
  async function loadChat(chatId) {
    if (chatId === currentChatId) return; // Don't reload if already loaded

    console.log(`Requesting to load chat: ${chatId}`);
    try {
      // Invoke the backend handler to load the chat data AND set it as active
      const history = await window.electronAPI.invoke('load-chat', chatId);
      currentChatId = chatId; // Update the current chat ID tracker

      clearChatWindow();

      // Render the loaded history
      if (history && history.length > 0) {
         const loadedChatId = currentChatId; // Capture chatId for the closure
         history.forEach((message, index) => { // Get index here
            // Assuming history format { id: '...', role: 'user'/'model', parts: [{ text: '...' }] }
            if (message.parts && message.parts.length > 0) {
               // Pass loadedChatId to renderMessage
               renderMessage(message.role, message.parts[0].text, index, message.id, loadedChatId);
            }
         });
         chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll to bottom
      }
      console.log(`Successfully loaded chat: ${chatId}`);
      // Highlight the selected chat in the list (optional)
      updateChatListSelection();

      // Reset the message index counter in app.js
      if (window.resetAppMessageCounter) {
        window.resetAppMessageCounter(history.length);
      }

    } catch (error) {
      console.error(`Failed to load chat ${chatId}:`, error);
      // Maybe show an error message to the user
    }
  }

  // Function to handle starting a new chat
  async function startNewChat() {
    console.log('Requesting to start new chat');
    try {
      const newChatId = await window.electronAPI.invoke('start-new-chat');
      currentChatId = newChatId; // Update the current chat ID tracker
      console.log('Started new chat with ID:', newChatId);
      clearChatWindow();
      await loadChatList(); // Reload the list to show the new chat
      updateChatListSelection(); // Highlight the new chat
    } catch (error) {
      console.error('Failed to start new chat:', error);
    }
  }

  // Function to visually indicate the selected chat (optional)
  function updateChatListSelection() {
     const items = chatListDiv.querySelectorAll('div[data-chat-id]');
     items.forEach(item => {
        if (item.dataset.chatId === currentChatId) {
           item.style.backgroundColor = 'var(--chat-list-selected-bg)';
           item.style.color = 'var(--chat-list-selected-text)'; // Apply selected text color
           item.classList.add('selected-chat');
        } else {
           item.style.backgroundColor = '';
           item.style.color = ''; // Reset text color
           item.classList.remove('selected-chat');
           // Add hover effect handling
           item.onmouseenter = () => { if (!item.classList.contains('selected-chat')) item.style.backgroundColor = 'var(--chat-list-hover-bg)'; };
           item.onmouseleave = () => { if (!item.classList.contains('selected-chat')) item.style.backgroundColor = ''; };
        }
     });
  }

 // Function to update a chat item's title in the list
 function updateChatItemTitle(chatId, newTitle) {
   const chatItem = chatListDiv.querySelector(`div[data-chat-id="${chatId}"]`);
   if (chatItem) {
     chatItem.textContent = newTitle;
     console.log(`Updated title for chat ${chatId} in list to: ${newTitle}`);
   } else {
     console.warn(`Could not find chat item with ID ${chatId} to update title.`);
   }
  }
 
  // Function to remove a chat item from the list
  function removeChatItem(chatId) {
    const chatItem = chatListDiv.querySelector(`div[data-chat-id="${chatId}"]`);
    if (chatItem) {
      chatItem.parentNode.removeChild(chatItem);
      console.log(`Removed deleted chat ${chatId} from list.`);
      // Check if the list is now empty
      if (chatListDiv.children.length === 0) {
         chatListDiv.innerHTML = '<p class="text-xs text-gray-500">No saved chats.</p>';
      }
      // If the deleted chat was the currently active one, potentially clear the main window
      // or load another chat (e.g., the first one in the list or start a new one).
      // For now, we'll just remove it from the list. Handling the active chat state
      // might require more complex logic depending on desired UX.
      if (currentChatId === chatId) {
          currentChatId = null; // Clear the currentChatId tracker
          // Optionally clear the main chat window here if desired
          // clearChatWindow();
      }
    } else {
      console.warn(`Could not find chat item with ID ${chatId} to remove.`);
    }
  }
 
 
   // --- Event Listeners ---
   newChatBtn.addEventListener('click', startNewChat);

  // --- Initial Load ---
  loadChatList();

  // Listen for title updates from the main process
  window.electronAPI.onTitleUpdate(updateChatItemTitle);
  window.electronAPI.onChatDeleted(removeChatItem); // Listen for chat deletion events

  // TODO: Consider how to get the initial currentChatId from app.js or backend
  // For now, we assume no chat is loaded initially until one is clicked or created.

});

// Expose a function to get the current chat ID for other modules
window.getCurrentChatId = () => {
  return currentChatId;
};
