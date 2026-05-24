<template>
  <div v-if="store.confirmDialog" class="modal-backdrop" @click.self="cancel">
    <div class="modal" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <h3 :id="titleId" class="modal-title">{{ store.confirmDialog.title }}</h3>
      <p v-if="store.confirmDialog.message" class="modal-message">
        {{ store.confirmDialog.message }}
      </p>

      <div class="modal-actions">
        <button class="btn-ghost" @click="cancel" ref="cancelBtnRef">
          {{ store.confirmDialog.cancelText || 'Cancel' }}
        </button>
        <button
          :class="['btn-primary', store.confirmDialog.danger && 'btn-danger']"
          @click="confirm"
        >
          {{ store.confirmDialog.confirmText || 'Confirm' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '../../store'

const store = useAppStore()
const titleId = `confirm-modal-title-${Math.random().toString(36).slice(2, 8)}`
const cancelBtnRef = ref(null)

function confirm() { store.resolveConfirm(true) }
function cancel() { store.resolveConfirm(false) }

function onKeydown(e) {
  if (!store.confirmDialog) return
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    confirm()
  }
}

watch(() => store.confirmDialog, async (val) => {
  if (val) {
    await nextTick()
    cancelBtnRef.value?.focus()
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
}

.modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px 28px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 10px;
}

.modal-message {
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-secondary);
  margin: 0 0 22px;
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

.btn-primary:hover { opacity: 0.85; }

.btn-danger {
  background: var(--error, #ef4444);
}

.btn-danger:hover { opacity: 0.9; }
</style>
