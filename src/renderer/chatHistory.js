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
  function renderMessage(sender, text, index, messageId) { // Accept index and messageId
     const bubble = document.createElement('div');
     const container = document.createElement('div');
     const bubbleClasses = sender === 'user'
       ? 'bg-blue-100 self-end text-left'
       : 'bg-gray-200 self-start text-left'; // Assuming 'bot' maps to 'model' role
     bubble.className = `w-fit max-w-3xl px-4 py-2 rounded-md whitespace-pre-wrap ${bubbleClasses}`;
     container.dataset.messageId = messageId; // Store messageId
     container.dataset.messageIndex = index; // Store index
     // Use marked.parse if available globally or import/require it
     bubble.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text.replace(/\n/g, '<br>');
     container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2`;
     container.appendChild(bubble);
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
          chatItem.className = 'p-2 rounded hover:bg-gray-300 cursor-pointer text-sm truncate';
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
         history.forEach((message, index) => { // Get index here
            // Assuming history format { id: '...', role: 'user'/'model', parts: [{ text: '...' }] }
            if (message.parts && message.parts.length > 0) {
               renderMessage(message.role, message.parts[0].text, index, message.id); // Pass index and message.id
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
           item.classList.add('bg-blue-200');
        } else {
           item.classList.remove('bg-blue-200');
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
