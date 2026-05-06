# Network Discovery — Design Spec

**Date:** 2026-05-05  
**Status:** Approved

---

## Overview

Canonic instances on the same LAN that have an active share automatically appear in the Peers panel of other Canonic users. Discovery is powered by mDNS (Bonjour/Zeroconf). Only users who have been starred/favorited show in the default panel view; a "Discover" button reveals everyone currently broadcasting on the network.

Discovered peers can be interacted with according to the permission level the sharer set: view-only, comment, or copy to workspace. Comments left on peer docs sync back to the owner's instance when they're reachable.

---

## Architecture

Three new concerns are added to the system:

1. **`electron/discovery.js`** — singleton module owning the `bonjour-service` instance. Publishes a `_canonic._tcp` service record when a share starts; unpublishes when it stops. Continuously browses for the same service type and emits `peer:found` / `peer:lost` events that `main.js` forwards to the renderer via IPC.

2. **Peers store extension** — `~/.canonic/peers.json` gains `favorited: boolean` and `permissions: { scope, level }` per peer entry. The Pinia store gains `discoveredPeers` (live mDNS peers), `favoritedPeerIds` (persisted Set from `peers.json`), and a `favoritedPeers` computed that filters `discoveredPeers` to favorited IDs.

3. **Comment sync** — the share HTTP server gains `POST /comments`. The renderer stores comments locally under `~/.canonic/comments/peers/<author>/` and a sync queue in `main.js` flushes pending comments to the peer's server every 60 seconds when they're online.

---

## Section 1: mDNS Advertisement & Discovery

### `electron/discovery.js` (new file)

Exports four functions:

- `startDiscovery()` — creates the `Bonjour` instance, starts browsing `_canonic._tcp`. Emits `peer:found` and `peer:lost` via an internal `EventEmitter`.
- `announceShare(shareInfo)` — publishes a service record for an active share.
- `unpublishShare(port)` — tears down the service record for a specific port when a share stops.
- `stopDiscovery()` — destroys the bonjour instance on app quit.

Service record format:

```
name:    "<displayName> (<hostname>)"
type:    "_canonic._tcp"
port:    <share port>
txt: {
  token:      "<share token>",
  scope:      "file" | "directory" | "workspace",
  permission: "view" | "comment" | "copy",
  author:     "<displayName>"
}
```

### `main.js` wiring

On `peer:found`: persist to `peers.json` (upsert by `author+host` key), then push `peers:found` IPC event to renderer with the full peer object. If the same author has multiple simultaneous active shares (e.g. a workspace share and a file share), their service records are all stored but grouped under one peer card in the UI by `author+host`. The most recently seen token is used for manifest fetches; all active share ports are tracked so `unpublishShare` only removes the peer card when all their records are gone.

On `peer:lost`: push `peers:lost` IPC event with `{ id }` so the renderer marks the peer offline.

New IPC handlers:

| Handler | Description |
|---|---|
| `peers:list-discovered` | Returns current in-memory discovered peers array |
| `peers:favorite` | Sets `favorited: true` in `peers.json` for a peer ID |
| `peers:unfavorite` | Sets `favorited: false` in `peers.json` for a peer ID |
| `peers:open-peer-file` | Fetches a peer file via HTTP and returns content to renderer |
| `peers:fetch-manifest` | Fetches `/manifest` from a peer's share server, returns file list |

### Network safety

On share start, record the current active network interface name (first non-internal IPv4 via `os.networkInterfaces()`). A 30-second `setInterval` re-checks the interface. If it changes:

1. Stop all active shares.
2. Send `share:network-changed` IPC event to renderer.
3. Renderer shows a persistent warning banner: *"Your network changed. Sharing has been paused to protect your files."*

This behavior is on by default. A future Settings toggle (`pause-on-network-change`, tracked in TODO) will let users disable it.

---

## Section 2: Permission Model

Two independent axes set when starting a share (added to the Share modal UI):

