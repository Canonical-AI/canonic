<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="context-menu"
      :style="{ top: `${pos.y}px`, left: `${pos.x}px` }"
      @mousedown.stop
      @contextmenu.prevent
    >
      <div v-for="item in items" :key="item.id" class="menu-item" @click="handleAction(item.action)">
        <component :is="item.icon" :size="14" class="menu-icon" />
        <span>{{ item.label }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Trash2 } from 'lucide-vue-next'

const visible = ref(false)
const pos = ref({ x: 0, y: 0 })
const items = ref([])

let onActionCallback = null

const TABLE_ITEMS = [
  { id: 'row-before', label: 'Add Row Above', icon: ChevronUp, action: 'addRowBefore' },
  { id: 'row-after', label: 'Add Row Below', icon: ChevronDown, action: 'addRowAfter' },
  { id: 'row-del', label: 'Delete Row', icon: Trash2, action: 'deleteRow' },
  { id: 'sep1', type: 'separator' },
  { id: 'col-before', label: 'Add Column Left', icon: ChevronLeft, action: 'addColBefore' },
  { id: 'col-after', label: 'Add Column Right', icon: ChevronRight, action: 'addColAfter' },
  { id: 'col-del', label: 'Delete Column', icon: Trash2, action: 'deleteCol' },
]

function open(x, y, type, onAction) {
  pos.value = { x, y }
  onActionCallback = onAction
  if (type === 'table') {
    items.value = TABLE_ITEMS.filter(i => i.type !== 'separator') // Simple for now
  }
  visible.value = true
}

function close() {
  visible.value = false
}

function handleAction(action) {
  onActionCallback?.(action)
  close()
}

onMounted(() => {
  window.addEventListener('mousedown', close)
})

onUnmounted(() => {
  window.removeEventListener('mousedown', close)
})

defineExpose({ open, close, visible })
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--bg-secondary, #1e1e1e);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  width: 180px;
  padding: 4px 0;
  user-select: none;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.menu-icon { opacity: 0.7; }
</style>
