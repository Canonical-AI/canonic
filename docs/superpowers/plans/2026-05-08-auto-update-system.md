# Auto-Update System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-download on launch, user-configurable auto-update and experimental channel prefs, and a prominent titlebar update indicator that makes it impossible to miss a ready update.

**Architecture:** Config gains two new fields (`autoUpdate`, `updateChannel`). The main process reads them live in the `update-available` event handler so changes take effect next check without restart. Channel (`allowPrerelease`) is set at boot from config — requires restart to change, which is communicated in the UI. The subtle bottom-right banner is replaced by an inline titlebar indicator that escalates: muted badge → download progress inline → pulsing accent button when ready.

**Tech Stack:** `electron-updater`, Vue 3, Pinia, Vite, Vitest — all already in place.

---

## File Map

| File | Change |
|------|--------|
| `electron/config.js` | Add `autoUpdate: true` and `updateChannel: 'stable'` to DEFAULTS |
| `electron/main.js` | `setupAutoUpdater()` reads config for channel + auto-download decision |
| `src/components/modals/SettingsModal.vue` | Add Updates tab; move check-for-updates button there; add toggle cards |
| `src/components/layout/MainLayout.vue` | Replace bottom-right banner with titlebar inline update indicator |
| `tests/unit/config.test.js` | Tests for new default fields |

---

## Task 1: Add update prefs to config defaults

**Files:**
- Modify: `electron/config.js`
- Modify: `tests/unit/config.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of the `describe("config", ...)` block in `tests/unit/config.test.js`:

```js
it("read() includes autoUpdate: true by default", () => {
  config.write({ displayName: "Test" });
  const cfg = config.read();
  expect(cfg.autoUpdate).toBe(true);
});

it("read() includes updateChannel: 'stable' by default", () => {
  config.write({ displayName: "Test" });
  const cfg = config.read();
  expect(cfg.updateChannel).toBe("stable");
});

it("write() persists autoUpdate: false and read() returns it", () => {
  config.write({ displayName: "Test", autoUpdate: false });
  expect(config.read().autoUpdate).toBe(false);
});