**Content scope** (existing concept, now explicit in UI):
- `file` — single document
- `directory` — folder of documents  
- `workspace` — entire workspace

**Permission level** (new):
- `view` — read-only
- `comment` — view + add comments (synced back to owner)
- `copy` — view + comment + copy files to own workspace

The permission level is stored in the mDNS TXT record so the discovering peer knows what they're allowed to do before connecting.

**Enforcement:**
- Server-side: `POST /comments` returns `403` if the share's permission level is `view`.
- Client-side: "Comment" and "Copy to workspace" actions are hidden/disabled in the Peers panel based on the peer's advertised permission level. Client-side enforcement is a UX convenience only; the server is authoritative.

`startShare` and `startWorkspaceShare` in `share.js` are updated to accept `{ scope, permission }` and store them on the active share object.

---

## Section 3: PeersPanel UI

`PeersPanel.vue` gets a full implementation replacing the demo stub.

### Default view (favorites only)

Shows only favorited peers. Each peer card:
- Avatar initials + display name
- Online/offline dot (live from `discoveredPeers`)
- Workspace/scope label
- File list (fetched lazily from `/manifest` on expand)
- Per-file action buttons: "Open" (always), "Comment" (if permission ≥ `comment`), "Copy" (if permission = `copy`)
- Star icon in card header to unfavorite

### Discover view

Toggled by a "Discover" button in the panel header. Shows all live mDNS peers (including unfavorited) in a list below a divider. Each row: avatar + name + scope label + star button to favorite. Favoriting moves the peer to the top section and persists to `peers.json`.

### Empty states

- No favorites, discover closed: *"Star a collaborator to see their docs here."* + Discover button
- Discover open, no peers found: *"No one sharing on this network."*

### Store additions (`src/store/index.js`)

```js
discoveredPeers: []       // reactive, updated by peers:found / peers:lost IPC
favoritedPeerIds: Set()   // persisted, loaded from peers.json on startup
// computed:
favoritedPeers            // discoveredPeers filtered to favoritedPeerIds
```

---

## Section 4: Comment Sync

### Local storage

Comments on peer docs are stored at:
```
~/.canonic/comments/peers/<author>/<relPath>.json
```

Separate from the user's own doc comments (`~/.canonic/comments/`) to avoid path collisions. Each comment object includes:
```json
{
  "id": "...",
  "text": "...",
  "anchor": { "quotedText": "..." },
  "createdAt": "<ISO timestamp>",
  "targetAuthor": "<peer display name>",
  "synced": false
}
```

### Sync queue

A 60-second `setInterval` in `main.js` scans `~/.canonic/comments/peers/` for entries with `synced: false`. For each peer with pending comments, if that peer is currently in `discoveredPeers` (online), it POSTs to:

```
POST http://<peer-ip>:<port>/comments?token=<token>
Body: { filePath, comments: [...] }
```

On HTTP 200 → mark comments `synced: true` in local file. On failure → leave in queue, retry next cycle.

### Receiving comments (`share.js`)

`POST /comments` endpoint added to the share server:
- Validates token.
- Returns `403` if share permission level is `view`.
- Merges incoming comments into `~/.canonic/comments/<relPath>.json` by ID (no duplicates).
- Pushes `comments:received` IPC event to renderer so CommentsPanel updates live.

**Conflict model:** append-only, last-write-wins by `createdAt`. Comments cannot be edited or deleted by the remote peer.

---

## Future TODOs (out of scope for this spec)

### PR / review workflow
When a user has copied a peer's file and made changes, a "Propose changes" action diffs their version against the peer's HEAD, packages the diff, and POSTs it to `POST /proposals` on the peer's share server. The owner sees incoming proposals in a "Review" panel — accept (applies diff + commits), request changes (sends comment back), or reject.

### Network safety setting
A toggle in Settings > Sharing: *"Pause sharing when network changes"* (on by default). When disabled, the 30-second network interface check is skipped.
