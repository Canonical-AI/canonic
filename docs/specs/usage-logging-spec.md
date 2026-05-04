# Usage Logging Design

## Goal
Implement a usage logging mechanism to track key interactions within Canonic. This will help identify which features are used most and where users might be getting stuck, ultimately improving the UX.

## Constraints
- **Opt-in Only:** Logging MUST be explicitly turned off by default.
- **Setup Prompt:** Users must be prompted during the initial setup to enable or disable logging.
- **Local Storage:** Logs should be stored locally on the user's machine (at least initially).
- **Privacy:** Ensure no sensitive information (API keys, document content) is logged.

## Proposed Changes

### 1. Configuration (`electron/config.js`)
- Add `telemetryEnabled: false` to the `DEFAULTS` object.

### 2. Setup Screen (`src/components/layout/SetupScreen.vue`)
- Add a 3rd step to the setup flow.
- This step will explain what is logged and why, and provide a toggle to enable it.
- Description: "Help improve Canonic by sharing anonymous usage data. We track things like which panels you use and how often you chat with the AI. We never collect your API keys or the content of your documents."

### 3. Settings Modal (`src/components/modals/SettingsModal.vue`)
- Add a toggle for "Usage Logging" in the settings.

### 4. Telemetry Utility (`src/utils/telemetry.js`)
- Create a utility that provides a `logEvent(eventName, details)` function.
- This function will check the app store's config for `telemetryEnabled`.
- If enabled, it will send the event to the main process via IPC.

### 5. Main Process Logging (`electron/main.js`)
- Add an IPC handler `telemetry:log`.
- This handler will append log entries to `~/.canonic/usage.log`.
- Log entry format: `[ISO-TIMESTAMP] [EVENT_NAME] {details...}`

### 6. Events to Track
- `app:start`
- `workspace:open`
- `file:open`
- `file:create`
- `ai:chat_sent`
- `version:save`
- `share:start`
- `comment:add`

## Implementation Steps
1. Update `electron/config.js`.
2. Implement `telemetry:log` in `electron/main.js`.
3. Create `src/utils/telemetry.js`.
4. Update `src/components/layout/SetupScreen.vue`.
5. Update `src/components/modals/SettingsModal.vue`.
6. Add `logEvent` calls to relevant components/store actions.
