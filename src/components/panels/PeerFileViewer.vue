<template>
  <div class="peer-viewer" ref="viewerEl">
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
        <button v-if="permission === 'copy'" class="btn-action" @click="copyToWorkspace">
          Copy to workspace
        </button>
        <button class="btn-close" @click="close" title="Close">
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- Document body -->
    <div class="viewer-body" ref="bodyEl" @mouseup="onMouseUp" @click="onBodyClick" @click.capture="onMarkClick">
      <div class="viewer-layout">
        <div class="viewer-gutter">
          <div v-for="n in lineCount" :key="n" class="gutter-line">{{ n }}</div>
        </div>
        <div class="viewer-prose" v-html="renderedContent" />
      </div>
    </div>

    <!-- Selection popover — "Add comment" button -->
    <div
      v-if="canComment && selectionPopover.visible && !commentInput.visible"
      class="comment-popover"
      :style="{ top: selectionPopover.y + 'px', left: selectionPopover.x + 'px' }"
    >
      <button class="popover-btn" @mousedown.prevent @click="openCommentInput">
        <MessageSquarePlus :size="13" />
        Add comment
      </button>
    </div>

    <!-- Inline comment input -->
    <div
      v-if="commentInput.visible"
      class="comment-input-box"
      :style="{ top: selectionPopover.y + 'px', left: selectionPopover.x + 'px' }"
      @click.stop
      @mousedown.stop
    >
      <div class="comment-quoted">
        <span class="comment-quote-bar" />
        <span class="comment-quote-text">{{ truncateQuote(selectionPopover.text) }}</span>
      </div>
      <textarea
        ref="commentTextareaEl"
        v-model="commentInput.text"
        class="comment-textarea"
        :placeholder="commentInput.isPrivate ? 'Private note (only visible to you)…' : `Comment for ${peer.name}…`"
        rows="3"
        @keydown.ctrl.enter="submitComment"
        @keydown.meta.enter="submitComment"
        @keydown.esc="cancelComment"
      />
      <div class="comment-input-actions">
        <span class="comment-input-hint">⌘↩ to submit</span>
        <button
          class="comment-private-btn"
          :class="{ active: commentInput.isPrivate }"
          @click="commentInput.isPrivate = !commentInput.isPrivate"
          :title="commentInput.isPrivate ? 'Private — only you can see this' : 'Make private'"
        >
          <Lock v-if="commentInput.isPrivate" :size="12" />
          <LockOpen v-else :size="12" />
          {{ commentInput.isPrivate ? 'Private' : 'Visible' }}
        </button>
        <button class="comment-cancel-btn" @click="cancelComment">Cancel</button>
        <button class="comment-submit-btn" @click="submitComment" :disabled="!commentInput.text.trim()">Comment</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, watch, onMounted } from 'vue'
import { marked } from 'marked'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '../../store'
import { Eye, MessageSquare, MessageSquarePlus, Copy, X, Lock, LockOpen } from 'lucide-vue-next'

const store = useAppStore()
const bodyEl = ref(null)
const commentTextareaEl = ref(null)

const peer = computed(() => store.peerFileContent?.peer ?? {})
const relPath = computed(() => store.peerFileContent?.relPath ?? '')
const content = computed(() => store.peerFileContent?.content ?? '')
const permission = computed(() => store.peerFileContent?.peer?.permission ?? 'view')
const canComment = computed(() => permission.value === 'comment' || permission.value === 'copy')

const permLabel = computed(() => ({ view: 'read-only', comment: 'can comment', copy: 'can copy' }[permission.value] ?? 'read-only'))
const permIcon = computed(() => ({ view: Eye, comment: MessageSquare, copy: Copy }[permission.value] ?? Eye))

const selectionPopover = ref({ visible: false, x: 0, y: 0, text: '' })
const commentInput = ref({ visible: false, text: '' })

const lineCount = computed(() => {
  if (!content.value) return 0
  return content.value.split('\n').length
})

const renderedContent = computed(() => {
  try { return marked.parse(content.value) } catch { return `<pre>${content.value}</pre>` }
})

function initials(name) {
  return (name || '?').split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
function basename(p) { return (p || '').split('/').pop() }
function truncateQuote(text, len = 80) {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

function close() {
  store.openPeerFile(null)
}

function onMouseUp() {
  if (commentInput.value.visible) return
  if (!canComment.value) return
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    selectionPopover.value.visible = false
    return
  }
  const selectedText = selection.toString().trim()
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  const wrapperRect = bodyEl.value.getBoundingClientRect()
  selectionPopover.value = {
    visible: true,
    x: Math.max(0, rect.left - wrapperRect.left),
    y: rect.top - wrapperRect.top - 44,
    text: selectedText
  }
}

function onBodyClick() {
  if (commentInput.value.visible) return
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    selectionPopover.value.visible = false
  }
}

// ── Comment highlights ────────────────────────────────────────────────────────

