<template>
  <div v-if="store.externalChangeNotice" class="ext-change-toast" role="status">
    <FileWarning :size="14" aria-hidden="true" />
    <div class="msg">
      <strong>{{ fileName }}</strong> changed on disk. Your unsaved edits are preserved.
    </div>
    <button class="reload" @click="reload" :disabled="reloading">Reload from disk</button>
    <button class="dismiss" @click="dismiss" aria-label="Dismiss">×</button>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAppStore } from '../../store'
import { FileWarning } from 'lucide-vue-next'

const store = useAppStore()
const reloading = ref(false)
let timer = null

const fileName = computed(() => {
  const f = store.externalChangeNotice?.file || ''
  return f.split('/').pop() || f
})

function dismiss() {
  store.externalChangeNotice = null
}

async function reload() {
  if (reloading.value) return
  reloading.value = true
  try {
    await store.reloadCurrentFromDisk()
  } finally {
    reloading.value = false
    dismiss()
  }
}

watch(
  () => store.externalChangeNotice?.at,
  (at) => {
    if (timer) clearTimeout(timer)
    if (at) timer = setTimeout(dismiss, 8000)
  },
)
</script>

<style scoped>
.ext-change-toast {
  position: fixed;
  top: 64px;
  right: 24px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--surface, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-left: 3px solid var(--accent, #f5a623);
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--text, #ddd);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  max-width: 380px;
}

.msg { flex: 1; }
.msg strong { font-weight: 600; }

.reload {
  padding: 4px 10px;
  background: var(--accent, #7c8cf8);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}

.reload:disabled { opacity: 0.5; cursor: not-allowed; }

.dismiss {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 4px;
}
</style>
