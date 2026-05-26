<template>
  <Teleport to="body">
    <div
      v-if="show && !store.commentingActive"
      class="floating-toolbar"
      :style="style"
      @mousedown.prevent
    >
      <template v-if="!addingLink && !editorReadonly.value">
        <button class="tb-btn" :class="{ active: marks.bold }" @click="exec('bold')" title="Bold">
          <Bold :size="14" />
        </button>
        <button class="tb-btn" :class="{ active: marks.italic }" @click="exec('italic')" title="Italic">
          <Italic :size="14" />
        </button>
        <button class="tb-btn" :class="{ active: marks.strike }" @click="exec('strike')" title="Strikethrough">
          <Strikethrough :size="14" />
        </button>
        <button class="tb-btn" :class="{ active: marks.link }" @click="clickLink" :title="marks.link ? 'Remove link' : 'Add link'">
          <LinkIcon :size="14" />
        </button>
        <template v-if="marks.link">
          <input
            v-model="editHrefValue"
            class="tb-url-input tb-url-inline"
            placeholder="https://…"
            @keydown.enter.prevent="commitHrefEdit"
            @blur="commitHrefEdit"
            @mousedown.stop
          />
        </template>
        <div class="tb-divider" />
        <button class="tb-btn" @click="exec('bulletList')" title="Bullet list">
          <List :size="14" />
        </button>
        <button class="tb-btn" @click="exec('orderedList')" title="Numbered list">
          <ListOrdered :size="14" />
        </button>
        <button class="tb-btn" @click="exec('blockquote')" title="Quote">
          <Quote :size="14" />
        </button>
        <div class="tb-divider" />
        <button class="tb-btn comment-btn" @click="clickComment" title="Add comment">
          <MessageSquarePlus :size="14" />
        </button>
      </template>
      <template v-else-if="!editorReadonly.value">
        <input
          ref="urlInputEl"
          v-model="urlValue"
          class="tb-url-input"
          placeholder="https://…"
          @keydown.enter.prevent="submitUrl"
          @keydown.esc="addingLink = false"
        />
        <button class="tb-btn tb-url-ok" @click="submitUrl">Add</button>
        <button class="tb-btn" @click="addingLink = false" title="Cancel">✕</button>
      </template>
      <template v-else-if="openCommentFromToolbar">
        <button class="tb-btn comment-btn" @click="clickComment" title="Add comment">
          <MessageSquarePlus :size="14" />
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, nextTick, watch, inject } from 'vue'
import { usePluginViewContext } from '@prosemirror-adapter/vue'
import { Bold, Italic, Strikethrough, Link as LinkIcon, List, ListOrdered, Quote, MessageSquarePlus } from 'lucide-vue-next'
import { useAppStore } from '../../store'

const { view, prevState } = usePluginViewContext()
const openCommentFromToolbar = inject('openCommentFromToolbar', null)
const editorReadonly = inject('editorReadonly', { value: false })
const store = useAppStore()

watch(prevState, () => updateState())

const show = ref(false)
const style = reactive({ position: 'fixed', top: '0px', left: '0px', zIndex: 2000, transform: 'translateX(-50%)' })
const marks = reactive({ bold: false, italic: false, strike: false, link: false })
const addingLink = ref(false)
const urlValue = ref('')
const urlInputEl = ref(null)
const editHrefValue = ref('')
let lastLinkHref = ''
let lastLinkRange = null

let lastSelectionText = ''
let lastCoords = { left: 0, top: 0 }

function updateState() {
  const v = view.value
  if (!v) return
  const { state } = v
  const { from, to, empty } = state.selection

  if (empty || from === to) {
    show.value = false
    addingLink.value = false
    return
  }

  const { schema } = state
  marks.bold = schema.marks.strong ? state.doc.rangeHasMark(from, to, schema.marks.strong) : false
  marks.italic = schema.marks.emphasis ? state.doc.rangeHasMark(from, to, schema.marks.emphasis) : false
  marks.strike = schema.marks.strike_through ? state.doc.rangeHasMark(from, to, schema.marks.strike_through) : false
  marks.link = schema.marks.link ? state.doc.rangeHasMark(from, to, schema.marks.link) : false

  if (marks.link) {
    let href = ''
    state.doc.nodesBetween(from, to, (node) => {
      if (!href) {
        const m = node.marks.find((x) => x.type === schema.marks.link)
        if (m) href = m.attrs.href || ''
      }
    })
    lastLinkHref = href
    lastLinkRange = { from, to }
    if (document.activeElement?.classList?.contains('tb-url-inline') !== true) {
      editHrefValue.value = href
    }
  } else {
    lastLinkHref = ''
    lastLinkRange = null
    editHrefValue.value = ''
  }

  lastSelectionText = state.doc.textBetween(from, to, ' ')

  const startCoords = v.coordsAtPos(from)
  const endCoords = v.coordsAtPos(to)
  const midLeft = (startCoords.left + endCoords.left) / 2
  const topY = startCoords.top - 48

  lastCoords = { left: midLeft, top: topY }
  style.left = `${midLeft}px`
  style.top = `${topY}px`
  show.value = true
}

