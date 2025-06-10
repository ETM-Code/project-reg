// src/renderer/chatHistory.js

document.addEventListener('DOMContentLoaded', () => {
  const chatListDiv = document.getElementById('chatList');
  const newChatBtn = document.getElementById('newChatBtn');
  const chatWindow = document.getElementById('chatWindow'); // Need access to clear/repopulate

  let currentChatId = null; // Keep track of the currently loaded chat
  let userHasManuallyScrolledUp = false;
  let isProgrammaticScroll = false;
  let scrollDebounceTimeout = null;

  // Function to clear the main chat window
  function clearChatWindow() {
    chatWindow.innerHTML = '';
    // Potentially reset any state in app.js related to the current conversation
  }

  // Function to render messages (simplified, might need adjustment based on app.js)
  // NOTE: This duplicates logic from app.js's appendMessage/createBubble.
  // Ideally, this rendering logic should be shared/refactored.
  function renderMessage(sender, text, index, messageId, chatId, personalityId = null) { // Add personalityId parameter
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
    // Enhanced regex to match various metadata formats and handle edge cases
    const metadataRegex = /^(Date: \d{1,2}\/\d{1,2}\/\d{4} \| Time: \d{1,2}:\d{2}:\d{2} \| Since last msg: \d+s\n)|(\(System: [^\)]+\)\n)/;
    let cleanText = text.replace(metadataRegex, '');
    
    // Remove any additional leading/trailing whitespace that might cause blank lines
    cleanText = cleanText.trim();
    
    // Handle cases where there might be multiple system messages or metadata lines
    // Remove any remaining lines that look like system messages
    const systemMessageRegex = /^\(System: [^\)]+\)\n/gm;
    cleanText = cleanText.replace(systemMessageRegex, '');
    
    // Final trim to ensure no leading/trailing whitespace
    cleanText = cleanText.trim();
    // --- End Strip Metadata ---

    // Use marked.parse if available globally or import/require it
    // Set innerHTML *after* potentially adding the button, using cleanText
    let bubbleContent = typeof marked !== 'undefined' ? marked.parse(cleanText) : cleanText.replace(/\n/g, '<br>');

    let buttonHtml = ''; // Store button HTML for user messages
    let personalityIconHtml = ''; // Store personality icon HTML for bot messages

    // Add Edit button *inside* the bubble for user messages
    if (sender === 'user' && messageId && chatId) { // Check chatId too
      buttonHtml = `
        <button class="absolute top-1.5 left-1.5 z-10 p-1 text-[var(--user-bubble-text)]/60 hover:text-[var(--user-bubble-text)] bg-[var(--user-bubble-bg)]/50 hover:bg-[var(--user-bubble-bg)]/75 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
                title="Edit message"
                data-message-id="${messageId}"
                data-raw-text="${escapeHtml(text)}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
        </button>
      `;
    } else if (sender === 'bot' || sender === 'model') {
      // Add personality icon for bot messages
      console.log(`[ChatHistory] Bot message - personalityId param: ${personalityId}`);
      
      // Use the passed personalityId if available, otherwise fall back to current personality
      if (window.getAvailablePersonalities) {
        const personalities = window.getAvailablePersonalities();
        console.log(`[ChatHistory] Available personalities:`, personalities.length, personalities.map(p => p.id));
        
        // Try to use the specific personality for this chat first
        let targetPersonalityId = personalityId;
        
        // If no specific personality provided, fall back to current active personality
        if (!targetPersonalityId && window.getCurrentActivePersonalityId) {
          targetPersonalityId = window.getCurrentActivePersonalityId();
          console.log(`[ChatHistory] Using current active personality: ${targetPersonalityId}`);
        }
        
        // If still no personality, fall back to default
        if (!targetPersonalityId && window.getCurrentDefaultPersonalityId) {
          targetPersonalityId = window.getCurrentDefaultPersonalityId();
          console.log(`[ChatHistory] Using default personality: ${targetPersonalityId}`);
        }
        
        console.log(`[ChatHistory] Target personality ID: ${targetPersonalityId}`);
        const personality = personalities.find(p => p.id === targetPersonalityId);
        console.log(`[ChatHistory] Found personality:`, personality);
        
        if (personality && personality.icon) {
          let iconSrc = personality.icon;
          console.log(`[ChatHistory] Original icon path: ${iconSrc}`);
          
          // Handle different icon path formats
          if (iconSrc.startsWith('src/renderer/')) {
            iconSrc = iconSrc.substring('src/renderer/'.length);
          }
          if (!iconSrc.startsWith('./') && !iconSrc.startsWith('http') && !iconSrc.startsWith('/')) {
            iconSrc = './' + iconSrc;
          }
          
          console.log(`[ChatHistory] Final icon path: ${iconSrc}`);
          
          personalityIconHtml = `
            <img src="${iconSrc}" 
                 alt="${personality.name}" 
                 class="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full object-cover opacity-60 border border-[var(--bot-bubble-text)]/20"
                 onerror="this.style.display='none'">
          `;
          console.log(`[ChatHistory] Generated icon HTML:`, personalityIconHtml);
        } else {
          console.log(`[ChatHistory] No personality found or no icon available`);
        }
      } else {
        console.log(`[ChatHistory] window.getAvailablePersonalities not available`);
      }
    }

    // Set bubble content with buttons/icons
    bubble.innerHTML = buttonHtml + personalityIconHtml + bubbleContent;

    // Handle external links to open in browser
    const links = bubble.querySelectorAll('a');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.href;
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          window.electronAPI.sendMessage('open-external-url', url);
        }
      });
    });

    // Add click listener for edit button if it exists
    if (buttonHtml) {
      const editBtn = bubble.querySelector('button[data-message-id]');
      if (editBtn) {
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
        };
      }
    }

     container.appendChild(bubble); // Append bubble (which now contains button if applicable)
     
     // Render LaTeX with MathJax if available
     if (window.MathJax && window.MathJax.typesetPromise) {
       window.MathJax.typesetPromise([bubble]).catch((err) => {
         console.warn('MathJax history render error:', err);
       });
     }
     
     chatWindow.appendChild(container);
  }

  // Helper to escape HTML for data attributes
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
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
          chatItem.dataset.chatId = chat.id; // Store chat ID
          
          // Create container for icon and title
          const contentContainer = document.createElement('div');
          contentContainer.className = 'flex items-center space-x-2';
          
          // Add personality icon if available
          if (chat.personalityId) {
            // We'll need to get personality data to show the icon
            const personalityIcon = document.createElement('img');
            personalityIcon.className = 'w-4 h-4 rounded-full flex-shrink-0 object-cover';
            personalityIcon.alt = 'Personality';
            
            // Get personality data to find the icon
            if (window.getAvailablePersonalities) {
              const personalities = window.getAvailablePersonalities();
              const personality = personalities.find(p => p.id === chat.personalityId);
              if (personality && personality.icon) {
                let iconSrc = personality.icon;
                // Handle different icon path formats
                if (iconSrc.startsWith('src/renderer/')) {
                  iconSrc = iconSrc.substring('src/renderer/'.length);
                }
                if (!iconSrc.startsWith('./') && !iconSrc.startsWith('http') && !iconSrc.startsWith('/')) {
                  iconSrc = './' + iconSrc;
                }
                personalityIcon.src = iconSrc;
                personalityIcon.onerror = () => {
                  personalityIcon.style.display = 'none';
                };
                contentContainer.appendChild(personalityIcon);
              }
            }
          }
          
          // Add chat title
          const titleSpan = document.createElement('span');
          titleSpan.className = 'truncate flex-1';
          titleSpan.textContent = chat.title || `Chat ${chat.id}`;
          contentContainer.appendChild(titleSpan);
          
          chatItem.appendChild(contentContainer);
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
      const chatData = await window.electronAPI.invoke('load-chat', chatId);
      currentChatId = chatId; // Update the current chat ID tracker

      clearChatWindow();

      // Extract history and chat metadata
      const history = chatData ? chatData.history : chatData; // Handle both old and new format
      const personalityId = chatData?.personalityId;
      const personalityName = chatData?.personalityName;
      const modelId = chatData?.modelId;

      console.log(`[ChatHistory] Loaded chat data:`, {
        personalityId,
        personalityName,
        modelId,
        hasHistory: !!history,
        historyLength: history?.length
      });

      // Render the loaded history
      if (history && history.length > 0) {
         const loadedChatId = currentChatId; // Capture chatId for the closure
         history.forEach((message, index) => { // Get index here
            // Assuming history format { id: '...', role: 'user'/'model', parts: [{ text: '...' }] }
            if (message.parts && message.parts.length > 0) {
               // Pass loadedChatId to renderMessage
               renderMessage(message.role, message.parts[0].text, index, message.id, loadedChatId, personalityId);
            }
         });
         // Use the new programmatic scroll function
         scrollToBottomProgrammatically(chatWindow);
      }

      // Update personality display in app.js if we have the data
      if (personalityName && window.updateActivePersonalityDisplay) {
        window.updateActivePersonalityDisplay(personalityName);
        console.log(`[ChatHistory] Updated personality display to: ${personalityName}`);
      }

      // Update model selector if we have the data
      if (modelId && window.updateModelSelectorDisplay) {
        window.updateModelSelectorDisplay(modelId);
        console.log(`[ChatHistory] Updated model selector to: ${modelId}`);
      }

      console.log(`Successfully loaded chat: ${chatId} (Personality: ${personalityName}, Model: ${modelId})`);
      // Highlight the selected chat in the list (optional)
      updateChatListSelection();

      // Reset the message index counter in app.js
      if (window.resetAppMessageCounter) {
        window.resetAppMessageCounter(history ? history.length : 0);
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
      // await loadChatList(); // No longer needed, new chat added via 'new-chat-saved' event in app.js
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
     // Find the title span within the chat item instead of replacing all content
     const titleSpan = chatItem.querySelector('span.truncate');
     if (titleSpan) {
       titleSpan.textContent = newTitle;
       console.log(`Updated title for chat ${chatId} in list to: ${newTitle}`);
     } else {
       // Fallback for older structure without icons
       chatItem.textContent = newTitle;
       console.log(`Updated title for chat ${chatId} in list to: ${newTitle} (fallback)`);
     }
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
 
 
   // Function to dynamically add a new chat item to the list
   function addChatToHistoryList(chatData) {
       if (!chatData || !chatData.id) {
           console.error("[ChatHistory] Invalid chat data received for adding to list:", chatData);
           return;
       }
       console.log(`[ChatHistory] Adding new chat item to list: ID=${chatData.id}, Title=${chatData.title}`);
       
       // Update currentChatId to the new chat since it's now active
       currentChatId = chatData.id;
       
       const chatItem = document.createElement('div');
       chatItem.className = 'chat-list-item-base'; // Use consistent styling
       chatItem.dataset.chatId = chatData.id;
       
       // Create container for icon and title
       const contentContainer = document.createElement('div');
       contentContainer.className = 'flex items-center space-x-2';
       
       // Add personality icon if available
       if (chatData.personalityId) {
         const personalityIcon = document.createElement('img');
         personalityIcon.className = 'w-4 h-4 rounded-full flex-shrink-0 object-cover';
         personalityIcon.alt = 'Personality';
         
         // Get personality data to find the icon
         if (window.getAvailablePersonalities) {
           const personalities = window.getAvailablePersonalities();
           const personality = personalities.find(p => p.id === chatData.personalityId);
           if (personality && personality.icon) {
             let iconSrc = personality.icon;
             // Handle different icon path formats
             if (iconSrc.startsWith('src/renderer/')) {
               iconSrc = iconSrc.substring('src/renderer/'.length);
             }
             if (!iconSrc.startsWith('./') && !iconSrc.startsWith('http') && !iconSrc.startsWith('/')) {
               iconSrc = './' + iconSrc;
             }
             personalityIcon.src = iconSrc;
             personalityIcon.onerror = () => {
               personalityIcon.style.display = 'none';
             };
             contentContainer.appendChild(personalityIcon);
           }
         }
       }
       
       // Add chat title
       const titleSpan = document.createElement('span');
       titleSpan.className = 'truncate flex-1';
       titleSpan.textContent = chatData.title || `Chat ${chatData.id}`;
       contentContainer.appendChild(titleSpan);
       
       chatItem.appendChild(contentContainer);
       chatItem.addEventListener('click', () => loadChat(chatData.id));

       // Prepend to the top of the list
       const firstChild = chatListDiv.firstChild;
       // Remove the "No saved chats" placeholder if it exists
       const placeholder = chatListDiv.querySelector('p');
       if (placeholder) chatListDiv.removeChild(placeholder);

       chatListDiv.insertBefore(chatItem, firstChild);
       
       // Update the chat list selection to highlight the new chat
       updateChatListSelection();
   }

   // Expose the function globally so app.js can call it
   window.addChatToHistoryList = addChatToHistoryList;

   // --- Event Listeners ---
   newChatBtn.addEventListener('click', startNewChat);

  // --- Initial Load ---
  loadChatList();

  // Listen for title updates from the main process
  window.electronAPI.onTitleUpdate((data) => {
    // Handle the event data format: { chatId, newTitle }
    if (data && data.chatId && data.newTitle) {
      updateChatItemTitle(data.chatId, data.newTitle);
    } else {
      console.warn('Invalid title update data received:', data);
    }
  });
  window.electronAPI.onChatDeleted(removeChatItem); // Listen for chat deletion events

  // TODO: Consider how to get the initial currentChatId from app.js or backend
  // For now, we assume no chat is loaded initially until one is clicked or created.

  // --- Intelligent Scroll Logic ---
  function scrollToBottomProgrammatically(element) {
    isProgrammaticScroll = true;
    element.scrollTop = element.scrollHeight;
  }

  if (chatWindow) {
    chatWindow.addEventListener('scroll', () => {
      if (isProgrammaticScroll) {
        isProgrammaticScroll = false; // Reset flag after programmatic scroll finishes
        return;
      }

      clearTimeout(scrollDebounceTimeout);

      // Check if near bottom (within a tolerance)
      const nearBottom = chatWindow.scrollHeight - chatWindow.scrollTop - chatWindow.clientHeight < 15;

      if (!nearBottom) {
        userHasManuallyScrolledUp = true;
        // console.log("User scrolled up");
      }

      scrollDebounceTimeout = setTimeout(() => {
        // This executes after the user has stopped scrolling for 150ms
        const stillNearBottom = chatWindow.scrollHeight - chatWindow.scrollTop - chatWindow.clientHeight < 15;
        if (stillNearBottom) {
          userHasManuallyScrolledUp = false;
          // console.log("User stopped scrolling at bottom, auto-scroll re-enabled.");
        } else {
          // console.log("User stopped scrolling, but not at bottom.");
        }
      }, 150); // 150ms debounce time
    });
  }

  // Expose this function for app.js to call when new content is added
  window.chatHistoryScrollToBottomIfAppropriate = () => {
    if (!userHasManuallyScrolledUp && chatWindow) {
      scrollToBottomProgrammatically(chatWindow);
    }
  };
  // --- End Intelligent Scroll Logic ---

});

// Expose a function to get the current chat ID for other modules
window.getCurrentChatId = () => {
  const chatListDiv = document.getElementById('chatList');
  const selectedItem = chatListDiv ? chatListDiv.querySelector('.selected-chat') : null;
  return selectedItem ? selectedItem.dataset.chatId : null;
};