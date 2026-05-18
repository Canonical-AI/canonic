<template>
  <div class="search-view">
    <div class="search-view-header">
      <div class="header-title">
        <Search :size="16" />
        <h2>Find &amp; Replace</h2>
        <span class="header-subtitle" v-if="store.workspaceName">{{ store.workspaceName }}</span>
      </div>
      <button class="close-btn" @click="close" title="Close (Esc)">
        <X :size="16" />
      </button>
    </div>

    <div class="search-form">
      <div class="form-row">
        <input
          ref="queryEl"
          v-model="store.wsSearch.query"
          class="search-input"
          placeholder="Search"
          @input="onQueryInput"
          @keydown.enter="runSearchNow"
          @keydown.esc="close"
        />
        <div class="toggle-group">
          <button
            class="opt-toggle"
            :class="{ active: store.wsSearch.opts.case }"
            @click="toggleOpt('case')"
            title="Match Case"
          >Aa</button>
          <button
            class="opt-toggle"
            :class="{ active: store.wsSearch.opts.word }"
            @click="toggleOpt('word')"
            title="Match Whole Word"
          >ab|</button>
          <button
            class="opt-toggle"
            :class="{ active: store.wsSearch.opts.regex }"
            @click="toggleOpt('regex')"
            title="Use Regular Expression"
          >.*</button>
        </div>
      </div>

      <div class="form-row">
        <input
          v-model="store.wsSearch.replace"
          class="search-input"
          placeholder="Replace"
          @keydown.enter="onReplaceAll"
        />
        <div class="toggle-group">
          <button class="action-btn" @click="onReplaceNext" :disabled="!canReplace" title="Replace next">
            <Replace :size="14" />
          </button>
          <button class="action-btn action-btn--primary" @click="onReplaceAll" :disabled="!canReplace" title="Replace all">
            <ReplaceAll :size="14" />
            <span>Replace All</span>
          </button>
        </div>
      </div>

      <div class="form-row form-row--filters">
        <input
          v-model="store.wsSearch.include"
          class="filter-input"
          placeholder="files to include (e.g. *.md, docs/**)"
          @input="onQueryInput"
        />
        <input
          v-model="store.wsSearch.exclude"
          class="filter-input"
          placeholder="files to exclude"
          @input="onQueryInput"
        />
        <label class="branches-toggle">
          <input
            type="checkbox"
            v-model="store.wsSearch.allBranches"
            @change="runSearchNow"
          />
          <span>All branches</span>
        </label>
      </div>
    </div>

    <div class="status-line" v-if="hasQuery">
      <span v-if="store.wsSearch.searching" class="status-muted">Searching…</span>
      <span v-else-if="store.wsSearch.lastError" class="status-error">{{ store.wsSearch.lastError }}</span>
      <span v-else>{{ statusText }}</span>
    </div>

    <div class="results-wrap">
      <div class="results" v-if="hasResults">
        <div class="result-group" v-for="group in store.wsSearch.results.branch" :key="'b:' + group.filePath">
          <div class="group-header" @click="toggleCollapsed(group.filePath)">
            <ChevronDown v-if="!isCollapsed(group.filePath)" :size="13" />
            <ChevronRight v-else :size="13" />
            <FileText :size="13" class="file-icon" />
            <span class="group-path">{{ group.filePath }}</span>
            <span class="group-count">{{ group.matches.length }}</span>
          </div>
          <div v-if="!isCollapsed(group.filePath)" class="group-matches">
            <div
              v-for="(m, idx) in group.matches"
              :key="group.filePath + ':' + idx"
              class="match-row"
              @click="openMatch(group.filePath, m)"
            >
              <span class="line-num">{{ m.line }}</span>
              <span class="line-text" v-html="renderHighlight(m)"></span>
            </div>
          </div>
        </div>

        <div v-if="store.wsSearch.results.other && store.wsSearch.results.other.length" class="result-group other-group">
          <div class="group-header other-header" @click="otherCollapsed = !otherCollapsed">
            <ChevronDown v-if="!otherCollapsed" :size="13" />
            <ChevronRight v-else :size="13" />
            <GitBranch :size="13" class="file-icon" />
            <span class="group-path">Other branches</span>
            <span class="group-count">{{ otherTotal }}</span>
          </div>
          <div v-if="!otherCollapsed" class="group-matches">
            <div v-for="group in store.wsSearch.results.other" :key="'o:' + group.branch + ':' + group.filePath" class="other-file">
              <div class="other-file-header">
                <span class="other-branch-pill">{{ group.branch }}</span>
                <span>{{ group.filePath }}</span>
              </div>
              <div
                v-for="(m, idx) in group.matches"
                :key="group.branch + ':' + group.filePath + ':' + idx"
                class="match-row match-row--readonly"
              >
                <span class="line-num">{{ m.line }}</span>
                <span class="line-text" v-html="renderHighlight(m)"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="hasQuery && !store.wsSearch.searching && !store.wsSearch.lastError" class="empty-results">
        <p>No results for "{{ store.wsSearch.query }}"</p>
      </div>

      <div v-else-if="!hasQuery" class="placeholder">
        <Search :size="32" class="placeholder-icon" />
        <p>Type to search across the workspace.</p>
        <p class="placeholder-hint">
          <kbd>{{ shortcutLabel }}</kbd> to toggle this view from anywhere.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, reactive } from 'vue'
