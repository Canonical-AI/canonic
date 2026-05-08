# Canonic — Human-Readable Requirements

This document is the source of truth for product requirements. Each section maps directly
to a feature area. Acceptance criteria are structured to be testable — each criterion
becomes one or more automated or manual test cases.

---

## How to use this document

- **Product decisions** live here, not in code comments
- **Test suites** reference criterion IDs (e.g. `CFG-3`) to stay traceable
- When a requirement changes, update this doc first — then update tests — then update code
- Mark criteria `[DONE]` when implemented and tested, `[PARTIAL]` when incomplete

---

## Feature: Global Configuration (CFG)

### Description
First-run setup and persistent user preferences. Config is stored at `~/.canonic/config.json`.
The setup screen appears when no config exists. Settings are also accessible at any time
from the titlebar gear icon.

### User Stories
- As a new user, I want to enter my API key once so I don't have to re-enter it every session
- As a user, I want to see my display name on my comments and commits
- As a user, I want to change my API key without reinstalling the app

### Acceptance Criteria

| ID | Criterion | Status |
|---|---|---|
| CFG-1 | On first launch with no config, the Setup screen appears before the Workspace screen | [ ] |
| CFG-2 | Setup screen has fields for: Display Name, Anthropic API key, default model (sonnet/opus/haiku), default workspace path | [ ] |
| CFG-3 | API key field renders as a password input (characters hidden by default, toggle to reveal) | [ ] |
| CFG-4 | Clicking "Continue" with any required field empty shows inline validation error; does not proceed | [ ] |
| CFG-5 | On valid submission, config is written to `~/.canonic/config.json` with fields: `displayName`, `apiKey`, `model`, `defaultWorkspacePath`, `sharingDefaults` | [ ] |
| CFG-6 | Config file is NOT tracked in any git workspace (never appears in `git status`) | [ ] |
| CFG-7 | After setup, the Settings modal is accessible via the gear icon in the titlebar | [ ] |
| CFG-8 | Changing the API key in Settings and saving immediately affects new AI chat requests | [ ] |
| CFG-9 | Display name is used as the `author.name` in all git commits made by this user | [ ] |
| CFG-10 | Display name is used as `author` in all comments added by this user | [ ] |
| CFG-11 | If `~/.canonic/config.json` exists and is valid on launch, the Setup screen is skipped | [ ] |
| CFG-12 | API key is stored as-is (plain text in config file); a warning is shown that config contains sensitive data | [ ] |

---

## Feature: Workspace Templates (WKS)

### Description
When creating a new workspace, the user can choose from workspace templates.
The PM Framework template creates a structured directory hierarchy with starter documents.

### User Stories
- As a PM, I want to start with a framework I recognize so I don't have to build structure from scratch
- As a user, I want a blank workspace when I don't need opinionated structure
- As a team lead, I want all team members to start from the same document structure

### Workspace Templates Available

**1. Blank** — empty git repo, no files created beyond README  
**2. PM Framework** — structured directory hierarchy for product teams:

```
Vision/
  product-vision.md     ← What we're building and why
  north-star-metric.md  ← The one metric that matters most
Strategy/
  strategy.md           ← How we'll achieve the vision
  competitive-analysis.md
Planning/
  roadmap.md            ← What we're building and when
  okrs.md               ← Objectives and key results
Discovery/
  user-research.md      ← What we've learned from users
  problem-statement.md  ← The problem we're solving
Implementation/
  technical-spec.md     ← How we're building it
  launch-checklist.md   ← Pre-launch verification
Monitoring/
  metrics-dashboard.md  ← Key metrics to watch post-launch
  incident-log.md       ← Issues and resolutions
```

### Acceptance Criteria

| ID | Criterion | Status |
|---|---|---|
| WKS-1 | Workspace setup screen shows at least two template options: "Blank" and "PM Framework" | [ ] |
| WKS-2 | Each template option shows a name, short description, and preview of what will be created | [ ] |
| WKS-3 | Selecting "Blank" creates an empty workspace with only README.md | [ ] |
| WKS-4 | Selecting "PM Framework" creates all 6 directories with all 12 template files | [ ] |
| WKS-5 | Each template file contains a title heading and a brief description of what belongs in that document | [ ] |
| WKS-6 | The initial git commit for a PM Framework workspace includes all 12 template files with message "Initialize PM Framework workspace" | [ ] |
| WKS-7 | The file tree in the sidebar correctly shows the 6 top-level directories collapsed by default | [ ] |
| WKS-8 | Opening any template file shows the starter content in the editor, ready to edit | [ ] |
| WKS-9 | After workspace creation, the selected branch is `main` | [ ] |
| WKS-10 | Re-opening an existing workspace (already initialized) skips the template selection | [ ] |

---

## Feature: Sharing Scope & Permissions (SHR)

### Description
Users can configure what they share at multiple levels: individual files, directories,
or the whole workspace. Sharing is configured both globally (in Settings as defaults)
and per-share-session. Recipients access shared content via a token-secured link.

### User Stories
- As a user, I want to share my entire Strategy directory with a stakeholder without sharing everything
- As a user, I want to set "share nothing" as my default so I never accidentally expose documents
- As a user, I want to share a whole workspace with my team so everyone has read access

### Share Scope Options

| Scope | Description |
|---|---|
| `none` | Nothing is shared; share button is disabled |
| `file` | Only the currently open document (default) |
| `directory` | The directory containing the current document |
| `workspace` | The entire workspace |

### Access Levels

| Level | Description |
|---|---|
| `read` | Can view document content and comments |
| `comment` | Can read and leave new comments (comments synced back) |

### Acceptance Criteria

