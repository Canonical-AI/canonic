# Peer File Viewer Design
_Last updated: 2026-05-07_

## Overview

When a user opens a file from a peer's workspace, Canonic renders it in a full read-only viewer panel (replacing the normal editor). The viewer supports inline commenting with text selection, a private/public toggle, comment anchor highlights in the document body, and bidirectional scroll linking between the document and the sidebar comments panel.

---

## Permission Model

Files shared by peers carry one of three permission levels, set by the sharer in `ShareModal`:

| Permission | Can read | Can comment | Can copy to workspace |
|---|---|---|---|
| `view` | ✓ | — | — |
| `comment` | ✓ | ✓ | — |
| `copy` | ✓ | ✓ | ✓ |

The permission badge is shown in the viewer header. The comment input and "Add comment" popover are hidden for `view`-only files.

---

## Component Architecture

```
MainLayout
└── right panel (shown when store.currentFile OR store.peerFileContent is set)
    ├── PeerFileViewer   (shown when store.peerFileContent is set)
    └── Editor           (shown when store.currentFile is set and no peerFileContent)

RightPanel
└── CommentsPanel        (peer mode when store.peerFileContent is set)
```

---

## Store State

All peer viewer state lives in `src/store/index.js`:

| Ref | Type | Description |
|---|---|---|
| `peerFileContent` | `{ peer, relPath, content }` or `null` | Currently open peer file |
| `peerFileComments` | `Comment[]` | Comments for the open peer file (both theirs and yours) |
| `activeCommentId` | `string` or `null` | Drives bidirectional scroll between viewer and sidebar |

### Actions

- **`openPeerFile(payload)`** — sets `peerFileContent` and pre-loads `peerFileComments` from the payload. Call with `null` to close the viewer; clears `activeCommentId` too.
- **`addPeerComment(comment)`** — prepends a new comment (yours) to `peerFileComments`.
- **`updatePeerComment(id, patch)`** — merges a patch into an existing comment (used to set `synced: true` after POST succeeds).
- **`setActiveComment(id)`** — sets `activeCommentId`, triggering bidirectional scroll in both CommentsPanel and PeerFileViewer.

---

## Comment Flow

### Leaving a comment (you on their doc)

1. User selects text in the viewer body.
2. An "Add comment" popover appears above the selection.
3. User clicks the popover → comment input box appears with the quoted text preview.
4. User types a comment. Optionally toggles **🔒 Private** (default: visible/public).
5. Submit (⌘↩ or button):
   - Comment is added to `peerFileComments` with `isOwn: true`.
   - Sidebar switches to the Comments tab.
   - **If public:** comment is POSTed to the peer's share server at `http://{host}:{port}/comments?token=…`.
     - On success: `synced: true` is set.
     - On failure: comment stays `synced: false`; retried by `flushPeerComments` interval.
   - **If private:** comment has `private: true, synced: null`; never POSTed, never retried.

### Receiving a comment (they on your doc)

Peers POST to your share server's `POST /comments` endpoint (see `electron/share.js`). Comments are stored in `~/.canonic/comments/{filePath}.json`. The `peerComments:received` IPC event notifies the store, which appends them to the normal `store.comments` list.

---

## Comment Sync Rules (`electron/comment-sync.js`)

`flushPeerComments(onlinePeers, commentsDir?)` runs on a 60-second interval:

1. Scans `~/.canonic/comments/peers/{author}/` directories.
2. For each author, looks them up in `onlinePeers` — skips if offline.
3. Filters to comments where `!c.synced && !c.private`.
4. POSTs the unsynced subset; marks them `synced: true` on 200 OK.
5. On network error: leaves unsynced, retries next cycle.

**Private comments are permanently excluded from sync**, regardless of peer online status.

---

## Comment Anchor Highlights

When `peerFileComments` contains comments with `anchor.quotedText`, those text passages are highlighted directly in the rendered document.

**Implementation (`PeerFileViewer.vue`):**

- After `v-html` renders the markdown, a `watchEffect` runs `highlightAnchors()`.
- `highlightAnchors()` walks DOM text nodes with `TreeWalker(NodeFilter.SHOW_TEXT)`, finds the first occurrence of each unique `quotedText`, and wraps it in `<mark class="comment-anchor" data-anchor="{quotedText}">`.
- Highlights are cleared and re-applied whenever `renderedContent` or `peerFileComments` change.
- Marks have hover and flash states styled via CSS.

---

## Bidirectional Scroll

Clicking a comment card or a highlight mark activates it — the partner scrolls into view and is visually highlighted.

### Sidebar → Editor

1. User clicks a comment card in `CommentsPanel`.
2. `store.setActiveComment(comment.id)` is called.
3. `PeerFileViewer` watches `store.activeCommentId`:
   - Finds the `<mark>` with `data-anchor === comment.anchor.quotedText`.
   - Scrolls it into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`).
   - Adds `.flash` class for 1.2s (accent background pulse).

### Editor → Sidebar

1. User clicks a `<mark.comment-anchor>` in the viewer body.
2. Click-capture delegation on `.viewer-body` fires `onMarkClick`.
3. Finds the first `peerFileComments` entry whose `anchor.quotedText` matches `mark.dataset.anchor`.
4. Calls `store.setActiveComment(comment.id)`.
5. `CommentsPanel` watches `store.activeCommentId`:
   - Finds `[data-comment-id="{id}"]` in `.comments-list`.
   - Scrolls it into view with `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`.
   - Applies `.active-comment` CSS class (accent border + tinted background).

---

## Private Comments

Users can mark any comment as private before submitting:

- Toggle: **Visible / 🔒 Private** button in the comment input box (defaults to Visible).
- When private: `{ private: true, synced: null }` — stored only in `peerFileComments` (in-memory / persisted locally by future work).
- CommentsPanel renders a **🔒 private** badge in the comment meta, with a distinct tinted card background.
- `flushPeerComments` skips comments where `c.private === true`.
- `submitComment` in PeerFileViewer skips the POST fetch for private comments entirely.

---

## Demo Mode

`public/demo/config.json` populates the peer viewer in demo mode:

- `peers[].files[].permission` — sets viewer permission per file.
- `comments["{filePath}"]` — pre-loaded into `peerFileComments` when the file is opened in demo mode.
  - Includes comments from multiple authors (Priya Nair, Ben Okafor).
  - Includes at least one private own-comment to demonstrate the private feature.
- Simulated sync: private comments stay `synced: null`; public own-comments simulate `synced: true` after 800ms.

---

## Test Coverage

| Test file | What it covers |
|---|---|
| `tests/integration/peers.test.js` | `openPeerFile`, `openPeerFile(null)`, `addPeerComment`, `updatePeerComment`, `setActiveComment`, `favoritePeer`, `unfavoritePeer`, `favoritedPeers` computed |
| `tests/unit/comment-sync.test.js` | `flushPeerComments`: skips offline, skips synced, POSTs when online, leaves unsynced on failure, sends only unsynced subset, skips private comments; `POST /comments`: stores structure, rejects view-only, rejects bad token, deduplicates, accumulates from multiple peers |