import { useAppStore } from '../../store'
import { ChevronDown, ChevronRight, Replace, ReplaceAll, Search, X, FileText, GitBranch } from 'lucide-vue-next'

const store = useAppStore()
const queryEl = ref(null)
const collapsedFiles = reactive(new Set())
const otherCollapsed = ref(true)

let debounceTimer = null

const hasQuery = computed(() => !!(store.wsSearch.query || '').trim())
const hasResults = computed(() => (store.wsSearch.results.branch || []).length > 0)
const otherTotal = computed(() => (store.wsSearch.results.other || []).reduce((n, g) => n + g.matches.length, 0))
const branchTotal = computed(() => (store.wsSearch.results.branch || []).reduce((n, g) => n + g.matches.length, 0))
const branchFileCount = computed(() => (store.wsSearch.results.branch || []).length)

const canReplace = computed(() => hasQuery.value && !store.isDemoMode && hasResults.value)

const statusText = computed(() => {
  const n = branchTotal.value
  const m = branchFileCount.value
  const k = otherTotal.value
  let s = `${n} match${n === 1 ? '' : 'es'} in ${m} file${m === 1 ? '' : 's'}`
  if (k > 0) s += ` · ${k} on other branches`
  return s
})

const shortcutLabel = computed(() => {
  const hk = store.findHotkeys?.findInWorkspace || 'Mod-Shift-f'
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
  return hk
    .replace(/Mod/i, isMac ? '⌘' : 'Ctrl')
    .replace(/Shift/i, isMac ? '⇧' : 'Shift')
    .replace(/Alt/i, isMac ? '⌥' : 'Alt')
    .replace(/-/g, isMac ? '' : '+')
})

function onQueryInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => store.runWorkspaceSearch(), 200)
}

function runSearchNow() {
  clearTimeout(debounceTimer)
  store.runWorkspaceSearch()
}

function toggleOpt(key) {
  store.wsSearch.opts[key] = !store.wsSearch.opts[key]
  runSearchNow()
}