| ID | Criterion | Status |
|---|---|---|
| SHR-1 | Settings screen has a "Sharing Defaults" section with scope selector (none / file / directory / workspace) | [ ] |
| SHR-2 | Settings screen has a default access level selector (read / comment) | [ ] |
| SHR-3 | Default sharing scope is `file` on fresh install | [ ] |
| SHR-4 | When sharing is started, a modal shows the scope selector pre-filled from defaults but editable per-session | [ ] |
| SHR-5 | Scope `file`: share link serves only the single current document | [ ] |
| SHR-6 | Scope `directory`: share link serves a manifest of all `.md` files in the same directory, plus their contents | [ ] |
| SHR-7 | Scope `workspace`: share link serves all `.md` files in the workspace recursively | [ ] |
| SHR-8 | Each share session generates a unique token; old tokens become invalid after `stopShare` | [ ] |
| SHR-9 | The share server responds with HTTP 403 to requests with a missing or incorrect token | [ ] |
| SHR-10 | Share modal displays which files will be shared (names only, not content) before the user confirms | [ ] |
| SHR-11 | When scope is `directory` or `workspace`, the share link opens a file-list view in the browser, not a single document | [ ] |
| SHR-12 | Directories can be excluded from sharing via a `.canonicignore` file (same syntax as `.gitignore`) | [ ] |
| SHR-13 | Stop sharing invalidates the token; subsequent requests to that link return 404 | [ ] |

---

## Feature: AI Assistant Configuration (AI)

### Description
The AI assistant in the right panel is configured to help users think, not to write for them.
Its behavior is adjustable in Settings.

### Acceptance Criteria

| ID | Criterion | Status |
|---|---|---|
| AI-1 | AI chat uses the API key from `~/.canonic/config.json` (not from `.env`) | [ ] |
| AI-2 | AI chat uses the model selected in Settings | [ ] |
| AI-3 | AI responses stream character-by-character (not a single block) | [ ] |
| AI-4 | AI has the full current document content as context in every message | [ ] |
| AI-5 | AI system prompt prevents it from generating document content directly | [ ] |
| AI-6 | If API key is missing or invalid, the AI panel shows a clear error with a link to Settings | [ ] |
| AI-7 | Chat history is not persisted between app restarts (fresh session per launch) | [ ] |

---

## Feature: Git Version Control (GIT)

### Description
Every workspace is a git repository. Version control operations are exposed via
a document-centric UI — no terminal required.

### Acceptance Criteria

| ID | Criterion | Status |
|---|---|---|
| GIT-1 | `git init` runs automatically when a new workspace is created | [ ] |
| GIT-2 | Creating a new document auto-stages and does NOT auto-commit (user must explicitly commit) | [ ] |
| GIT-3 | Saving a document (Cmd+S) writes to disk but does NOT create a git commit | [ ] |
| GIT-4 | The commit modal requires a non-empty message; clicking "Save checkpoint" with empty message shows error | [ ] |
| GIT-5 | After commit, the History panel shows the new commit at the top of the list | [ ] |
| GIT-6 | Creating a branch from `main` with a clean working tree succeeds and switches to the new branch | [ ] |
| GIT-7 | The branch selector in the titlebar always reflects the current branch | [ ] |
| GIT-8 | Switching branches updates the file tree and editor content to reflect that branch's state | [ ] |
| GIT-9 | Merging a branch into `main` from the branch menu shows success or a conflict message | [ ] |
| GIT-10 | The History panel diff view shows added lines in green and removed lines in red | [ ] |
| GIT-11 | Clicking a commit in the History panel shows a diff of that commit vs. current | [ ] |

---

## Feature: Comments (CMT)

### Description
Inline comments anchored to either selected text or line numbers. Shown in the right panel.

### Acceptance Criteria

| ID | Criterion | Status |
|---|---|---|
| CMT-1 | Selecting text in the editor and releasing the mouse shows a "Add comment" popover | [ ] |
| CMT-2 | Submitting a comment on selected text saves the quoted text as the anchor | [ ] |
| CMT-3 | Comments survive app restart (persisted to `~/.canonic/comments/<docId>.json`) | [ ] |
| CMT-4 | The selected text of an active comment is visually highlighted in the editor | [ ] |
| CMT-5 | Clicking a comment in the right panel scrolls the editor to its anchor text | [ ] |
| CMT-6 | Resolved comments are hidden by default; a toggle shows them | [ ] |
| CMT-7 | Comments are scoped to a document path — switching documents shows only that doc's comments | [ ] |
| CMT-8 | Author name on comments matches the display name from Settings (CFG-10) | [ ] |

---

## Test Infrastructure

### Manual Test Checklist (run before each release)
- [ ] Fresh install: no config exists → Setup screen appears
- [ ] Complete setup with valid API key → proceeds to workspace screen
- [ ] Create PM Framework workspace → all 12 files present, git log shows 1 commit
- [ ] Create a document, write text, Cmd+S → file exists on disk, no new git commit
- [ ] Commit with a message → History panel shows commit
- [ ] Create branch "feature/test" → branch selector updates, file tree reflects branch
- [ ] Share a file → modal shows share link → opening link in browser shows document
- [ ] Add comment on selected text → restart app → comment still present with highlight
- [ ] AI chat: type "what's missing?" → response streams in, does not rewrite document

### Automated Test Targets (future)
The following modules should have unit tests:
- `electron/git.js` — mock `fs`, assert git operations produce expected repository state
- `electron/search.js` — index documents, assert search returns ranked results with highlights
- `electron/share.js` — assert token generation, assert 403 on wrong token, assert 404 after stop
- `electron/config.js` — assert read/write/validate of config shape
- `src/store/index.js` — assert state transitions (openFile, addComment, etc.) with mocked IPC

---

*Last updated: 2026-04-30*  
*Next review: before each major release*
