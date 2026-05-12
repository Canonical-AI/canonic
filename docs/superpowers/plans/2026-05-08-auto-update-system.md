# Auto-Update System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkboxes `[ ]`. Update this file as you progress.

## Overview
Implement a robust, production-ready auto-update system using `electron-updater` and `github` provider. The system should handle background checks, manual triggers, and user-facing notifications for download progress and installation readiness.

## Tasks

### 1. Foundation & Configuration
- [x] Add `electron-updater` to `package.json` dependencies
- [x] Configure `publish` field in `package.json` (GitHub provider)
- [x] Expose `app:version` IPC handler to return `app.getVersion()`
- [x] Add version display to `SettingsModal.vue` (Updates tab)

### 2. Main Process Logic (`electron/main.js`)
- [x] Initialize `autoUpdater` with `autoDownload = false`
- [x] Implement periodic update checks (every 4 hours)
- [x] Handle `update-available`: notify renderer + check `autoUpdate` config
- [x] Handle `download-progress`: notify renderer with percentage
- [x] Handle `update-downloaded`: notify renderer + store state for "Update and Restart"
- [x] Implement IPC handlers: `update:check`, `update:download`, `update:install`
- [x] Add explicit `semver` comparison to ensure only newer versions trigger notifications

### 3. UI Implementation
- [x] **Store State:** Add `appVersion`, `updateAvailable`, `updateDownloading`, `downloadProgress`, `updateReady` to Pinia store
- [x] **Titlebar Indicator:** Add pulsing accent button to `MainLayout.vue` when update is ready
- [x] **Settings Tab:** Create "Updates" tab in `SettingsModal.vue`
    - [x] "Check for Updates" button with status text
    - [x] "Download updates automatically" toggle (persisted to config)
    - [x] Current version display (e.g., `v0.0.4-alpha`)
- [x] **Download Banner:** Show progress bar/percentage in `MainLayout.vue` during active download

### 4. Safety & Refinement
- [x] Ensure `isDev` check prevents update logic in development
- [x] Add "Discard changes" or "Save all" prompt before `update:install` (optional, use existing confirm dialog)
- [x] Validate `semver` logic against edge cases (e.g., alpha/beta tags)

### 5. Verification & Cleanup
- [x] Bump version in `package.json` to `0.0.4-alpha`
- [x] Synchronize `package-lock.json`
- [x] Update `README.md` version badge
- [x] Update `TODO.md` to reflect completed items
- [x] Run full test suite to ensure no regressions

## Success Criteria
- [x] User can manually check for updates in Settings
- [x] App version is clearly visible in the UI
- [x] Update notifications only appear for versions > current version
- [x] Download progress is visible to the user
- [x] "Update and Restart" button successfully triggers installation (tested via mock/logs)
- [x] All 139 tests pass

🤖 Implementation completed by Gemini CLI - 2026-05-11
