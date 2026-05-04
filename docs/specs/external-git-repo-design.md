# External Git Repo Support — Design Spec

**Date:** 2026-05-03  
**Status:** Approved

---

## Overview

When a user opens a folder that already contains a `.git` directory, Canonic switches into **External Git Mode**. In this mode, Canonic uses the repo's existing history instead of initializing its own, shows the workspace-level branch in the sidebar, and hides per-document branching to avoid confusing the user with two competing branch models.

---

## Detection & Store State

**Where:** `electron/main.js` — the `git:init` IPC handler (called during `openWorkspace`).

**How:** Before running `git.init()`, check whether `.git/` already exists in the workspace folder using `fs.existsSync(path.join(workspacePath, '.git'))`. If it does, skip init and return `{ isExternal: true }` to the renderer.

**Store:** Add `isExternalRepo: false` to the Pinia store's initial state. Set it to `true` when the IPC response includes `isExternal: true`. Reset to `false` when the workspace is closed or switched.

---

## Branch Indicator (FileTree — External Mode Only)

**Placement:** Between the "Documents" header row and the file list — a slim row that appears only when `store.isExternalRepo` is true.

**Content:** Git branch icon + current branch name + chevron-down icon to signal interactivity.

```
Documents                    [+ doc] [+ folder]
⎇  main                                       ▾
───────────────────────────────────────────────
file1.md
file2.md
```

**Interaction:** Clicking the row expands an inline branch list within the sidebar panel (not a floating popover). Each row shows a branch name with a checkmark on the active branch. Clicking a branch calls `store.checkoutBranch(branch)`, which uses the existing `git:checkout` IPC handler, then reloads the file tree and current file content.

**Branch list data:** Uses the existing `store.branches` array populated by `git:branches` IPC — no new IPC calls needed.

---

## Per-Doc Branching — Hidden in External Mode

When `store.isExternalRepo` is true, hide:
- The branch selector pill in the titlebar (BranchMenu trigger)
- Fork document / create branch buttons (wherever they appear in the UI)

The **History panel** and **commit modal** remain fully visible — commits made in Canonic land in the real repo's history alongside commits from other tools.

---

## Scoped Commit Fix

**Problem:** `commit()` in `electron/git.js` currently runs `git.add({ filepath })` then `git.commit()`. If the user has pre-staged files from outside Canonic (e.g. `git add somefile.py` in terminal), those files get bundled into the Canonic commit.

**Fix:** Replace the two-step add+commit with isomorphic-git's `commit({ filepath })` option, which scopes the commit to only the specified file without touching the staging area. No `git.add()` call needed.

**TODO entry:** Add to `docs/TODO.md` before implementing.

---

## README Update

Add a short section "Opening existing git repos" to `README.md`:
- Canonic detects `.git` at workspace open
- Uses existing repo history (no re-init)
- Per-doc branching is hidden; workspace branch shown in sidebar
- Commits from Canonic appear in `git log` alongside external commits

---

## HOWTO.md

Create `docs/HOWTO.md` as the primary end-user usage guide. Sections:

1. Getting started & first launch
2. Creating a workspace (Blank vs PM Framework templates)
3. Opening an existing git repo (external mode behavior)
4. Editing documents
5. Saving & auto-save (30s dirty timer)
6. Committing checkpoints
7. Branching — Canonic mode only (per-doc fork/merge)
8. Version history & diffs
9. Inline comments (text anchor + line anchor)
10. AI assistant (providers, config, thinking-partner mode)
11. Sharing (scopes: file/directory/workspace; access: read/comment; tokens)
12. Search
13. Settings & keyboard shortcuts

---

## Files Affected

| File | Change |
|---|---|
| `electron/main.js` | `git:init` handler — detect `.git`, return `isExternal` |
| `electron/git.js` | `commit()` — replace add+commit with scoped `commit({ filepath })` |
| `src/store/index.js` | Add `isExternalRepo` state; set/reset in `openWorkspace` |
| `src/components/sidebar/FileTree.vue` | Add branch indicator row + inline branch switcher |
| `src/components/layout/MainLayout.vue` | Hide BranchMenu trigger when `isExternalRepo` |
| `docs/TODO.md` | Add scoped commit entry |
| `docs/REQUIREMENTS.md` | Mark EGR criteria as covered by this spec |
| `README.md` | Add external repo section |
| `docs/HOWTO.md` | Create comprehensive usage doc |

---

## Out of Scope

- Pushing/pulling to remotes (future)
- Showing untracked/staged status of non-markdown files (future)
- `.canonicignore` interaction with external repos (future)
