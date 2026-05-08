<template>
  <div class="comments-panel">
    <div class="panel-header">
      <span>{{ visibleComments.length }} comment{{ visibleComments.length !== 1 ? 's' : '' }}</span>
      <label v-if="!isPeerMode" class="toggle-label">
        <input type="checkbox" v-model="showResolved" />
        Show resolved
      </label>
      <span v-else class="peer-mode-label">{{ store.peerFileContent.peer.name }}'s doc</span>
    </div>

    <div class="comments-list" v-if="visibleComments.length > 0">
      <div
        v-for="comment in visibleComments"
        :key="comment.id"
        :class="['comment-card',
          comment.resolved && 'resolved',
          comment.isAgent && 'agent-comment',
          comment.pending && 'pending-comment',
          comment.isOwn && 'own-comment',
          comment.private && 'private-comment'
        ]"
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
import { ref, computed } from 'vue'
import { useAppStore } from '../../store'

const store = useAppStore()
const showResolved = ref(false)

const isPeerMode = computed(() => !!store.peerFileContent)

const visibleComments = computed(() => {
  if (isPeerMode.value) {
    return store.peerFileComments
  }
  const active = store.comments.filter(c => !c.resolved)
  return showResolved.value ? store.comments : active
})

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
