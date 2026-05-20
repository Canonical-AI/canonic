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

> The AI chat panel is a thinking partner — it helps users reason through their document, not write it for them.

* scenario: API key source
  given: an AI chat message is sent
  when: the request is made to the AI provider
  then: the API key from \~/.config/canonic/config.json is used, not any .env file

* scenario: model selection
  given: the user has selected a model in Settings
  when: an AI chat message is sent
  then: that model is used for the request

* scenario: streaming responses
  given: an AI chat message is sent
  when: the response arrives
  then: text streams character-by-character rather than appearing all at once

* scenario: document context
  given: an AI chat message is sent
  when: the request is constructed
  then: the full current document content is included as context

* scenario: AI does not ghostwrite
  given: the AI system prompt is in effect
  when: the user asks the AI to write document content directly
  then: the AI declines to generate the content and redirects to a thinking/questioning role

* scenario: missing or invalid API key
  given: no API key is configured or the key is invalid
  when: the user opens the AI chat panel
  then: a clear error message is shown with a link to Settings

* scenario: chat history not persisted
  given: the user has an active AI chat session
  when: the app is restarted
  then: the previous chat messages are gone and the session starts fresh

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

* scenario: comment from toolbar
  given: text is selected and the toolbar is visible
  when: the user clicks the comment button
  then: the comment input opens pre-filled with the selected text as the anchor

* scenario: active mark state
  given: the cursor is inside bold text
  when: the floating toolbar is visible
  then: the bold button appears in its active/highlighted state

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

*Last updated: 2026-05-19*
