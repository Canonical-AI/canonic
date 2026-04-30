<template>
  <div class="editor-wrapper">
    <div class="editor-topbar">
      <h1 class="doc-title">{{ docTitle }}</h1>
      <div class="topbar-actions">
        <span v-if="store.isDirty" class="unsaved-label">Unsaved</span>
        <button class="action-btn" @click="save" :disabled="!store.isDirty">Save</button>
      </div>
    </div>

    <!-- Comment highlights overlay is handled via CSS marks in the editor -->
    <div class="editor-scroll">
      <div
        ref="editorEl"
        class="editor-content"
        @mouseup="onMouseUp"
      >
        <textarea
          ref="textareaEl"
          class="markdown-input"
          v-model="localContent"
          @input="onInput"
          @scroll="onScroll"
          spellcheck="true"
          :placeholder="placeholder"
        />
      </div>
    </div>

    <!-- Selection comment popover -->
    <div
      v-if="selectionPopover.visible"
      class="comment-popover"
      :style="{ top: selectionPopover.y + 'px', left: selectionPopover.x + 'px' }"
    >
      <button class="popover-btn" @click="addSelectionComment">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.457 1.457 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z"/>
        </svg>
        Add comment
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useAppStore } from '../store'
import { v4 as uuidv4 } from 'uuid'

const store = useAppStore()
const editorEl = ref(null)
const textareaEl = ref(null)
const localContent = ref('')

const selectionPopover = ref({ visible: false, x: 0, y: 0, text: '', start: 0, end: 0 })
const pendingComment = ref(null)

const placeholder = `Start writing...

Use # for headings, **bold**, _italic_, - for lists.

Select any text to add a comment.`

const docTitle = computed(() => {
  if (!store.currentFile) return ''
  return store.currentFile.split('/').pop().replace('.md', '')
})

watch(() => store.currentContent, (val) => {
  if (val !== localContent.value) {
    localContent.value = val || ''
  }
}, { immediate: true })

function onInput() {
  store.isDirty = true
}

async function save() {
  await store.saveFile(localContent.value)
}

// Auto-save every 30s if dirty
let autoSaveTimer = null
watch(() => store.isDirty, (dirty) => {
  if (dirty) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => save(), 30000)
  }
})

function onMouseUp(e) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    selectionPopover.value.visible = false
    return
  }

  const selectedText = selection.toString()
  const textarea = textareaEl.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd

  if (start === end) {
    selectionPopover.value.visible = false
    return
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect()
  const wrapperRect = editorEl.value.getBoundingClientRect()

  selectionPopover.value = {
    visible: true,
    x: rect.left - wrapperRect.left,
    y: rect.top - wrapperRect.top - 40,
    text: selectedText,
    start,
    end
  }
}

function addSelectionComment() {
  const { text, start, end } = selectionPopover.value
  selectionPopover.value.visible = false

  const commentText = prompt('Add a comment:')
  if (!commentText) return

  store.addComment({
    id: uuidv4(),
    author: 'You',
    type: 'selection',
    anchor: {
      quotedText: text,
      start,
      end
    },
    text: commentText,
    resolved: false,
    createdAt: new Date().toISOString()
  })
}

function onScroll() {
  // Could sync scroll with comments panel here
}

// Keyboard shortcut: Cmd+S to save
onMounted(() => {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (store.isDirty) save()
    }
  })
})
</script>

<style scoped>
.editor-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.editor-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 48px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.doc-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.01em;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.unsaved-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.action-btn {
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.action-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.editor-scroll {
  flex: 1;
  overflow-y: auto;
}

.editor-content {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 48px 80px;
  position: relative;
  min-height: 100%;
}

.markdown-input {
  width: 100%;
  min-height: 60vh;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Inter', sans-serif;
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--text-primary);
  caret-color: var(--accent);
}

.markdown-input::placeholder { color: var(--text-muted); }

.comment-popover {
  position: absolute;
  z-index: 100;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}

.popover-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
}

.popover-btn:hover { background: var(--bg-hover); }
</style>
