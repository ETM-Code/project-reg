// src/renderer/app/timers.js
import { state } from './state.js';
import * as dom from './dom.js';
import { showInAppAlert } from './ui.js';

const TIMERS_ALARMS_UI_UPDATE_INTERVAL = 1000;

// Store chat timer elements for easy access
const chatTimerElements = new Map();

// Store active alarm sounds for persistent playback
const activeAlarmSounds = new Map();

export async function loadTimersAndAlarms() {
  try {
    console.log('[App] Loading timers and alarms...');
    const [timersResult, alarmsResult] = await Promise.all([
      window.electronAPI.invoke('get-active-timers'),
      window.electronAPI.invoke('get-active-alarms')
    ]);

    state.activeTimers = timersResult.success ? timersResult.timers : [];
    state.activeAlarms = alarmsResult.success ? alarmsResult.alarms : [];

    console.log(`[App] Loaded ${state.activeTimers.length} active timers, ${state.activeAlarms.length} active alarms.`);
    renderTimersAndAlarmsUI();
    await renderChatTimers(); // Render in chat as well
  } catch (error) {
    console.error('[App] Error loading timers/alarms:', error);
    state.activeTimers = [];
    state.activeAlarms = [];
    renderTimersAndAlarmsUI();
  }
}

// Create a timer widget for rendering in chat
export function createChatTimerWidget(timer) {
  const timerWidget = document.createElement('div');
  timerWidget.className = 'chat-timer-widget';
  timerWidget.dataset.timerId = timer.id;
  
  // Add debug styling to make it highly visible
  timerWidget.style.cssText = `
    background: #ff0000 !important;
    border: 3px solid #00ff00 !important;
    padding: 10px !important;
    margin: 10px 0 !important;
    display: block !important;
    position: relative !important;
    width: 100% !important;
    z-index: 1000 !important;
    color: white !important;
    font-weight: bold !important;
  `;
  
  const isTriggered = timer.triggered;
  const endTime = timer.startTime + (timer.duration * 1000);
  const isExpired = Date.now() >= endTime;
  
  const statusClass = isTriggered || isExpired ? 'timer-finished' : 'timer-active';
  
  timerWidget.innerHTML = `
    <div class="timer-widget-inner ${statusClass}" style="background: #ffff00 !important; color: #000000 !important; padding: 15px !important;">
      <div class="timer-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <div class="timer-content">
        <div class="timer-label">${timer.label || 'Timer'}</div>
        <div class="timer-display" id="chat-timer-${timer.id}">
          ${isTriggered || isExpired ? 'Finished!' : formatTime(Math.max(0, endTime - Date.now()))}
        </div>
        <div class="timer-duration">Duration: ${formatDuration(timer.duration)}</div>
      </div>
      <div class="timer-actions">
        <button class="timer-dismiss-btn" onclick="dismissChatTimer('${timer.id}')" title="Dismiss Timer">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  `;
  
  console.log('[Timers] Created timer widget with debug styling:', timerWidget);
  
  return timerWidget;
}

// Create an alarm widget for rendering in chat
export function createChatAlarmWidget(alarm) {
  const alarmWidget = document.createElement('div');
  alarmWidget.className = 'chat-alarm-widget';
  alarmWidget.dataset.alarmId = alarm.id;
  
  const isTriggered = alarm.triggered;
  let alarmTime;
  if (/^\d{2}:\d{2}$/.test(alarm.time)) {
    const [hours, minutes] = alarm.time.split(':');
    alarmTime = new Date();
    alarmTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  } else {
    alarmTime = new Date(alarm.time);
  }
  
  const isExpired = Date.now() >= alarmTime.getTime();
  const statusClass = isTriggered || isExpired ? 'alarm-triggered' : 'alarm-pending';
  
  let timeDisplay;
  try {
    if (/^\d{2}:\d{2}$/.test(alarm.time)) {
      timeDisplay = alarmTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      timeDisplay = alarmTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
    }
  } catch (e) {
    timeDisplay = alarm.time;
  }
  
  alarmWidget.innerHTML = `
    <div class="alarm-widget-inner ${statusClass}">
      <div class="alarm-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
      </div>
      <div class="alarm-content">
        <div class="alarm-label">${alarm.label || 'Alarm'}</div>
        <div class="alarm-display">
          ${isTriggered || isExpired ? 'Triggered!' : `at ${timeDisplay}`}
        </div>
      </div>
      <div class="alarm-actions">
        <button class="alarm-dismiss-btn" onclick="dismissChatAlarm('${alarm.id}')" title="Dismiss Alarm">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  `;
  
  return alarmWidget;
}

