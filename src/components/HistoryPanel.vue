<template>
  <div class="history-panel">
    <div class="history-list" v-if="store.commitLog.length > 0">
      <div
        v-for="commit in store.commitLog"
        :key="commit.oid"
        class="commit-item"
        @click="viewCommit(commit)"
        :class="{ viewing: viewingOid === commit.oid }"
      >
        <div class="commit-dot" />
        <div class="commit-info">
          <p class="commit-message">{{ commit.message }}</p>
          <div class="commit-meta">
            <span class="commit-author">{{ commit.author }}</span>
            <span class="commit-time">{{ formatTime(commit.timestamp) }}</span>
          </div>
          <code class="commit-oid">{{ commit.oid.slice(0, 7) }}</code>
        </div>
      </div>
    </div>

    <div v-else class="empty-history">
      <p>No commits yet.</p>
      <p class="hint">Use the commit button to save checkpoints in your document's history.</p>
    </div>

    <!-- Diff view -->
    <div v-if="diffContent" class="diff-view">
      <div class="diff-header">
        <span>Changes since {{ viewingOid?.slice(0, 7) }}</span>
        <button class="close-btn" @click="diffContent = null">✕</button>
      </div>
      <pre class="diff-content">{{ diffContent }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '../store'

const store = useAppStore()
const viewingOid = ref(null)
const diffContent = ref(null)

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function viewCommit(commit) {
  if (viewingOid.value === commit.oid) {
    viewingOid.value = null
    diffContent.value = null
    return
  }
  viewingOid.value = commit.oid
  const result = await window.canonic.git.diff(store.workspacePath, store.currentFile, commit.oid)
  if (result) {
    diffContent.value = generateDiff(result.before, result.after)
  }
}

function generateDiff(before, after) {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const lines = []

  const maxLen = Math.max(beforeLines.length, afterLines.length)
  for (let i = 0; i < maxLen; i++) {
    const b = beforeLines[i]
    const a = afterLines[i]
    if (b === a) {
      lines.push('  ' + (b ?? ''))
    } else {
      if (b !== undefined) lines.push('- ' + b)
      if (a !== undefined) lines.push('+ ' + a)
    }
  }
  return lines.join('\n')
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

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.commit-item {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.commit-item:hover { background: var(--bg-hover); }
.commit-item.viewing { background: var(--bg-active); }

.commit-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: 5px;
  flex-shrink: 0;
}

.commit-info { flex: 1; }

.commit-message {
  font-size: 0.8375rem;
  color: var(--text-primary);
  margin: 0 0 4px;
  font-weight: 500;
}

.commit-meta {
  display: flex;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.commit-oid {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 1px 4px;
  border-radius: 3px;
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

.diff-view {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-base);
  border-top: 1px solid var(--border);
  max-height: 50%;
  display: flex;
  flex-direction: column;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 0.8rem;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.875rem;
}

.diff-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
