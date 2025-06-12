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
  // Updated to handle AM/PM format and more flexible date/time patterns
  const metadataRegex = /^(Date: \d{1,2}\/\d{1,2}\/\d{2,4} \| Time: \d{1,2}:\d{2}:\d{2}(\s*(AM|PM))? \| Since last msg: \d+s\n?)|(\(System: [^\)]+\)\n?)/;
  let cleanText = text.replace(metadataRegex, '');
  
  // Remove any additional metadata lines that might have different formats
  // Handle multiple consecutive metadata/system lines
  const additionalMetadataRegex = /^(Date: [^\n]+\n)|(\(System: [^\)]+\)\n?)/gm;
  cleanText = cleanText.replace(additionalMetadataRegex, '');
  
  // Remove any leading empty lines and whitespace that might cause blank padding
  cleanText = cleanText.replace(/^\s*\n+/, '').trim();
  
  // Remove any remaining system messages that might be scattered throughout
  const systemMessageRegex = /^\(System: [^\)]+\)\n?/gm;
  cleanText = cleanText.replace(systemMessageRegex, '');
  
  // Final cleanup: remove leading/trailing whitespace and empty lines
  cleanText = cleanText.replace(/^\s+|\s+$/g, '').replace(/^\n+|\n+$/g, '');
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
   
   // Check if this is a timer/alarm creation message and inject widgets
   if ((sender === 'bot' || sender === 'model') && chatId) {
     setTimeout(() => {
       injectTimerWidgetsIntoMessage(container, cleanText, chatId);
     }, 100); // Small delay to ensure timer data is processed
   }
   
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

// Function to inject timer widgets into messages
function injectTimerWidgetsIntoMessage(messageContainer, messageText, chatId) {
  // Check if this message indicates a timer was created - updated patterns
  const isTimerMessage = messageText.includes('Timer Started Successfully') || 
                         messageText.includes('Timer Details') ||
                         messageText.includes('timer is set') ||
                         messageText.includes('perfect brew is ready') ||
                         messageText.includes('Kitchen timer activated') ||
                         messageText.includes('Break time timer set') ||
                         messageText.includes('Meeting reminder set') ||
                         messageText.includes('Workout timer ready') ||
                         messageText.includes('Study session timer set') ||
                         messageText.includes('Meditation timer started') ||
                         messageText.includes('Pomodoro timer activated') ||
                         messageText.includes('timer activated');
  
  const isAlarmMessage = messageText.includes('Alarm set') || 
                        messageText.includes('Alarm Details') ||
                        messageText.includes('alarm is set');

  if (!isTimerMessage && !isAlarmMessage) return;

  console.log('[Bubble] Timer/alarm message detected, injecting widgets...');

  // Get active timers and alarms from state
  if (window.state && (window.state.activeTimers || window.state.activeAlarms)) {
    const activeItems = [
      ...(window.state.activeTimers || []),
      ...(window.state.activeAlarms || [])
    ];

    // Find recently created items for this chat (within last 10 seconds)
    const recentItems = activeItems.filter(item => 
      item.chatId === chatId && 
      (Date.now() - new Date(item.createdAt).getTime()) < 10000
    );

    console.log(`[Bubble] Found ${recentItems.length} recent timer/alarm items for chat ${chatId}`);

    if (recentItems.length > 0) {
      const bubble = messageContainer.querySelector('.w-fit');
      if (bubble && !bubble.querySelector('.chat-timer-widget, .chat-alarm-widget')) {
        // Import the timer widget creation functions
        import('./timers.js').then(module => {
          recentItems.forEach(item => {
            let widget;
            if (item.duration) {
              // It's a timer
              widget = module.createChatTimerWidget(item);
              console.log('[Bubble] Created timer widget for:', item.id);
            } else {
              // It's an alarm
              widget = module.createChatAlarmWidget(item);
              console.log('[Bubble] Created alarm widget for:', item.id);
            }
            
            if (widget) {
              // Insert widget at the beginning of the bubble
              const firstChild = bubble.firstChild;
              bubble.insertBefore(widget, firstChild);
              
              // Add separator
              const separator = document.createElement('div');
              separator.className = 'timer-separator my-2 border-b border-gray-200/30';
              bubble.insertBefore(separator, firstChild);
              
              console.log('[Bubble] Inserted widget into bubble successfully');
            }
          });
        }).catch(err => {
          console.warn('Could not load timer widgets:', err);
        });
      }
    }
  }
}