// Render chat timers in the appropriate chat context
async function renderChatTimers() {
  let currentChatId = null;
  
  // Try to get current chat ID from multiple sources
  if (window.getCurrentChatId) {
    currentChatId = window.getCurrentChatId();
  } else if (window.electronAPI) {
    try {
      currentChatId = await window.electronAPI.invoke('get-current-chat-id');
    } catch (error) {
      console.warn('[Timers] Failed to get current chat ID from IPC:', error);
    }
  }
  
  if (!currentChatId) {
    console.log('[Timers] No current chat ID available, skipping timer rendering');
    return;
  }
  
  console.log(`[Timers] Rendering chat timers for chat ${currentChatId}`);
  
  // Remove existing chat timer widgets
  chatTimerElements.clear();
  document.querySelectorAll('.chat-timer-widget, .chat-alarm-widget').forEach(el => {
    console.log('[Timers] Removing existing widget');
    el.remove();
  });
  
  const chatWindow = dom.getChatWindow();
  if (!chatWindow) {
    console.warn('[Timers] Chat window not found');
    return;
  }
  
  // Find messages that contain timer/alarm creation and insert widgets
  const messageContainers = chatWindow.querySelectorAll('[data-message-id]');
  console.log(`[Timers] Found ${messageContainers.length} message containers`);
  
  messageContainers.forEach((container, index) => {
    const messageText = container.textContent || '';
    console.log(`[Timers] Checking container ${index} text:`, messageText.substring(0, 100));
    
    // Check for timer mentions in the message - updated patterns to match StartTimer.js output
    state.activeTimers.forEach(timer => {
      const isTimerMessage = timer.chatId === currentChatId && (
        messageText.includes('Timer Started Successfully') || 
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
        messageText.includes('timer activated') ||
        messageText.includes(timer.label)
      );
      
      if (isTimerMessage) {
        console.log(`[Timers] Found timer message in container ${index} for timer ${timer.id}`);
        const timerWidget = createChatTimerWidget(timer);
        insertWidgetIntoMessage(container, timerWidget);
        chatTimerElements.set(timer.id, timerWidget);
      }
    });
    
    // Check for alarm mentions in the message
    state.activeAlarms.forEach(alarm => {
      const isAlarmMessage = alarm.chatId === currentChatId && (
        messageText.includes('Alarm set') || 
        messageText.includes('Alarm Details') || 
        messageText.includes('alarm is set') ||
        messageText.includes(alarm.label)
      );
      
      if (isAlarmMessage) {
        console.log(`[Timers] Found alarm message in container ${index} for alarm ${alarm.id}`);
        const alarmWidget = createChatAlarmWidget(alarm);
        insertWidgetIntoMessage(container, alarmWidget);
        chatTimerElements.set(alarm.id, alarmWidget);
      }
    });
  });
  
  console.log(`[Timers] Rendered ${chatTimerElements.size} timer/alarm widgets`);
}

