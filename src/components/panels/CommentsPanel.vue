<template>
  <div class="comments-panel">
    <div class="panel-header">
      <span>{{ activeComments.length }} comment{{ activeComments.length !== 1 ? 's' : '' }}</span>
      <label class="toggle-label">
        <input type="checkbox" v-model="showResolved" />
        Show resolved
      </label>
    </div>

    <div class="comments-list" v-if="visibleComments.length > 0">
      <div
        v-for="comment in visibleComments"
        :key="comment.id"
        :class="['comment-card', comment.resolved && 'resolved', comment.isAgent && 'agent-comment']"
        @click="highlightAnchor(comment)"
      >
        <div class="comment-header">
          <span :class="['comment-author', comment.isAgent && 'agent-author']">
            {{ comment.isAgent ? `${comment.agentName || 'Agent'} · suggestion` : comment.author }}
          </span>
          <span class="comment-time">{{ formatTime(comment.createdAt) }}</span>
        </div>

        <div v-if="comment.anchor?.quotedText" class="quoted-text">
          "{{ truncate(comment.anchor.quotedText, 80) }}"
        </div>
        <div v-else-if="comment.anchor?.lineNumber" class="line-ref">
          Line {{ comment.anchor.lineNumber }}
        </div>

        <p class="comment-text">{{ comment.text }}</p>

        <div class="comment-actions">
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
      <p class="hint">Select text in the document to add a comment.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '../../store'

const store = useAppStore()
const showResolved = ref(false)

const activeComments = computed(() => store.comments.filter(c => !c.resolved))
const visibleComments = computed(() =>
  showResolved.value ? store.comments : activeComments.value
)

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

function highlightAnchor(comment) {
  // Emit to parent to scroll editor to anchor — simplified for now
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
  cursor: pointer;
  transition: border-color 0.15s;
}

.comment-card:hover { border-color: var(--accent-muted); }
.comment-card.resolved { opacity: 0.5; }

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

.comment-time {
  font-size: 0.75rem;
  color: var(--text-muted);
}

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

/* Agent (AI) comment styling */
.comment-card.agent-comment {
  border-left: 3px solid var(--accent);
}

.comment-card.agent-comment:hover {
  border-color: var(--accent);
}

.agent-author {
  color: var(--accent) !important;
  font-style: italic;
}
</style>
