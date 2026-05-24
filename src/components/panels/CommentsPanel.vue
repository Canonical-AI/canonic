<template>
  <div class="comments-panel">
    <div class="panel-header">
      <span>{{ visibleComments.length }} comment{{ visibleComments.length !== 1 ? 's' : '' }}</span>
      <div v-if="!isPeerMode" class="header-actions">
        <button
          v-if="agentCommentCount > 0"
          class="clear-agents"
          :title="`Delete all ${agentCommentCount} AI comment${agentCommentCount !== 1 ? 's' : ''}`"
          @click="clearAgentComments"
        >
          Clear AI ({{ agentCommentCount }})
        </button>
        <label class="toggle-label">
          <input type="checkbox" v-model="showResolved" />
          Show resolved
        </label>
      </div>
      <span v-else class="peer-mode-label">{{ store.peerFileContent.peer.name }}'s doc</span>
    </div>

    <div class="comments-list" v-if="visibleComments.length > 0" ref="listEl">
      <div
        v-for="comment in visibleComments"
        :key="comment.id"
        :data-comment-id="comment.id"
        :class="['comment-card',
          comment.resolved && 'resolved',
          comment.isAgent && 'agent-comment',
          comment.pending && 'pending-comment',
          comment.isOwn && 'own-comment',
          comment.private && 'private-comment',
          store.activeCommentId === comment.id && 'active-comment'
        ]"
        @click="store.setActiveComment(comment.id)"
      >
        <div class="comment-header">
          <span :class="['comment-author', comment.isAgent && 'agent-author']">
            {{ comment.isAgent ? `${comment.agentName || 'Agent'} · suggestion` : comment.author }}
          </span>
          <span class="comment-meta">
            <span v-if="comment.private" class="sync-status private">🔒 private</span>
            <span v-else-if="comment.pending" class="sync-status pending">⏳ pending</span>
            <span v-else-if="comment.synced === false" class="sync-status pending">⏳ pending</span>
            <span v-else-if="comment.synced === true" class="sync-status sent">✓ sent</span>
            <span v-else class="comment-time">{{ formatTime(comment.createdAt) }}</span>
          </span>
        </div>

        <div v-if="comment.anchor?.quotedText" class="quoted-text">
          "{{ truncate(comment.anchor.quotedText, 80) }}"
        </div>
        <div v-else-if="comment.anchor?.lineNumber" class="line-ref">
          Line {{ comment.anchor.lineNumber }}
        </div>

        <p class="comment-text">{{ comment.text }}</p>

        <div v-if="!isPeerMode" class="comment-actions">
          <button v-if="!comment.resolved" class="action-link" @click.stop="store.resolveComment(comment.id)">
            Resolve
          </button>
          <button class="action-link danger" @click.stop="store.deleteComment(comment.id)">
            Delete
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty-comments">
      <p>No comments yet.</p>
      <p class="hint">
        {{ isPeerMode ? 'Select text in the document to leave a comment.' : 'Select text in the document to add a comment.' }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useAppStore } from '../../store'

const store = useAppStore()
const showResolved = ref(false)
const listEl = ref(null)

// When activeCommentId changes (e.g. user clicked a mark in the viewer),
// scroll the matching card into view in the sidebar.
watch(() => store.activeCommentId, async (id) => {
  if (!id || !listEl.value) return
  await nextTick()
  const el = listEl.value.querySelector(`[data-comment-id="${id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})

const isPeerMode = computed(() => !!store.peerFileContent)

const visibleComments = computed(() => {
  if (isPeerMode.value) {
    return store.peerFileComments
  }
  const active = store.comments.filter(c => !c.resolved)
  return showResolved.value ? store.comments : active
})

const agentCommentCount = computed(() =>
  store.comments.filter(c => c.isAgent).length
)

async function clearAgentComments() {
  if (agentCommentCount.value === 0) return
  const count = agentCommentCount.value
  const ok = await store.confirm({
    title: `Delete ${count} AI comment${count !== 1 ? 's' : ''}?`,
    message: 'This will remove every AI-suggested comment on this document. Human comments stay. This cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    danger: true,
  })
  if (!ok) return
  await store.deleteAgentComments()
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString()
}

function truncate(text, len) {
  return text.length > len ? text.slice(0, len) + '…' : text
}
</script>

<style scoped>
.comments-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 0.8rem;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 0.75rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.clear-agents {
  font-size: 0.7rem;
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.clear-agents:hover {
  color: var(--error);
  border-color: var(--error);
}

.peer-mode-label {
  font-size: 0.75rem;
  color: var(--accent);
}

.comments-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comment-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  transition: border-color 0.15s;
}

.comment-card:hover { border-color: var(--accent-muted); }
.comment-card.resolved { opacity: 0.5; }

.comment-card.own-comment {
  border-left: 3px solid var(--accent);
}

.comment-card.private-comment {
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 4%, var(--bg-surface));
}

.comment-card.active-comment {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
}

.comment-card { cursor: pointer; }

.comment-card.pending-comment {
  opacity: 0.7;
}

.comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.comment-author {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-primary);
}

.comment-meta {
  display: flex;
  align-items: center;
}

.comment-time {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.sync-status {
  font-size: 0.7rem;
}
.sync-status.pending { color: var(--text-muted); }
.sync-status.sent { color: var(--success, #22c55e); }
.sync-status.private { color: var(--accent); }

.quoted-text {
  font-size: 0.8rem;
  color: var(--accent);
  font-style: italic;
  margin-bottom: 6px;
  padding: 4px 8px;
  background: var(--bg-hover);
  border-radius: 4px;
  border-left: 2px solid var(--accent);
}

.line-ref {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 6px;
}

.comment-text {
  font-size: 0.8375rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0 0 8px;
}

.comment-actions {
  display: flex;
  gap: 12px;
}

.action-link {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
}

.action-link:hover { color: var(--text-primary); }
.action-link.danger:hover { color: var(--error); }

.empty-comments {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
  padding: 24px;
  gap: 4px;
}

.hint { font-size: 0.8rem; color: var(--text-muted); opacity: 0.7; }

.comment-card.agent-comment { border-left: 3px solid var(--accent); }
.comment-card.agent-comment:hover { border-color: var(--accent); }
.agent-author { color: var(--accent) !important; font-style: italic; }
</style>