// Insert widget into message bubble
function insertWidgetIntoMessage(messageContainer, widget) {
  // Look for the actual message bubble within the container
  const bubble = messageContainer.querySelector('.w-fit, .message-bubble, [style*="background-color"]');
  
  console.log('[Timers] Attempting to insert widget into container:', messageContainer);
  console.log('[Timers] Found bubble element:', bubble);
  console.log('[Timers] Bubble classes:', bubble?.className);
  console.log('[Timers] Container structure:', messageContainer.innerHTML.substring(0, 200));
  
  if (bubble) {
    console.log('[Timers] Inserting widget into message bubble');
    
    // Check if widget already exists to avoid duplicates
    if (bubble.querySelector('.chat-timer-widget, .chat-alarm-widget')) {
      console.log('[Timers] Widget already exists in this bubble, skipping');
      return;
    }
    
    // Create a separator
    const separator = document.createElement('div');
    separator.className = 'timer-separator my-2 border-b border-gray-200/30';
    separator.style.cssText = `
      background: #00ffff !important;
      height: 10px !important;
      width: 100% !important;
      display: block !important;
      margin: 10px 0 !important;
    `;
    
    // Insert at the beginning of the bubble content
    const firstChild = bubble.firstChild;
    if (firstChild) {
      bubble.insertBefore(widget, firstChild);
      bubble.insertBefore(separator, firstChild);
    } else {
      bubble.appendChild(widget);
      bubble.appendChild(separator);
    }
    
    console.log('[Timers] Widget inserted successfully, bubble now contains:', bubble.children.length, 'children');
    
    // Debug: Check where the widget actually ended up
    setTimeout(() => {
      const insertedWidget = document.querySelector('.chat-timer-widget');
      if (insertedWidget) {
        const rect = insertedWidget.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(insertedWidget);
        console.log('[Timers] Widget position debug:', {
          rect: rect,
          position: computedStyle.position,
          top: computedStyle.top,
          left: computedStyle.left,
          transform: computedStyle.transform,
          zIndex: computedStyle.zIndex,
          parent: insertedWidget.parentElement?.tagName,
          parentClasses: insertedWidget.parentElement?.className
        });
        
        // Highlight the widget's actual position
        insertedWidget.style.border = '5px solid magenta';
        insertedWidget.style.boxShadow = '0 0 20px magenta';
      } else {
        console.error('[Timers] Widget not found in DOM after insertion!');
      }
    }, 100);
    
  } else {
    console.warn('[Timers] Could not find message bubble to insert widget into');
    console.log('[Timers] Available children in container:', Array.from(messageContainer.children).map(el => ({
      tag: el.tagName,
      classes: el.className,
      hasWFit: el.querySelector('.w-fit') ? 'yes' : 'no'
    })));
    
    // Try alternative approach - look for any div that might be the bubble
    const allDivs = messageContainer.querySelectorAll('div');
    console.log('[Timers] All divs in container:', Array.from(allDivs).map(div => ({
      classes: div.className,
      hasText: div.textContent ? div.textContent.substring(0, 50) : 'no text'
    })));
    
    // Try to find a div with actual content (not just buttons/icons)
    const contentDiv = Array.from(allDivs).find(div => 
      div.textContent && 
      div.textContent.trim().length > 20 && 
      !div.querySelector('button') &&
      !div.querySelector('svg')
    );
    
    if (contentDiv) {
      console.log('[Timers] Found alternative content div, inserting widget there');
      contentDiv.insertBefore(widget, contentDiv.firstChild);
      const separator = document.createElement('div');
      separator.className = 'timer-separator my-2 border-b border-gray-200/30';
      contentDiv.insertBefore(separator, contentDiv.firstChild);
    } else {
      console.error('[Timers] Could not find any suitable container for timer widget');
    }
  }
}

// Format time for display (mm:ss)
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Format duration for display
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

// Play alarm sound
function playAlarmSound() {
  try {
    console.log('[Timers] Playing alarm sound...');
    
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create multiple beeps for attention
    const playBeep = (frequency, duration, delay = 0) => {
      setTimeout(() => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
      }, delay);
    };
    
    // Play a sequence of beeps
    playBeep(800, 0.2, 0);    // First beep
    playBeep(1000, 0.2, 300); // Second beep
    playBeep(800, 0.3, 600);  // Third longer beep
    
    console.log('[Timers] Alarm sound played successfully');
    
  } catch (error) {
    console.warn('[Timers] Could not play alarm sound via Web Audio API:', error);
    
    // Fallback to simple audio element with data URI
    try {
      const audio = new Audio();
      audio.volume = 0.7;
      // Simple sine wave data URI
      audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMbCDiS2e7Heu0FIXzM6NuQQAkXarfn52daFAlGneLzvmEbCTyX2+7HdOYFIXzJ8dSPQwcZaLbo6Z9BFApBqODyvWMcBjqN2O7Lb9wIKHfJ8N+PQQcVXa/m66hUFAlHmOH0u14dBUKS2+/Ce9oHL3TJ8d2OQwoVY7Lh5Z1VFAhAn+HwwmIrBTeU3u/Bc94dMHzG9duMRQwTXarh5aRRGAg+ltzyxHkpBz2R0OzN8+bKYQQQOYPJ7tKNU0wYUanX6qRXE0dGpNbz1mIrCWM1dP/9a0NANk3Q7LJP';
      audio.play().then(() => {
        console.log('[Timers] Fallback audio played successfully');
      }).catch((fallbackError) => {
        console.warn('[Timers] Fallback audio also failed:', fallbackError);
      });
    } catch (fallbackError) {
      console.warn('[Timers] All audio methods failed:', fallbackError);
    }
  }
}

