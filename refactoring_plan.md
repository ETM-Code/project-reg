# Refactoring Plan: `src/renderer/app.js`

This document outlines the plan for refactoring the monolithic `src/renderer/app.js` file into smaller, more manageable modules.

## Phase 1: Project Structure Setup

1.  **Create New Directory**: A new directory will be created at `src/renderer/app/` to house the new modules.

## Phase 2: Module Creation & Code Migration

The existing `app.js` will be broken down into the following single-responsibility modules within the `src/renderer/app/` directory.

-   **`src/renderer/app/state.js`**: Centralizes the application's dynamic state variables (e.g., `isEditing`, `currentStreamAbortController`, `activeTimers`).
-   **`src/renderer/app/dom.js`**: Declares and exports all DOM element getters (e.g., `chatWindow`, `userInput`, `sendBtn`).
-   **`src/renderer/app/ui.js`**: Manages general UI interactions and components like window controls, sidebar toggle, loading bubbles, and in-app alerts.
-   **`src/renderer/app/theme.js`**: Handles theme application logic.
-   **`src/renderer/app/font.js`**: Handles font application logic.
-   **`src/renderer/app/config.js`**: Manages fetching the main application configuration and populating the model selector.
-   **`src/renderer/app/personality.js`**: All logic related to fetching, setting, and updating chat personalities.
-   **`src/renderer/app/message.js`**: Core logic for creating, appending, and rendering chat messages.
-   **`src/renderer/app/editing.js`**: Contains all functions related to the message editing feature.
-   **`src/renderer/app/input.js`**: Manages the logic for the expandable text input area and the primary `handleSendOrSave` function.
-   **`src/renderer/app/streaming.js`**: Handles the client-side logic for processing streaming AI responses.
-   **`src/renderer/app/ipc.js`**: Centralizes all Electron IPC listeners (`window.electronAPI.onMessage(...)`).
-   **`src/renderer/app/timers.js`**: Contains all logic for the timers and alarms feature.
-   **`src/renderer/app/init.js`**: Orchestrates the application's startup sequence within the `DOMContentLoaded` event.

## Phase 3: The New `app.js` Orchestrator

The existing `src/renderer/app.js` file will be completely overhauled to become a lean orchestrator. Its new responsibilities will be:

1.  **Import Modules**: Import all the newly created modules.
2.  **Expose Globals**: Explicitly attach the required functions to the `window` object to maintain compatibility with other scripts.
3.  **Initialize**: Call the main initialization function from `init.js` when the DOM is loaded.

## Visual Plan: Mermaid Diagram

```mermaid
graph TD
    subgraph "New Modular Structure"
        direction LR
        NewAppJS["src/renderer/app.js (Orchestrator)"]

        subgraph "src/renderer/app/"
            direction TB
            Init["init.js"]
            DOM["dom.js"]
            State["state.js"]
            UI["ui.js"]
            Theme["theme.js"]
            Font["font.js"]
            Config["config.js"]
            Personality["personality.js"]
            Message["message.js"]
            Editing["editing.js"]
            Input["input.js"]
            Streaming["streaming.js"]
            IPC["ipc.js"]
            Timers["timers.js"]
        end

        NewAppJS -->|Imports & Initializes| Init
        Init -->|Uses| DOM
        Init -->|Uses| State
        Init -->|Uses| Theme
        Init -->|Uses| Font
        Init -->|Uses| Config
        Init -->|Uses| Personality
        Init -->|Uses| Timers
        Init -->|Uses| UI
        Init -->|Uses| Input
        Init -->|Uses| IPC

        NewAppJS -->|Exposes to| WindowObject[window]
    end

    subgraph "External Consumers"
        direction TB
        Components["Other JS Components (e.g., personalitySelector.js)"]
        HTML["index.html (inline scripts)"]
    end

    WindowObject -->|Provides functions to| Components
    WindowObject -->|Provides functions to| HTML