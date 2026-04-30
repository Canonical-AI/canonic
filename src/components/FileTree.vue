<template>
  <div class="file-tree">
    <div class="tree-header">
      <span class="section-label">Documents</span>
      <button class="add-btn" @click="showNewDoc()" title="New document">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 11-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z"/>
        </svg>
      </button>
    </div>
    <div class="tree-body">
      <TreeNode
        v-for="item in store.files"
        :key="item.path"
        :item="item"
        :depth="0"
      />
      <div v-if="store.files.length === 0" class="empty-hint">
        No documents yet. Create one to get started.
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue'
import { useAppStore } from '../store'
import TreeNode from './TreeNode.vue'

const store = useAppStore()
const showNewDoc = inject('showNewDoc')
</script>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.add-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.tree-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.empty-hint {
  padding: 12px;
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