// Start persistent alarm sound for critical notifications
function startPersistentAlarmSound(itemId, type) {
  console.log(`[Timers] Starting persistent alarm sound for ${type} ${itemId}`);
  
  // Don't start if already playing
  if (activeAlarmSounds.has(itemId)) {
    console.log(`[Timers] Alarm sound already playing for ${itemId}`);
    return;
  }
  
  // Start playing alarm sound immediately and then every 5 seconds
  playAlarmSound();
  
  const alarmInterval = setInterval(() => {
    // Check if the timer/alarm still exists and is active
    const isStillActive = type === 'timer' 
      ? state.activeTimers.some(t => t.id === itemId && t.triggered)
      : state.activeAlarms.some(a => a.id === itemId && a.triggered);
    
    if (isStillActive) {
      playAlarmSound();
      console.log(`[Timers] Playing persistent alarm sound for ${type} ${itemId}`);
    } else {
      console.log(`[Timers] Stopping persistent alarm sound for ${type} ${itemId} - no longer active`);
      stopPersistentAlarmSound(itemId);
    }
  }, 5000); // Play every 5 seconds
  
  activeAlarmSounds.set(itemId, alarmInterval);
  
  // Auto-stop after 5 minutes to prevent indefinite playing
  setTimeout(() => {
    if (activeAlarmSounds.has(itemId)) {
      console.log(`[Timers] Auto-stopping persistent alarm sound for ${type} ${itemId} after 5 minutes`);
      stopPersistentAlarmSound(itemId);
    }
  }, 300000);
}

// Stop persistent alarm sound
function stopPersistentAlarmSound(itemId) {
  if (activeAlarmSounds.has(itemId)) {
    clearInterval(activeAlarmSounds.get(itemId));
    activeAlarmSounds.delete(itemId);
    console.log(`[Timers] Stopped persistent alarm sound for ${itemId}`);
  }
}

// Enhanced alarm notification with macOS-specific features
function triggerEnhancedAlarm(item, type) {
  const isTimer = type === 'timer';
  const title = isTimer ? 'Timer Ended!' : 'Alarm!';
  const message = `${item.label || (isTimer ? 'Your timer' : 'Your alarm')} ${isTimer ? 'has finished' : 'is ringing'}.`;
  
  console.log(`[Timers] ${type} triggered:`, { id: item.id, label: item.label });
  
  // Send a message to the AI about the timer completion instead of showing popup
  if (window.electronAPI && item.chatId) {
    const aiNotificationMessage = `🔔 **Timer Completed**: "${item.label || 'Unnamed timer'}" has finished. The timer ran for ${isTimer ? formatDuration(item.duration) : 'the scheduled time'}.`;
    
    // Send a message to the AI in the appropriate chat
    window.electronAPI.sendMessage('chatMessage', { 
      message: `(System notification: Timer "${item.label || 'Unnamed timer'}" has completed)`,
      model: null, // Use current model
      isSystemMessage: true,
      chatId: item.chatId
    });
  }
  
  // macOS-specific enhancements (notification sound)
  if (window.electronAPI) {
    // Send enhanced notification with sound
    window.electronAPI.sendMessage('show-enhanced-notification', {
      title,
      body: message,
      chatId: item.chatId,
      type,
      requireInteraction: true,
      sound: true
    });
    
    // Request attention (dock bouncing)
    window.electronAPI.sendMessage('request-attention', { type: 'critical' });
  }
  
  // Start persistent in-app alarm sound after a delay (2 seconds) to avoid conflicting with notification
  setTimeout(() => {
    startPersistentAlarmSound(item.id, type);
  }, 2000);
  
  // Update chat widget if it exists
  const chatWidget = document.querySelector(`[data-${type}-id="${item.id}"]`);
  if (chatWidget) {
    const inner = chatWidget.querySelector(`.${type}-widget-inner`);
    if (inner) {
      inner.className = `${type}-widget-inner ${type === 'timer' ? 'timer-finished' : 'alarm-triggered'}`;
      inner.style.animation = 'pulse 2s infinite';
    }
  }
}

