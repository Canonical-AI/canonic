# Editor Features Design: Links, Doc References, Mermaid

Date: 2026-05-07

## Overview

Three editor features ported from the original Canonical-AI/canonical repo, adapted for canonic-local's local-first file-based architecture. Implemented in order: links → doc references → mermaid.

---

## Feature 1: Links

### Goal
Allow users to add/edit/remove hyperlinks via a toolbar button, without requiring manual markdown syntax.

### Approach
Add a link toggle button to the existing toolbar in `Editor.vue`. No new packages needed — `@milkdown/preset-commonmark` already provides the `link` mark.

### Behavior
- Toolbar shows a link icon (`mdi-link`)
- With text selected and no existing link: clicking opens an inline URL input row below the toolbar
- User types URL and presses Enter → `AddLink` command applies the link mark to the selection
- With text selected and a link already present: clicking removes the link mark (`RemoveLink`)
- Pressing Escape in the URL input cancels without applying
- URL input auto-focuses when it appears

### UI
- Inline text field slides in below the toolbar (same row as other controls, using `v-expand-transition`)
- Placeholder: `Enter URL (e.g., https://example.com)`
- Buttons: Cancel | Add Link
- Active state on the link button when cursor is inside a link

### Files Affected
- `src/components/editor/Editor.vue` — add toolbar button + URL input UI + link command logic

### Packages
- None new — uses existing `@milkdown/preset-commonmark`

---

## Feature 2: Doc References (`[[wiki-link]]`)

### Goal
Allow users to reference other docs in the workspace using `[[doc-name]]` syntax. References render as interactive chips that navigate to or create the referenced doc.

### Markdown Syntax
```
[[doc-name]]              — link to a doc
[[doc-name#heading]]      — future: link to a specific heading
[[doc-name#L23-L55]]      — future: link to a line range
```
Stored as-is in the markdown file. No frontmatter or IDs.

### Node Schema
```js
attrs: {
  name:   { default: '' },   // e.g. 'product-vision'
  anchor: { default: null }  // e.g. '#risks' | '#L23-L55' | null
}
```
`anchor` is parsed and stored from day one but ignored at navigation time in Phase 1. Phase 2 (future) will scroll to the heading or highlight the line range on open. No migration needed — the markdown on disk is already forward-compatible.

### Resolution — File Index
Resolution uses a pre-built in-memory index rather than scanning at render time:
- On workspace open, the main process builds `{ 'doc-name': 'relative/path.md' }` by walking all `.md` files
- A `chokidar` watcher on the workspace directory keeps the index current for external changes (Finder, Terminal, git operations)
- The index is exposed to the renderer via `api.files.getIndex()` + `api.files.onIndexUpdate(cb)` IPC
- The store holds a reactive copy (`fileIndex`) — wiki-link chips resolve against it and update live
- Shortest path wins when a name matches multiple files (root-level `design.md` beats `folder/design.md`)

### Chip States
| State | Condition | Color | Click behavior |
|-------|-----------|-------|----------------|
| **Resolved** | File with matching name exists | Blue | Open the referenced doc |
| **New** | Name has never existed as a file | Green | Create the doc (see creation flow) |
| **Broken** | Name was once a ref but file no longer found | Red | Offer to create a new doc with that name |

Green and broken use the same creation flow. The distinction is visual only — there's no stored state differentiating "new" vs "broken."

### Insertion Flow
- User types `[[` in the editor → autocomplete dropdown appears
- Dropdown lists all `.md` files in the workspace (by name, without extension)
- User can select an existing file or type a new name
- Pressing Enter or clicking inserts the `[[name]]` node

### Doc Creation Flow (green/red chip click)
1. `createFile(name)` is called via the store
2. If an LLM provider is configured (`store.config.aiProvider` is set): call the LLM with a prompt to generate starter content based on the doc name and the content of the current (parent) doc
3. If no LLM: create an empty file
4. Open the newly created file

### Architecture
- **Remark plugin**: custom plugin that parses `[[name]]` and `[[name#anchor]]` into AST nodes
- **Milkdown node**: `$node('wiki-link')` with `name` and `anchor` attrs
- **Node view**: Vue component (`WikiLinkChip.vue`) rendered via `@prosemirror-adapter/vue`
- **Autocomplete tooltip**: Vue component (`WikiLinkTooltip.vue`) triggered on `[[` input
- **File index**: maintained in main process via `chokidar`, synced to store via IPC

### Files
- `src/components/editor/wiki-link/index.js` — remark plugin + Milkdown node definition
- `src/components/editor/wiki-link/WikiLinkChip.vue` — chip renderer (three states)
- `src/components/editor/wiki-link/WikiLinkTooltip.vue` — autocomplete dropdown
- `src/components/editor/MilkdownEditor.vue` — register plugins + node view
- `electron/fileIndex.js` — chokidar watcher + index build/update logic
- `electron/main.js` — wire IPC handlers for `getIndex` / `onIndexUpdate`
- `electron/preload.js` — expose `api.files.getIndex` + `api.files.onIndexUpdate`
- `src/store/index.js` — add reactive `fileIndex` + IPC subscription

### Packages
- `remark-wiki-link` — parses `[[name]]` syntax (or hand-rolled ~20 line remark plugin)
- `@prosemirror-adapter/vue` — renders Vue components as ProseMirror node views
- `chokidar` — file system watcher for external change detection

---

## Feature 3: Mermaid Diagrams

### Goal
Render fenced code blocks tagged `mermaid` as interactive diagram cards with a live preview and an editable source tab.

### Milkdown Upgrade
Current version is 7.5.0. Upgrade all `@milkdown/*` packages to 7.13.x to unlock `@milkdown/plugin-diagram`. The existing comment-highlight ProseMirror plugin uses only stable APIs (`PluginKey`, `DecorationSet`) — no breaking changes expected.

