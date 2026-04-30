<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <h3 class="modal-title">Share document</h3>
      <p class="modal-subtitle">
        Share <strong>{{ store.currentFile }}</strong> with others.
        Recipients can view and comment. Your file stays on your machine.
      </p>

      <div v-if="!store.shareInfo">
        <div class="info-box">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm8-6.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.5 7.75A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
          <span>
            When you share, a secure link is generated. The document is served directly
            from your machine while this app is open. Anyone with the link and permission token can view it.
          </span>
        </div>

        <div class="modal-actions" style="margin-top: 20px">
          <button class="btn-ghost" @click="$emit('close')">Cancel</button>
          <button class="btn-primary" @click="startShare" :disabled="loading">
            {{ loading ? 'Starting…' : 'Generate share link' }}
          </button>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <div v-else class="share-result">
        <div class="link-row" v-if="store.shareInfo.tunnelUrl">
          <label class="link-label">Public link (internet)</label>
          <div class="link-box">
            <span class="link-text">{{ store.shareInfo.tunnelUrl }}</span>
            <button class="copy-btn" @click="copy(store.shareInfo.tunnelUrl)">
              {{ copied === 'tunnel' ? '✓' : 'Copy' }}
            </button>
          </div>
        </div>

        <div class="link-row">
          <label class="link-label">Local network link</label>
          <div class="link-box">
            <span class="link-text">{{ store.shareInfo.localUrl }}</span>
            <button class="copy-btn" @click="copy(store.shareInfo.localUrl)">
              {{ copied === 'local' ? '✓' : 'Copy' }}
            </button>
          </div>
        </div>

        <div v-if="!store.shareInfo.tunnelUrl" class="tunnel-hint">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575zm1.763.707a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368zM8 6a.75.75 0 01.75.75v3.5a.75.75 0 11-1.5 0v-3.5A.75.75 0 018 6zm.75 8a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
          </svg>
          Public tunnel not available. Install cloudflared for internet sharing:
          <code>brew install cloudflared</code>
        </div>

        <div class="share-status">
          <span class="status-dot" /> Sharing active — close this modal to keep sharing
        </div>

        <div class="modal-actions" style="margin-top: 16px">
          <button class="btn-danger" @click="stopShare">Stop sharing</button>
          <button class="btn-ghost" @click="$emit('close')">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '../store'

const emit = defineEmits(['close'])
const store = useAppStore()
const loading = ref(false)
const error = ref('')
const copied = ref('')

async function startShare() {
  loading.value = true
  error.value = ''
  const result = await store.startShare({})
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
  copied.value = text.includes('localhost') ? 'local' : 'tunnel'
  setTimeout(() => { copied.value = '' }, 2000)
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

.error { color: var(--error); font-size: 0.8rem; margin-top: 10px; }

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

.copy-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.75rem;
  cursor: pointer;
}

.copy-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.tunnel-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.775rem;
  color: var(--text-muted);
  flex-wrap: wrap;
}

.tunnel-hint code {
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
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
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
