# Canonic — How To Use It

This is the complete usage guide for Canonic. If you're new, start at the top. If you're looking for something specific, jump to the relevant section.

---

## Getting Started

### First Launch

On first launch, Canonic shows a setup screen. Fill in:

- **Display name** — appears on your commits and comments
- **API key** — your key for the AI provider (default: OpenRouter)
- **Default workspace path** — where new workspaces are created

Your settings are saved to `~/.canonic/config.json`. You can change them anytime via the gear icon in the top-right.

### Opening the App Again

Canonic remembers your recent workspaces. On launch, pick one from the list or open a new folder.

---

## Workspaces

### Creating a New Workspace

Click **New Workspace** and choose a folder. You'll be asked to pick a template:

- **Blank** — just a README, ready for whatever you need
- **PM Framework** — a structured set of directories and starter documents for product teams (Vision, Strategy, Planning, Discovery, Implementation, Monitoring)

Canonic runs `git init` in the folder and makes an initial commit.

### Opening an Existing Folder

You can open any folder as a workspace — including folders that already have a `.git` directory (e.g. a cloned GitHub repo). When Canonic detects an existing git repo, it switches to **External Git Mode**:

- The workspace's current branch is shown in the sidebar below the file list header
- Click the branch name to expand a list of all branches — click any to switch
- Per-document branching (Fork/Merge) is hidden to avoid confusion with the repo's own branch model
- Commits you make in Canonic appear in `git log` alongside commits from other tools

---

## Editing Documents

### The Editor

Canonic uses a WYSIWYG markdown editor. You can:

- Use markdown syntax directly (`**bold**`, `## heading`, `- list item`) or use the toolbar
- Double-click a document title to rename it
- Drag files and folders in the sidebar to reorganize

### Saving

Press **Cmd+S** (or click **Save**) to write changes to disk. Saving does **not** create a git commit — it just persists the file.

**Auto-save** kicks in automatically after 30 seconds of unsaved changes.

If you switch to another document while unsaved, your changes are held in a buffer and restored when you come back.

---

## Committing Checkpoints

A **commit** (called a checkpoint in Canonic) is a snapshot you can return to. To commit:

1. Save your document first
2. Click the **Commit** button (or press **Cmd+Shift+S**)
3. Enter a message describing what you changed
4. Click **Save checkpoint**

Commits are **per-document** in Canonic-managed workspaces — only the current file is staged and committed. In external git repos, commits follow the same scoped behavior.

---

## Branching (Canonic-Managed Workspaces Only)

> This section applies when Canonic created the workspace. If you opened an existing git repo, branching is handled by the repo's own branch model — see the sidebar branch indicator.

### Fork a Document

Click **Fork** in the editor toolbar to create a draft branch of the current document. Give it a name. You're now working on a branch — changes here don't affect `main`.

### Switching Between Branches

The branch selector in the editor topbar shows the current document's branch. Click it to switch to another branch for that document.

### Merging Back to Main

When you're happy with a draft, click **Merge → main** in the editor topbar (only visible when you're on a non-main branch). This merges your changes back into `main` and deletes the draft branch.

---

## Version History & Diffs

The **History** tab in the right panel shows all commits for the current document, most recent first.

- Click any commit to see a diff — added lines in green, removed lines in red
- The diff shows only changed lines for a clean view

**Named versions** let you tag a specific commit with a meaningful name (e.g. "Approved by stakeholders"). Click **Version** in the editor toolbar to save one. Named versions appear in the History panel alongside regular commits.

---

## Inline Comments

### Adding a Comment

Select any text in the document and release the mouse. A popover appears — click **Add comment** to attach a comment to that selection.

Comments appear in the **Comments** tab in the right panel.

### Comment Highlights

Selected text that has a comment is highlighted in the editor. Click the highlight to jump to the comment in the panel. Click the comment to scroll the editor to its anchor.

### Resolving Comments

Click **Resolve** on a comment to mark it done. Resolved comments are hidden by default. Toggle the "Show resolved" option in the Comments panel to see them.

---

## AI Assistant

The AI panel (right side, **AI** tab) is a thinking partner — it challenges assumptions and asks questions, but won't write your documents for you.

### Setup

Configure the AI in **Settings**:

- **Base URL** — any OpenAI-compatible endpoint (default: OpenRouter at `https://openrouter.ai/api/v1`)
- **API key** — your key for that provider
- **Model** — the model to use (e.g. `anthropic/claude-sonnet-4-6`)

Works with OpenRouter, OpenAI, Mistral, DeepSeek, Groq, Ollama, or any OpenAI-compatible API.

### Using the AI

Type a message in the AI panel. The current document is always included as context. The AI will respond with questions and challenges — not rewrites.

Chat history is session-only and resets on app restart.

---

## Sharing

### Starting a Share Session

Click the **Share** button in the titlebar. A modal appears letting you configure:

- **Scope** — what to share:
  - `file` — only the current document
  - `directory` — all documents in the same folder
  - `workspace` — all documents in the workspace
- **Access level**:
  - `read` — recipients can view content and comments
  - `comment` — recipients can also leave comments (synced back to you)

Click **Start sharing** to generate a link. The link uses a Cloudflare Tunnel — no server setup required.

### Stopping a Share Session

Click **Stop sharing**. The link becomes invalid immediately.

### Excluding Directories

Create a `.canonicignore` file in your workspace root (same syntax as `.gitignore`) to exclude specific directories from sharing.

### Default Sharing Preferences

In **Settings > Sharing**, set your default scope and access level so you don't have to configure it each time.

---

## Search

Click the **Search** tab in the left sidebar (magnifying glass icon). Type to search across all documents in your workspace. Results show the matching document and a snippet of context. Click a result to open the document.

Search is indexed in-memory and re-indexed when you open or save a document.

---

## Settings

Access settings via the **gear icon** in the top-right.

### Profile

- Change display name (used in commits and comments)
- Change API key and model
- Check for updates manually

### Sharing Defaults

- Set default share scope (none / file / directory / workspace)
- Set default access level (read / comment)

### Danger Zone

- **Uninstall** — removes `~/.canonic/` config and data

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+S` | Save document |
| `Cmd+Shift+S` | Commit checkpoint |
| `Cmd++` / `Cmd+-` | Increase / decrease font size |
| `Cmd+F` | Focus search |

---

## Troubleshooting

**AI isn't responding**
- Check your API key in Settings
- Make sure your provider's Base URL is correct
- Verify your model name matches what the provider expects

**History panel is empty**
- The document must have at least one commit. Save and commit the file first.

**Share link isn't working**
- Make sure the share session is still active (Share button shows "Stop sharing")
- The link uses Cloudflare Tunnel — requires an internet connection

**App won't open a folder**
- Check that the folder exists and you have read/write permissions