// Fire on initial mount — the component mounts AFTER peerFileContent is set,
// so the watch below won't see a change on first render.
onMounted(async () => {
  await nextTick()
  highlightAnchors()
})

// Re-apply whenever content re-renders or comments are added/updated.
watch(
  [renderedContent, () => store.peerFileComments],
  async () => { await nextTick(); highlightAnchors() },
  { deep: true }
)

function highlightAnchors() {
  const prose = bodyEl.value?.querySelector('.viewer-prose')
  if (!prose) return

  // Remove old highlights first
  prose.querySelectorAll('mark.comment-anchor').forEach(mark => {
    const parent = mark.parentNode
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })

  const quotedTexts = [...new Set(
    store.peerFileComments
      .map(c => c.anchor?.quotedText)
      .filter(t => t?.trim())
  )]
  for (const qt of quotedTexts) highlightTextInElement(prose, qt)
}

function highlightTextInElement(root, searchText) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  let node
  while ((node = walker.nextNode())) nodes.push(node)

  for (const textNode of nodes) {
    const idx = textNode.textContent.indexOf(searchText)
    if (idx === -1) continue

    const before = textNode.textContent.slice(0, idx)
    const after = textNode.textContent.slice(idx + searchText.length)
    const mark = document.createElement('mark')
    mark.className = 'comment-anchor'
    mark.dataset.anchor = searchText   // used for click delegation + scroll
    mark.textContent = searchText

    const parent = textNode.parentNode
    if (before) parent.insertBefore(document.createTextNode(before), textNode)
    parent.insertBefore(mark, textNode)
    if (after) parent.insertBefore(document.createTextNode(after), textNode)
    parent.removeChild(textNode)
    break // first occurrence only
  }
}

// When user clicks a highlight in the doc, activate the matching sidebar comment.
function onMarkClick(e) {
  const mark = e.target.closest('mark.comment-anchor')
  if (!mark) return
  e.stopPropagation()
  const qt = mark.dataset.anchor
  const comment = store.peerFileComments.find(c => c.anchor?.quotedText === qt)
  if (comment) {
    store.setActiveComment(comment.id)
    store.rightPanelTab = 'comments'
    store.rightPanelCollapsed = false
  }
}

// When activeCommentId changes (e.g. user clicked a sidebar card),
// scroll to the matching mark in the viewer and briefly flash it.
watch(() => store.activeCommentId, async (id) => {
  if (!id) return
  const comment = store.peerFileComments.find(c => c.id === id)
  if (!comment?.anchor?.quotedText) return
  await nextTick()
  
  // Use CSS.escape for robust attribute selection (handles newlines, quotes, slashes, etc.)
  const escapedAnchor = CSS.escape(comment.anchor.quotedText)
  const mark = bodyEl.value?.querySelector(`mark.comment-anchor[data-anchor="${escapedAnchor}"]`)
  
  if (!mark) {
    console.warn(`[PeerFileViewer] Could not find mark for anchor: ${comment.anchor.quotedText}`)
    return
  }
  mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
  mark.classList.add('flash')
  setTimeout(() => mark.classList.remove('flash'), 1200)
})

// ── Comment input ─────────────────────────────────────────────────────────────

async function openCommentInput() {
  commentInput.value = { visible: true, text: '', isPrivate: false }
  await nextTick()
  commentTextareaEl.value?.focus()
}

function cancelComment() {
  commentInput.value = { visible: false, text: '' }
  selectionPopover.value.visible = false
}

