<template>
  <div class="history-panel">

    <!-- Commit form -->
    <div class="commit-form">
      <input
        v-model="commitMsg"
        class="commit-input"
        placeholder="Describe this checkpoint…"
        @keydown.enter="commit"
        :disabled="committing"
      />
      <button class="commit-btn" @click="commit" :disabled="!commitMsg.trim() || committing">
        {{ committing ? '…' : 'Save checkpoint' }}
      </button>
      <p v-if="commitSuccess" class="commit-success">✓ Saved</p>
      <p v-if="commitError" class="commit-error">{{ commitError }}</p>
    </div>

    <!-- Named versions -->
    <div v-if="store.docVersions.length" class="versions-section">
      <div class="section-label">
        <Tag :size="11" />
        Versions
      </div>
      <div
        v-for="v in store.docVersions"
        :key="v.name"
        class="version-item"
      >
        <div class="version-info">
          <span class="version-name">{{ v.name }}</span>
          <span v-if="v.message" class="version-note">{{ v.message }}</span>
          <div class="version-meta">
            <code class="version-oid">{{ v.oid.slice(0, 7) }}</code>
            <span class="version-time">{{ formatTime(v.createdAt) }}</span>
          </div>
        </div>
        <div class="version-actions">
          <button class="v-btn" @click="restore(v)" title="Restore this version">Restore</button>
          <button class="v-btn v-btn-danger" @click="deleteVersion(v.name)" title="Delete version">✕</button>
        </div>
      </div>
    </div>

    <!-- Commit history -->
    <div class="section-label commits-label" v-if="store.commitLog.length || store.docVersions.length || store.isDirty || store.fileIsUncommitted">
      <GitCommitHorizontal :size="11" />
      History
    </div>

    <div class="history-list" v-if="store.commitLog.length > 0 || store.isDirty || store.fileIsUncommitted">

      <!-- Unsaved changes row -->
      <div v-if="store.isDirty" class="pending-item pending-unsaved">
        <div class="pending-line" />
        <div class="pending-dot unsaved-dot" />
        <div class="pending-info">
          <span class="pending-label">Unsaved changes</span>
          <span class="pending-hint">Not written to disk yet</span>
        </div>
      </div>

      <!-- Uncommitted changes row -->
      <div v-else-if="store.fileIsUncommitted" class="pending-item pending-uncommitted">
        <div class="pending-line" />
        <div class="pending-dot uncommitted-dot" />
        <div class="pending-info">
          <span class="pending-label">Uncommitted changes</span>
          <span class="pending-hint">Saved but not checkpointed</span>
        </div>
      </div>

      <!-- Commit entries -->
      <div
        v-for="(commit, idx) in store.commitLog"
        :key="commit.oid"
      >
        <!-- Branch tip badge row -->
        <div
          v-if="commit.branchTips && commit.branchTips.length"
          class="branch-tip-row"
        >
          <span
            v-for="b in commit.branchTips"
            :key="b"
            class="branch-badge"
            :class="b === 'main' ? 'branch-badge-main' : 'branch-badge-draft'"
          >
            <GitBranch :size="9" />
            {{ b }}
          </span>
        </div>

        <!-- Merge commit -->
        <div
          v-if="commit.isMerge"
          class="merge-item"
          @click="viewCommit(commit)"
          :class="{ viewing: viewingOid === commit.oid }"
        >
          <div class="merge-icon-wrap">
            <GitMerge :size="12" class="merge-icon" />
          </div>
          <div class="commit-info">
            <p class="commit-message merge-message">{{ commit.message }}</p>
            <div class="commit-meta">
              <span class="commit-author">{{ commit.author }}</span>
              <span class="commit-time">{{ formatTime(commit.timestamp) }}</span>
            </div>
          </div>
        </div>

        <!-- Regular commit -->
        <div v-else>
          <div
            class="commit-item"
            @click="viewCommit(commit)"
            :class="{ viewing: viewingOid === commit.oid }"
          >
            <div class="commit-line" :class="idx === store.commitLog.length - 1 && 'last'" />
            <div class="commit-dot" />
            <div class="commit-info">
              <p class="commit-message">{{ commit.message }}</p>
              <div class="commit-meta">
                <span class="commit-author">{{ commit.author }}</span>
                <span class="commit-time">{{ formatTime(commit.timestamp) }}</span>
              </div>
              <div class="commit-footer">
                <code class="commit-oid">{{ commit.oid.slice(0, 7) }}</code>
                <span
                  v-if="versionsByOid[commit.oid]"
                  class="commit-version-badge"
                  :title="versionsByOid[commit.oid].message"
                >{{ versionsByOid[commit.oid].name }}</span>
                <span
                  v-if="statsByOid[commit.oid]"
                  class="commit-stats"
                  :title="`${statsByOid[commit.oid].added} added, ${statsByOid[commit.oid].removed} removed`"
                >
                  <span class="stat-add">+{{ statsByOid[commit.oid].added }}</span>
                  <span class="stat-del">-{{ statsByOid[commit.oid].removed }}</span>
                </span>
                <span v-if="loadingOid === commit.oid" class="diff-loading">loading…</span>
              </div>
            </div>
          </div>

          <!-- Inline diff -->
          <div v-if="viewingOid === commit.oid && diffsByOid[commit.oid]" class="inline-diff">
            <div
              v-for="(line, li) in diffsByOid[commit.oid].split('\n')"
              :key="li"
              class="diff-line"
              :class="line.startsWith('+ ') ? 'diff-add' : line.startsWith('- ') ? 'diff-del' : line === '  ···' ? 'diff-sep' : ''"
            >{{ line }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!store.docVersions.length" class="empty-history">
      <p>No commits yet.</p>
      <p class="hint">Use the commit button to save checkpoints in your document's history.</p>
    </div>

    <!-- Restore confirm -->
    <div v-if="restoreConfirm" class="restore-overlay">
      <div class="restore-box">
        <p>Restore <strong>{{ restoreConfirm.name }}</strong>?</p>
        <p class="restore-hint">This will load the document content from that version. Unsaved changes will be lost.</p>
        <div class="restore-actions">
          <button class="btn-ghost" @click="restoreConfirm = null">Cancel</button>
          <button class="btn-restore" @click="confirmRestore">Restore</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAppStore } from '../../store'
