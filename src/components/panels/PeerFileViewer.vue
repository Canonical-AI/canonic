<template>
  <div class="peer-viewer">
    <!-- Header bar -->
    <div class="viewer-header">
      <div class="viewer-meta">
        <div class="peer-avatar">{{ initials(peer.name) }}</div>
        <div class="viewer-doc-info">
          <span class="doc-name">{{ basename(relPath) }}</span>
          <span class="peer-name">{{ peer.name }}<span v-if="peer.role"> · {{ peer.role }}</span></span>
        </div>
        <span class="perm-badge" :class="permission">
          <component :is="permIcon" :size="11" />
          {{ permLabel }}
        </span>
      </div>
      <div class="viewer-actions">
        <button
          v-if="permission === 'copy'"
          class="btn-action"
          @click="copyToWorkspace"
        >
          Copy to workspace
        </button>
        <button class="btn-close" @click="store.openPeerFile(null)" title="Close">
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- Document body -->
    <div class="viewer-body">
      <div class="viewer-prose" v-html="renderedContent" />
    </div>

    <!-- Comment bar (comment or copy permission) -->
    <div v-if="permission === 'comment' || permission === 'copy'" class="comment-bar">
      <div v-if="submittedComment" class="comment-sent">
        <MessageSquare :size="13" /> Comment sent to {{ peer.name }}
      </div>
      <template v-else>
        <textarea
          v-model="commentText"
          class="comment-input"
          :placeholder="`Leave a comment for ${peer.name}…`"
          rows="2"
        />
        <button
          class="btn-send"
          :disabled="!commentText.trim()"
          @click="sendComment"
        >
          Send
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { marked } from 'marked'
import { useAppStore } from '../../store'
import { Lock, Eye, MessageSquare, Copy, X } from 'lucide-vue-next'

const store = useAppStore()

const peer = computed(() => store.peerFileContent?.peer ?? {})
const relPath = computed(() => store.peerFileContent?.relPath ?? '')
const content = computed(() => store.peerFileContent?.content ?? '')
const permission = computed(() => store.peerFileContent?.peer?.permission ?? 'view')

const permLabel = computed(() => ({ view: 'read-only', comment: 'can comment', copy: 'can copy' }[permission.value] ?? 'read-only'))
const permIcon = computed(() => ({ view: Eye, comment: MessageSquare, copy: Copy }[permission.value] ?? Lock))

const commentText = ref('')
const submittedComment = ref(false)

const renderedContent = computed(() => {
  try {
    return marked.parse(content.value)
  } catch {
    return `<pre>${content.value}</pre>`
  }
})

function initials(name) {
  return (name || '?').split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function basename(path) {
  return (path || '').split('/').pop()
}

async function copyToWorkspace() {
  await store.copyPeerFileToWorkspace({ relPath: relPath.value, content: content.value })
  store.openPeerFile(null)
}

function sendComment() {
  if (!commentText.value.trim()) return
  // In demo mode / live mode this would POST to the peer's share server.
  // For now, show a confirmation.
  submittedComment.value = true
}
</script>

<style scoped>
.peer-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.viewer-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.peer-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  flex-shrink: 0;
}

.viewer-doc-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.doc-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.peer-name {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.perm-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  font-size: 0.6875rem;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}
.perm-badge.comment {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.perm-badge.copy {
  color: #22c55e;
  border-color: color-mix(in srgb, #22c55e 40%, transparent);
  background: color-mix(in srgb, #22c55e 8%, transparent);
}

.viewer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-action {
  padding: 5px 12px;
  border-radius: 7px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.8125rem;
  cursor: pointer;
}
.btn-action:hover { opacity: 0.85; }

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.btn-close:hover { background: var(--bg-hover); color: var(--text-primary); }

.viewer-body {
  flex: 1;
  overflow-y: auto;
  padding: 40px 60px;
}

.viewer-prose {
  max-width: 680px;
  margin: 0 auto;
  color: var(--text-primary);
  line-height: 1.7;
  font-size: 0.9375rem;
}

/* Markdown typography */
.viewer-prose :deep(h1) { font-size: 1.75rem; font-weight: 700; margin: 0 0 8px; color: var(--text-primary); }
.viewer-prose :deep(h2) { font-size: 1.2rem; font-weight: 600; margin: 2rem 0 0.5rem; color: var(--text-primary); }
.viewer-prose :deep(h3) { font-size: 1rem; font-weight: 600; margin: 1.5rem 0 0.4rem; color: var(--text-primary); }
.viewer-prose :deep(p) { margin: 0 0 1rem; color: var(--text-secondary); }
.viewer-prose :deep(blockquote) {
  margin: 0 0 1rem;
  padding: 4px 0 4px 16px;
  border-left: 3px solid var(--accent);
  color: var(--text-muted);
  font-style: italic;
}
.viewer-prose :deep(ul),
.viewer-prose :deep(ol) { margin: 0 0 1rem; padding-left: 1.5rem; color: var(--text-secondary); }
.viewer-prose :deep(li) { margin-bottom: 0.25rem; }
.viewer-prose :deep(code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8125rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
}
.viewer-prose :deep(pre) {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 0 0 1rem;
}
.viewer-prose :deep(pre code) { background: none; border: none; padding: 0; }
.viewer-prose :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: 0.875rem; }
.viewer-prose :deep(th),
.viewer-prose :deep(td) { padding: 7px 12px; border: 1px solid var(--border); text-align: left; }
.viewer-prose :deep(th) { background: var(--bg-base); font-weight: 600; color: var(--text-primary); }
.viewer-prose :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }
.viewer-prose :deep(a) { color: var(--accent); }

/* Comment bar */
.comment-bar {
  border-top: 1px solid var(--border);
  padding: 10px 16px;
  background: var(--bg-surface);
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-shrink: 0;
}

.comment-input {
  flex: 1;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.8125rem;
  color: var(--text-primary);
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s;
}
.comment-input:focus { border-color: var(--accent); }
.comment-input::placeholder { color: var(--text-muted); }

.btn-send {
  padding: 7px 14px;
  border-radius: 7px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-send:hover:not(:disabled) { opacity: 0.85; }
.btn-send:disabled { opacity: 0.35; cursor: not-allowed; }

.comment-sent {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: var(--accent);
  padding: 4px 0;
}
</style>
