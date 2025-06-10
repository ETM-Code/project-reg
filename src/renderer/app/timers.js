// src/renderer/app/timers.js
import { state } from './state.js';
import * as dom from './dom.js';
import { showInAppAlert } from './ui.js';

const TIMERS_ALARMS_UI_UPDATE_INTERVAL = 1000;

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
  } catch (error) {
    console.error('[App] Error loading timers/alarms:', error);
    state.activeTimers = [];
    state.activeAlarms = [];
    renderTimersAndAlarmsUI();
  }
}

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
    itemDiv.className = `p-2 mb-1 rounded text-xs ${isTimer ? 'bg-blue-100 dark:bg-blue-800' : 'bg-orange-100 dark:bg-orange-800'} border ${isTimer ? 'border-blue-300 dark:border-blue-600' : 'border-orange-300 dark:border-orange-600'}`;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = `${item.label || (isTimer ? 'Timer' : 'Alarm')}: `;
    itemDiv.appendChild(labelSpan);

    const timeSpan = document.createElement('span');
    timeSpan.id = `${isTimer ? 'timer' : 'alarm'}-${item.id}-time`;
    itemDiv.appendChild(timeSpan);

    if (item.chatId && window.loadChat) {
      const goToChatBtn = document.createElement('button');
      goToChatBtn.textContent = 'Go to Chat';
      goToChatBtn.className = 'ml-2 px-1 py-0.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs';
      goToChatBtn.onclick = () => window.loadChat(item.chatId);
      itemDiv.appendChild(goToChatBtn);
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.innerHTML = '&times;';
    dismissBtn.className = 'ml-2 px-1 py-0.5 bg-red-200 dark:bg-red-700 hover:bg-red-300 dark:hover:bg-red-600 rounded text-xs font-bold';
    dismissBtn.title = "Dismiss";
    dismissBtn.onclick = async () => {
      try {
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

export async function checkTimersAndAlarms() {
  let changed = false;
  const now = Date.now();

  for (const timer of state.activeTimers) {
    if (timer.triggered) continue;
    const endTime = timer.startTime + (timer.duration * 1000);
    if (now >= endTime) {
      timer.triggered = true;
      changed = true;
      showInAppAlert('timer', 'Timer Ended!', `${timer.label || 'Your timer'} has finished.`, timer.chatId);
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
      showInAppAlert('alarm', 'Alarm!', `${alarm.label || 'Your alarm'} is ringing.`, alarm.chatId);
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
}