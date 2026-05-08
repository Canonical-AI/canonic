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
