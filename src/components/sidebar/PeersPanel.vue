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
      <div v-if="store.favoritedPeers.length === 0" class="empty-hint">
        No favorited peers yet. Switch to Discover to find people on your network and star them.
      </div>

      <div v-for="peer in store.favoritedPeers" :key="peer.id" class="peer-group">
        <div class="peer-header">
          <div class="peer-avatar">{{ initials(peer.name) }}</div>
          <div class="peer-info">
            <span class="peer-name">{{ peer.name }}</span>
            <span class="peer-id">{{ peer.id }}</span>
          </div>
          <div class="peer-status" :class="peer.online ? 'online' : 'offline'">
            <span class="status-dot" />
          </div>
          <button class="icon-btn unfav-btn" title="Unfavorite" @click="store.unfavoritePeer(peer.id)">
            <Star :size="13" fill="currentColor" />
          </button>
        </div>

        <div v-if="peer.online">
          <div v-if="peerFiles[peer.id] === undefined" class="peer-files-loading">
            <button class="load-files-btn" @click="loadFiles(peer)">Load files…</button>
          </div>
          <div v-else-if="peerFiles[peer.id] === null" class="peer-files-error">
            Could not load files.
          </div>
          <div v-else class="peer-files">
            <div v-if="peerFiles[peer.id].length === 0" class="peer-files-empty">No files shared.</div>
            <button
              v-for="relPath in peerFiles[peer.id]"
              :key="relPath"
              class="peer-file"
              @click="openFile(peer, relPath)"
            >
              <FileText :size="13" />
              <span class="file-name">{{ basename(relPath) }}</span>
              <span class="perm-badge" :class="peer.permission">{{ peer.permission ?? 'view' }}</span>
            </button>
          </div>
        </div>
        <div v-else class="peer-offline-hint">Offline — can't load files</div>
      </div>
    </div>

    <!-- DISCOVER VIEW -->
    <div v-if="view === 'discover'" class="panel-body">
      <div v-if="discovering" class="discover-spinner">
        <Loader :size="14" class="spin" /> Scanning network…
      </div>

      <div v-if="!discovering && allDiscovered.length === 0" class="empty-hint">
        No Canonic peers found on this network.
      </div>

      <div v-for="peer in allDiscovered" :key="peer.id" class="peer-group">
        <div class="peer-header">
          <div class="peer-avatar">{{ initials(peer.name) }}</div>
          <div class="peer-info">
            <span class="peer-name">{{ peer.name }}</span>
            <span class="peer-id">{{ peer.id }}</span>
          </div>
          <div class="peer-status" :class="peer.online ? 'online' : 'offline'">
            <span class="status-dot" />
          </div>
          <button
            class="icon-btn"
            :class="store.favoritedPeerIds.has(peer.id) ? 'unfav-btn' : 'fav-btn'"
            :title="store.favoritedPeerIds.has(peer.id) ? 'Unfavorite' : 'Favorite'"
            @click="toggleFavorite(peer)"
          >
            <Star :size="13" :fill="store.favoritedPeerIds.has(peer.id) ? 'currentColor' : 'none'" />
          </button>
        </div>
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
import { FileText, Star, AlertTriangle, Loader, Eye } from 'lucide-vue-next'

const store = useAppStore()
const api = window.canonic

const view = ref('favorites')
const discovering = ref(false)
const allDiscovered = ref([])
const peerFiles = reactive({}) // peerId -> string[] | null | undefined

function initials(name) {
  return (name || '?').split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function basename(relPath) {
  return relPath.split('/').pop()
}

async function switchToDiscover() {
  view.value = 'discover'
  if (allDiscovered.value.length > 0) return
  discovering.value = true
  try {
    const peers = await api.peers.listDiscovered()
    allDiscovered.value = peers
  } finally {
    discovering.value = false
  }
}

async function loadFiles(peer) {
  peerFiles[peer.id] = undefined // show loading state
  const result = await api.peers.fetchManifest(peer.id)
  peerFiles[peer.id] = result.success ? result.files : null
}

async function openFile(peer, relPath) {
  const result = await api.peers.openFile(peer.id, relPath)
  if (result.success) {
    store.openPeerFile({ peer, relPath, content: result.content })
  }
}

async function copyToWorkspace() {
  const { relPath, content } = store.peerFileContent
  await store.copyPeerFileToWorkspace({ relPath, content })
  store.openPeerFile(null)
}

function toggleFavorite(peer) {
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

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0 12px;
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
}

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

.peer-files {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 6px 4px 6px;
}

.peer-file {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 6px 4px 36px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.12s;
}
.peer-file:hover { background: var(--bg-hover); color: var(--text-primary); }

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.perm-badge {
  font-size: 0.625rem;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-hover);
  color: var(--text-muted);
  flex-shrink: 0;
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
