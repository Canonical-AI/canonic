<template>
  <div class="share-panel">

    <div class="panel-section">
      <div class="section-label">
        <Share2 :size="11" />
        Share this document
      </div>
      <p class="section-desc">
        Served directly from your machine. Anyone on the same network
        with the link can view it — no cloud, no relay.
      </p>
    </div>

    <!-- Not yet sharing -->
    <div v-if="!store.shareInfo" class="share-action">
      <button class="start-btn" @click="startShare" :disabled="loading">
        {{ loading ? 'Starting…' : 'Start sharing' }}
      </button>
      <p v-if="error" class="error-msg">{{ error }}</p>
    </div>

    <!-- Active share -->
    <div v-else class="share-active">

      <!-- Status + live stats -->
      <div class="status-bar">
        <div class="status-live">
          <span class="status-dot" />
          <span class="status-label">Live</span>
        </div>
        <div class="stat-pills">
          <div class="stat-pill" :class="store.shareStats.connected > 0 && 'stat-pill--active'">
            <Users :size="10" />
            {{ store.shareStats.connected }}
            {{ store.shareStats.connected === 1 ? 'viewer' : 'viewers' }}
          </div>
          <div class="stat-pill">
            <Eye :size="10" />
            {{ store.shareStats.reads }} {{ store.shareStats.reads === 1 ? 'read' : 'reads' }}
          </div>
        </div>
      </div>

      <!-- Link -->
      <div class="link-block">
        <div class="link-row">
          <span class="link-text">{{ store.shareInfo.localUrl }}</span>
          <button class="copy-btn" :class="copied && 'copied'" @click="copy(store.shareInfo.localUrl)">
            {{ copied ? '✓' : 'Copy' }}
          </button>
        </div>
        <p class="link-hint">Works for anyone on your network or VPN</p>
      </div>

      <!-- Actions -->
      <div class="share-actions">
        <button class="action-btn" @click="openInBrowser">
          <ExternalLink :size="11" />
          Preview in browser
        </button>
        <button class="stop-btn" @click="stopShare">Stop sharing</button>
      </div>

    </div>

    <!-- Peer workspaces -->
    <div class="panel-section peers-section">
      <div class="section-label">
        <Users :size="11" />
        Peer workspaces
      </div>
      <p class="section-desc">
        Open a doc shared by someone else on your network.
      </p>
      <div class="peer-input-row">
        <input
          v-model="peerUrl"
          class="peer-input"
          placeholder="http://192.168.x.x:38xx/doc?token=…"
          @keydown.enter="openPeer"
        />
        <button class="open-btn" @click="openPeer" :disabled="!peerUrl.trim() || peerLoading">
          {{ peerLoading ? '…' : 'Open' }}
        </button>
      </div>
      <p v-if="peerError" class="error-msg">{{ peerError }}</p>
    </div>

    <!-- Recent peers -->
    <div v-if="peers.length" class="peer-list">
      <div class="peer-type-label">Recent</div>
      <button
        v-for="peer in peers"
        :key="peer.id"
        class="peer-row"
        @click="reconnectPeer(peer)"
      >
        <div class="peer-avatar">{{ peer.name?.[0]?.toUpperCase() || '?' }}</div>
        <div class="peer-info">
          <span class="peer-name">{{ peer.name }}</span>
          <span class="peer-meta">{{ relativeTime(peer.lastSeen) }}</span>
        </div>
      </button>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAppStore } from '../../store'
import { Share2, Users, Eye, ExternalLink } from 'lucide-vue-next'

const store = useAppStore()
const loading = ref(false)
const error = ref('')
const copied = ref(false)

const peerUrl = ref('')
const peerLoading = ref(false)
const peerError = ref('')
const peers = ref([])

onMounted(async () => {
  peers.value = await window.canonic.peers.list() || []
})

async function startShare() {
  loading.value = true
  error.value = ''
  const result = await store.startShare({})
  loading.value = false
  if (!result.success) error.value = result.error || 'Failed to start sharing'
}

async function stopShare() {
  await store.stopShare()
}

async function copy(text) {
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function openInBrowser() {
  if (store.shareInfo?.localUrl) {
    window.canonic.share.openLink(store.shareInfo.localUrl)
  }
}

async function openPeer() {
  const url = peerUrl.value.trim()
  if (!url) return
  peerLoading.value = true
  peerError.value = ''

  // Extract token from URL
  let token = ''
  try {
    const u = new URL(url)
    token = u.searchParams.get('token') || ''
  } catch {
    peerError.value = 'Invalid URL'
    peerLoading.value = false
    return
  }

  const result = await window.canonic.share.openShared(url, token)
  peerLoading.value = false

  if (!result.success) {
    peerError.value = result.error || 'Could not connect'
    return
  }

  // Refresh peer list
  peers.value = await window.canonic.peers.list() || []
  peerUrl.value = ''
}

async function reconnectPeer(peer) {
  if (!peer.lastUrl || !peer.lastToken) return
  peerLoading.value = true
  peerError.value = ''
  const result = await window.canonic.share.openShared(peer.lastUrl, peer.lastToken)
  peerLoading.value = false
  if (!result.success) peerError.value = result.error || 'Could not reconnect'
}

function relativeTime(ms) {
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}
</script>

<style scoped>
.share-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 0 0 16px;
}

.panel-section {
  padding: 10px 12px 10px;
  border-bottom: 1px solid var(--border);
}

.peers-section {
  margin-top: 4px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.section-desc {
  font-size: 0.775rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 10px;
}

/* ── Share action ── */
.share-action {
  padding: 14px 12px;
}

.start-btn {
  width: 100%;
  padding: 8px 0;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
.start-btn:hover:not(:disabled) { opacity: 0.85; }
.start-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Active share ── */
.share-active {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.status-live {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--success);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.stat-pills {
  display: flex;
  gap: 5px;
}

.stat-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid var(--border);
  font-size: 0.72rem;
  color: var(--text-muted);
  background: var(--bg-base);
  white-space: nowrap;
}

.stat-pill--active {
  border-color: var(--success);
  color: var(--success);
  background: rgba(75, 125, 111, 0.08);
}

.link-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
}

.link-text {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin: 0;
}

.copy-btn {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.72rem;
  cursor: pointer;
  transition: color 0.1s, border-color 0.1s;
}
.copy-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.copy-btn.copied { color: var(--success); border-color: var(--success); }

.share-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.775rem;
  cursor: pointer;
  justify-content: center;
  transition: background 0.1s;
}
.action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.stop-btn {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.775rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.stop-btn:hover { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.3); }

/* ── Peer input ── */
.peer-input-row {
  display: flex;
  gap: 6px;
}

.peer-input {
  flex: 1;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text-primary);
  font-size: 0.775rem;
  font-family: inherit;
  outline: none;
  min-width: 0;
}
.peer-input:focus { border-color: var(--accent-muted); }
.peer-input::placeholder { color: var(--text-muted); }

.open-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.775rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.open-btn:hover:not(:disabled) { opacity: 0.85; }
.open-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.error-msg {
  font-size: 0.775rem;
  color: var(--error);
  margin: 6px 0 0;
}

/* ── Peer list ── */
.peer-list {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.peer-type-label {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.peer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.peer-row:hover { background: var(--bg-hover); }

.peer-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--accent-muted);
  color: var(--accent-light);
  font-size: 0.75rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.peer-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.peer-name {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
}
</style>
