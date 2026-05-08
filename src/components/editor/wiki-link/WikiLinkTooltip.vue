<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="wiki-tooltip"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
    >
      <div class="wiki-tooltip-search">
        <input
          ref="searchInput"
          v-model="query"
          class="wiki-tooltip-input"
          placeholder="Search docs..."
          @keydown.enter.prevent="selectFirst"
          @keydown.escape="close"
          @keydown.arrow-down.prevent="moveDown"
          @keydown.arrow-up.prevent="moveUp"
        />
      </div>
      <div class="wiki-tooltip-list">
        <div
          v-for="(item, i) in filtered"
          :key="item.name"
          class="wiki-tooltip-item"
          :class="{ active: i === activeIndex }"
          @mousedown.prevent="select(item.name)"
        >
          <span class="wiki-item-icon">@</span>
          {{ item.name }}
        </div>
        <div
          v-if="filtered.length === 0 && query"
          class="wiki-tooltip-item wiki-create"
          @mousedown.prevent="select(query)"
        >
          <span class="wiki-item-icon">+</span>
          Create "{{ query }}"
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useAppStore } from '../../../store'

const store = useAppStore()

const visible = ref(false)
const query = ref('')
const pos = ref({ top: 0, left: 0 })
const activeIndex = ref(0)
const searchInput = ref(null)

let onSelectCallback = null
let onCloseCallback = null

const allDocs = computed(() =>
  Object.keys(store.fileIndex).map((name) => ({ name }))
)

const filtered = computed(() => {
  const q = query.value.toLowerCase()
  return allDocs.value.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 12)
})

watch(filtered, () => { activeIndex.value = 0 })

function open(anchorPos, onSelect, onClose) {
  pos.value = anchorPos
  onSelectCallback = onSelect
  onCloseCallback = onClose
  query.value = ''
  activeIndex.value = 0
  visible.value = true
  nextTick(() => searchInput.value?.focus())
}

function close() {
  visible.value = false
  onCloseCallback?.()
  onSelectCallback = null
  onCloseCallback = null
}

function select(name) {
  const cb = onSelectCallback
  onSelectCallback = null
  onCloseCallback = null
  visible.value = false
  cb?.(name)
}

function selectFirst() {
  if (filtered.value.length > 0) {
    select(filtered.value[activeIndex.value].name)
  } else if (query.value) {
    select(query.value)
  }
}

function moveDown() {
  if (activeIndex.value < filtered.value.length - 1) activeIndex.value++
}

function moveUp() {
  if (activeIndex.value > 0) activeIndex.value--
}

defineExpose({ open, close, visible })
</script>

<style scoped>
.wiki-tooltip {
  position: fixed;
  z-index: 1000;
  background: var(--bg-secondary, #1e1e1e);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  width: 240px;
  overflow: hidden;
}

.wiki-tooltip-search { padding: 8px; border-bottom: 1px solid var(--border); }

.wiki-tooltip-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-family: inherit;
  box-sizing: border-box;
}

.wiki-tooltip-list { max-height: 200px; overflow-y: auto; }

.wiki-tooltip-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.wiki-tooltip-item:hover,
.wiki-tooltip-item.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.wiki-create { color: var(--accent); }

.wiki-item-icon { opacity: 0.5; font-size: 0.75rem; }
</style>