export async function checkTimersAndAlarms() {
  let changed = false;
  const now = Date.now();

  for (const timer of state.activeTimers) {
    if (timer.triggered) continue;
    const endTime = timer.startTime + (timer.duration * 1000);
    if (now >= endTime) {
      timer.triggered = true;
      changed = true;
      triggerEnhancedAlarm(timer, 'timer');
      try {
        await window.electronAPI.invoke('mark-timer-triggered', timer.id);
      } catch (error) {
        console.error(`[App] Error marking timer ${timer.id} as triggered:`, error);
      }
    }
  }

  for (const alarm of state.activeAlarms) {
    if (alarm.triggered) continue;
    let alarmTime;
    if (/^\d{2}:\d{2}$/.test(alarm.time)) {
      const [hours, minutes] = alarm.time.split(':');
      alarmTime = new Date();
      alarmTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      alarmTime = new Date(alarm.time);
    }

    if (now >= alarmTime.getTime()) {
      alarm.triggered = true;
      changed = true;
      triggerEnhancedAlarm(alarm, 'alarm');
      try {
        await window.electronAPI.invoke('mark-alarm-triggered', alarm.id);
      } catch (error) {
        console.error(`[App] Error marking alarm ${alarm.id} as triggered:`, error);
      }
    }
  }
  updateTimersAndAlarmsDisplay();
}

export function initializeTimers() {
    loadTimersAndAlarms();
    if (state.timersAlarmsInterval) clearInterval(state.timersAlarmsInterval);
    state.timersAlarmsInterval = setInterval(checkTimersAndAlarms, TIMERS_ALARMS_UI_UPDATE_INTERVAL);
    
    // Re-render chat timers when chat changes
    if (window.electronAPI) {
      window.electronAPI.onMessage('chat-loaded', () => {
        setTimeout(async () => {
          await renderChatTimers();
        }, 100); // Small delay to ensure DOM is ready
      });
    }
}

// Expose renderChatTimers to global window object
window.renderChatTimers = renderChatTimers;

// Enhance dismiss functions to stop sounds
window.dismissChatTimer = async function(timerId) {
  try {
    // Stop persistent sound if playing
    stopPersistentAlarmSound(timerId);
    
    await window.electronAPI.invoke('dismiss-timer', timerId);
    const widget = document.querySelector(`[data-timer-id="${timerId}"]`);
    if (widget) {
      widget.style.animation = 'slideOutUp 0.3s ease-in forwards';
      setTimeout(() => widget.remove(), 300);
    }
    chatTimerElements.delete(timerId);
    loadTimersAndAlarms();
  } catch (error) {
    console.error(`[App] Error dismissing timer ${timerId}:`, error);
  }
};

window.dismissChatAlarm = async function(alarmId) {
  try {
    // Stop persistent sound if playing
    stopPersistentAlarmSound(alarmId);
    
    await window.electronAPI.invoke('dismiss-alarm', alarmId);
    const widget = document.querySelector(`[data-alarm-id="${alarmId}"]`);
    if (widget) {
      widget.style.animation = 'slideOutUp 0.3s ease-in forwards';
      setTimeout(() => widget.remove(), 300);
    }
    chatTimerElements.delete(alarmId);
    loadTimersAndAlarms();
  } catch (error) {
    console.error(`[App] Error dismissing alarm ${alarmId}:`, error);
  }
};

