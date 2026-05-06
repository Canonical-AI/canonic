# Agent Integration Design
_Last updated: 2026-05-03_

## Overview

Canonic exposes a local HTTP API that lets any AI coding agent (Claude Code, Cursor, Aider, etc.) open a document in Canonic for human review, receive the edited content back, and write inline comments — all with zero manual setup from the user.

The integration ships as:
1. A local HTTP server inside the Canonic Electron app
2. A reference skill implementation for Claude Code (published as a GitHub gist and in the docs)
3. An open API spec so any agent can integrate

---

## Problem Statement

AI agents are good at generating structured documents (specs, PRDs, research notes, ADRs) but users have no good way to review, annotate, and hand them back. Copy-pasting between a terminal and a markdown editor breaks flow. Canonic is already the right tool for this review step — it just needs a bridge.

---

## User Story

> "I'm working with Claude Code on a new feature. I say 'write me a spec'. Claude Code creates `feature-spec.md`, opens it in Canonic, and my focus switches there automatically. I read it, make edits, leave a few comments. When I'm done I click 'Implement this' and Claude Code picks up right where it left off — with my edited doc."

---

## Workflow

```
Agent runs skill
  → check ~/.canonic/api.lock
  → if Canonic not installed: offer to auto-install (see Install Flow)
  → if Canonic not running: auto-launch, poll for lockfile (up to 15s)
  → POST /session/start { file, agentName, callbackUrl }
  → Canonic raises window, opens file, shows agent UI

User edits in Canonic
  → Agent optionally POSTs /comments while the user reads
  → Comments appear inline + in comments panel

User clicks action (e.g. "Implement this")
  → Canonic POSTs { file, content, prompt } to callbackUrl
  → Agent resumes with edited content + chosen prompt

Session ends, agent UI clears
```

---

## Install Flow

When the skill detects Canonic is not installed (no lockfile, no binary):

```
Canonic isn't installed.
Download and install it automatically? (yes/no)
```

**If yes:**
1. Fetch latest release asset URL from `https://api.github.com/repos/Canonical-AI/canonic/releases/latest`
2. Detect platform and download the right asset:
   - macOS → `.dmg`
   - Windows → `.exe` (silent installer)
   - Linux → `.AppImage`
3. Verify checksum against GitHub release metadata
4. Install silently:
   - macOS: `hdiutil attach Canonic.dmg` → `cp -R /Volumes/Canonic/Canonic.app /Applications/` → `hdiutil detach`
   - Windows: `Canonic-Setup.exe /S`
   - Linux: move to `~/Applications/Canonic.AppImage`, `chmod +x`
5. Launch Canonic and poll for lockfile (up to 15s)

**If no:**
```
Download it manually at: https://github.com/Canonical-AI/canonic
```

---

## API Spec

### Discovery

Canonic writes `~/.canonic/api.lock` at launch and deletes it on quit:

```json
{ "port": 52341, "token": "32-char-random-hex" }
```

All requests include `Authorization: Bearer <token>`.

### Endpoints

#### `GET /ping`
Health check. Returns:
```json
{ "ok": true, "version": "1.2.0" }
```

#### `POST /session/start`
Opens a file in Canonic and shows the agent UI.

Request:
```json
{
  "file": "path/to/feature-spec.md",
  "agentName": "Claude Code",
  "callbackUrl": "http://127.0.0.1:48291/canonic-done",
  "workspacePath": "/Users/john/my-project"
}
```

`file` is relative to `workspacePath`. If `workspacePath` is omitted, Canonic uses the currently open workspace. If neither matches, returns `{ "error": "workspace not open" }`.

Response:
```json
{ "ok": true, "sessionId": "uuid" }
```

Canonic calls `mainWindow.focus()` on receipt.

#### `POST /session/cancel`
Clears the agent UI without calling the callback.

Request:
```json
{ "sessionId": "uuid" }
```

#### `POST /comments`
Adds an agent comment to a document.

Request:
```json
{
  "sessionId": "uuid",
  "file": "path/to/feature-spec.md",
  "anchor": { "quotedText": "the exact text to anchor to" },
  "text": "This conflicts with the constraint in section 3.",
  "agentName": "Claude Code"
}
```

Response:
```json
{ "ok": true, "commentId": "uuid" }
```

Comments appear inline in the editor (ProseMirror decoration) and in the comments panel with an `agent` badge.

### Callback (agent-side)

When the user picks an action, Canonic POSTs to `callbackUrl`:

```json
{
  "sessionId": "uuid",
  "file": "path/to/feature-spec.md",
  "content": "# Feature Spec\n\n...(full edited markdown)...",
  "prompt": "Implement this"
}
```

The agent's callback server should respond `200 OK` within 5 seconds; Canonic shows a loading state while waiting.