import { Tag, GitCommitHorizontal, GitBranch, GitMerge } from 'lucide-vue-next'
import { generateDiff, countDiff } from '../../utils/diff.js'

const store = useAppStore()
const viewingOid = ref(null)
const diffsByOid = ref({})
const statsByOid = ref({})
const loadingOid = ref(null)
const restoreConfirm = ref(null)

const commitMsg = ref('')
const committing = ref(false)
const commitSuccess = ref(false)
const commitError = ref('')

async function commit() {
  if (!commitMsg.value.trim() || committing.value) return
  if (store.isDirty) {
    await window.canonic.files.write(store.workspacePath, store.currentFile, store.currentContent)
    store.isDirty = false
  }
  committing.value = true
  commitError.value = ''
  commitSuccess.value = false
  const result = await store.commitFile(commitMsg.value.trim())
  committing.value = false
  if (result?.success) {
    commitMsg.value = ''
    commitSuccess.value = true
    setTimeout(() => { commitSuccess.value = false }, 2000)
  } else {
    commitError.value = result?.error || 'Commit failed'
  }
}

watch(() => store.currentFile, () => {
  viewingOid.value = null
  diffsByOid.value = {}
  statsByOid.value = {}
  loadingOid.value = null
  restoreConfirm.value = null
  commitMsg.value = ''
  commitError.value = ''
  commitSuccess.value = false
})

const versionsByOid = computed(() => {
  const map = {}
  for (const v of store.docVersions) {
    if (!map[v.oid]) map[v.oid] = v
  }
  return map
})

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function viewCommit(commit) {
  if (viewingOid.value === commit.oid) {
    viewingOid.value = null
    return
  }
  viewingOid.value = commit.oid
  if (diffsByOid.value[commit.oid]) return // already loaded
  loadingOid.value = commit.oid
  try {
    const gitApi = window.canonic.git
    if (!gitApi.commitDiff) {
      diffsByOid.value[commit.oid] = '(diff bridge missing — fully quit and re-run `npm run dev`)'
      return
    }
    const result = await gitApi.commitDiff(
      store.workspacePath,
      store.currentFile,
      commit.oid,
    )
    if (result) {
      diffsByOid.value[commit.oid] = generateDiff(result.before, result.after)
      statsByOid.value[commit.oid] = countDiff(result.before, result.after)
    } else {
      diffsByOid.value[commit.oid] = '(no changes)'
    }
  } catch (err) {
    console.error('viewCommit failed:', err)
    diffsByOid.value[commit.oid] = `(diff error: ${err.message})`
  } finally {
    loadingOid.value = null
  }
}

function restore(version) {
  restoreConfirm.value = version
}

async function confirmRestore() {
  if (!restoreConfirm.value) return
  await store.restoreDocVersion(restoreConfirm.value.oid)
  restoreConfirm.value = null
}

async function deleteVersion(name) {
  await store.deleteDocVersion(name)
}
</script>

