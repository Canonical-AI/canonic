<template>
  <div class="peers-panel">
    <!-- Network changed warning -->
    <div v-if="store.networkChanged" class="network-warning">
      <AlertTriangle :size="13" />
      <span>Network changed — sharing paused.</span>
    </div>

    <!-- Tab bar -->
    <div class="tab-bar">
      <button class="tab" :class="{ active: view === 'favorites' }" @click="view = 'favorites'">Favorites</button>
      <button class="tab" :class="{ active: view === 'discover' }" @click="switchToDiscover">Discover</button>
    </div>

    <!-- FAVORITES VIEW -->
    <div v-if="view === 'favorites'" class="panel-body">
      <div class="discover-header">
        <div class="discover-meta">
          {{ store.favoritedPeers.length }} favorite{{ store.favoritedPeers.length !== 1 ? 's' : '' }}
        </div>
        <button class="refresh-btn" @click="refreshDiscover" :disabled="discovering">
          <RefreshCw :size="13" :class="{ spin: discovering }" />
        </button>
      </div>

      <!-- Demo mode: show favorited peers (demoPeers + any favorited from Discover) -->
      <template v-if="store.isDemoMode">
        <div v-if="!store.demoPeers.length && !store.favoritedPeers.length" class="empty-hint">
          No favorited peers yet. Switch to Discover to find people on your network and star them.
        </div>

        <!-- Legacy demo peers (Priya, Ben) -->
        <div v-for="peer in store.demoPeers" :key="peer.id" class="peer-group">
          <div class="peer-header" @click="togglePeerFiles(peer)">
            <div class="peer-avatar">{{ initials(peer.name) }}</div>
            <div class="peer-info">
              <span class="peer-name">{{ peer.name }}</span>
              <span class="peer-id">{{ peer.role }}</span>
            </div>
            <div class="peer-status" :class="peer.online ? 'online' : 'offline'">
              <span class="status-dot" />
            </div>
            <button class="icon-btn unfav-btn" title="Unfavorite" @click.stop="unfavoriteDemoPeer(peer.id)">
              <Star :size="13" fill="currentColor" />
            </button>
          </div>
          <div v-if="peerFilesExpanded[peer.id]" class="peer-files-container">
            <div class="peer-workspace-name">{{ peer.workspaceName }}</div>
            <div class="peer-files">
              <button
                v-for="file in peer.files"
                :key="file.path"
                class="peer-file"
                @click="openDemoFile(peer, file)"
              >
                <FileText :size="13" />
                <span class="file-name">{{ file.name }}</span>
                <span class="perm-badge" :class="file.permission ?? 'view'">{{ file.permission ?? 'view' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Discovered peers that were favorited -->
        <div v-for="peer in store.favoritedPeers" :key="peer.id" class="peer-group">
          <div class="peer-header" @click="togglePeerFiles(peer)">
            <div class="peer-avatar">{{ initials(peer.name) }}</div>
            <div class="peer-info">
              <span class="peer-name">{{ peer.name }}</span>
              <span class="peer-id">{{ peer.id }}</span>
            </div>
            <div class="peer-status" :class="peer.online ? 'online' : 'offline'">
              <span class="status-dot" />
            </div>
            <button class="icon-btn unfav-btn" title="Unfavorite" @click.stop="toggleFavorite(peer)">
              <Star :size="13" fill="currentColor" />
            </button>
          </div>
          <div v-if="peerFilesExpanded[peer.id]" class="peer-offline-hint">{{ peer.online ? 'Online — not sharing files' : 'Offline' }}</div>
        </div>
      </template>

      <!-- Live mode -->
      <template v-else>
        <div v-if="store.favoritedPeers.length === 0" class="empty-hint">
          No favorited peers yet. Switch to Discover to find people on your network and star them.
        </div>

        <div v-for="peer in store.favoritedPeers" :key="peer.id" class="peer-group">
          <div class="peer-header" @click="togglePeerFiles(peer)">
            <div class="peer-avatar">{{ initials(peer.name) }}</div>
            <div class="peer-info">
              <span class="peer-name">{{ peer.name }}</span>
              <span class="peer-id">{{ peer.id }}</span>
            </div>
            <div class="peer-status" :class="peer.online ? 'online' : 'offline'">
              <span class="status-dot" />
            </div>
            <button class="icon-btn unfav-btn" title="Unfavorite" @click.stop="store.unfavoritePeer(peer.id)">
              <Star :size="13" fill="currentColor" />
            </button>
          </div>

          <div v-if="peerFilesExpanded[peer.id] && peer.online">
            <div v-if="peerFiles[peer.id] === undefined" class="peer-files-loading">
              <Loader :size="12" class="spin" /> Loading files…
            </div>
            <div v-else-if="peerFiles[peer.id] === null" class="peer-files-error">
              Could not load files. <button class="load-files-btn" @click.stop="loadFiles(peer)">Try again</button>
            </div>
            <div v-else class="peer-files">
              <div v-if="!peerFiles[peer.id] || peerFiles[peer.id].length === 0" class="peer-files-empty">No files shared.</div>
              
              <template v-else>
                <div v-for="node in getPeerTreeNodes(peer.id)" :key="node.key" v-show="node.visible" class="peer-node-row">
                  <!-- Directory -->
                  <div 
                    v-if="node.type === 'dir' || node.type === 'ws'" 
                    class="peer-ascii-dir"
                    @click="toggleDir(peer.id, node.key)"
                  >
                    <span class="ascii-prefix">{{ getAsciiPrefix(node.depth) }}</span><span class="ascii-name">{{ node.name }}/</span> <span class="ascii-state">{{ isDirExpanded(peer.id, node.key) ? '(-)' : `(+${node.count})` }}</span>
                  </div>

                  <!-- File -->
                  <button
                    v-else
                    class="peer-ascii-file"
                    @click="openFile(peer, node.path, node.workspace)"
                  >
                    <span class="ascii-prefix">{{ getAsciiPrefix(node.depth) }}</span><span class="file-name">{{ node.name }}</span>
                    <span v-if="node.versions" class="file-version-count">{{ node.versions.length }} v</span>
                  </button>
                </div>
              </template>
            </div>
          </div>
          <div v-else-if="peerFilesExpanded[peer.id]" class="peer-offline-hint">Offline — can't load files</div>
        </div>
      </template>
    </div>

    <!-- DISCOVER VIEW -->
    <div v-if="view === 'discover'" class="panel-body">
      <div class="discover-header">
        <div v-if="discovering" class="discover-spinner">
          <Loader :size="14" class="spin" /> Scanning…
        </div>
        <div v-else class="discover-meta">
          {{ store.discoveredPeers.length }} peer{{ store.discoveredPeers.length !== 1 ? 's' : '' }} found
        </div>
        <button class="refresh-btn" @click="refreshDiscover" :disabled="discovering">
          <RefreshCw :size="13" :class="{ spin: discovering }" />
        </button>
      </div>

      <div v-if="!discovering && store.discoveredPeers.length === 0" class="empty-hint">
        No Canonic peers found on this network.
      </div>

      <div v-for="peer in store.discoveredPeers" :key="peer.id" class="peer-group">
        <div class="peer-header" @click="togglePeerFiles(peer)">
          <div class="peer-avatar">{{ initials(peer.name) }}</div>
          <div class="peer-info">
            <span class="peer-name">{{ peer.name }}</span>
          </div>
          <div class="peer-status" :class="peer.online ? 'online' : 'offline'">
            <span class="status-dot" />
          </div>
          <button
            class="icon-btn"
            :class="store.favoritedPeerIds.has(peer.id) ? 'unfav-btn' : 'fav-btn'"
            :title="store.favoritedPeerIds.has(peer.id) ? 'Unfavorite' : 'Favorite'"
            @click.stop="toggleFavorite(peer)"
          >
            <Star :size="13" :fill="store.favoritedPeerIds.has(peer.id) ? 'currentColor' : 'none'" />
          </button>
        </div>

        <div v-if="peerFilesExpanded[peer.id] && peer.online">
          <div v-if="peerFiles[peer.id] === undefined" class="peer-files-loading">
            <Loader :size="12" class="spin" /> Loading files…
          </div>
          <div v-else-if="peerFiles[peer.id] === null" class="peer-files-error">
            Could not load files. <button class="load-files-btn" @click.stop="loadFiles(peer)">Try again</button>
          </div>
          <div v-else class="peer-files">
            <div v-if="!peerFiles[peer.id] || peerFiles[peer.id].length === 0" class="peer-files-empty">No files shared.</div>
            
            <template v-else>
              <div v-for="node in getPeerTreeNodes(peer.id)" :key="node.key" v-show="node.visible" class="peer-node-row">
                <!-- Directory -->
                <div 
                  v-if="node.type === 'dir' || node.type === 'ws'" 
                  class="peer-ascii-dir"
                  @click="toggleDir(peer.id, node.key)"
                >
                  <span class="ascii-prefix">{{ getAsciiPrefix(node.depth) }}</span><span class="ascii-name">{{ node.name }}/</span> <span class="ascii-state">{{ isDirExpanded(peer.id, node.key) ? '(-)' : `(+${node.count})` }}</span>
                </div>

                <!-- File -->
                <button
                  v-else
                  class="peer-ascii-file"
                  @click="openFile(peer, node.path, node.workspace)"
                >
                  <span class="ascii-prefix">{{ getAsciiPrefix(node.depth) }}</span><span class="file-name">{{ node.name }}</span>
                  <span v-if="node.versions" class="file-version-count">{{ node.versions.length }} v</span>
                </button>
              </div>
            </template>
          </div>
        </div>
        <div v-else-if="peerFilesExpanded[peer.id]" class="peer-offline-hint">Offline — can't load files</div>
      </div>
    </div>

    <!-- Peer file viewer overlay -->
    <div v-if="store.peerFileContent" class="peer-viewer-bar">
      <span class="viewer-label">
        <Eye :size="12" /> {{ store.peerFileContent.relPath }} ({{ store.peerFileContent.peer.name }})
      </span>
      <div class="viewer-actions">
        <button
          v-if="store.peerFileContent.peer.permission === 'copy'"
          class="viewer-btn"
          @click="copyToWorkspace"
        >
          Copy to workspace
        </button>
        <button class="viewer-btn ghost" @click="store.openPeerFile(null)">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useAppStore } from '../../store'
import { FileText, Star, AlertTriangle, Loader, Eye, RefreshCw, FolderSync } from 'lucide-vue-next'
import demoConfig from "../../demo/config.json"

const store = useAppStore()
const api = window.canonic

const view = ref('favorites')
const discovering = ref(false)
const peerFiles = reactive({}) // peerId -> string[] | null | undefined
const peerFilesExpanded = reactive({}) // peerId -> boolean
const dirExpansion = reactive({}) // peerId:dirKey -> boolean

function initials(name) {
  return (name || '?').split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function basename(relPath) {
  return relPath.split('/').pop()
}

function getAsciiPrefix(depth) {
  if (depth === 0) return ''
  return '│  '.repeat(depth - 1) + '├─ '
}

function getPeerTreeNodes(peerId) {
  const files = peerFiles[peerId] || []
  const nodes = []
  const expansionPrefix = `${peerId}:`

  // 1. Group by workspace first
  const workspaces = {}
  for (const f of files) {
    const wsName = typeof f === 'string' ? 'Workspace' : (f.workspace || 'Workspace')
    const fPath = typeof f === 'string' ? f : f.path
    if (!workspaces[wsName]) workspaces[wsName] = []
    workspaces[wsName].push(f)
  }

  for (const [wsName, wsFiles] of Object.entries(workspaces)) {
    const wsKey = `ws:${wsName}`
    const wsExpanded = isDirExpanded(peerId, wsKey)
    
    // Add Workspace root node
    nodes.push({
      key: wsKey,
      type: 'ws',
      name: wsName,
      count: wsFiles.length,
      depth: 0,
      visible: true
    })

    // Add children (directories and files)
    const tree = {}
    for (const f of wsFiles) {
      const fPath = typeof f === 'string' ? f : f.path
      const parts = fPath.split('/')
      let curr = tree
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const isFile = i === parts.length - 1
        if (isFile) {
          curr[`f:${part}`] = f
        } else {
          if (!curr[`d:${part}`]) curr[`d:${part}`] = { _count: 0, _children: {} }
          curr[`d:${part}`]._count++
          curr = curr[`d:${part}`]._children
        }
      }
    }

    const flatten = (obj, depth, parentVisible, parentKey) => {
      const entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
      for (const [key, val] of entries) {
        const type = key.startsWith('d:') ? 'dir' : 'file'
        const name = key.slice(2)
        const nodeKey = `${parentKey}/${key}`
        const visible = parentVisible && isDirExpanded(peerId, parentKey)

        if (type === 'dir') {
          nodes.push({
            key: nodeKey,
            type: 'dir',
            name,
            count: val._count,
            depth: depth + 1,
            visible
          })
          flatten(val._children, depth + 1, visible, nodeKey)
        } else {
          const f = val
          nodes.push({
            key: nodeKey,
            type: 'file',
            name,
            path: typeof f === 'string' ? f : f.path,
            workspace: typeof f === 'string' ? null : f.workspace,
            versions: f.versions,
            depth: depth + 1,
            visible
          })
        }
      }
    }

    flatten(tree, 0, wsExpanded, wsKey)
  }

  return nodes
}

function isDirExpanded(peerId, key) {
  const compositeKey = `${peerId}:${key}`
  if (dirExpansion[compositeKey] === undefined) {
    // Default: expand workspace root, collapse others
    return key.startsWith('ws:')
  }
  return dirExpansion[compositeKey]
}

function toggleDir(peerId, key) {
  const compositeKey = `${peerId}:${key}`
  dirExpansion[compositeKey] = !isDirExpanded(peerId, key)
}

async function switchToDiscover() {
  view.value = 'discover'
  if (store.discoveredPeers.length > 0) return
  await refreshDiscover()
}

async function refreshDiscover() {
  if (store.isDemoMode) {
    // Demo mode uses demoConfig but we could also just leave it
    return
  }
  discovering.value = true
  try {
    await store.refreshDiscoveredPeers()
    // Clear local cache on refresh so we try loading again
    for (const key in peerFiles) {
      delete peerFiles[key]
    }
  } finally {
    discovering.value = false
  }
}

async function togglePeerFiles(peer) {
  const isExpanded = !!peerFilesExpanded[peer.id]
  peerFilesExpanded[peer.id] = !isExpanded

  // If expanding and we don't have files (or failed previously), load them
  if (!isExpanded && (peerFiles[peer.id] === undefined || peerFiles[peer.id] === null) && !store.isDemoMode) {
    await loadFiles(peer)
  }
}

function groupedPeerFiles(peerId) {
  const files = peerFiles[peerId] || []
  const groups = {}
  for (const f of files) {
    const ws = f.workspace || 'Default'
    if (!groups[ws]) groups[ws] = []
    groups[ws].push(f)
  }
  return groups
}

async function loadFiles(peer) {
  peerFiles[peer.id] = undefined // show loading state
  try {
    const result = await api.peers.fetchManifest(peer.id)
    // The manifest now includes scope metadata
    if (result.success) {
      peerFiles[peer.id] = result.files
      peer.scope = result.scope // dynamically update scope from manifest
    } else {
      peerFiles[peer.id] = null
    }
  } catch (err) {
    peerFiles[peer.id] = null
  }
}

async function openFile(peer, relPath, wsName = null) {
  try {
    const result = await api.peers.openFile(peer.id, relPath, wsName)
    if (result.success) {
      store.openPeerFile({ 
        peer, 
        relPath, 
        content: result.content, 
        comments: result.comments 
      })
    } else {
      alert(`Could not open file: ${result.error || 'Unknown error'}`)
    }
  } catch (err) {
    alert(`Could not open file: ${err.message}`)
  }
}

async function copyToWorkspace() {
  const { relPath, content } = store.peerFileContent
  await store.copyPeerFileToWorkspace({ relPath, content })
  store.openPeerFile(null)
}

function openDemoFile(peer, file) {
  const content = demoConfig.files[file.path] ?? `# ${file.name}\n\n*(No preview available)*`
  const comments = demoConfig.comments?.[file.path] ?? []
  store.openPeerFile({ peer: { ...peer, permission: file.permission ?? 'view' }, relPath: file.path, content, comments })
}

function unfavoriteDemoPeer(id) {
  const idx = store.demoPeers.findIndex(p => p.id === id)
  if (idx >= 0) store.demoPeers.splice(idx, 1)
}

function toggleFavorite(peer) {
  if (store.isDemoMode) {
    if (store.favoritedPeerIds.has(peer.id)) {
      store.favoritedPeerIds.delete(peer.id)
      // Remove from discoveredPeers so favoritedPeers computed updates
      const idx = store.discoveredPeers.findIndex(p => p.id === peer.id)
      if (idx >= 0) store.discoveredPeers.splice(idx, 1)
    } else {
      store.favoritedPeerIds.add(peer.id)
      // Add to discoveredPeers so favoritedPeers computed picks it up
      if (!store.discoveredPeers.find(p => p.id === peer.id)) {
        store.discoveredPeers.push(peer)
      }
    }
    return
  }
  if (store.favoritedPeerIds.has(peer.id)) {
    store.unfavoritePeer(peer.id)
  } else {
    store.favoritePeer(peer.id)
  }
}
</script>

<style scoped>
.peers-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.network-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 30%, transparent);
  font-size: 0.775rem;
  color: var(--warning, #f59e0b);
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 8px 12px;
  background: transparent;
  border: none;
  font-size: 0.8125rem;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.1s;
}
.tab:hover { color: var(--text-secondary); }
.tab.active { color: var(--text-primary); border-bottom-color: var(--accent); font-weight: 500; }

