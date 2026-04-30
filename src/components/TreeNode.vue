<template>
  <div>
    <div
      :class="['tree-node', item.type === 'file' && store.currentFile === item.path && 'active']"
      :style="{ paddingLeft: `${12 + depth * 16}px` }"
      @click="handleClick"
      @dblclick="item.type === 'file' && startRename()"
      @contextmenu.prevent="item.type === 'file' && startRename()"
    >
      <svg v-if="item.type === 'directory'" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" class="chevron" :class="open && 'open'">
        <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/>
      </svg>
      <svg v-else width="12" height="12" viewBox="0 0 16 16" fill="currentColor" class="file-icon">
        <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 00.25-.25V6h-2.75A1.75 1.75 0 019 4.25V1.5H3.75zm6.75.062V4.25c0 .138.112.25.25.25h2.688L10.5 1.573z"/>
      </svg>

      <!-- Inline rename input -->
      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameValue"
        class="rename-input"
        @keydown.enter.stop="confirmRename"
        @keydown.esc.stop="renaming = false"
        @blur="confirmRename"
        @click.stop
      />
      <span v-else class="node-name">{{ item.name }}</span>
      <span v-if="item.type === 'file' && isDirty && !renaming" class="dirty-dot" title="Unsaved changes" />
    </div>

    <template v-if="item.type === 'directory' && open">
      <TreeNode
        v-for="child in item.children"
        :key="child.path"
        :item="child"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useAppStore } from '../store'

const props = defineProps({
  item: Object,
  depth: Number
})

const store = useAppStore()
const open = ref(true)
const renaming = ref(false)
const renameValue = ref('')
const renameInput = ref(null)

const isDirty = computed(() =>
  store.currentFile === props.item.path && store.isDirty
)

function handleClick() {
  if (renaming.value) return
  if (props.item.type === 'directory') {
    open.value = !open.value
  } else {
    store.openFile(props.item.path)
  }
}

async function startRename() {
  renameValue.value = props.item.name
  renaming.value = true
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

async function confirmRename() {
  const newName = renameValue.value.trim()
  renaming.value = false
  if (!newName || newName === props.item.name) return
  await store.renameFile(props.item.path, newName)
}
</script>

<style scoped>
.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  cursor: pointer;
  border-radius: 4px;
  margin: 0 4px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  transition: background 0.1s;
  white-space: nowrap;
  overflow: hidden;
}

.tree-node:hover { background: var(--bg-hover); color: var(--text-primary); }
.tree-node.active { background: var(--bg-active); color: var(--text-primary); }

.chevron { flex-shrink: 0; transition: transform 0.15s; }
.chevron.open { transform: rotate(90deg); }
.file-icon { flex-shrink: 0; color: var(--text-muted); }

.node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.rename-input {
  flex: 1;
  background: var(--bg-base);
  border: 1px solid var(--accent-muted);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-family: inherit;
  outline: none;
  min-width: 0;
}
</style>
