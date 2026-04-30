<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <h3 class="modal-title">New document</h3>

      <div class="field">
        <input
          v-model="docName"
          class="field-input"
          placeholder="Document name"
          @keydown.enter="create"
          autofocus
        />
      </div>

      <div class="modal-actions">
        <button class="btn-ghost" @click="$emit('close')">Cancel</button>
        <button class="btn-primary" @click="create" :disabled="!docName.trim() || loading">
          {{ loading ? 'Creating…' : 'Create' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '../store'

const emit = defineEmits(['close'])
const store = useAppStore()
const docName = ref('')
const loading = ref(false)

async function create() {
  if (!docName.value.trim()) return
  loading.value = true
  await store.createFile(docName.value.trim())
  loading.value = false
  emit('close')
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
  width: 380px;
  max-width: 90vw;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px;
}

.field { margin-bottom: 20px; }

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
</style>
