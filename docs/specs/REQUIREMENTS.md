# Canonic — Requirements

Source of truth for product requirements. When a requirement changes, update this file first, then tests, then code.

* scenario: first launch with no config
  given: no config file exists at \~/.config/canonic/config.json
  when: the app launches
  then: the Setup screen appears before the Workspace screen

***

## Global Configuration (CFG)

> First-run setup and persistent user preferences. Config lives at `~/.config/canonic/config.json`. Setup screen appears on first launch; settings are always accessible from the titlebar gear icon.

* scenario: first launch with valid config
  given: \~/.config/canonic/config.json exists and is valid
  when: the app launches
  then: the Setup screen is skipped and the Workspace screen loads directly

* scenario: setup screen fields
  given: the Setup screen is open
  when: the user views it
  then: fields are present for Display Name, Anthropic API key, default model (sonnet/opus/haiku), and default workspace path

* scenario: API key field masking
  given: the Setup screen is open
  when: the user views the API key field
  then: characters are hidden by default with a toggle to reveal them

* scenario: setup validation — empty required field
  given: the Setup screen is open and a required field is empty
  when: the user clicks Continue
  then: an inline validation error appears and the app does not proceed

* scenario: setup submission writes config
  given: all required fields are filled with valid values
  when: the user clicks Continue
  then: \~/.config/canonic/config.json is written with fields displayName, apiKey, model, defaultWorkspacePath, and sharingDefaults

* scenario: config file not tracked by git
  given: a workspace is open
  when: the user runs git status inside the workspace
  then: \~/.config/canonic/config.json does not appear in the output

* scenario: settings accessible after setup
  given: setup has been completed
  when: the user clicks the gear icon in the titlebar
  then: the Settings modal opens

* scenario: API key change takes effect immediately
  given: Settings is open and the user changes the API key and saves
  when: the user sends a new AI chat message
  then: the new API key is used for that request

* scenario: display name on commits
  given: the user has a display name set in config
  when: a git commit is made
  then: the commit's author.name matches the display name

* scenario: display name on comments
  given: the user has a display name set in config
  when: the user adds a comment
  then: the comment's author field matches the display name

* scenario: sensitive data warning
  given: the user opens the config file or Settings
  when: the API key is stored
  then: a warning is shown that the config file contains sensitive data stored in plain text

***

## Workspace Templates (WKS)

> When creating a new workspace the user picks a template. Blank gives an empty repo. PM Framework scaffolds a full directory hierarchy with twelve starter documents.

* scenario: template options shown
  given: the user is creating a new workspace
  when: the template selection screen appears
  then: at least two options are shown — Blank and PM Framework — each with a name, short description, and preview of what will be created

* scenario: blank template
  given: the user selects Blank and confirms
  when: the workspace is created
  then: only README.md exists in the workspace

* scenario: PM Framework template — files created
  given: the user selects PM Framework and confirms
  when: the workspace is created
  then: all 6 directories and 12 template files are present (Vision, Strategy, Planning, Discovery, Implementation, Monitoring)

* scenario: PM Framework template — file content
  given: the PM Framework workspace was just created
  when: the user opens any template file
  then: the file contains a title heading and a brief description of what belongs there

* scenario: PM Framework template — initial commit
  given: the PM Framework workspace was just created
  when: the user checks the git log
  then: exactly one commit exists with message "Initialize PM Framework workspace" containing all 12 files

* scenario: PM Framework template — sidebar
  given: the PM Framework workspace is open
  when: the user views the sidebar
  then: the 6 top-level directories are shown collapsed by default

* scenario: workspace creation — default branch
  given: any template was used to create a workspace
  when: the workspace opens
  then: the active branch is main

* scenario: re-opening existing workspace
  given: a workspace already exists with git initialized
  when: the user opens it
  then: the template selection screen does not appear

* scenario: app restart restores last workspace
  given: the user previously opened at least one workspace and global config is set up
  when: the app launches
  then: the most recently opened workspace is reopened automatically and the workspace picker is skipped

* scenario: app restart with no prior workspace
  given: global config exists but no workspace has ever been opened
  when: the app launches
  then: the workspace picker is shown

* scenario: app restart with first-run setup pending
  given: global config has not yet been created
  when: the app launches
  then: the first-run setup screen is shown and no auto-reopen is attempted

* scenario: last workspace path is missing or unreadable
  given: the recorded last workspace cannot be opened (deleted folder, permissions, etc.)
  when: the app launches and auto-reopen fails
  then: the workspace picker is shown with an error message naming the failed workspace

* scenario: switch workspace after auto-reopen
  given: the app auto-reopened the last workspace
  when: the user chooses Switch Workspace from settings
  then: the workspace picker is shown and no auto-reopen runs again in the same session

***

## Sharing Scope & Permissions (SHR)

> Users share content via a token-secured Cloudflare Tunnel link. Scope (none / file / directory / workspace) and access level (read / comment) are configurable globally and per-session.

* scenario: sharing defaults in settings
  given: Settings is open
  when: the user views the Sharing section
  then: a scope selector (none / file / directory / workspace) and an access level selector (read / comment) are present

* scenario: default sharing scope on fresh install
  given: the app has never been configured
  when: the user opens Settings
  then: the default sharing scope is file

* scenario: per-session scope override
  given: the user starts sharing
  when: the share modal opens
  then: the scope selector is pre-filled from defaults but can be changed for this session

* scenario: scope file — served content
  given: sharing is active with scope file
  when: a recipient opens the share link
  then: only the single currently open document is served

* scenario: scope directory — served content
  given: sharing is active with scope directory
  when: a recipient opens the share link
  then: all .md files in the same directory as the current document are served as a manifest

* scenario: scope workspace — served content
  given: sharing is active with scope workspace
  when: a recipient opens the share link
  then: all .md files in the workspace are served recursively

* scenario: scope directory or workspace — link view
  given: sharing is active with scope directory or workspace
  when: a recipient opens the share link
  then: a file-list view appears in the browser rather than a single document

* scenario: unique token per session
  given: a share session is started
  when: the session ends via stopShare
  then: the token from that session is invalid and any subsequent requests using it return 404

* scenario: unauthorized access
  given: a share link is active
  when: a request arrives with a missing or incorrect token
  then: the server responds with HTTP 403

* scenario: share modal — file preview
  given: the user opens the share modal before confirming
  when: they view the modal
  then: the names of files that will be shared are listed (content not shown)

* scenario: canonicignore exclusions
  given: a .canonicignore file exists with entries matching certain directories
  when: the user shares with scope directory or workspace
  then: the matching directories are excluded from the shared manifest

***

## AI Assistant (AI)

> The AI chat panel is a thinking partner — it helps users reason through their document, brainstorm, spot gaps, ask clarifying questions, and leave inline comments. It does not ghostwrite the document.

### Identity and configuration

* scenario: configurable assistant name
  given: the user sets `assistant.name` in config
  when: the chat panel renders the intro
  then: the configured name appears as the assistant's name

* scenario: provider-driven model list
  given: providers with `baseUrl` and `apiKey` are configured
  when: the chat panel opens or `/model` is invoked
  then: models are fetched from `{baseUrl}/models` and shown in the selector

* scenario: no providers configured
  given: no providers exist in config
  when: the user opens `/model`
  then: a hint message instructs the user to add a provider in Settings, and the model list is empty

* scenario: stale model auto-cleared
  given: `assistant.model` is set to an id not present in the fetched provider models
  when: provider models load
  then: `assistant.model` and `assistant.providerId` are cleared and persisted

