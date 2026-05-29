# Canonic — How To Use It

This is the complete usage guide for Canonic. If you're new, start at the top. If you're looking for something specific, jump to the relevant section.

![2001 monkey gif - Bad Books, Good Times](https://www.startpage.com/av/proxy-image?piurl=https%3A%2F%2Fi1.wp.com%2Fbadbooksgoodtimes.com%2Fwp-content%2Fuploads%2F2017%2F03%2F2001-monkey-gif.gif%3Ffit%3D540%252C250%26ssl%3D1\&sp=1778471545Tc9e7edd86387c75b72d201ac3e6c5654cd5404dcc3d6d7cf5914396bc4727c72)

***

## Getting Started

### First Launch

On first launch, Canonic shows a setup screen. Fill in:

* **Display name** — appears on your commits and comments

* **API key** — your key for the AI provider (default: OpenRouter)

* **Default workspace path** — where new workspaces are created

Your settings are saved to `~/.config/canonic/config.json`. You can change them anytime via the gear icon in the top-right.

### Opening the App Again

Canonic remembers your recent workspaces. On launch, pick one from the list or open a new folder.

***

## Workspaces

### Creating a New Workspace

Click **New Workspace** and choose a folder. You'll be asked to pick a template:

* **Blank** — just a README, ready for whatever you need

* **PM Framework** — a structured set of directories and starter documents for product teams (Vision, Strategy, Planning, Discovery, Implementation, Monitoring)

Canonic runs `git init` in the folder and makes an initial commit.

### Opening an Existing Folder

You can open any folder as a workspace — including folders that already have a `.git` directory (e.g. a cloned GitHub repo). When Canonic detects an existing git repo, it switches to **External Git Mode**:

* The workspace's current branch is shown in the sidebar below the file list header

* Click the branch name to expand a list of all branches — click any to switch

* Per-document branching (Fork/Merge) is hidden to avoid confusion with the repo's own branch model

* Commits you make in Canonic appear in `git log` alongside commits from other tools

***

## Editing Documents

### The Editor

Canonic uses a WYSIWYG markdown editor. You can:

* Use markdown syntax directly (`**bold**`, `## heading`, `- list item`) or use the floating toolbar that appears when you select text (bold, italic, strikethrough, link, list, quote, comment)

* Double-click a document title to rename it

* Drag files and folders in the sidebar to reorganize

* **Zoom**: `Cmd++` / `Cmd+-` increases / decreases font size and proportionally scales headings and table sizing

### Slash Menu (Insert Blocks)

Type `/` anywhere in a document or press `Cmd/Ctrl+I` to open the slash menu. Pick a block type:

* **Insert → Text & Headings** — Heading 1/2/3, Quote
* **Insert → Lists** — Bullet, Numbered, Task list
* **Insert → Table** — inserts a 2x2 GFM table
* **Insert → Code Block**, **Mermaid Diagram**, **Divider**

Filter by typing after `/` (e.g. `/mermaid`). Use arrows + Enter to pick, Escape to close.

**Quick-table shortcut**: press `Cmd/Ctrl+I` then `T` within ~500ms to insert a table without navigating menus.

### Editing Tables

Click any cell in a table to reveal the floating **table toolbar** above the table, with `Row`, `Col`, and `Delete Table` controls. Right-click a cell for the same actions as a context menu.

Tables use GFM markdown — they always have a header row. Deleting the header row promotes the first body row to header automatically (so the table never becomes malformed).

Columns auto-size to their widest content. The table fills the editor width; if one column needs more room, the others shrink.

### Wiki-Links

Type `[[doc-name]]` to insert an inline link chip. Typing `[[` opens a picker of existing documents. Anchors work too: `[[doc#heading]]` jumps to a heading inside that document.

### Mermaid Diagrams

Type a fenced ` ```mermaid ` block (or insert via the slash menu) to embed a live diagram. The card renders a preview with an inline editor for the diagram source.

### Find & Replace

* **`Cmd+F`** — in-document find, with `Cmd+G` / `Cmd+Shift+G` for next/previous match and replace controls
* **`Cmd+Shift+F`** — workspace-wide find & replace across every file in the workspace

### Clipboard

* **Copy on select** — selecting text automatically copies it to the primary selection clipboard
* **Middle-click** or **`Ctrl+click`** to paste the primary selection
* **AI chat paste** — pasting more than ~2000 characters into the AI input truncates with a "load full content" affordance so long pastes don't blow past the context window

### Session Tabs

Open documents stack as tabs at the bottom of the editor by default. Position is configurable in Settings → Editor (Top / Bottom / Hidden). Drag tabs to reorder; middle-click to close.

### Saving

Press **Cmd+S** (or click **Save**) to write changes to disk. Saving does **not** create a git commit — it just persists the file.

**Auto-save** kicks in automatically after 30 seconds of unsaved changes.

If you switch to another document while unsaved, your changes are held in a buffer and restored when you come back.

***

## Committing Checkpoints

A **commit** (called a checkpoint in Canonic) is a snapshot you can return to. To commit:

1. Save your document first
2. Click the **Commit** button (or press **Cmd+Shift+S**)
3. Enter a message describing what you changed
4. Click **Save checkpoint**

Commits are **per-document** in Canonic-managed workspaces — only the current file is staged and committed. In external git repos, commits follow the same scoped behavior.

***

## Branching (Canonic-Managed Workspaces Only)

> This section applies when Canonic created the workspace. If you opened an existing git repo, branching is handled by the repo's own branch model — see the sidebar branch indicator.

### Fork a Document

Click **Fork** in the editor toolbar to create a draft branch of the current document. Give it a name. You're now working on a branch — changes here don't affect `main`.

### Switching Between Branches

The branch selector in the editor topbar shows the current document's branch. Click it to switch to another branch for that document.

### Merging Back to Main

When you're happy with a draft, click **Merge → main** in the editor topbar (only visible when you're on a non-main branch). This merges your changes back into `main` and deletes the draft branch.

***

## Version History & Diffs

The **History** tab in the right panel shows all commits for the current document, most recent first.

* Click any commit to see a **parent-vs-commit diff** — added lines in green, removed lines in red
* The diff shows only changed lines for a clean view
* The **Commit modal** includes a live diff preview of the changes you're about to commit so you can sanity-check before snapshotting

**Named versions** let you tag a specific commit with a meaningful name (e.g. "Approved by stakeholders"). Click **Version** in the editor toolbar to save one. Named versions appear in the History panel alongside regular commits.

***

## Inline Comments

### Adding a Comment

Select any text in the document and release the mouse. A popover appears — click **Add comment** to attach a comment to that selection.

Comments appear in the **Comments** tab in the right panel.

### Comment Highlights

Selected text that has a comment is highlighted in the editor. Click the highlight to jump to the comment in the panel. Click the comment to scroll the editor to its anchor.

### Resolving Comments

Click **Resolve** on a comment to mark it done. Resolved comments are hidden by default. Toggle the "Show resolved" option in the Comments panel to see them.

### AI-Suggested Comments

When the AI annotates a document via the chat, its comments are tagged as agent-authored. The Comments panel has a **Delete all AI suggestions** button so you can clear them in bulk after reviewing.

***

## AI Assistant

The AI panel (right side, **AI** tab) is a thinking partner — it challenges assumptions and asks questions, but won't write your documents for you.

### Setup

Configure the AI in **Settings**:

* **Base URL** — any OpenAI-compatible endpoint (default: OpenRouter at `https://openrouter.ai/api/v1`)

* **API key** — your key for that provider

* **Model** — the model to use (e.g. `anthropic/claude-sonnet-4-6`)

Works with OpenRouter, OpenAI, Mistral, DeepSeek, Groq, Ollama, or any OpenAI-compatible API.

### Using the AI

Type a message in the AI panel. The current document is always included as context. The AI will respond with questions and challenges — not rewrites.

**Input behaviour**:

* **Enter** or **`Cmd/Ctrl+Enter`** — send
* **`Shift+Enter`** — newline inside the message
* **`Esc`** — cancel an in-flight response. Partial text already streamed in is retained so you don't lose context.

**Tools the assistant can call** (each gated by a capability toggle in Settings → AI):

* `read_doc` — read another document in the workspace
* `list_workspace` — list files and folders
* `web_search` — fetch a snippet from the web
* `post_comment` — drop an inline comment anchored to a quoted span in the current document
* `suggest_edits` — propose a ghost-text edit you can accept or reject

The assistant's tool calls show up as a single-line log row inside its message so you can see what it actually did.

### Slash Commands (in AI Chat)

Type `/` in the chat input to open a small picker:

* `/model` — switch the model used for the assistant
* `/effort` — switch the effort/quality level (Low / Medium / High)
* `/tools` — toggle individual capabilities on or off; `Space` toggles, `Enter` closes the menu

Preferences (model, effort, tools, system prompt) are persisted to your `config.json` so they survive restarts.

### Compact Mode

On narrow windows, the AI panel docks as a centered floating modal instead of squeezing into the side panel. Streaming, tools, and history all keep working the same way.

Chat history is session-only and resets on app restart unless you explicitly save it.

***

## Coding Agents (AI Control)

The **Implementation** panel (right side) runs an external coding agent's own CLI inside an embedded terminal, so you can kick off and steer engineering work without leaving Canonic. Unlike the AI Assistant, this is the agent's real interactive session — it owns its own turns, permissions, and memory.

Supported agents: **Claude Code, Codex, Gemini CLI, OpenCode, Pi** (or any custom CLI you point it at).

### What you need

* **Install the agent's CLI yourself** — e.g. `claude`, `codex`, `gemini`, `opencode`, or `pi`. Canonic detects what's installed; an uninstalled agent shows a "Not installed" badge with an install hint.
* **Nothing else.** Canonic runs a local MCP server automatically (loopback only, token-authed) and registers itself into the agent's MCP config on the first session. You do **not** edit `AGENTS.md` / `GEMINI.md` or install any skill for this.

### Starting a session

1. Pick an agent in the panel header.
2. Type a prompt and press **`Cmd/Ctrl+Enter`**.
3. The agent's CLI spawns in the embedded terminal and your prompt is sent once it finishes loading. From there it's the normal interactive CLI.

The agent sees what you're working on: the focused doc and your open tray are pushed to the MCP server, and the agent can call `get_open_docs` (or read the context injected at startup) to act on "this doc" without you pasting a path. It can also read, edit, comment on, and create docs in the workspace through the Canonic MCP tools.

> Pi is the exception — it doesn't use MCP. It receives the same workspace context inline via its system prompt instead.

### History, resume, and pop-out

* **History** — every session you start is recorded (agent, prompt, time, status). Expand the History toggle at the bottom of the panel.
* **Resume** — click a history entry to re-open it in a fresh terminal seeded with that prompt.
* **Pop out** — the pop-out button launches the session in your real OS terminal (Terminal / cmd / your configured emulator) if you'd rather drive it there.

Switching to a different agent automatically ends the live session (it's saved to history first).

***

## Sharing

### Starting a Share Session

Click the **Share** button in the titlebar. A modal appears letting you configure:

* **Scope** — what to share:

  * `file` — only the current document

  * `directory` — all documents in the same folder

  * `workspace` — all documents in the workspace

* **Access level**:

  * `read` — recipients can view content and comments

  * `comment` — recipients can also leave comments (synced back to you)

Click **Start sharing** to generate a link. The link uses a Cloudflare Tunnel — no server setup required.

### Stopping a Share Session

Click **Stop sharing**. The link becomes invalid immediately.

### Excluding Directories

Create a `.canonicignore` file in your workspace root (same syntax as `.gitignore`) to exclude specific directories from sharing.

### Default Sharing Preferences

In **Settings > Sharing**, set your default scope and access level so you don't have to configure it each time.

***

## Search

Click the **Search** tab in the left sidebar (magnifying glass icon). Type to search across all documents in your workspace. Results show the matching document and a snippet of context. Click a result to open the document.

Search is indexed in-memory and re-indexed when you open or save a document.

***

## Settings

Access settings via the **gear icon** in the sidebar bottom (or the native menu).

The Settings modal has a left-side tab list plus an **All Settings** search at the top — type any keyword (e.g. `tabs`, `mermaid`, `share`) to jump to the matching control regardless of tab.

### Profile

* Change display name (used in commits and comments)
* Change API key and model
* Check for updates manually

### Sharing Defaults

* Set default share scope (none / file / directory / workspace)
* Set default access level (read / comment)

### Editor

* **Session tabs** — show / hide and position (Top / Bottom)
* **Paragraph spacing** — toggle wider paragraph gaps
* **Window transparency** — opacity + blur for the main window
* **Organic grain** — subtle background grain overlay; opacity adjustable

### AI Capabilities

Per-tool toggles for the assistant: index workspace, read docs, list tree, web search, post comments, suggest edits. Disable any tool you don't want the assistant to call.

### Editing the Config File Directly

The **File** menu has **Open Config File** (opens `~/.config/canonic/config.json` in your default editor) and **Reload Config** (re-reads the file without restarting the app). Useful when scripting or hand-editing provider entries.

### Danger Zone

* **Uninstall** — removes `~/.config/canonic/` config and data

***

## Keyboard Shortcuts

Most shortcuts use `Cmd` on macOS and `Ctrl` on Linux / Windows. Custom bindings are configurable in Settings → Keybindings.

### Editor

| Shortcut              | Action                                             |
| --------------------- | -------------------------------------------------- |
| `Cmd+S`               | Save document                                      |
| `Cmd+Shift+S`         | Commit checkpoint                                  |
| `Cmd+L`               | Select current line / block                        |
| `Shift+ArrowUp/Down`  | Move selected block(s) up / down                   |
| `Cmd++` / `Cmd+-`     | Increase / decrease font size                      |
| `Cmd+F`               | Find in current document                           |
| `Cmd+Shift+F`         | Find & replace across the workspace                |
| `Cmd+G` / `Cmd+Shift+G` | Next / previous find match                       |
| `Tab` (with ghost text) | Accept the inline AI completion                  |

### Slash Menu & Tables

| Shortcut              | Action                                             |
| --------------------- | -------------------------------------------------- |
| `/`                   | Open slash menu at cursor                          |
| `Cmd+I`               | Open slash menu (no `/` inserted)                  |
| `Cmd+I` then `T`      | Insert a 2x2 table (within ~500ms)                 |
| `Cmd+Alt+ArrowUp`     | Add table row above current row                    |
| `Cmd+Alt+ArrowDown`   | Add table row below current row                    |
| `Cmd+Alt+ArrowLeft`   | Add table column left of current column            |
| `Cmd+Alt+ArrowRight`  | Add table column right of current column           |
| `Cmd+Alt+Backspace`   | Delete the current row (promotes next body row to header if you delete the header row) |
| Right-click in cell   | Open the table context menu                        |

### AI Chat

| Shortcut              | Action                                             |
| --------------------- | -------------------------------------------------- |
| `Enter` / `Cmd+Enter` | Send the message                                   |
| `Shift+Enter`         | Newline inside the message                         |
| `Esc`                 | Cancel the in-flight assistant response            |
| `/`                   | Open the chat slash menu (`/model`, `/effort`, `/tools`) |

***

## Troubleshooting

**AI isn't responding**

* Check your API key in Settings

* Make sure your provider's Base URL is correct

* Verify your model name matches what the provider expects

**History panel is empty**

* The document must have at least one commit. Save and commit the file first.

**Share link isn't working**

* Make sure the share session is still active (Share button shows "Stop sharing")

* The link uses Cloudflare Tunnel — requires an internet connection

**App won't open a folder**

* Check that the folder exists and you have read/write permissions
