<template>
  <div class="search-panel">
    <div class="search-input-row">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.749.749 0 11-1.06 1.06l-3.04-3.04zm-5.42-1.617a4.5 4.5 0 006.344-6.344 4.5 4.5 0 00-6.344 6.344z"/>
      </svg>
      <input
        v-model="query"
        class="search-input"
        placeholder="Search documents…"
        @input="onInput"
      />
    </div>

    <div class="results" v-if="query.trim()">
      <div v-if="results.length === 0 && !searching" class="no-results">
        No results for "{{ query }}"
      </div>

      <div
        v-for="result in results"
        :key="result.filePath + result.workspace"
        class="result-item"
        @click="openResult(result)"
      >
        <div class="result-header">
          <span class="result-title">{{ result.title }}</span>
          <span v-if="!result.isOwn" class="result-badge">shared</span>
        </div>
        <p class="result-excerpt" v-html="result.excerpt" />
      </div>
    </div>

    <div v-else class="search-hint">
      <p>Search across your documents and documents shared with you.</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '../store'

const store = useAppStore()
const query = ref('')
const results = ref([])
const searching = ref(false)
let searchTimer = null

function onInput() {
  clearTimeout(searchTimer)
  if (!query.value.trim()) { results.value = []; return }
  searching.value = true
  searchTimer = setTimeout(async () => {
    results.value = await store.searchDocs(query.value)
    searching.value = false
  }, 200)
}

async function openResult(result) {
  if (result.isOwn) {
    await store.openFile(result.filePath)
    store.sidebarTab = 'files'
  }
  // For shared docs, could open a read-only view
}
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.search-icon { color: var(--text-muted); flex-shrink: 0; }

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.8375rem;
}

.search-input::placeholder { color: var(--text-muted); }

.results {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.no-results {
  padding: 16px 12px;
  font-size: 0.8125rem;
  color: var(--text-muted);
  text-align: center;
}

.result-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
  margin-bottom: 2px;
}

.result-item:hover { background: var(--bg-hover); }

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.result-title {
  font-size: 0.8375rem;
  font-weight: 500;
  color: var(--text-primary);
}

.result-badge {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--bg-hover);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.result-excerpt {
  font-size: 0.775rem;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.result-excerpt :deep(mark) {
  background: var(--accent-muted);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 1px;
}

.search-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.6;
}
</style>