* scenario: API key source
  given: an AI chat message is sent
  when: the request is made to the AI provider
  then: the API key from `~/.config/canonic/config.json` is used, not any .env file

* scenario: missing API key
  given: no API key is configured for the selected provider
  when: the user sends a chat message
  then: a clear error message is shown directing the user to Settings → Providers

### Persistence of assistant preferences

* scenario: persist effort level
  given: the user sets effort via `/effort`
  when: the app is restarted
  then: the previously selected effort level is restored from `~/.config/canonic/config.json`

* scenario: persist tool toggles
  given: the user toggles any agent capability via `/tools`
  when: the app is restarted
  then: the toggle state is restored from `assistant.caps` in config

* scenario: persist thinking display preferences
  given: the user toggles "Show thinking" or expands/collapses the thoughts block
  when: the app is restarted
  then: `assistant.showThinking` and `assistant.thinkingExpanded` are restored from config

* scenario: custom system prompt
  given: the user has set `assistant.extraInstructions` in config
  when: the request is built
  then: the extra instructions are appended after the built-in system prompt

### Chat session lifecycle

* scenario: streaming responses
  given: an AI chat message is sent
  when: the response arrives
  then: text streams chunk-by-chunk rather than appearing all at once

* scenario: cancel mid-stream
  given: a stream is in progress
  when: the user presses Escape
  then: the underlying HTTP request is aborted and `streaming` returns to false

* scenario: chat history persisted per workspace
  given: the user sends and receives messages
  when: the chat ends or the session is switched
  then: the session is saved to `.canonic/ai-chats.json` in the workspace

* scenario: fresh session on workspace open
  given: a workspace is opened or switched
  when: the AI chat panel mounts
  then: chat history is loaded into the history list and a new empty session is started

* scenario: history view reopen
  given: prior sessions exist
  when: the user clicks the history button and selects a chat
  then: that session is loaded into the active chat

* scenario: chat survives focus mode toggle
  given: a stream is in progress
  when: the user enters or exits focus mode, switches right-panel tabs, or collapses the right panel
  then: the AIChat component remains mounted and the stream continues to update state

### Document context and indexing

* scenario: current document always in context
  given: a chat message is sent with a document open
  when: the request is built
  then: the full current document content is included as `<current_document>` with its path

* scenario: workspace index = path list only
  given: `caps.indexWorkspace` is enabled and the workspace contains .md files
  when: the request is built
  then: a `<workspace_index>` block listing relative paths (not content) is included

* scenario: read_file tool
  given: `caps.readDocs` is enabled
  when: the model calls `read_file` with a path
  then: the file content is returned to the model and a tool log of type `read` is rendered

* scenario: list_workspace tool
  given: `caps.listTree` is enabled
  when: the model calls `list_workspace`
  then: a directory tree up to maxDepth (default 3, max 5, capped at 500 entries) is returned and a tool log of type `tree` is rendered

* scenario: list_workspace ignores noise
  given: the workspace contains `.git/`, `node_modules/`, `.canonic/`, `dist/`, dotfiles
  when: `list_workspace` walks the tree
  then: those entries are excluded from the returned listing

### Tools — comments and actions

* scenario: post_comment when asked
  given: `caps.postComments` is enabled and the current document is open
  when: the user asks the assistant to comment, annotate, flag, or critique a passage
  then: the assistant calls the `post_comment` tool and an inline comment is added to the document with the assistant's name as author and `isAgent: true`

* scenario: comment anchor must be verbatim
  given: a `post_comment` tool call is received
  when: the comment is stored
  then: `anchor.quotedText` matches an exact substring of the current document

* scenario: tool log appears in chat
  given: any tool is executed during a turn
  when: the assistant message renders
  then: a `tool-logs` row appears showing the action, truncated to a single line

* scenario: comment tool log is clickable
  given: a `post_comment` tool log is present
  when: the user clicks it
  then: the right panel switches to Comments and scrolls to the matching comment

### Slash commands

* scenario: slash menu opens on `/`
  given: the chat input has focus
  when: the user types `/`
  then: the root slash menu appears with `model`, `effort`, `tools`

* scenario: filter root commands
  given: the slash menu is open at root
  when: the user types `/mo`
  then: the menu filters to commands matching the typed prefix and the first match is highlighted

* scenario: arrow key navigation
  given: any slash submenu is open
  when: the user presses ArrowUp or ArrowDown
  then: the highlighted item moves and wraps at the ends

* scenario: enter selects a menu item
  given: the slash menu is open with an item highlighted
  when: the user presses Enter
  then: the highlighted item is selected; for `tools` Enter closes the menu

* scenario: space toggles a tool
  given: the `/tools` submenu is open with an item highlighted
  when: the user presses Space
  then: that capability toggles and the change is persisted to config

### Thinking display

* scenario: thinking surfaced from reasoning_content
  given: the provider streams a `reasoning_content` delta
  when: the chunk is forwarded
  then: it is wrapped between `<think>` and `</think>` tokens and shown in a collapsible "Thoughts" block

* scenario: thinking parsed from inline tags
  given: a model emits literal `<think>...</think>` in its content stream
  when: the chunk is parsed
  then: the inside is shown in the Thoughts block and removed from the rendered final response

* scenario: thinking collapsed by default
  given: no prior preference is set
  when: an assistant message with thoughts renders
  then: the Thoughts block is collapsed; the user can expand it manually or with Cmd/Ctrl-O

* scenario: thinking style is minimal
  given: a Thoughts block renders in either streaming or final state
  when: it appears in the chat
  then: it has no background fill, no border box, and no padded card — only a left-indented muted text treatment

* scenario: empty assistant content not rendered
  given: a turn produces only tool calls and no textual content
  when: the assistant message renders
  then: no empty content bubble is drawn

### Markdown rendering

* scenario: assistant content is markdown
  given: the assistant returns markdown
  when: the message renders
  then: it is parsed by a real markdown library (paragraphs, lists, code blocks, blockquotes, headings, links, hr)

* scenario: render styles are tight
  given: markdown is rendered inside an assistant bubble
  when: it displays
  then: paragraph margins are compact and lists/code/headings use scoped styles tuned for the bubble width

### DeepSeek thinking-mode follow-up

* scenario: reasoning_content sent back
  given: a previous assistant turn included thoughts (from `reasoning_content` or `<think>` tags) and made a tool call
  when: the next request is built for a DeepSeek thinking-mode model
  then: `reasoning_content` is included on that assistant message so the API does not reject the turn

### Compact mode

* scenario: AI chat as floating modal on small screens
  given: the window is below the small-screen threshold and the right panel is open on the AI tab
  when: the panel renders
  then: it is positioned as a centered modal (both axes) rather than docked to the right edge

* scenario: floating modal preserves stream
  given: a stream is in progress
  when: the window crosses the compact threshold or panels toggle
  then: the AIChat instance is not unmounted and the stream continues

***

## Git Version Control (GIT)

> Every workspace is a git repo. Version control is exposed through a document-centric UI — no terminal required.

* scenario: git init on workspace creation
  given: a new workspace is being created
  when: creation completes
  then: git init has been run and the workspace is a valid git repository

* scenario: new document — staged not committed
  given: the user creates a new document
  when: the file is saved for the first time
  then: the file is staged but no commit is made automatically

* scenario: Cmd+S does not commit
  given: a document is open and the user has unsaved changes
  when: the user presses Cmd+S
  then: the file is written to disk and no git commit is created

* scenario: commit — empty message blocked
  given: the commit modal is open
  when: the user clicks Save checkpoint with an empty message field
  then: an inline error is shown and the commit is not made