it("write() persists updateChannel: 'experimental' and read() returns it", () => {
  config.write({ displayName: "Test", updateChannel: "experimental" });
  expect(config.read().updateChannel).toBe("experimental");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/unit/config.test.js
```
Expected: 4 failing — `autoUpdate is not a property`, etc.

- [ ] **Step 3: Add defaults to `electron/config.js`**

In the `DEFAULTS` object, add after `telemetryEnabled`:

```js
const DEFAULTS = {
  displayName: os.userInfo().username,
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "anthropic/claude-sonnet-4-5",
  defaultWorkspacePath: path.join(os.homedir(), "canonic"),
  telemetryEnabled: false,
  autoUpdate: true,
  updateChannel: "stable",
  sharingDefaults: {
    scope: "file",
    permission: "view",
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/unit/config.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/config.js tests/unit/config.test.js
git commit -m "feat: add autoUpdate and updateChannel to config defaults"
```

---

## Task 2: Wire autoUpdater to config prefs in main process

**Files:**
- Modify: `electron/main.js` (lines ~248–278, the `setupAutoUpdater` function)

- [ ] **Step 1: Update `setupAutoUpdater()` in `electron/main.js`**

Replace the existing `setupAutoUpdater` function:

```js
function setupAutoUpdater() {
  if (isDev) return;

  // Read config for channel preference at boot (channel change requires restart)
  const cfg = configService.read();
  autoUpdater.autoDownload = false; // we control downloads manually
  autoUpdater.allowPrerelease = cfg?.updateChannel === "experimental";

  autoUpdater.checkForUpdatesAndNotify();

  // Check for updates every 4 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdates();
    },
    4 * 60 * 60 * 1000,
  );

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update:available", info);
    // Read config fresh so toggling autoUpdate in settings takes effect
    const liveCfg = configService.read();
    if (liveCfg?.autoUpdate !== false) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("download-progress", (progressObj) => {
    mainWindow?.webContents.send("update:progress", progressObj);
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    mainWindow?.webContents.send("update:downloaded", info);
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update:error", err.message);
  });
}
```

- [ ] **Step 2: Run all tests to confirm nothing broken**

```bash
npm test
```
Expected: all tests pass (autoUpdater is not called in test env — `isDev` guard prevents it).

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: autoUpdater respects autoUpdate and updateChannel config prefs"
```

---

## Task 3: Settings modal — Updates tab

**Files:**
- Modify: `src/components/modals/SettingsModal.vue`

- [ ] **Step 1: Add the Updates tab button**

In the `<div class="tabs">` section, add after the Privacy tab button:

```html
<button
    :class="['tab', activeTab === 'updates' && 'active']"
    @click="activeTab = 'updates'"
>
    Updates
</button>
```

- [ ] **Step 2: Add the Updates tab content**

Add after the closing `</div>` of the Privacy tab content (`v-if="activeTab === 'privacy'"`):

```html
<!-- Updates tab -->
<div v-if="activeTab === 'updates'" class="tab-content">
    <!-- Auto-update toggle -->
    <div class="field">
        <label class="field-label">Automatic updates</label>
        <div
            class="telemetry-card"
            :class="{ active: form.autoUpdate }"
            @click="form.autoUpdate = !form.autoUpdate"
        >
            <div class="telemetry-header">
                <span class="telemetry-label">Download updates automatically</span>
                <div class="toggle" :class="{ on: form.autoUpdate }">
                    <div class="toggle-thumb"></div>
                </div>
            </div>
            <p class="telemetry-desc">
                When a new version is available, Canonic downloads it in the
                background and shows a notification when it's ready to install.
                Turn this off to download updates manually.
            </p>
        </div>
    </div>

    <!-- Experimental channel toggle -->
    <div class="field">
        <label class="field-label">Update channel</label>
        <div
            class="telemetry-card"
            :class="{ active: form.updateChannel === 'experimental' }"
            @click="form.updateChannel = form.updateChannel === 'experimental' ? 'stable' : 'experimental'"
        >
            <div class="telemetry-header">
                <span class="telemetry-label">Experimental builds</span>
                <div class="toggle" :class="{ on: form.updateChannel === 'experimental' }">
                    <div class="toggle-thumb"></div>
                </div>
            </div>
            <p class="telemetry-desc">
                Opt into pre-release builds with the latest features. These may
                be less stable. <strong>Requires restart to take effect.</strong>
            </p>
        </div>
    </div>

    <!-- Manual check -->
    <div class="field" style="padding-top: 8px; border-top: 1px solid var(--border);">
        <label class="field-label">Check for updates</label>
        <div class="update-check">
            <button
                class="btn-ghost"
                @click="checkUpdates"
                :disabled="checkingUpdates"
            >
                {{ checkingUpdates ? "Checking…" : "Check now" }}
            </button>
            <span v-if="updateStatus" class="update-status">{{ updateStatus }}</span>
        </div>
        <p class="field-hint" style="margin-top: 8px">
            Canonic also checks automatically on launch and every 4 hours.
        </p>
    </div>
</div>
```

- [ ] **Step 3: Remove the check-for-updates block from the Profile tab**

In the Profile tab content, remove this entire block (it's being moved to Updates):

```html
<div
    class="field"
    style="
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid var(--border);
    "
>
    <label class="field-label">Application</label>
    <div class="update-check">
        <button
            class="btn-ghost"
            @click="checkUpdates"
            :disabled="checkingUpdates"
        >
            {{
                checkingUpdates
                    ? "Checking for updates..."
                    : "Check for updates"
            }}
        </button>
        <span v-if="updateStatus" class="update-status">{{
            updateStatus
        }}</span>
    </div>
</div>
```

- [ ] **Step 4: Add `autoUpdate` and `updateChannel` to the form reactive object**

In the `const form = reactive({...})` block, add after `telemetryEnabled`:

```js
const form = reactive({
    displayName: "",
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4-5",
    defaultWorkspacePath: "",
    telemetryEnabled: false,
    autoUpdate: true,
    updateChannel: "stable",
    sharingDefaults: { scope: "file", accessLevel: "read" },
});
```

- [ ] **Step 5: Load prefs in `onMounted`**

In the `onMounted` block, after `form.telemetryEnabled = !!cfg.telemetryEnabled;`, add:

```js
form.autoUpdate = cfg.autoUpdate !== false; // default true
form.updateChannel = cfg.updateChannel || "stable";
```

- [ ] **Step 6: Verify settings save works**

Run the app in dev mode and open Settings → Updates. Toggle both cards and click Save. Reopen Settings — verify toggles restored to saved state (check `~/.canonic/config.json` for `autoUpdate` and `updateChannel` fields).

- [ ] **Step 7: Commit**

```bash
git add src/components/modals/SettingsModal.vue
git commit -m "feat: add Updates tab to Settings with auto-update and channel toggles"
```

---

## Task 4: Prominent titlebar update indicator

**Files:**
- Modify: `src/components/layout/MainLayout.vue`

Replace the bottom-right floating banner with an inline indicator in the titlebar that escalates through three states: **available** (muted badge + Download) → **downloading** (inline progress) → **ready** (pulsing accent button).

- [ ] **Step 1: Replace the update banner in the template**

Remove the existing `<div v-if="updateAvailable || updateDownloading || updateReady" class="update-banner">` block entirely (lines ~189–220).

In the titlebar's `<div class="titlebar-right">`, add the update indicator **before** the font toggle button:

```html
<!-- Update indicator -->
<template v-if="updateReady">
    <button class="update-ready-btn" @click="installUpdate" title="Restart and install update">
        <ArrowUpCircle :size="14" />
        <span>{{ updateInfo?.version }} ready — Restart</span>
    </button>
</template>
<template v-else-if="updateDownloading">
    <span class="update-progress-pill">
        <span class="update-progress-bar" :style="{ width: downloadProgress + '%' }" />
        <span class="update-progress-label">{{ downloadProgress }}%</span>
    </span>
</template>
<template v-else-if="updateAvailable">
    <button class="update-available-btn" @click="downloadUpdate" title="Download available update">
        <ArrowUpCircle :size="14" />
        <span>Update</span>
    </button>
</template>
```

- [ ] **Step 2: Add `ArrowUpCircle` to the lucide import**

In the `<script setup>` imports, add `ArrowUpCircle` to the lucide-vue-next import:

```js
import {
    Settings,
    Files,
    Search,
    Users,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    Type,
    Palette,
    MessageSquare,
    Sparkles,
    History,
    Share2,
    ArrowUpCircle,
} from "lucide-vue-next";
```

- [ ] **Step 3: Add the new CSS at the bottom of the `<style scoped>` block**

Remove all the old `.update-banner`, `.update-btn`, `.update-dismiss`, `.progress-bar-bg`, `.progress-bar-fill` rules.

Add in their place:

```css
/* ── Titlebar update indicator ── */
.update-ready-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    animation: update-pulse 2s ease-in-out infinite;
    white-space: nowrap;
}

.update-ready-btn:hover {
    opacity: 0.88;
}

@keyframes update-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(74, 122, 155, 0.5); }
    50%       { box-shadow: 0 0 0 5px rgba(74, 122, 155, 0); }
}

.update-available-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--accent-muted);
    background: transparent;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
}

.update-available-btn:hover {
    background: var(--accent-muted);
}

.update-progress-pill {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-hover);
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    min-width: 60px;
    white-space: nowrap;
}

.update-progress-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--accent-muted);
    transition: width 0.3s ease;
    z-index: 0;
}

.update-progress-label {
    position: relative;
    z-index: 1;
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```
Expected: all tests pass (no logic changes — purely template/style).

- [ ] **Step 5: Verify UI in dev mode**

Run the app. The update banner is gone from the bottom. To smoke-test the titlebar states without a real update, temporarily add `updateAvailable.value = true` at the bottom of `onMounted` in MainLayout.vue, confirm the blue badge appears, then set `updateReady.value = true` to confirm the pulsing green button appears. Remove the test code after verifying.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/MainLayout.vue
git commit -m "feat: replace update banner with prominent titlebar update indicator"
```

---

## Task 5: Commit REQUIREMENTS.md and TODO.md updates, push PR

- [ ] **Step 1: Stage and commit docs**

```bash
git add docs/specs/REQUIREMENTS.md docs/TODO.md docs/superpowers/plans/2026-05-08-auto-update-system.md
git commit -m "docs: add UPD requirements and auto-update implementation plan"
```

- [ ] **Step 2: Push and open PR targeting dev**

```bash
git push -u origin $(git rev-parse --abbrev-ref HEAD)
gh pr create --base dev --title "feat: auto-update system with prefs and titlebar indicator" --body "$(cat <<'EOF'
## Summary

- **Config:** `autoUpdate` (default `true`) and `updateChannel` (default `'stable'`) persisted to `~/.canonic/config.json`
- **Main process:** `setupAutoUpdater()` reads channel at boot (`allowPrerelease`); reads `autoUpdate` live on each `update-available` event to decide whether to auto-download
- **Settings:** New Updates tab with toggle cards for auto-update and experimental channel; manual check button moved there
- **UI:** Bottom-right update banner replaced with inline titlebar indicator — muted badge when available (auto-update off), progress pill while downloading, pulsing accent button when ready to install

## Test plan
- [ ] Fresh install — confirm `autoUpdate: true` and `updateChannel: 'stable'` appear in `~/.canonic/config.json` on first write
- [ ] Open Settings → Updates — verify both toggle cards and Check now button present
- [ ] Toggle auto-update off, save, reopen Settings — confirm off state restored
- [ ] Toggle experimental channel on, save, reopen — confirm experimental state restored
- [ ] Simulate `updateAvailable.value = true` in dev — confirm blue "Update" badge appears in titlebar
- [ ] Simulate `updateReady.value = true` — confirm pulsing accent "vX.Y.Z ready — Restart" button appears
- [ ] All 106+ tests pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

*Plan written: 2026-05-08*