### Behavior
- Typing a fenced code block with ` ```mermaid ` triggers the diagram node
- Default view: rendered SVG diagram (Preview tab)
- Hover over the diagram card → tabs appear (Preview | Editor)
- Editor tab shows a plain textarea with the mermaid source
- Edits in the textarea debounce 300ms then re-render + update the node
- Invalid mermaid syntax shows an inline error message instead of SVG
- Re-renders on dark/light theme toggle

### UI Component (`MermaidComponent.vue`)
```
┌─────────────────────────────────┐
│  [rendered SVG diagram]         │
│                                 │
├─ (on hover) ──────────────────┤
│  Preview  │  Editor             │
└─────────────────────────────────┘
```
- Card wraps the diagram
- Tabs only visible on hover (`v-intersect` or mouse events)
- Editor tab: monospace textarea, "Docs" link, "Update" button
- SVG styles: `width: 100%; height: auto; overflow: visible`

### Files
- `src/components/editor/MermaidComponent.vue` — diagram card component
- `src/components/editor/MilkdownEditor.vue` — register diagram plugin + node view
- `package.json` — upgrade `@milkdown/*` to 7.13.x, add `mermaid ^11.6.0`, `@milkdown/plugin-diagram ^7.13.x`

### Packages
- `mermaid` ^11.6.0
- `@milkdown/plugin-diagram` ^7.13.x
- All `@milkdown/*` packages upgraded from 7.5.0 → 7.13.x

---

## Implementation Order

1. **Links** — smallest change, no new packages, validates toolbar pattern
2. **Mermaid** — self-contained, requires package upgrade but no new architecture
3. **Doc references** — most complex, builds on stable editor after upgrade

---

## Out of Scope

- Backlink panel (showing which docs reference the current doc)
- Link previews / hover cards for doc references
- Syncing broken references across the workspace
- Math / LaTeX rendering

---

## Acceptance Criteria

### Feature 1: Links

**Toolbar link button — add**
- Given text is selected in the editor and no link mark covers the selection
- When the user clicks the link icon in the floating toolbar
- Then an inline URL input appears within the toolbar, auto-focused

**Toolbar link button — submit**
- Given the URL input is visible and the user has typed a URL
- When the user presses Enter or clicks Add
- Then the link mark is applied to the originally selected text and the input disappears

**Toolbar link button — cancel**
- Given the URL input is visible
- When the user presses Escape
- Then the input disappears with no link applied

**Toolbar link button — remove**
- Given text is selected and a link mark already covers that range
- When the user clicks the link icon
- Then the link mark is removed immediately (no input shown)

---

### Feature 2: Doc References (`[[wiki-link]]`)

**Chip renders with name**
- Given a document contains `[[product-vision]]`
- When the editor renders that document
- Then a chip appears showing `@ product-vision` with blue styling if the file exists, or green styling if it does not

**Chip navigation — resolved**
- Given a resolved chip (blue) is visible in the editor
- When the user clicks it
- Then the referenced document opens in the editor and the view scrolls to the top of that document

**Chip navigation — anchor**
- Given a chip with an anchor (e.g. `[[roadmap#next-q3-2026]]`)
- When the user clicks it
- Then the referenced document opens and the view scrolls to the heading matching the anchor text, or to the top if no heading matches

**Back navigation — banner appears**
- Given the user has navigated to a doc via a wiki-link chip
- When the destination doc loads
- Then a dismissable "Back to [source doc name]" banner is shown at the top of the editor

**Back navigation — scroll position preserved**
- Given the user was scrolled partway through a document and clicked a wiki-link chip
- When they click "Back to [source doc name]" in the banner
- Then the source document opens and the scroll position is restored to where they were before they left

**Back navigation — dismiss**
- Given the back navigation banner is visible
- When the user clicks the ✕ button
- Then the banner disappears and the back destination is forgotten

**Chip creation — no LLM**
- Given a new/unresolved chip (green) and no AI provider is configured
- When the user clicks it
- Then a new empty `.md` file is created with that name and immediately opened

**Chip creation — with LLM**
- Given a new/unresolved chip (green) and an AI provider is configured
- When the user clicks it
- Then a new file is created, an AI prompt is sent using the parent doc content as context, and the generated markdown is saved to the new file

**Autocomplete trigger**
- Given the user types `[[` in the editor
- When the second `[` is typed
- Then an autocomplete dropdown appears listing all docs in the workspace

**Autocomplete selection**
- Given the autocomplete dropdown is open
- When the user selects a doc name
- Then `[[doc-name]]` is inserted at the cursor as a resolved chip

---

### Feature 3: Mermaid Diagrams

**Diagram renders**
- Given a fenced code block tagged `mermaid` with valid diagram syntax
- When the editor renders that document
- Then the diagram is rendered as an SVG preview card

**Diagram error**
- Given a fenced code block tagged `mermaid` with invalid syntax
- When the editor renders it
- Then an error message is shown in place of the diagram: "Diagram error: [reason]"

**Edit tab — writable doc**
- Given a mermaid card is rendered in a writable (non-readonly) document
- When the user hovers over the card
- Then Preview and Edit tab buttons appear at the bottom

**Edit tab — readonly doc**
- Given a mermaid card is rendered in a readonly document (peer view or readonly prop)
- When the user hovers over the card
- Then no tab buttons appear

**Source editing**
- Given the user has switched to the Edit tab on a mermaid card
- When they modify the source and click Update (or wait for the debounce)
- Then the preview re-renders with the updated diagram and the markdown on disk is updated

**Dark mode**
- Given the app is in dark mode
- When a mermaid diagram is rendered
- Then the diagram uses the mermaid `dark` theme (not `default`)