.discover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
}

.discover-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.refresh-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 12px;
}

.empty-hint {
  padding: 16px 12px;
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.peer-group {
  margin-bottom: 4px;
}

.peer-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;
}
.peer-header:hover { background: var(--bg-hover); }

.peer-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--accent-muted, color-mix(in srgb, var(--accent) 15%, transparent));
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  flex-shrink: 0;
}

.peer-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}

.peer-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-id {
  font-size: 0.6875rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-status { display: flex; align-items: center; flex-shrink: 0; }

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.online .status-dot { background: #22c55e; }
.offline .status-dot { background: var(--text-muted); }

.icon-btn {
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.1s;
}
.icon-btn:hover { background: var(--bg-hover); }
.fav-btn { color: var(--text-muted); }
.fav-btn:hover { color: var(--accent); }
.unfav-btn { color: var(--accent); }

.peer-workspace-name {
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 0 10px 4px 43px;
  font-style: italic;
}

.peer-files {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 0;
}

.peer-node-row {
  display: flex;
  flex-direction: column;
}

.peer-ascii-dir {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  font-size: 0.775rem;
  color: var(--text-muted); /* Muted color for directories */
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s, color 0.1s;
}
.peer-ascii-dir:hover { background: var(--bg-hover); color: var(--text-secondary); }

.peer-ascii-file {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border: none;
  background: transparent;
  color: var(--text-primary); /* Prominent color for files */
  font-size: 0.8125rem; /* Slightly larger for prominence */
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.1s, color 0.1s;
}
.peer-ascii-file:hover { background: var(--bg-hover); color: var(--accent-light); }

.ascii-prefix {
  color: var(--text-muted);
  opacity: 0.5; /* Slightly fainter prefix */
  white-space: pre;
}

.ascii-name {
  font-weight: 400; /* Regular weight for dirs */
}

.file-name {
  font-weight: 500; /* Bold weight for files */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ascii-state {
  color: var(--text-muted);
  font-size: 0.7rem;
  opacity: 0.7;
}

.file-version-count {
  font-size: 0.625rem;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  padding: 0 4px;
  border-radius: 4px;
  font-weight: 600;
  flex-shrink: 0;
}

.perm-badge {
  font-size: 0.6rem;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--bg-hover);
  color: var(--text-muted);
  flex-shrink: 0;
  height: 14px;
  line-height: 14px;
}
.perm-badge.comment { color: var(--accent); }
.perm-badge.copy { color: #22c55e; }

.peer-files-loading, .peer-files-error, .peer-files-empty, .peer-offline-hint {
  padding: 3px 12px 4px 42px;
  font-size: 0.775rem;
  color: var(--text-muted);
}

.load-files-btn {
  background: transparent;
  border: none;
  color: var(--accent);
  font-size: 0.775rem;
  cursor: pointer;
  padding: 0;
}
.load-files-btn:hover { text-decoration: underline; }

.discover-spinner {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Peer file viewer bar at bottom */
.peer-viewer-bar {
  border-top: 1px solid var(--border);
  padding: 8px 10px;
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.viewer-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.775rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.viewer-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
  font-size: 0.775rem;
  cursor: pointer;
}
.viewer-btn:hover { opacity: 0.85; }
.viewer-btn.ghost {
  background: transparent;
  color: var(--text-muted);
  border-color: var(--border);
}
.viewer-btn.ghost:hover { background: var(--bg-hover); }
</style>