function toggleMark(type) {
  const v = view.value
  if (!v) return
  const { state, dispatch } = v
  const { from, to } = state.selection
  if (state.doc.rangeHasMark(from, to, type)) {
    dispatch(state.tr.removeMark(from, to, type))
  } else {
    dispatch(state.tr.addMark(from, to, type.create()))
  }
  v.focus()
}

function wrapIn(nodeType) {
  const v = view.value
  if (!v) return
  const { state, dispatch } = v
  const { $from, $to } = state.selection
  const range = $from.blockRange($to)
  if (!range) return
  dispatch(state.tr.wrap(range, [{ type: nodeType }]))
  v.focus()
}

function exec(action) {
  const v = view.value
  if (!v) return
  const { schema } = v.state
  switch (action) {
    case 'bold': return schema.marks.strong && toggleMark(schema.marks.strong)
    case 'italic': return schema.marks.emphasis && toggleMark(schema.marks.emphasis)
    case 'strike': return schema.marks.strike_through && toggleMark(schema.marks.strike_through)
    case 'bulletList': {
      const { $from, $to } = v.state.selection
      const range = $from.blockRange($to)
      if (!range) return
      v.dispatch(v.state.tr.wrap(range, [{ type: schema.nodes.bullet_list }, { type: schema.nodes.list_item }]))
      v.focus()
      return
    }
    case 'orderedList': {
      const { $from, $to } = v.state.selection
      const range = $from.blockRange($to)
      if (!range) return
      v.dispatch(v.state.tr.wrap(range, [{ type: schema.nodes.ordered_list }, { type: schema.nodes.list_item }]))
      v.focus()
      return
    }
    case 'blockquote': return wrapIn(schema.nodes.blockquote)
  }
}

function clickLink() {
  const v = view.value
  if (!v) return
  const { state } = v
  const { from, to } = state.selection
  if (state.doc.rangeHasMark(from, to, state.schema.marks.link)) {
    v.dispatch(state.tr.removeMark(from, to, state.schema.marks.link))
    v.focus()
  } else {
    addingLink.value = true
    urlValue.value = ''
    nextTick(() => urlInputEl.value?.focus())
  }
}

function submitUrl() {
  const url = urlValue.value.trim()
  if (!url) return
  const v = view.value
  if (!v) return
  const { state, dispatch } = v
  const { from, to } = state.selection
  const linkMark = state.schema.marks.link
  if (linkMark) {
    dispatch(state.tr.addMark(from, to, linkMark.create({ href: url })))
  }
  addingLink.value = false
  urlValue.value = ''
  v.focus()
}

function clickComment() {
  if (!openCommentFromToolbar) return
  openCommentFromToolbar(lastSelectionText, lastCoords)
}

function commitHrefEdit() {
  const next = editHrefValue.value.trim()
  if (!lastLinkRange) return
  if (next === lastLinkHref) return
  const v = view.value
  if (!v) return
  const { from, to } = lastLinkRange
  const linkMark = v.state.schema.marks.link
  if (!linkMark) return
  let tr = v.state.tr.removeMark(from, to, linkMark)
  if (next) tr = tr.addMark(from, to, linkMark.create({ href: next }))
  v.dispatch(tr)
  lastLinkHref = next
}
</script>

<style scoped>
.floating-toolbar {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 100px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 1px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), 0 1px 6px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
  user-select: none;
}

.tb-divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
  flex-shrink: 0;
}

.tb-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
  appearance: none;
  -webkit-appearance: none;
}

.tb-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tb-btn.active {
  background: var(--accent-muted);
  color: var(--accent-light);
}

.comment-btn {
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.comment-btn:hover {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}

.tb-url-input {
  width: 180px;
  padding: 4px 10px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 100px;
  color: var(--text-primary);
  font-size: 0.8rem;
  font-family: inherit;
  outline: none;
}

.tb-url-input:focus { border-color: var(--accent-muted); }
.tb-url-input::placeholder { color: var(--text-muted, var(--text-secondary)); }

.tb-url-inline {
  width: 160px;
  margin: 0 4px;
  height: 22px;
  padding: 2px 8px;
  font-size: 0.75rem;
}

.tb-url-ok {
  width: auto;
  padding: 0 10px;
  font-size: 0.75rem;
  color: var(--accent-light);
  font-weight: 500;
  border-radius: 100px;
}
</style>
