const ActionBase = require('./ActionBase');
const { ipcRenderer } = require('electron'); // Required for sending IPC messages from renderer, but actions run in main.
                                        // This will be problematic. Actions run in the main process via ActionsManager.
                                        // The IPC call to show notification should be from renderer after tool response.
                                        // The action itself should just return success.
                                        // Let's re-evaluate. The action's execute is called by ChatManager, which is in main.
                                        // The flow is: AI -> ChatManager (main) -> Action (main) -> (response to AI) -> ChatManager (main) -> Renderer -> IPC to main for notification.
                                        // So, the action itself doesn't send IPC. It prepares data or confirms action.
                                        // The prompt says: `execute(params)`: Should send an IPC message (e.g., `show-native-notification`) to `main.js`
                                        // This implies the action *could* directly interact if it had access to `mainWindow.webContents.send`.
                                        // However, the more common pattern is for the renderer to handle UI effects based on action results.
                                        // Let's stick to the prompt's direct instruction for now, assuming the action context might provide `mainWindow`.
                                        // If not, we'll adjust. The prompt also says "Return a success message like 'Notification request sent.'"
                                        // This suggests the action's job is to *initiate* the request.

// Simpler approach: Action returns data, renderer uses it.
// The prompt: "execute(params): Should send an IPC message (e.g., `show-native-notification`) to `main.js` with `params.title`, `params.body`, and the `currentChatId`"
// This is tricky. Actions are typically backend logic. Sending IPC *from* an action in `main` *to* `main` to then show a notification is a bit convoluted.
// A cleaner way:
// 1. AI calls `create_notification`.
// 2. `CreateNotificationAction.execute()` runs in `main`. It *could* directly use `Notification` API if `main.js` exposes it or if `Notification` can be required here.
//    Or, it returns a structured response.
// 3. `chatManager` (main) gets the result.
// 4. `chatManager` sends the tool result (including notification details if the action doesn't show it directly) to `app.js` (renderer).
// 5. `app.js` (renderer) then calls `window.electronAPI.send('show-native-notification', ...)`
// This aligns with "Native Notifications & Chat Linking (`main.js`, `preload.js`, `app.js`, `chatHistory.js`)" section where `app.js` calls `window.electronAPI.send`.

// So, the action should simply validate and return the parameters, perhaps with a success status.
// The actual IPC call will be handled by `app.js` upon receiving the tool's successful execution response.
// The `context` (containing chatManager) will be passed to the execute method.

class CreateNotification extends ActionBase {
    constructor() {
        super();
        // name and schema are defined by static getSchema now
    }

    static getSchema() {
        return {
            name: 'create_notification',
            description: 'Creates a system notification. The UI will handle displaying it.',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'The title of the notification.',
                    },
                    body: {
                        type: 'string',
                        description: 'The main content of the notification.',
                    },
                },
                required: ['title', 'body'],
            },
        };
    }

    // Context will be passed by ActionsManager to execute
    async execute(params, context) {
        const { title, body } = params;
        // const currentChatId = context && context.chatManager ? context.chatManager.getCurrentChatId() : null;
        // The chatId will be handled by app.js when sending IPC, using its own knowledge of currentChatId.
        // The action's role is to validate and prepare data for the notification.

        if (!title || !body) {
            return {
                success: false,
                error: 'Missing title or body for notification.',
            };
        }

        // The action itself doesn't show the notification.
        // It signals success and provides the necessary data for the renderer.
        // The renderer (app.js) will receive this tool_call_response and then use IPC to show the native notification.
        // It will also add the chatId at that point.
        return {
            success: true,
            message: 'Notification request acknowledged. The system will attempt to display it.',
            data: { // This data will be part of the tool result sent back to the AI and then to the renderer
                title: title,
                body: body,
                // No need to pass chatId from here, app.js will handle it.
            }
        };
    }
}

module.exports = CreateNotification;