<style scoped>
.history-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.commit-form {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.commit-input {
  width: 100%;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--text-primary);
  font-size: 0.8125rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.commit-input:focus { border-color: var(--accent-muted); }
.commit-input::placeholder { color: var(--text-muted); }
.commit-input:disabled { opacity: 0.5; }

.commit-btn {
  width: 100%;
  padding: 6px 0;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.commit-btn:hover:not(:disabled) { opacity: 0.85; }
.commit-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.commit-success { font-size: 0.775rem; color: var(--success); margin: 0; }
.commit-error { font-size: 0.775rem; color: var(--error); margin: 0; }

.section-label {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  flex-shrink: 0;
}

.commits-label { padding-top: 10px; border-top: 1px solid var(--border); }

/* Versions */
.versions-section {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}

.version-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 12px;
  transition: background 0.12s;
}

.version-item:hover { background: var(--bg-hover); }
.version-info { flex: 1; min-width: 0; }

.version-name {
  display: inline-block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 7px;
  margin-bottom: 3px;
}

.version-note {
  display: block;
  font-size: 0.775rem;
  color: var(--text-secondary);
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.version-meta { display: flex; gap: 6px; align-items: center; }

.version-oid {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--accent);
  background: var(--bg-surface);
  padding: 1px 4px;
  border-radius: 3px;
}

.version-time { font-size: 0.7rem; color: var(--text-muted); }

.version-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s;
}

.version-item:hover .version-actions { opacity: 1; }

.v-btn {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.v-btn:hover { background: var(--bg-active); color: var(--text-primary); }
.v-btn-danger:hover { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }

/* History list */
.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 8px 12px;
}

/* Pending (unsaved/uncommitted) rows */
.pending-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px 10px;
  position: relative;
}

.pending-line {
  position: absolute;
  left: 15px;
  top: 20px;
  bottom: -4px;
  width: 1px;
  background: var(--border);
}

.pending-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid;
}

.unsaved-dot { border-color: #f59e0b; background: rgba(245,158,11,0.2); }
.uncommitted-dot { border-color: var(--accent-muted); background: rgba(74,122,155,0.15); }

.pending-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pending-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.pending-hint {
  font-size: 0.725rem;
  color: var(--text-muted);
}

/* Branch tip badges */
.branch-tip-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px 4px 2px;
}

.branch-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.7rem;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 10px;
  border: 1px solid;
}

.branch-badge-main {
  color: #34d399;
  background: rgba(52,211,153,0.1);
  border-color: rgba(52,211,153,0.3);
}

.branch-badge-draft {
  color: var(--accent);
  background: rgba(74,122,155,0.12);
  border-color: var(--accent-muted);
}

/* Regular commits */
.commit-item {
  display: flex;
  gap: 10px;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.commit-item:hover { background: var(--bg-hover); }
.commit-item.viewing { background: var(--bg-active); }

.commit-line {
  position: absolute;
  left: 11px;
  top: 18px;
  bottom: -6px;
  width: 1px;
  background: var(--border);
}

.commit-line.last { display: none; }

.commit-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: 5px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.commit-info { flex: 1; min-width: 0; }

.commit-message {
  font-size: 0.8375rem;
  color: var(--text-primary);
  margin: 0 0 3px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-meta {
  display: flex;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 3px;
}

.commit-footer { display: flex; align-items: center; gap: 6px; }

.commit-oid {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 1px 4px;
  border-radius: 3px;
}

.commit-version-badge {
  font-size: 0.7rem;
  background: rgba(74, 122, 155, 0.2);
  color: var(--accent);
  border: 1px solid var(--accent-muted);
  padding: 1px 6px;
  border-radius: 10px;
}

.commit-stats {
  display: inline-flex;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
}

.stat-add { color: #34d399; }
.stat-del { color: #f87171; }

/* Merge commits */
.merge-item {
  display: flex;
  gap: 10px;
  padding: 5px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  opacity: 0.75;
}

.merge-item:hover { background: var(--bg-hover); opacity: 1; }
.merge-item.viewing { background: var(--bg-active); opacity: 1; }

.merge-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  margin-top: 4px;
  flex-shrink: 0;
}

.merge-icon { color: #a78bfa; }

.merge-message {
  font-size: 0.775rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0 0 2px;
  font-weight: 400;
}

.empty-history {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 0.875rem;
  gap: 4px;
}

.hint { font-size: 0.8rem; opacity: 0.7; }

/* Inline diff */
.inline-diff {
  margin: 0 4px 6px 22px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  overflow: hidden;
  max-height: 280px;
  overflow-y: auto;
  padding: 6px 0;
}

.diff-line {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  line-height: 1.6;
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-muted);
}

.diff-add { background: rgba(52, 211, 153, 0.08); color: #34d399; }
.diff-del { background: rgba(248, 113, 113, 0.08); color: #f87171; }
.diff-sep { color: var(--text-muted); opacity: 0.5; text-align: center; letter-spacing: 0.1em; }

.diff-loading {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-style: italic;
  margin-left: 4px;
}

/* Restore confirm overlay */
.restore-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 10;
}

.restore-box {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  width: 100%;
  max-width: 260px;
}

.restore-box p {
  font-size: 0.875rem;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.restore-hint {
  font-size: 0.775rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.restore-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.btn-ghost {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
}

.btn-ghost:hover { background: var(--bg-hover); }

.btn-restore {
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-restore:hover { opacity: 0.85; }
</style>
