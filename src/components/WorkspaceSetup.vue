<template>
  <div class="setup-screen">
    <div class="setup-card">
      <div class="logo">
        <span class="logo-text">canonic</span>
        <span class="logo-dot">.ai</span>
      </div>
      <p class="tagline">Write. Version. Share.</p>

      <div class="actions">
        <button class="btn-primary" @click="openExisting" :disabled="loading">
          Open Workspace
        </button>
        <button class="btn-secondary" @click="createDefault" :disabled="loading">
          Create Default Workspace
        </button>
      </div>

      <p v-if="loading" class="status">Initializing...</p>
      <p v-if="error" class="error">{{ error }}</p>

      <p class="hint">
        A workspace is a folder on your machine. All documents are stored as Markdown files
        and versioned with git.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../store'

const router = useRouter()
const store = useAppStore()
const loading = ref(false)
const error = ref(null)

async function openExisting() {
  const chosen = await window.canonic.workspace.openDialog()
  if (!chosen) return
  await launch(chosen)
}

async function createDefault() {
  const defaultPath = await window.canonic.workspace.getDefault()
  await launch(defaultPath)
}

async function launch(workspacePath) {
  loading.value = true
  error.value = null
  try {
    await store.openWorkspace(workspacePath)
    router.push('/workspace')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.setup-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg-base);
}

.setup-card {
  text-align: center;
  padding: 48px;
  max-width: 420px;
}

.logo {
  font-size: 2.5rem;
  font-weight: 600;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}

.logo-text { color: var(--text-primary); }
.logo-dot { color: var(--accent); }

.tagline {
  color: var(--text-muted);
  margin-bottom: 40px;
  font-size: 0.95rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-primary {
  background: var(--accent);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-secondary:hover { background: var(--bg-hover); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.status { color: var(--text-muted); font-size: 0.875rem; }
.error { color: var(--error); font-size: 0.875rem; }

.hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.6;
  margin-top: 24px;
}
</style>
