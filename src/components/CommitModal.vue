<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <h3 class="modal-title">Save checkpoint</h3>
      <p class="modal-subtitle">
        Commit the current state of <strong>{{ store.currentFile }}</strong> to history.
      </p>

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
import { ref } from 'vue'
import { useAppStore } from '../store'

const emit = defineEmits(['close'])
const store = useAppStore()
const message = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
const commitOid = ref('')

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
  width: 440px;
  max-width: 90vw;
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
  margin: 0 0 20px;
}

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