**Skill callback port:** The skill picks a random available port using `net.createServer().listen(0)` (or equivalent), starts a one-shot HTTP listener, and passes that address as `callbackUrl`. The listener closes itself after receiving one request.

**Canonic quits during session:** If Canonic exits while a session is active, it attempts to call `callbackUrl` with `{ "error": "session_cancelled", "reason": "app_closed" }` before quitting. If that call fails, the skill's callback listener will timeout — the skill should treat a 30-second timeout as a cancellation and exit gracefully.

### Pre-filled Prompts

Defaults (user can also type a custom prompt):
- "Implement this"
- "Research this"
- "Review and suggest changes"
- "Create a task list"
- "Write tests for this"

---

## Security Model

- Server binds to `127.0.0.1` only — never `0.0.0.0`
- Token is 32-char random hex, generated fresh at each app launch, never persisted to disk beyond the lockfile
- Canonic rejects any `callbackUrl` that is not a `localhost` / `127.0.0.1` address
- Lockfile is `chmod 600` on Unix

---

## UI Spec

### Floating Pill Button
- Position: bottom-right corner of the editor
- Appearance: pill-shaped button, purple (`#7c8cf8`), pulsating glow animation while session is active
- Label: `⚡ {agentName} is waiting`
- Click: opens Action Picker

### Sidebar Agent Panel
- Location: left sidebar, below the file list, above peers
- Visible only when a session is active
- Shows: agent name, which file was opened, elapsed time, "Return" button
- "Return" button opens the same Action Picker as the floating pill

### Action Picker
- Appears as a bottom sheet or inline modal
- Title: "Send back to {agentName}"
- Pre-filled prompt buttons (tappable chips)
- Free-text input for custom prompt
- "Cancel session" link at the bottom

### Agent Comments
- **In the comments panel**: same panel as human comments; agent comments have a purple left border and a small `agent` badge next to the agent name. Avatar is the agent's icon (⚡ default).
- **In the editor**: inline highlight decoration on the `quotedText` anchor (same ProseMirror system as human comment highlights). Purple underline instead of yellow to distinguish from human comments.

---

## Skill Format (Claude Code Reference Implementation)

Published at: `docs/canonic-skill.md` and as a GitHub gist.

```markdown
---
name: canonic
description: Open a document in Canonic for human review, then resume with the edited content and chosen next step.
---

## Usage
canonic <file-path> [--agent-name "My Agent"]

## What this does
1. Checks if Canonic is installed and running
2. Auto-installs / auto-launches if needed
3. Opens <file-path> in Canonic for human review
4. Waits for the user to finish editing and choose a next step
5. Returns the edited content and chosen prompt so you can continue

## Steps
(See Install Flow and API Spec in docs/AGENT-API.md for full implementation details.)
```

Any agent that can run shell commands and make HTTP requests can implement this protocol. The full API spec lives at `docs/AGENT-API.md` in the Canonic repo — that document is the source of truth for third-party integrations.

---

## Demo Script

**Setup:** Canonic installed, workspace open with one doc. Claude Code running in terminal beside it.

---

**[0:00] Presenter in terminal**
> "I'm going to ask Claude Code to write a product spec for a new feature."

Types: `"Write a product spec for a dark mode toggle — put it in Canonic"`

---

**[0:10] Claude Code runs the canonic skill**
- Terminal shows: `Opening feature-spec.md in Canonic...`
- Canonic raises to foreground, `feature-spec.md` opens
- Purple pulsating pill appears: `⚡ Claude Code is waiting`

---

**[0:20] Presenter reviews the spec in Canonic**
> "Claude Code wrote a solid first draft. I'm going to tighten the success metrics section."

Makes two edits. Notices a comment already in the margin:
- `⚡ Claude Code: "I wasn't sure about the timeline — left it as TBD, adjust if needed"`

---

**[0:40] Presenter clicks the pill button**
Action picker appears. Clicks **"Implement this"**.

---

**[0:45] Back in terminal**
Claude Code receives the edited doc and prompt. Starts implementing.
> "And just like that, Claude Code has my reviewed spec and is writing the code."

---

**[1:00] Wrap**
> "Canonic keeps your thinking in one place. Your AI agent does the building. Together."

---

## Marketing Copy Options

### Option A — Feature highlight (concise)

**Work with your AI agent, not around it.**
Install the Canonic skill in Claude Code (or any local agent). Your agent writes the doc. You review it in Canonic. One click sends your edits back — with a pre-filled prompt to keep building.

---

### Option B — Homepage hero variant

**The missing link between your AI and your thinking.**
Canonic connects to Claude Code, Cursor, and any local AI agent. Agents write drafts. You review, annotate, and redirect — without leaving your flow.

---

### Option C — Feature page subheading

**Canonic speaks agent.**
A local API lets any AI coding tool open documents in Canonic for human review. Edit. Comment. Send it back with one click. Your agent picks up right where it left off.
