<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="floating-toolbar"
      :style="style"
      @mousedown.prevent
    >
      <template v-if="!addingLink">
        <div class="tb-group">
          <button class="tb-btn" :class="{ active: marks.bold }" @click="exec('bold')" title="Bold">
            <Bold :size="14" />
          </button>
          <button class="tb-btn" :class="{ active: marks.italic }" @click="exec('italic')" title="Italic">
            <Italic :size="14" />
          </button>
          <button class="tb-btn" :class="{ active: marks.strike }" @click="exec('strike')" title="Strikethrough">
            <Strikethrough :size="14" />
          </button>
          <button class="tb-btn" :class="{ active: marks.link }" @click="clickLink" title="Link">
            <Link :size="14" />
          </button>
        </div>
        <div class="tb-divider" />
        <div class="tb-group">
          <button class="tb-btn" @click="exec('bulletList')" title="Bullet list">
            <List :size="14" />
          </button>
          <button class="tb-btn" @click="exec('orderedList')" title="Numbered list">
            <ListOrdered :size="14" />
          </button>
        </div>
        <div class="tb-divider" />
        <div class="tb-group">
          <button class="tb-btn" @click="exec('blockquote')" title="Quote">
            <Quote :size="14" />
          </button>
          <button class="tb-btn" @click="exec('code')" title="Code block">
            <Code :size="14" />
          </button>
        </div>
      </template>
      <template v-else>
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
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import { usePluginViewContext } from '@prosemirror-adapter/vue'
import { Bold, Italic, Strikethrough, Link, List, ListOrdered, Quote, Code } from 'lucide-vue-next'

const { view } = usePluginViewContext()

const show = ref(false)
const style = reactive({ position: 'fixed', top: '0px', left: '0px', zIndex: 2000, transform: 'translateX(-50%)' })
const marks = reactive({ bold: false, italic: false, strike: false, link: false })
const addingLink = ref(false)
const urlValue = ref('')
const urlInputEl = ref(null)

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
  marks.bold = state.doc.rangeHasMark(from, to, schema.marks.strong)
  marks.italic = state.doc.rangeHasMark(from, to, schema.marks.em)
  marks.strike = schema.marks.strike_through
    ? state.doc.rangeHasMark(from, to, schema.marks.strike_through)
    : false
  marks.link = schema.marks.link
    ? state.doc.rangeHasMark(from, to, schema.marks.link)
    : false

  const startCoords = v.coordsAtPos(from)
  const endCoords = v.coordsAtPos(to)
  style.left = `${(startCoords.left + endCoords.left) / 2}px`
  style.top = `${startCoords.top - 44}px`
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
    case 'bold': return toggleMark(schema.marks.strong)
    case 'italic': return toggleMark(schema.marks.em)
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
    case 'code': {
      const { from, to } = v.state.selection
      v.dispatch(v.state.tr.setBlockType(from, to, schema.nodes.code_block))
      v.focus()
      return
    }
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

onMounted(() => {
  const dom = view.value?.dom
  if (!dom) return
  dom.addEventListener('mouseup', updateState)
  dom.addEventListener('keyup', updateState)
})

onUnmounted(() => {
  const dom = view.value?.dom
  if (!dom) return
  dom.removeEventListener('mouseup', updateState)
  dom.removeEventListener('keyup', updateState)
})
</script>

<style scoped>
.floating-toolbar {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
}

.tb-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tb-divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 2px;
}

.tb-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  transition: background 0.1s, color 0.1s;
}

.tb-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tb-btn.active {
  background: var(--bg-active);
  color: var(--accent);
}

.tb-url-input {
  width: 180px;
  padding: 4px 8px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-family: inherit;
  outline: none;
}

.tb-url-input:focus { border-color: var(--accent-muted); }

.tb-url-ok {
  width: auto;
  padding: 0 8px;
  color: var(--accent);
}
</style>