async function submitComment() {
  const text = commentInput.value.text.trim()
  if (!text) return

  const isPrivate = commentInput.value.isPrivate
  const comment = {
    id: uuidv4(),
    author: store.config?.displayName || 'You',
    isOwn: true,
    private: isPrivate,
    text,
    anchor: { quotedText: selectionPopover.value.text },
    createdAt: new Date().toISOString(),
    synced: isPrivate ? null : false   // private comments are never synced
  }

  store.addPeerComment(comment)
  // Switch sidebar to comments tab so user sees it
  store.rightPanelTab = 'comments'
  store.rightPanelCollapsed = false

  // Private comments stay local — never synced
  if (!isPrivate) {
    if (!store.isDemoMode && peer.value.host && peer.value.port) {
      try {
        const res = await fetch(
          `http://${peer.value.host}:${peer.value.port}/comments?token=${peer.value.token}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: relPath.value, comments: [comment] })
          }
        )
        if (res.ok) store.updatePeerComment(comment.id, { synced: true })
      } catch {
        // Will be retried by flushPeerComments interval
      }
    } else if (store.isDemoMode) {
      setTimeout(() => store.updatePeerComment(comment.id, { synced: true }), 800)
    }
  }

  cancelComment()
}

async function copyToWorkspace() {
  await store.copyPeerFileToWorkspace({ relPath: relPath.value, content: content.value })
  close()
}
</script>

<style scoped>
.peer-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
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

.viewer-doc-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }

.doc-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.peer-name { font-size: 0.75rem; color: var(--text-muted); }

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

.viewer-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

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
  padding: 40px 0;
  position: relative;
  user-select: text;
}

.viewer-layout {
  display: flex;
  max-width: 800px;
  margin: 0 auto;
  position: relative;
}

.viewer-gutter {
  width: 48px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 16px;
  padding-top: 0.1em;
  color: var(--text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  user-select: none;
  opacity: 0.5;
  border-right: 1px solid var(--border);
  display: none;
}

:global([data-line-numbers="true"]) .viewer-gutter {
  display: block;
}

.gutter-line {
  line-height: 1.7; /* Match viewer-prose line-height */
  height: 1.7em;
}

.viewer-prose {
  flex: 1;
  padding-left: 40px;
  padding-right: 40px;
  color: var(--text-primary);
  line-height: 1.7;
  font-size: 0.9375rem;
  min-width: 0;
}

.viewer-prose :deep(h1) { font-size: 1.75rem; font-weight: 700; margin: 0 0 8px; }
.viewer-prose :deep(h2) { font-size: 1.2rem; font-weight: 600; margin: 2rem 0 0.5rem; }
.viewer-prose :deep(h3) { font-size: 1rem; font-weight: 600; margin: 1.5rem 0 0.4rem; }
.viewer-prose :deep(p) { margin: 0 0 1rem; color: var(--text-secondary); }
.viewer-prose :deep(blockquote) {
  margin: 0 0 1rem; padding: 4px 0 4px 16px;
  border-left: 3px solid var(--accent); color: var(--text-muted); font-style: italic;
}
.viewer-prose :deep(ul), .viewer-prose :deep(ol) { margin: 0 0 1rem; padding-left: 1.5rem; color: var(--text-secondary); }
.viewer-prose :deep(li) { margin-bottom: 0.25rem; }
.viewer-prose :deep(code) {
  font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem;
  background: var(--bg-base); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px;
}
.viewer-prose :deep(pre) {
  background: var(--bg-base); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px 16px; overflow-x: auto; margin: 0 0 1rem;
}
.viewer-prose :deep(pre code) { background: none; border: none; padding: 0; }
.viewer-prose :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: 0.875rem; }
.viewer-prose :deep(th), .viewer-prose :deep(td) { padding: 7px 12px; border: 1px solid var(--border); text-align: left; }
.viewer-prose :deep(th) { background: var(--bg-base); font-weight: 600; }
.viewer-prose :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }
.viewer-prose :deep(a) { color: var(--accent); }

/* Comment anchor highlights */
.viewer-prose :deep(mark.comment-anchor) {
  background: color-mix(in srgb, var(--secondary, #f59e0b) 30%, transparent);
  color: inherit;
  border-radius: 2px;
  padding: 0 2px;
  cursor: pointer;
  transition: background 0.2s;
}
.viewer-prose :deep(mark.comment-anchor:hover) {
  background: color-mix(in srgb, var(--secondary, #f59e0b) 50%, transparent);
}
.viewer-prose :deep(mark.comment-anchor.flash) {
  background: color-mix(in srgb, var(--secondary, #f59e0b) 65%, transparent);
  outline: 2px solid color-mix(in srgb, var(--secondary, #f59e0b) 80%, transparent);
  border-radius: 3px;
  transition: none;
}

/* Selection popover */
.comment-popover {
  position: absolute;
  z-index: 50;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  padding: 2px;
}

.popover-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 0.8125rem;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
}
.popover-btn:hover { background: var(--bg-hover); }

/* Comment input box */
.comment-input-box {
  position: absolute;
  z-index: 60;
  width: 300px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.22);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comment-quoted { display: flex; align-items: flex-start; gap: 8px; }

.comment-quote-bar {
  width: 3px;
  min-height: 16px;
  border-radius: 2px;
  background: var(--accent);
  flex-shrink: 0;
  align-self: stretch;
}

.comment-quote-text { font-size: 0.75rem; color: var(--text-muted); font-style: italic; line-height: 1.4; }

.comment-textarea {
  width: 100%;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  font-size: 0.8125rem;
  color: var(--text-primary);
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.comment-textarea:focus { border-color: var(--accent); }
.comment-textarea::placeholder { color: var(--text-muted); }

.comment-input-actions { display: flex; align-items: center; gap: 6px; }

.comment-input-hint { flex: 1; font-size: 0.6875rem; color: var(--text-muted); }

.comment-private-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s;
}
.comment-private-btn:hover { background: var(--bg-hover); }
.comment-private-btn.active {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  color: var(--accent);
}

.comment-cancel-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.775rem;
  cursor: pointer;
}
.comment-cancel-btn:hover { background: var(--bg-hover); }

.comment-submit-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.775rem;
  font-weight: 500;
  cursor: pointer;
}
.comment-submit-btn:hover:not(:disabled) { opacity: 0.85; }
.comment-submit-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