* scenario: commit — appears in history
  given: a commit has just been made with a message
  when: the user opens the History panel
  then: the new commit appears at the top of the list

* scenario: branch creation
  given: the working tree is clean on main
  when: the user creates a branch named feature/test
  then: the branch is created and the app switches to it

* scenario: branch selector reflects current branch
  given: the user is on any branch
  when: they view the titlebar
  then: the branch selector shows the name of the current branch

* scenario: switching branches updates content
  given: two branches have different versions of a file
  when: the user switches branches
  then: the file tree and editor content update to reflect the newly checked-out branch

* scenario: merge — success or conflict
  given: a feature branch exists
  when: the user merges it into main from the branch menu
  then: a success message is shown if the merge completes cleanly, or a conflict message if it does not

* scenario: history panel — diff colors
  given: a commit is selected in the History panel
  when: the diff view renders
  then: added lines are shown in green and removed lines in red

* scenario: history panel — diff on click
  given: the user clicks a commit in the History panel
  when: the diff view opens
  then: it shows the diff of that commit relative to the current working state

***

## Document Tree (TREE)

> The sidebar file tree lists documents and folders. New documents may be created with a path, and existing documents may be moved between folders by dragging onto a folder node.

* scenario: create a document with a path creates the parent folders
  given: the user is creating a new document
  when: they name it `feature/open-document-tabs`
  then: the folder `feature/` is created if missing and the document is written at `feature/open-document-tabs.md` with `# open-document-tabs` as its heading

* scenario: drop a document onto a folder moves it into that folder
  given: the user is dragging a document in the tree
  when: they drop it onto a folder node
  then: the document is moved into that folder

* scenario: dropping a document outside a folder does nothing
  given: the user is dragging a document in the tree
  when: they release it over empty tree space or over a file node rather than a folder
  then: nothing happens and the document keeps its current location

***

## Comments (CMT)

> Inline comments anchored to selected text. Shown in the right panel. Comments persist across restarts.

* scenario: comment trigger on selection
  given: the user selects text in the editor and releases the mouse
  when: the selection is non-empty
  then: an Add comment button or popover appears

* scenario: comment saves quoted text
  given: the user has selected text and opened the comment input
  when: the user submits a comment
  then: the selected text is saved as the anchor for that comment

* scenario: comments persist after restart
  given: a comment has been added to a document
  when: the app is restarted and the document is reopened
  then: the comment is still visible with its anchor intact

* scenario: comment anchor highlighted
  given: an unresolved comment exists on a document
  when: the document is open in the editor
  then: the anchor text is visually highlighted in the editor

* scenario: click comment scrolls to anchor
  given: a comment is visible in the right panel
  when: the user clicks on it
  then: the editor scrolls to the anchor text for that comment

* scenario: resolved comments hidden by default
  given: a document has both resolved and unresolved comments
  when: the user opens the comment panel
  then: resolved comments are hidden and a toggle is available to show them

* scenario: comments scoped to document
  given: the user switches from document A to document B
  when: the comment panel updates
  then: only comments belonging to document B are shown

* scenario: comment author matches display name
  given: the user adds a comment
  when: the comment is saved
  then: the author field matches the display name from Settings

* scenario: mass delete AI-suggested comments
  given: a document has one or more comments created by an AI agent (isAgent: true)
  when: the user clicks the "Clear AI" button in the comments panel header and confirms
  then: all agent-created comments are removed and persisted, while human comments remain untouched

* scenario: clear AI button hidden when no agent comments
  given: a document has only human-authored comments
  when: the comments panel is open
  then: the "Clear AI" button is not shown

***

## Floating Toolbar (TBR)

> A formatting toolbar that appears when text is selected. Provides bold, italic, strikethrough, link, list, blockquote, and comment actions without leaving the editor.

* scenario: toolbar appears on selection
  given: the editor contains text
  when: the user selects one or more characters
  then: the floating toolbar appears above the selection

* scenario: toolbar hides on deselect
  given: the floating toolbar is visible
  when: the user clicks somewhere with no selection
  then: the toolbar disappears

* scenario: bold toggle
  given: text is selected and bold is not applied
  when: the user clicks the bold button
  then: the selected text becomes bold

* scenario: bold remove
  given: text is selected and the entire selection is bold
  when: the user clicks the bold button
  then: bold is removed from the selection

* scenario: italic toggle
  given: text is selected
  when: the user clicks the italic button
  then: the mark toggles on or off for the selection

* scenario: strikethrough toggle
  given: text is selected
  when: the user clicks the strikethrough button
  then: the mark toggles on or off for the selection

* scenario: link add
  given: text is selected and no link covers the selection
  when: the user clicks the link button
  then: a URL input appears inside the toolbar, auto-focused

* scenario: link submit via Enter
  given: the URL input is visible and contains a URL
  when: the user presses Enter
  then: the link mark is applied to the originally selected text and the input closes

* scenario: link submit via button
  given: the URL input is visible and contains a URL
  when: the user clicks Add
  then: the link mark is applied to the originally selected text and the input closes

* scenario: link cancel
  given: the URL input is visible
  when: the user presses Escape
  then: the input closes and no link is applied

* scenario: link remove
  given: text is selected and a link already covers the selection
  when: the user clicks the link button
  then: the link mark is removed immediately with no input shown

* scenario: link edit inline
  given: the selection covers an existing link
  when: the toolbar is shown
  then: an inline URL input appears next to the formatting buttons pre-filled with the current href, and the bold/italic/etc. buttons remain available

* scenario: link href update via inline input
  given: the inline URL input is visible with the current href
  when: the user edits the value and presses Enter or blurs the input
  then: the link mark is rewritten with the new href across the same range; if the value is empty the link mark is removed

* scenario: comment from toolbar
  given: text is selected and the toolbar is visible
  when: the user clicks the comment button
  then: the comment input opens pre-filled with the selected text as the anchor

* scenario: active mark state
  given: the cursor is inside bold text
  when: the floating toolbar is visible
  then: the bold button appears in its active/highlighted state

***

## Editor Slash Menu & Tables (EDT)

> Typing `/` (or `Cmd/Ctrl+I`) in the editor opens a searchable slash menu for inserting blocks (headings, lists, table, code, mermaid, divider). When the cursor is inside a table, a floating toolbar and right-click context menu provide add/delete row, add/delete column, and delete-table actions.

### Slash menu

* scenario: slash trigger opens menu
  given: a writable document with an editable editor
  when: the user types `/` after a space
  then: the slash menu tooltip appears anchored to the caret with the root "Insert" entry highlighted

* scenario: slash at the start of a line opens menu
  given: a writable document with the caret at the start of a line or block (including an empty new line or the start of the document)
  when: the user types `/`
  then: the slash menu tooltip appears

* scenario: slash mid-word does not open menu
  given: the caret sits immediately after a non-space character (e.g. `TODO`)
  when: the user types `/`
  then: the slash menu does not open and the `/` is inserted as normal text

* scenario: Cmd/Ctrl+I opens slash menu
  given: a writable document with an editable editor
  when: the user presses Cmd/Ctrl+I
  then: the slash menu tooltip appears at the caret

* scenario: rapid Cmd/Ctrl+I+T inserts a table
  given: a writable document with an editable editor
  when: the user presses Cmd/Ctrl+I then T within 500ms
  then: a 2x2 table is inserted at the caret and the slash menu closes

