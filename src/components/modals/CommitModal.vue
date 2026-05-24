<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <h3 class="modal-title">Save checkpoint</h3>
      <p class="modal-subtitle">
        Commit the current state of <strong>{{ store.currentFile }}</strong> to history.
      </p>

      <!-- Change summary + diff preview -->
      <div class="diff-section">
        <div class="diff-header">
          <span class="diff-header-label">Changes since last checkpoint</span>
          <span v-if="diffLoading" class="diff-loading">loading…</span>
          <span v-else-if="stats" class="diff-stats">
            <span class="stat-add">+{{ stats.added }}</span>
            <span class="stat-del">-{{ stats.removed }}</span>
          </span>
        </div>
        <div v-if="!diffLoading && diffText" class="diff-preview">
          <div
            v-for="(line, li) in diffText.split('\n')"
            :key="li"
            class="diff-line"
            :class="line.startsWith('+ ') ? 'diff-add' : line.startsWith('- ') ? 'diff-del' : line === '  ···' ? 'diff-sep' : ''"
          >{{ line }}</div>
        </div>
        <p v-else-if="!diffLoading" class="diff-empty">No textual changes detected.</p>
      </div>

      <div class="field">
        <label class="field-label">Commit message</label>
        <input
          v-model="message"
          class="field-input"
          placeholder="e.g. Draft v2 with revised success metrics"
          @keydown.enter="commit"
          autofocus
        />
        <p class="field-hint">Describe what changed or why this checkpoint matters.</p>
      </div>

      <div class="modal-actions">
        <button class="btn-ghost" @click="$emit('close')">Cancel</button>
        <button class="btn-primary" @click="commit" :disabled="!message.trim() || loading">
          {{ loading ? 'Saving…' : 'Save checkpoint' }}
        </button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="success" class="success">✓ Checkpoint saved ({{ commitOid }})</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAppStore } from '../../store'
import { generateDiff, countDiff } from '../../utils/diff.js'

const emit = defineEmits(['close'])
const store = useAppStore()
const message = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
const commitOid = ref('')

const diffLoading = ref(true)
const diffText = ref('')
const stats = ref(null)

onMounted(async () => {
  try {
    const headOid = store.commitLog?.[0]?.oid
    const workingContent = store.isDirty
      ? store.currentContent
      : await window.canonic.files.read(store.workspacePath, store.currentFile)
    let headContent = ''
    if (headOid) {
      const result = await window.canonic.git.diff(
        store.workspacePath,
        store.currentFile,
        headOid,
      )
      // diff() returns { before: commit content, after: working file on disk }
      headContent = result?.before ?? ''
    }
    stats.value = countDiff(headContent, workingContent ?? '')
    const preview = generateDiff(headContent, workingContent ?? '')
    diffText.value = preview === '(no changes)' ? '' : preview
  } catch (err) {
    console.error('CommitModal diff load failed:', err)
  } finally {
    diffLoading.value = false
  }
})

async function commit() {
  if (!message.value.trim() || loading.value) return

  // Auto-save first if dirty
  if (store.isDirty) {
    // The editor auto-saves on Cmd+S, but we should save before committing
    await window.canonic.files.write(store.workspacePath, store.currentFile, store.currentContent)
    store.isDirty = false
  }

  loading.value = true
  error.value = ''
  const result = await store.commitFile(message.value.trim())
  loading.value = false

  if (result.success) {
    commitOid.value = result.oid?.slice(0, 7) || ''
    success.value = true
    setTimeout(() => emit('close'), 1500)
  } else {
    error.value = result.error || 'Commit failed'
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
  width: 520px;
  max-width: 92vw;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.modal-subtitle {
  font-size: 0.8375rem;
  color: var(--text-muted);
  margin: 0 0 16px;
}

.diff-section {
  margin-bottom: 18px;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.diff-header-label {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.diff-stats {
  display: inline-flex;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}

.stat-add { color: #34d399; }
.stat-del { color: #f87171; }

.diff-loading {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-style: italic;
}

.diff-preview {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-base);
  max-height: 240px;
  overflow-y: auto;
  padding: 6px 0;
}

.diff-empty {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0;
}

.diff-line {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  line-height: 1.6;
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-muted);
}

.diff-add { background: rgba(52, 211, 153, 0.08); color: #34d399; }
.diff-del { background: rgba(248, 113, 113, 0.08); color: #f87171; }
.diff-sep { color: var(--text-muted); opacity: 0.5; text-align: center; letter-spacing: 0.1em; }

.field { margin-bottom: 20px; }

.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field-input {
  width: 100%;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.field-input:focus { border-color: var(--accent-muted); }

.field-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 6px 0 0;
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

.error { color: var(--error); font-size: 0.8rem; margin-top: 12px; }
.success { color: var(--success); font-size: 0.8rem; margin-top: 12px; }
</style>