function renderTimersAndAlarmsUI() {
  const timersAlarmsContainer = dom.getTimersAlarmsContainer();
  if (!timersAlarmsContainer) {
    console.warn('[App] timersAlarmsContainer not found in DOM.');
    return;
  }
  timersAlarmsContainer.innerHTML = '';

  [...state.activeTimers, ...state.activeAlarms].forEach(item => {
    const isTimer = !!item.duration;
    const itemDiv = document.createElement('div');
    
    // Use CSS variables for proper theming
    itemDiv.className = `p-2 mb-1 rounded text-xs border transition-colors duration-200`;
    itemDiv.style.backgroundColor = 'var(--content-bg-color)';
    itemDiv.style.borderColor = isTimer ? 'var(--primary-color)' : 'var(--accent-color)';
    itemDiv.style.color = 'var(--foreground-color)';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = `${item.label || (isTimer ? 'Timer' : 'Alarm')}: `;
    labelSpan.style.color = 'var(--foreground-color)';
    itemDiv.appendChild(labelSpan);

    const timeSpan = document.createElement('span');
    timeSpan.id = `${isTimer ? 'timer' : 'alarm'}-${item.id}-time`;
    timeSpan.style.color = isTimer ? 'var(--primary-color)' : 'var(--accent-color)';
    timeSpan.style.fontWeight = 'bold';
    itemDiv.appendChild(timeSpan);

    if (item.chatId && window.loadChat) {
      const goToChatBtn = document.createElement('button');
      goToChatBtn.textContent = 'Go to Chat';
      goToChatBtn.className = 'ml-2 px-1 py-0.5 rounded text-xs transition-colors duration-200';
      goToChatBtn.style.backgroundColor = 'var(--secondary-color)';
      goToChatBtn.style.color = 'var(--foreground-color)';
      goToChatBtn.style.borderColor = 'var(--border-color-soft)';
      goToChatBtn.onmouseover = () => {
        goToChatBtn.style.backgroundColor = 'var(--chat-list-hover-bg)';
      };
      goToChatBtn.onmouseout = () => {
        goToChatBtn.style.backgroundColor = 'var(--secondary-color)';
      };
      goToChatBtn.onclick = () => window.loadChat(item.chatId);
      itemDiv.appendChild(goToChatBtn);
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.innerHTML = '&times;';
    dismissBtn.className = 'ml-2 px-1 py-0.5 rounded text-xs font-bold transition-colors duration-200';
    dismissBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
    dismissBtn.style.color = '#ef4444';
    dismissBtn.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    dismissBtn.title = "Dismiss";
    dismissBtn.onmouseover = () => {
      dismissBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
    };
    dismissBtn.onmouseout = () => {
      dismissBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
    };
    dismissBtn.onclick = async () => {
      try {
        // Stop any persistent sounds
        stopPersistentAlarmSound(item.id);
        
        if (isTimer) {
          await window.electronAPI.invoke('dismiss-timer', item.id);
        } else {
          await window.electronAPI.invoke('dismiss-alarm', item.id);
        }
        loadTimersAndAlarms();
      } catch (error) {
        console.error(`[App] Error dismissing ${isTimer ? 'timer' : 'alarm'} ${item.id}:`, error);
      }
    };
    itemDiv.appendChild(dismissBtn);
    timersAlarmsContainer.appendChild(itemDiv);
  });
  updateTimersAndAlarmsDisplay();
}

function updateTimersAndAlarmsDisplay() {
  state.activeTimers.forEach(timer => {
    const timeElement = document.getElementById(`timer-${timer.id}-time`);
    if (timeElement) {
      if (timer.triggered) {
        timeElement.textContent = 'Ended!';
        timeElement.closest('div').classList.add('opacity-50');
      } else {
        const endTime = timer.startTime + (timer.duration * 1000);
        const remaining = Math.max(0, endTime - Date.now());
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        timeElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        if (remaining <= 0) {
          checkTimersAndAlarms();
        }
      }
    }
    
    // Update chat timer display
    const chatTimerDisplay = document.getElementById(`chat-timer-${timer.id}`);
    if (chatTimerDisplay && !timer.triggered) {
      const endTime = timer.startTime + (timer.duration * 1000);
      const remaining = Math.max(0, endTime - Date.now());
      if (remaining > 0) {
        chatTimerDisplay.textContent = formatTime(remaining);
      } else {
        chatTimerDisplay.textContent = 'Finished!';
        const widget = chatTimerDisplay.closest('.chat-timer-widget');
        if (widget) {
          widget.querySelector('.timer-widget-inner').className = 'timer-widget-inner timer-finished';
        }
      }
    }
  });

  state.activeAlarms.forEach(alarm => {
    const timeElement = document.getElementById(`alarm-${alarm.id}-time`);
    if (timeElement) {
      if (alarm.triggered) {
        timeElement.textContent = 'Triggered!';
        timeElement.closest('div').classList.add('opacity-50');
      } else {
        let alarmTimeStr = alarm.time;
        try {
          if (/^\d{2}:\d{2}$/.test(alarm.time)) {
            const [hours, minutes] = alarm.time.split(':');
            const alarmDate = new Date();
            alarmDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            alarmTimeStr = alarmDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else {
            alarmTimeStr = new Date(alarm.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
          }
        } catch (e) { /* use original string */ }
        timeElement.textContent = `at ${alarmTimeStr}`;
      }
    }
  });
}