* scenario: filter narrows submenu
  given: the slash menu is open in the Insert submenu
  when: the user types `mermaid`
  then: the highlighted item is "Mermaid Diagram" and pressing Enter inserts a mermaid block

* scenario: Escape closes menu
  given: the slash menu is open
  when: the user presses Escape
  then: the menu closes and focus returns to the editor

* scenario: trigger slash is removed on action
  given: the user typed `/` to open the menu
  when: an action is selected
  then: the trigger `/` character is removed from the document before the block is inserted

### Agent slash commands

* scenario: root menu lists Review and Build
  given: the slash menu is open at the root
  when: the user views the menu
  then: the root entries include "Review with agent" and "Build with agent" alongside "Insert"

* scenario: agent slash commands are searchable
  given: the slash menu is open at the root
  when: the user types "build"
  then: the highlighted entry is "Build with agent"

* scenario: /review lists configured agents
  given: at least one agent is configured
  when: the user opens the slash menu and selects "Review with agent"
  then: a submenu lists every configured agent by name

* scenario: selecting a reviewer agent opens the panel
  given: the slash menu is open in the Review submenu and agent "Claude" is listed
  when: the user selects "Claude"
  then: the right panel opens to the Agent tab (uncollapsed), "Claude" becomes the active agent, the flavor is set to reviewer, and the trigger "/" is removed from the document

* scenario: /build opens the agent in implementer mode
  given: the slash menu is open in the Build submenu and agent "Claude" is listed
  when: the user selects "Claude"
  then: the right panel opens to the Agent tab, "Claude" becomes active, and the flavor is set to implementer

* scenario: no agents configured
  given: no agents are configured
  when: the user selects "Review with agent" or "Build with agent"
  then: the submenu offers a "Set up an agent…" entry that opens the agent panel in the chosen flavor

### Table toolbar

* scenario: toolbar appears inside a table
  given: a table exists in the editor
  when: the user clicks any cell
  then: a floating table toolbar appears above the table

* scenario: add row below
  given: the table toolbar is visible
  when: the user clicks "Add row below"
  then: a new row is appended after the current row and the table row count increases by one

* scenario: add row above
  given: the table toolbar is visible
  when: the user clicks "Add row above"
  then: a new row is inserted before the current row

* scenario: delete row
  given: the table toolbar is visible and the table has at least two rows
  when: the user clicks "Delete row"
  then: the row containing the cursor is removed

* scenario: add column right
  given: the table toolbar is visible
  when: the user clicks "Add column right"
  then: every row gains a cell to the right of the current column

* scenario: add column left
  given: the table toolbar is visible
  when: the user clicks "Add column left"
  then: every row gains a cell to the left of the current column

* scenario: delete column
  given: the table toolbar is visible and the table has at least two columns
  when: the user clicks "Delete column"
  then: the column containing the cursor is removed from every row

* scenario: delete table
  given: the table toolbar is visible
  when: the user clicks "Delete Table"
  then: the entire table node is removed from the document

### Table context menu

* scenario: right-click inside table opens context menu
  given: a table exists in the editor
  when: the user right-clicks a cell
  then: a context menu appears with row and column add/delete entries

* scenario: context menu action mutates table
  given: the table context menu is open
  when: the user clicks "Add Row Below" or "Delete Column"
  then: the corresponding prosemirror table command runs and the menu closes

### Markdown link clicks

* scenario: left-click on a markdown link opens it
  given: the editor contains a `[label](https://example.com)` link
  when: the user left-clicks the link text with no modifier keys
  then: the URL opens in the system browser and the editor caret does not move into the link

* scenario: only safe schemes open externally
  given: the editor contains a link with an unsupported scheme (e.g. `javascript:` or `file:`)
  when: the user left-clicks the link
  then: nothing is opened and the caret is not placed inside the link

* scenario: mailto links open in the default mail client
  given: the editor contains a `mailto:` link
  when: the user left-clicks it
  then: the system mail client is launched

* scenario: right-click on a link selects the link and shows the floating toolbar
  given: the editor contains a markdown link
  when: the user right-clicks the link text
  then: the link's full text range is selected, the floating toolbar appears with the link button active, and the OS context menu is suppressed

* scenario: right-click on non-link text keeps the native context menu
  given: the editor cursor is on regular paragraph text
  when: the user right-clicks the text
  then: the OS context menu appears with spelling and grammar entries intact

* scenario: keyboard navigation enters a link
  given: the caret is adjacent to a markdown link
  when: the user moves the caret with arrow keys
  then: the caret moves through the link text without opening the URL

***

## Wiki-Links (WKL)

> `[[doc-name]]` syntax renders as inline chips. Chips navigate to or create the referenced document. Anchors (`[[doc#heading]]`) scroll to a matching heading.

* scenario: chip renders — resolved
  given: a document contains [[product-vision]] and a file named product-vision.md exists
  when: the editor renders the document
  then: a chip appears with the doc name in blue styling

* scenario: chip renders — unresolved
  given: a document contains [[new-idea]] and no file named new-idea.md exists
  when: the editor renders the document
  then: a chip appears with the doc name in green styling

* scenario: chip navigation — resolved
  given: a resolved (blue) chip is visible
  when: the user clicks it
  then: the referenced document opens and the view scrolls to the top

