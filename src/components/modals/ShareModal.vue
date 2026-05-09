<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <h3 class="modal-title">Share document</h3>
      <p class="modal-subtitle">
        Served directly from your machine over your local network.
        Anyone on the same network with the link can view it.
      </p>

      <div v-if="!store.shareInfo">
        <div class="info-box">
          <Info :size="14" style="flex-shrink:0" />
          <span>
            No cloud, no relay. Your doc is served straight from this machine
            on your local network — like a local web app. Stop sharing any time.
          </span>
        </div>

        <div class="permission-row">
          <label class="section-label">Permission</label>
          <div class="permission-options">
            <button
              v-for="opt in permissionOptions"
              :key="opt.value"
              class="perm-btn"
              :class="{ active: permission === opt.value }"
              @click="permission = opt.value"
            >
              <component :is="opt.icon" :size="14" />
              {{ opt.label }}
            </button>
          </div>
          <p class="perm-hint">{{ currentPermissionHint }}</p>
        </div>

        <div class="modal-actions" style="margin-top: 20px">
          <button class="btn-ghost" @click="$emit('close')">Cancel</button>
          <button class="btn-primary" @click="startShare" :disabled="loading">
            {{ loading ? 'Starting…' : 'Start sharing' }}
          </button>
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
      </div>

      <div v-else class="share-result">
        <div class="link-row">
          <label class="link-label">Network link</label>
          <div class="link-box">
            <span class="link-text">{{ store.shareInfo.localUrl }}</span>
            <button class="copy-btn" :class="copied && 'copied'" @click="copy(store.shareInfo.localUrl)">
              {{ copied ? '✓ Copied' : 'Copy' }}
            </button>
          </div>
          <p class="link-hint">
            Anyone on your network can open this in a browser or in Canonic.
          </p>
        </div>

        <div class="share-meta">
          <span class="meta-badge">
            <component :is="activePermissionIcon" :size="12" />
            {{ activePermissionLabel }}
          </span>
        </div>

        <div class="share-status">
          <span class="status-dot" />
          Serving on port {{ store.shareInfo.port }} · auto-stops if traffic spikes
        </div>

        <div class="modal-actions" style="margin-top: 16px">
          <button class="btn-danger" @click="stopShare">Stop sharing</button>
          <button class="btn-ghost" @click="openInBrowser">Open in browser</button>
          <button class="btn-ghost" @click="$emit('close')">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '../../store'
import { Info, Eye, MessageSquare, Copy } from 'lucide-vue-next'

const emit = defineEmits(['close'])
const store = useAppStore()
const loading = ref(false)
const error = ref('')
const copied = ref(false)
const permission = ref(store.config?.sharingDefaults?.permission || 'view')

const permissionOptions = [
  { value: 'view',    label: 'View',    icon: Eye,           hint: 'Others can read the document.' },
  { value: 'comment', label: 'Comment', icon: MessageSquare, hint: 'Others can read and leave comments.' },
  { value: 'copy',    label: 'Copy',    icon: Copy,          hint: 'Others can read, comment, and copy the document to their workspace.' },
]

const currentPermissionHint = computed(() =>
  permissionOptions.find(o => o.value === permission.value)?.hint ?? ''
)

const activePermissionIcon = computed(() =>
  permissionOptions.find(o => o.value === store.shareInfo?.permission)?.icon ?? Eye
)

const activePermissionLabel = computed(() =>
  permissionOptions.find(o => o.value === store.shareInfo?.permission)?.label ?? 'View'
)

async function startShare() {
  loading.value = true
  error.value = ''
  const result = await store.startShare({ permission: permission.value })
  loading.value = false
  if (!result.success) {
    error.value = result.error || 'Failed to start sharing'
  }
}

async function stopShare() {
  await store.stopShare()
  emit('close')
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
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px;
  width: 480px;
  max-width: 90vw;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--text-primary);
}

.modal-subtitle {
  font-size: 0.8375rem;
  color: var(--text-muted);
  margin: 0 0 20px;
  line-height: 1.5;
}

.info-box {
  display: flex;
  gap: 10px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.permission-row {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.permission-options {
  display: flex;
  gap: 8px;
}

.perm-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.perm-btn:hover { background: var(--bg-hover); }
.perm-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.perm-hint {
  font-size: 0.775rem;
  color: var(--text-muted);
  margin: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-ghost {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
}
.btn-ghost:hover { background: var(--bg-hover); }

.btn-primary {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-danger {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--error);
  color: white;
  font-size: 0.875rem;
  cursor: pointer;
}
.btn-danger:hover { opacity: 0.85; }

.error-msg { color: var(--error); font-size: 0.8rem; margin-top: 10px; }

.share-result { display: flex; flex-direction: column; gap: 14px; }

.link-row { display: flex; flex-direction: column; gap: 6px; }

.link-label {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.link-box {
  display: flex;
  align-items: center;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  gap: 8px;
}

.link-text {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-hint {
  font-size: 0.775rem;
  color: var(--text-muted);
  margin: 0;
}

.copy-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.copy-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.copy-btn.copied { color: var(--success); border-color: var(--success); }

.share-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 99px;
  border: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.share-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
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
</style>
