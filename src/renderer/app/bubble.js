// src/renderer/app/bubble.js
import * as dom from './dom.js';
import { state } from './state.js';

export function appendMessage(sender, text, index) {
  const bubbleElements = createBubble(sender, text, index);
  dom.getChatWindow().appendChild(bubbleElements.container);
  if (window.chatHistoryScrollToBottomIfAppropriate) {
    window.chatHistoryScrollToBottomIfAppropriate();
  }
}

export function createBubble(sender, text, messageId = null, chatId = null, personalityId = null) {
  const bubble = document.createElement('div');
  const container = document.createElement('div');
  // Ensure container has relative and group for absolute positioning and hover effect of button
  container.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-2 relative group`;
  container.dataset.messageId = messageId; // Store messageId

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
    // Use the passed personalityId if available, otherwise fall back to current personality
    if (window.getAvailablePersonalities) {
      const personalities = window.getAvailablePersonalities();
      
      // Try to use the specific personality for this chat first
      let targetPersonalityId = personalityId;
      
      // If no specific personality provided, fall back to current active personality
      if (!targetPersonalityId && window.getCurrentActivePersonalityId) {
        targetPersonalityId = window.getCurrentActivePersonalityId();
      }
      
      // If still no personality, fall back to default
      if (!targetPersonalityId && window.getCurrentDefaultPersonalityId) {
        targetPersonalityId = window.getCurrentDefaultPersonalityId();
      }
      
      const personality = personalities.find(p => p.id === targetPersonalityId);
      
      if (personality && personality.icon) {
        let iconSrc = personality.icon;
        
        // Handle different icon path formats
        if (iconSrc.startsWith('src/renderer/')) {
          iconSrc = iconSrc.substring('src/renderer/'.length);
        }
        if (!iconSrc.startsWith('./') && !iconSrc.startsWith('http') && !iconSrc.startsWith('/')) {
          iconSrc = './' + iconSrc;
        }
        
        personalityIconHtml = `
          <img src="${iconSrc}" 
               alt="${personality.name}" 
               class="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full object-cover opacity-60 border border-[var(--bot-bubble-text)]/20"
               onerror="this.style.display='none'">
        `;
      }
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
   
   return { container, bubble, rawText: text };
}

// Helper to escape HTML for data attributes
export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
       .replace(/&/g, "&")
       .replace(/</g, "<")
       .replace(/>/g, ">")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}