* scenario: chip navigation — anchor
  given: a chip references [[roadmap#next-q3-2026]]
  when: the user clicks it
  then: the referenced document opens and the view scrolls to the heading matching the anchor text

* scenario: chip navigation — anchor not found
  given: a chip references a heading anchor that does not exist in the destination doc
  when: the user clicks it
  then: the destination document opens and the view scrolls to the top

* scenario: back navigation — banner appears
  given: the user navigated to a document by clicking a wiki-link chip
  when: the destination document loads
  then: a dismissable Back to \[source doc name] banner appears at the top of the editor

* scenario: back navigation — scroll position restored
  given: the user was scrolled partway through a document before clicking a wiki-link chip
  when: the user clicks the back banner
  then: the source document opens and the scroll position is restored to where it was before

* scenario: back navigation — dismiss
  given: the back banner is visible
  when: the user clicks the ✕ button on it
  then: the banner disappears and the back destination is forgotten

* scenario: chip creation — no LLM
  given: an unresolved (green) chip is visible and no AI provider is configured
  when: the user clicks it
  then: a new empty .md file is created with that name and immediately opened

* scenario: chip creation — with LLM
  given: an unresolved (green) chip is visible and an AI provider is configured
  when: the user clicks it
  then: a new file is created, an AI prompt is sent using the current doc as context, and the generated content is saved to the new file

* scenario: autocomplete trigger
  given: the user is editing a writable document
  when: the user types [[
  then: an autocomplete dropdown appears listing all docs in the workspace by name

* scenario: autocomplete selection
  given: the autocomplete dropdown is open
  when: the user selects a doc name
  then: [[doc-name]] is inserted at the cursor as a chip

* scenario: wiki-link survives save and reopen
  given: a document contains a wiki-link chip
  when: the document is saved and reopened
  then: the chip renders correctly and [[name]] appears in the raw markdown without backslash escaping

* scenario: chips hidden in readonly
  given: a document is open in readonly mode (peer view)
  when: the editor renders
  then: wiki-link chips are visible but clicking them does not trigger creation

***

## Mermaid Diagrams (MRM)

> Fenced ` ```mermaid ` blocks render as interactive diagram cards with a live SVG preview and an editable source tab. Supports dark and light themes.

* scenario: diagram renders from fenced block
  given: a document contains a fenced code block tagged mermaid with valid syntax
  when: the editor renders the document
  then: the block appears as an SVG diagram card rather than a raw code block

* scenario: diagram created by typing fence
  given: the user types \`\`\`mermaid and presses Enter in a writable document
  when: the block is completed
  then: the block auto-converts to a mermaid diagram card

* scenario: multiple diagrams on same page
  given: a document contains two or more mermaid blocks
  when: the editor renders the document
  then: all diagrams render independently without interfering with each other

* scenario: invalid syntax shows error
  given: a fenced mermaid block contains invalid diagram syntax
  when: the editor renders it
  then: an error message is shown in place of the diagram reading Diagram error: \[reason]

* scenario: edit tab — writable doc
  given: a mermaid card is in a writable document
  when: the user hovers over the card
  then: Preview and Edit tab buttons appear at the bottom of the card

* scenario: edit tab — readonly doc
  given: a mermaid card is in a readonly document (peer view or readonly prop)
  when: the user hovers over the card
  then: no tab buttons appear

* scenario: source editing updates diagram
  given: the user has switched to the Edit tab on a mermaid card and modified the source
  when: the user clicks Update or the 300ms debounce elapses
  then: the preview re-renders with the updated diagram and the markdown on disk reflects the change

* scenario: dark mode theme
  given: the app is in dark mode (any theme that is not paper)
  when: a mermaid diagram renders
  then: the diagram uses dark-themed colors matching the app's color palette

* scenario: light mode theme
  given: the app is in light mode (paper theme)
  when: a mermaid diagram renders
  then: the diagram uses light-themed colors matching the app's color palette

* scenario: theme switch re-renders
  given: a mermaid diagram is visible and the user switches the app theme
  when: the theme change completes
  then: the diagram re-renders with the new theme's colors

* scenario: cursor after last diagram
  given: a mermaid diagram is the last block in a document
  when: the user clicks below the diagram card
  then: the cursor can be placed in an empty paragraph below it and the user can type

***

***

## Image Paste (IMG)

> Users can paste images (PNG, JPG, GIF, WebP) and screenshots directly into the editor. Images are saved to disk in the workspace's `assets/` folder and embedded in the markdown document.

* scenario: paste PNG or JPEG from clipboard
  given: the user has copied an image to the clipboard
  when: the user pastes (Cmd+V / Ctrl+V) in the editor
  then: the image is saved to `assets/image-<timestamp>.png` (or `.jpg`) in the workspace and displayed inline in the editor

* scenario: paste animated GIF from clipboard
  given: the user has copied a GIF to the clipboard
  when: the user pastes in the editor
  then: the GIF is saved to `assets/image-<timestamp>.gif` and displayed inline; animation plays in the editor

* scenario: image saved to assets folder
  given: an image was pasted into any document
  when: the user inspects the workspace folder
  then: an `assets/` directory exists containing the saved image file

* scenario: markdown references the image
  given: an image was pasted
  when: the markdown is serialized
  then: the image appears as `![](canonic-asset:///assets/image-<timestamp>.ext)` in the `.md` file

* scenario: paste in readonly mode
  given: the editor is in readonly mode (peer file view or prop)
  when: the user attempts to paste an image
  then: no image is saved and no change occurs in the editor

* scenario: paste in demo mode
  given: the app is in demo mode (no real workspace)
  when: the user attempts to paste an image
  then: no file is written and the paste is silently ignored

* scenario: paste non-image content
  given: the user copies text or non-image content
  when: the user pastes in the editor
  then: normal paste behavior occurs (image plugin does not interfere)

***

## Find & Replace (FND)

> Zed-style find-and-replace. In-document find via Cmd+F (floating bar over editor). Workspace-wide find and replace via Cmd+Shift+F (sidebar panel) with results grouped by file and per-branch awareness. Keybindings are configurable in Settings → Hotkeys.

### In-document Find (Cmd+F)

* scenario: open find bar in current doc
  given: a document is open in the editor
  when: the user presses Cmd+F (or Ctrl+F)
  then: a floating find bar appears at the top of the editor with an input focused

* scenario: close find bar
  given: the find bar is open
  when: the user presses Escape or clicks the close (×) button
  then: the find bar closes, all highlights are cleared, and editor focus is restored

* scenario: matches highlighted on type
  given: the find bar is open
  when: the user types a query
  then: all matches in the current document are highlighted and the first match is accent-colored as the current match

* scenario: match count displayed
  given: the find bar shows N matches for a query
  when: the user views the bar
  then: a label reads "X of N" where X is the 1-based index of the current match

* scenario: cycle next match
  given: the find bar has matches and a current match selected
  when: the user presses Enter (or clicks the next ↓ button)
  then: the current match advances to the next match; wraps to the first match after the last

* scenario: cycle previous match
  given: the find bar has matches and a current match selected
  when: the user presses Shift+Enter (or clicks the prev ↑ button)
  then: the current match moves to the previous match; wraps to the last match before the first

* scenario: case-sensitive toggle
  given: the find bar is open
  when: the user toggles the Aa button on
  then: matching becomes case-sensitive and the highlighted matches update

* scenario: whole-word toggle
  given: the find bar is open
  when: the user toggles the ab| button on
  then: only matches surrounded by word boundaries are highlighted

* scenario: regex toggle
  given: the find bar is open
  when: the user toggles the .* button on and types a regex
  then: matches are computed via regex; if regex is invalid, an error indicator is shown and no matches are highlighted

* scenario: prefill from selection
  given: the user has text selected in the editor
  when: the user presses Cmd+F
  then: the find bar opens with the selected text as the initial query

* scenario: no matches
  given: the find bar has a query with zero matches in the doc
  when: the user views the bar
  then: the label reads "0 of 0" and no highlights are shown

### Workspace Find & Replace (Cmd+Shift+F)

* scenario: open workspace search view
  given: a workspace is open
  when: the user presses Cmd+Shift+F (or Ctrl+Shift+F)
  then: the main content area shows the workspace find-and-replace view (replacing the editor) with the query input focused

* scenario: close search view restores editor
  given: the workspace search view is open and a document was previously open
  when: the user presses Escape or clicks the close (×) button
  then: the search view closes and the previously open document is shown in the editor

* scenario: clicking match closes view and opens file
  given: the workspace search view is open with results
  when: the user clicks a match row for a checked-out file
  then: the search view closes and the file opens in the editor at the matching line

* scenario: search across current branch
  given: the search panel is open and "across all branches" is OFF
  when: the user enters a query
  then: results are returned by scanning files in the workspace working tree (excluding .git, node_modules, .canonic), grouped by file path with line number and line text for each match

* scenario: search across all branches
  given: the search panel is open and "across all branches" is ON
  when: the user enters a query
  then: results include matches from files in non-checked-out branches, shown under an "Other branches" group with the branch name labeled

* scenario: include glob filter
  given: the search panel is open
  when: the user enters a pattern in "files to include" (e.g. `*.md`)
  then: only files matching the glob are searched

* scenario: exclude glob filter
  given: the search panel is open
  when: the user enters a pattern in "files to exclude" (e.g. `assets/**`)
  then: files matching the glob are skipped

* scenario: case-sensitive search
  given: the search panel is open and case-sensitive toggle is ON
  when: the user enters a query
  then: matches are case-sensitive

* scenario: whole-word search
  given: the search panel is open and whole-word toggle is ON
  when: the user enters a query
  then: only matches surrounded by word boundaries are returned

* scenario: regex search
  given: the search panel is open and regex toggle is ON
  when: the user enters a valid regex
  then: matches are computed via regex; if invalid, an error message is shown and the result list is empty

* scenario: jump to match
  given: the search results contain a match in a checked-out file
  when: the user clicks the match row
  then: the file opens in the editor at the matching line and the match is highlighted in the editor

* scenario: jump to cross-branch match
  given: a result row is from a file on a non-checked-out branch
  when: the user clicks the row
  then: a read-only viewer opens showing that branch's file with the match highlighted

* scenario: replace next match
  given: the user has a query, a replacement string, and at least one match on a checked-out file
  when: the user clicks Replace
  then: the next checked-out-branch match is replaced in the file's in-memory buffer and that file is marked dirty

* scenario: replace all matches
  given: the user has a query, a replacement string, and matches on checked-out files
  when: the user clicks Replace All
  then: every match on checked-out files is replaced in-memory and each affected file is marked dirty

* scenario: cross-branch replace skipped
  given: the search includes matches from non-checked-out branches
  when: the user clicks Replace All
  then: cross-branch matches are skipped and the status line reports "K skipped on other branches"

* scenario: empty query
  given: the search panel is open
  when: the query input is empty
  then: no search runs and the result list is empty

### Configurable Keybindings (FND-KB)

* scenario: hotkeys tab shows find shortcuts
  given: Settings → Hotkeys is open
  when: the user views the tab
  then: rows are present for "Find in document," "Find in workspace," "Find next," and "Find previous"

* scenario: default shortcuts
  given: the user has not customized find shortcuts
  when: the Hotkeys tab loads
  then: defaults shown are Mod-f, Mod-Shift-f, Mod-g, Mod-Shift-g

* scenario: change a shortcut
  given: the Hotkeys tab is open
  when: the user types a new binding string (e.g. `Mod-Shift-h`) into a find shortcut field
  then: the binding is saved to `~/.config/canonic/config.json` under `hotkeys.findInDoc` (etc.) and takes effect on next keypress without restart

### Demo Mode (FND-DEMO)

* scenario: workspace search in demo mode
  given: the app is in demo mode and the Search view is open
  when: the user enters a query that matches demo content
  then: results are returned from demo workspace files (in-memory) and shown in the same UI as live mode

* scenario: replace in demo mode
  given: the user runs Replace or Replace All in demo mode
  when: the action fires
  then: no file is written; a hint informs the user that demo mode is read-only

### Split Panels (SPLIT)

* scenario: open a reference pane
  given: a document is open in the editor and at least one other document exists
  when: the user clicks the Split button
  then: a read-only reference pane opens beside the editor showing another document

* scenario: switch a pane's document with quicksearch
  given: a reference pane is open
  when: the user clicks the pane's document switcher and picks a document from the search list
  then: the pane loads and displays the chosen document

* scenario: activate a reference pane
  given: a reference pane shows document B while document A is the active editor
  when: the user clicks the reference pane
  then: document B becomes the active editable document and document A moves into the reference pane

* scenario: close a reference pane
  given: a reference pane is open
  when: the user clicks the pane's close button
  then: the pane is removed and the active editor expands to fill the space

* scenario: pane limit
  given: two reference panes are already open
  when: the user looks at the Split button
  then: the Split button is disabled (maximum three panes total)

* scenario: drag a document onto a reference pane
  given: a reference pane is open
  when: the user drags a document from the file tree and drops it on the pane
  then: the pane loads the dropped document

* scenario: drag a document onto the active editor
  given: the editor is open
  when: the user drags a document from the file tree and drops it on the editor pane
  then: the dropped document opens as the active editable document

* scenario: reference panes are read-only
  given: a reference pane is showing a document
  when: the user views the pane
  then: the content cannot be edited; only the active editor pane accepts edits

* scenario: opening a referenced doc removes the duplicate pane
  given: document B is shown in a reference pane
  when: the user opens document B as the active document
  then: the reference pane showing B is removed so the document is not displayed twice

* scenario: split view in demo mode
  given: the user launches demo mode
  when: the demo workspace loads
  then: the app opens with the editor and one reference pane visible

* scenario: panes stack top/bottom by default
  given: the user has not changed the split layout setting
  when: a reference pane opens
  then: the panes are arranged top-to-bottom

* scenario: switch to side-by-side layout
  given: split panels are open
  when: the user unchecks "Stack split panels" in the theme menu
  then: the panes are arranged side by side, and the choice persists across restarts

## Editor Topbar (TOP)

> The editor topbar shows the current document title alongside Save, Version and Split actions. The title is clickable to rename the document in place.

* scenario: click the title to rename
  given: a document is open
  when: the user clicks the title in the editor topbar
  then: the title becomes an editable input pre-filled with the current name

* scenario: confirm a title rename
  given: the title input is editing
  when: the user types a new name and presses Enter (or blurs the input)
  then: the document is renamed to the new name and its tab updates

* scenario: cancel a title rename
  given: the title input is editing
  when: the user presses Escape
  then: the input reverts to the original title and no rename occurs

## Editor Tabs (TAB)

* scenario: tab appears when a file is opened
  given: editor tabs are enabled
  when: the user opens a document
  then: a tab for that document appears in the tab strip

* scenario: tabs ordered by open time
  given: editor tabs are enabled
  when: the user opens document A, then B, then C
  then: the tab strip shows A, B, C in that left-to-right order

* scenario: re-opening a file does not duplicate its tab
  given: a tab for document A already exists
  when: the user opens document A again
  then: no new tab is added and the existing tab becomes active

* scenario: active tab is highlighted
  given: multiple tabs are open
  when: the user views the tab strip
  then: the tab matching the currently open document is visually highlighted

* scenario: switching documents via a tab
  given: multiple tabs are open
  when: the user clicks a non-active tab
  then: that document becomes the active document and the highlight moves to its tab

* scenario: closing a tab preserves unsaved edits
  given: document A has unsaved edits and its tab is open
  when: the user closes the tab for A
  then: the tab is removed but the unsaved edits remain buffered for A and persist if A is reopened in the same session

* scenario: edits clear only on app close before save
  given: document A has unsaved edits that were never written to disk
  when: the user closes the app before saving
  then: the unsaved edits are discarded; saved edits are preserved

* scenario: closing the active tab activates a neighbor
  given: tabs A, B, C are open and B is active
  when: the user closes tab B
  then: another open tab becomes active (the next tab to the right, or the previous if none follows)

* scenario: closing the last tab shows the empty state
  given: only one tab is open
  when: the user closes that tab
  then: no document is active and the empty editor state is shown

* scenario: tabs sit at the bottom by default
  given: the user has not changed the tabs position setting
  when: a document is open
  then: the tab strip is rendered at the bottom of the editor area

* scenario: tabs span the editor area when split
  given: a vertical split with one reference pane and editor tabs enabled
  when: the user views the editor area
  then: the tab strip spans the full width of the editor area and sits below the split row (or above, when position is "top")

* scenario: move tabs to the top
  given: editor tabs are enabled
  when: the user selects "Top" in Settings → Appearance → Tab position
  then: the tab strip moves to the top of the editor area and the choice persists across restarts

* scenario: disable tabs entirely
  given: at least one tab is open
  when: the user turns off "Editor tabs" in Settings → Appearance
  then: the tab strip is hidden but the open-tab list is preserved if tabs are re-enabled in the same session

* scenario: renamed file updates its tab
  given: a tab for document A is open
  when: the user renames A to B
  then: the same tab now shows the name B in the same position

* scenario: deleted file is removed from tabs
  given: a tab for document A is open
  when: the user deletes A
  then: the tab for A is removed from the tab strip

* scenario: switching workspaces clears the tab strip
  given: tabs are open in workspace W1
  when: the user opens workspace W2
  then: the tab strip is empty in W2

## Window Chrome — Transparency & Blur (CHROME)

* scenario: macOS shows transparency and blur controls
  given: the app runs on macOS
  when: the user opens Settings → Appearance
  then: both "Window transparency" (with opacity slider) and "Window blur" controls are shown

* scenario: Linux and Windows hide transparency and blur controls
  given: the app runs on Linux or Windows
  when: the user opens Settings → Appearance
  then: the "Window transparency", "Transparency opacity", and "Window blur" controls are not shown, and searching settings for "blur" or "transparency" returns no result

* scenario: macOS vibrancy blur frosts the desktop behind the window
  given: the app runs on macOS and "Window blur" is on
  when: the window is displayed
  then: the OS vibrancy material ("under-window") renders a frosted-glass blur of the desktop behind the panels

* scenario: macOS transparency keeps bars and editor see-through, floating menus solid
  given: the app runs on macOS and "Window transparency" is on at opacity X
  when: the window is displayed
  then: the topbar, left sidebar, right panel, editor surface and outer container are semi-transparent at opacity X so the vibrancy/desktop shows through, while floating menus (tooltips, popovers, dropdowns, modals, toasts) render fully opaque so they stay readable over content

* scenario: Linux and Windows windows stay fully opaque
  given: the app runs on Linux or Windows
  when: the window is displayed
  then: the window is created non-transparent with a solid background color, the `window-transparency` class is not applied, and no blur is attempted regardless of stored config

* scenario: changing blur or transparency applies without restart on macOS
  given: the app runs on macOS
  when: the user toggles "Window blur" or "Window transparency" in Settings
  then: the window vibrancy and background update immediately and the choice persists across restarts

* scenario: floating menus stay opaque while bars stay transparent
  given: transparency is on (any window width, compact or wide)
  when: a tooltip, popover, dropdown, slash menu, table/floating toolbar, branch menu, agent selector, modal, or toast renders over content
  then: its background is fully opaque so text over content stays readable, while the topbar, sidebar and right panel keep their transparency (vibrancy)

* scenario: components referencing alias surfaces are never undefined
  given: a component styles a surface with `--bg-secondary` or `--bg-body`
  when: it renders under any theme
  then: the alias resolves to a real themed surface (never an undefined background); inside a floating menu it resolves opaque, on a transparent bar it follows that bar

## External File Sync (EXT)

* scenario: file added outside the app appears in the sidebar
  given: a workspace is open
  when: another process creates a new `.md` file under the workspace
  then: the sidebar file tree updates to include the new file within a second, with no user action

* scenario: file deleted outside the app disappears from the sidebar
  given: a workspace is open and a file `X.md` is visible in the sidebar
  when: another process deletes `X.md`
  then: `X.md` is removed from the sidebar file tree

* scenario: active doc content reloads when changed on disk and buffer is clean
  given: the active doc is open and the buffer has no unsaved edits
  when: another process modifies the active doc on disk
  then: the editor re-renders with the new disk content automatically

* scenario: external change while buffer is dirty shows a toast and preserves edits
  given: the active doc has unsaved edits
  when: another process modifies the active doc on disk
  then: a toast appears noting the on-disk change, the unsaved edits remain in the buffer, and the user can click "Reload from disk" to discard edits and load the disk content

## Agent API — Read Comments (AGT-CMT)

* scenario: agent reads comments for one doc
  given: Canonic is running and the agent has the lockfile token
  when: the agent calls `GET /comments?file=<relPath>` with Bearer auth
  then: the response is `200 { file, comments: [...] }` with the saved comments for that doc, or an empty array if none exist

* scenario: agent reads all comments in workspace
  given: Canonic is running and the agent has the lockfile token
  when: the agent calls `GET /comments` (no `file` param) with Bearer auth
  then: the response is `200 { comments: { <relPath>: [...], ... } }` mapping every doc with stored comments to its comment array

* scenario: missing or bad auth is rejected
  given: a GET request to `/comments` with no Authorization header or a wrong token
  when: the server handles the request
  then: it returns `401 unauthorized` and no comment data

## Agent Session Routing (AGT-RTE)

* scenario: agent sends an explicit workspace and relative file
  given: Canonic is running with workspace W1 open
  when: the agent calls `POST /session/start` with `workspacePath: W2` and a relative `file`
  then: Canonic switches to workspace W2, opens the file, and the agent-waiting pill is visible

* scenario: agent sends an absolute file path with no workspace
  given: workspace W1 is in the recent-workspaces list at path `/Users/me/W1`
  when: the agent calls `POST /session/start` with `file: /Users/me/W1/Vision/spec.md` and no `workspacePath`
  then: Canonic resolves W1 from recent workspaces, opens it, opens `Vision/spec.md`, and the agent-waiting pill is visible

* scenario: agent sends a file under the currently open workspace
  given: workspace W1 is open
  when: the agent calls `POST /session/start` with a relative `file` and `workspacePath: W1` (or no workspacePath)
  then: Canonic does not re-open the workspace, just opens the file, and the agent-waiting pill is visible

## Agent Session Focus Return (AGT-FOC)

* scenario: focus returns to caller on submit (macOS)
  given: the user is in a terminal that POSTs `/session/start` to Canonic, and Canonic steals focus
  when: the user clicks a prompt in the pill (Submit)
  then: after the callback fires and the session ends, the OS app that was frontmost before Canonic stole focus is reactivated

* scenario: focus returns to caller on cancel (macOS)
  given: an agent session is active with a captured caller app
  when: the user clicks "Cancel session" in the pill, or the agent POSTs `/session/cancel`
  then: the previously-frontmost OS app is reactivated

* scenario: non-macOS platforms no-op safely
  given: Canonic is running on Linux or Windows
  when: an agent session starts and ends
  then: the caller-refocus step is skipped without error

***

## AI Control (AIC)

> Agent-driven implementation surface in Canonic's right panel. PMs start coding-agent sessions from inside the app to kick off and steer engineering work without leaving the planning context.

### Agent Configuration

* scenario: no agents configured
  given: no agents have been configured
  when: the user opens the Agent panel
  then: an empty state is shown with a "Configure an agent" button

* scenario: load preset agents
  given: the Agent panel mounts
  when: presets are loaded from main process
  then: Claude Code, Gemini CLI, Codex, OpenCode, and Pi are listed with install status

* scenario: select preset agent
  given: at least one preset agent is configured
  when: the user clicks the agent selector and picks an agent
  then: that agent becomes active, name appears in header

* scenario: add custom agent
  given: the agent selector popup is open
  when: the user clicks "Add agent" then "Custom" and fills name and binary path
  then: the custom agent appears in configured agents list

* scenario: reject uninstalled agent
  given: a preset agent binary is not installed on system
  when: the user tries to select it
  then: the agent is not selected and a "Not installed" badge is shown

### Flavor and Model

* scenario: toggle reviewer/implementer flavor
  given: the Agent panel is open
  when: the user clicks the Reviewer or Implementer pill
  then: only one pill is active at a time, flavor switches accordingly

* scenario: implementer shows target directory
  given: flavor is set to Implementer
  when: the user views the panel
  then: a target directory path is shown, clickable to open a folder picker

* scenario: model and effort selected in the CLI, not in-app
  given: an agent is selected
  when: the user views the Agent panel
  then: no in-app model or effort picker is shown — model/effort are chosen inside each agent's own CLI

### Session Management

* scenario: start session runs the agent's native TUI in an embedded terminal
  given: an agent is selected and Agent panel is open
  when: the user types a prompt and presses Cmd+Enter
  then: the agent's interactive CLI spawns in an embedded PTY terminal and status changes to running

* scenario: initial prompt auto-sends once the CLI settles
  given: a session starts with a non-empty prompt
  when: the agent's startup render goes idle (or a hard cap elapses)
  then: the prompt is typed into the TUI and submitted automatically

* scenario: session persists across doc switches
  given: a session is running in the Agent panel
  when: the user switches to a different document
  then: the PTY session keeps running and terminal output is preserved

* scenario: stop session
  given: a session is running
  when: the user clicks the stop button
  then: the agent PTY process is terminated and status changes to ended

* scenario: auto-end session on agent switch
  given: a session is running for one agent
  when: the user selects a different agent
  then: the live session is ended (history saved) before the new agent becomes active

* scenario: pop out to the OS terminal
  given: a session is running
  when: the user clicks the pop-out button
  then: a launch script is written and opened in the user's real terminal (Terminal/cmd/configured emulator), not a copied command string

* scenario: error handling
  given: an agent binary is not found or crashes
  when: a session is started
  then: an error message (with install hint when available) is printed in the terminal

### Session History

* scenario: history panel collapsed by default
  given: the Agent panel is open
  when: the user views the bottom of the panel
  then: a History toggle is shown, collapsed

* scenario: expand history shows recent sessions
  given: at least one previous session exists
  when: the user clicks the History toggle
  then: up to 5 recent sessions are shown with title, agent, date, and status

* scenario: filter history by title
  given: the history panel is expanded
  when: the user types in the filter input
  then: only sessions whose title matches the filter are shown

* scenario: delete history entry
  given: the history panel is expanded with entries
  when: the user clicks the delete button on an entry
  then: that entry is removed from history

* scenario: save session on end
  given: a session ends
  when: the session finalizes
  then: an entry is added to session history

* scenario: resume a past session from history
  given: the history panel is expanded with entries
  when: the user clicks a history entry
  then: its agent is re-selected and a new terminal session opens seeded with that entry's prompt

### Embedded Terminal Appearance

* scenario: terminal matches the Canonic theme
  given: a terminal session is open
  when: the terminal renders
  then: it uses the app's mono font and the surrounding panel background so it blends in rather than reading as a separate boxed window

* scenario: terminal auto-contrasts text to background
  given: the active Canonic theme has a dark or light panel background
  when: the terminal builds its theme
  then: dark backgrounds get light text and light backgrounds get dark text

* scenario: terminal re-themes on theme switch
  given: a terminal session is open
  when: the user switches the Canonic theme
  then: the terminal palette updates to the new theme

### Context Injection

* scenario: silent system-prompt injection where supported
  given: the selected agent supports a silent system-prompt flag (Claude Code, Pi)
  when: a session spawns
  then: the workspace context is passed via --append-system-prompt and only the user's prompt is typed into the visible terminal

* scenario: typed context fallback
  given: the selected agent has no silent system-prompt flag and no MCP context
  when: a session spawns with a prompt
  then: a one-line workspace context is prepended to the typed prompt

* scenario: curl-only agents get a deterministic REST playbook
  given: the selected agent cannot use MCP natively (Pi)
  when: a session spawns
  then: the injected system prompt is a curl playbook with the live API base URL, instructing the agent to first GET /workspace and GET /doc, then read/write docs and post comments via curl

* scenario: editor state pushed to the MCP server
  given: a workspace is open
  when: the user focuses a doc or changes the open tray
  then: the renderer pushes the focused doc and open-tray paths to the MCP server

### REST API (curl agents)

Plain HTTP routes on the same local server, bound to 127.0.0.1 and token-free (same posture as /mcp), so agents that can't speak MCP can act with curl.

* scenario: GET /workspace returns workspace state
  given: a workspace is open
  when: an agent sends GET /workspace
  then: workspace name, path, branch, focused doc, open tray, and the doc file list are returned

* scenario: GET /doc returns the focused doc when no path is given
  given: the user has a focused doc
  when: an agent sends GET /doc with no path
  then: the focused doc path and content are returned

* scenario: GET /doc returns a doc by path
  given: a workspace is open with an existing doc
  when: an agent sends GET /doc?path=<rel>
  then: the doc path and content are returned

* scenario: GET /doc with no path and no focused doc
  given: no doc is focused
  when: an agent sends GET /doc with no path
  then: a 404 with an explanatory error is returned

* scenario: POST /doc writes a doc
  given: a workspace is open
  when: an agent sends POST /doc with path and content
  then: the file is written and the editor repaints via the file watcher

* scenario: POST /comment posts a comment
  given: a workspace is open
  when: an agent sends POST /comment with path, text, and optional anchor
  then: the comment is persisted and emitted to the renderer

* scenario: GET /comment reads comments for a doc
  given: a doc has open comments
  when: an agent sends GET /comment?path=<rel>
  then: the open comments for that doc are returned

### MCP Server

* scenario: MCP initialize returns capabilities and standing instructions
  given: the MCP server is running
  when: an agent sends an initialize request
  then: protocol version, tools capability, server info, and an instructions string naming the canonic tools are returned

* scenario: initialize instructions carry the live focused doc and open tray
  given: the user has a focused doc and open tray
  when: an agent sends an initialize request
  then: the instructions string includes the focused doc path and the open-tray paths as a snapshot

* scenario: MCP tools/list returns all tools
  given: the MCP server is running
  when: an agent sends a tools/list request
  then: all 11 tools are listed with descriptions and input schemas

* scenario: get_open_docs returns the live editor view
  given: a workspace is open
  when: an agent calls get_open_docs
  then: the focused doc and the open-tray paths are returned for mid-session refresh

* scenario: read_doc returns file content
  given: a workspace is open with an existing doc
  when: an agent calls read_doc with a valid path
  then: the markdown content is returned

* scenario: write_doc overwrites file
  given: a workspace is open
  when: an agent calls write_doc with path and content
  then: the file is written and editor repaints via file watcher

* scenario: post_comment writes comment
  given: a workspace is open
  when: an agent calls post_comment with path, text, and optional anchor
  then: a comment is persisted and emitted to the renderer

* scenario: get_workspace_info returns state
  given: a workspace is open
  when: an agent calls get_workspace_info
  then: workspace name, path, current branch, focused doc, and open-tray paths are returned

* scenario: get_doc_history lists a doc's revisions
  given: a workspace is open and a doc has at least one commit
  when: an agent calls get_doc_history with the doc path
  then: its commit revisions are returned newest-first, each with oid, short oid, message, author, and date

* scenario: get_doc_changes returns uncommitted edits as a diff
  given: a doc has been edited on disk since its last commit
  when: an agent calls get_doc_changes with the doc path
  then: a unified diff of the working version against the last commit is returned with added/removed counts, so the agent can plan from the edits

* scenario: get_doc_changes compares against an older revision
  given: a doc has multiple commits
  when: an agent calls get_doc_changes with `since` set to an older oid
  then: a unified diff of the current version against that revision is returned

* scenario: get_doc_changes with no uncommitted edits shows the last commit's diff
  given: a doc matches its last commit exactly
  when: an agent calls get_doc_changes with the doc path
  then: the diff of what that most recent commit introduced (versus its parent) is returned

### Demo Mode

* scenario: demo mode shows configured agents
  given: demo mode is active
  when: the Agent panel mounts
  then: Claude Code appears as a configured agent with resumable terminal-kind session history entries

*Last updated: 2026-05-28*