function isCollapsed(filePath) { return collapsedFiles.has(filePath) }
function toggleCollapsed(filePath) {
  if (collapsedFiles.has(filePath)) collapsedFiles.delete(filePath)
  else collapsedFiles.add(filePath)
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function renderHighlight(m) {
  const text = m.text || ''
  const before = escapeHtml(text.slice(0, m.col))
  const hit = escapeHtml(text.slice(m.col, m.col + m.length))
  const after = escapeHtml(text.slice(m.col + m.length))
  return `${before}<mark>${hit}</mark>${after}`
}

function openMatch(filePath, m) {
  store.openWorkspaceSearchResult({ filePath, line: m.line })
  close()
}

async function onReplaceNext() { await store.replaceNextInWorkspace() }
async function onReplaceAll() { await store.replaceAllInWorkspace() }

function close() {
  store.searchViewOpen = false
}

function focusInput() {
  nextTick(() => {
    queryEl.value?.focus()
    queryEl.value?.select()
  })
}

defineExpose({ focusInput })

onMounted(() => focusInput())
</script>

<style scoped>
.search-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  background: var(--bg-primary, var(--bg));
}

.search-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}

.header-title h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.header-subtitle {
  margin-left: 6px;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.search-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle, transparent);
}

.form-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
  background: var(--bg-input, var(--bg-hover));
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  color: var(--text-primary);
  font-size: 0.875rem;
  padding: 7px 10px;
  max-width: 720px;
}

.search-input:focus { border-color: var(--accent, #6495ed); }

.toggle-group {
  display: flex;
  gap: 4px;
  align-items: center;
}

.opt-toggle, .action-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 5px 9px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.78rem;
  min-width: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.opt-toggle:hover, .action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.opt-toggle.active {
  background: var(--accent-muted, rgba(100, 149, 237, 0.2));
  color: var(--accent, #6495ed);
  border-color: var(--accent-muted, rgba(100, 149, 237, 0.4));
}

.action-btn:disabled { opacity: 0.4; cursor: default; }

.action-btn--primary {
  padding: 5px 12px;
  font-weight: 500;
}

.filter-input {
  flex: 1;
  background: var(--bg-input, var(--bg-hover));
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  color: var(--text-primary);
  font-size: 0.8rem;
  padding: 6px 9px;
  max-width: 320px;
}

.form-row--filters { flex-wrap: wrap; }

.branches-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  margin-left: auto;
}

.status-line {
  padding: 8px 24px;
  font-size: 0.78rem;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

.status-error { color: #e88; }
.status-muted { color: var(--text-muted); opacity: 0.8; }

.results-wrap {
  flex: 1;
  overflow-y: auto;
}

.results {
  padding: 8px 0 24px;
}

.result-group { margin-bottom: 6px; }

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 24px;
  font-size: 0.85rem;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}

.group-header:hover { background: var(--bg-hover); }

.file-icon { color: var(--text-muted); }

.group-path { flex: 1; }
.group-count {
  color: var(--text-muted);
  font-size: 0.75rem;
  background: var(--bg-hover);
  padding: 1px 8px;
  border-radius: 10px;
}

.group-matches { padding: 0; }

.match-row {
  display: flex;
  gap: 12px;
  padding: 3px 24px 3px 48px;
  font-size: 0.82rem;
  color: var(--text-muted);
  cursor: pointer;
  align-items: baseline;
}

.match-row:hover { background: var(--bg-hover); }
.match-row--readonly { cursor: default; opacity: 0.7; }

.line-num {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  opacity: 0.5;
  min-width: 36px;
  text-align: right;
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
}

.line-text {
  flex: 1;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  color: var(--text-primary);
}

.line-text :deep(mark) {
  background: rgba(250, 204, 21, 0.4);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 2px;
  font-weight: 500;
}

.other-header { color: var(--text-muted); }

.other-file {
  padding-bottom: 4px;
}

.other-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--text-muted);
  padding: 4px 24px 2px 48px;
}

.other-branch-pill {
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  font-size: 0.7rem;
  color: var(--text-primary);
}

.empty-results, .placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  color: var(--text-muted);
  text-align: center;
  gap: 8px;
}

.placeholder-icon { opacity: 0.3; margin-bottom: 8px; }
.placeholder-hint { font-size: 0.8rem; margin-top: 4px; }
.placeholder-hint kbd {
  background: var(--bg-hover);
  border: 1px solid var(--border);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: inherit;
  font-size: 0.78rem;
  color: var(--text-primary);
}
</style>
