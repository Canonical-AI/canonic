<template>
  <Milkdown />
  <WikiLinkTooltip ref="wikiTooltipRef" />
</template>

<script setup>
import { watch, ref, provide, computed, onUnmounted, reactive } from 'vue'
import { Milkdown, useEditor } from '@milkdown/vue'
import { useAppStore } from '../../store'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, prosePluginsCtx, remarkPluginsCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { Plugin, PluginKey, NodeSelection, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { mermaidRemarkPlugin, mermaidNode } from './mermaid/index.js'
import MermaidComponent from './mermaid/MermaidComponent.vue'
import { useNodeViewFactory, usePluginViewFactory } from '@prosemirror-adapter/vue'
import FloatingToolbar from './FloatingToolbar.vue'
import { $view, $prose } from '@milkdown/utils'
import { wikiLinkRemarkPlugin, wikiLinkNode } from './wiki-link/index.js'
import WikiLinkChip from './wiki-link/WikiLinkChip.vue'
import WikiLinkTooltip from './wiki-link/WikiLinkTooltip.vue'
import { createInlineCompletionPlugin } from './inline-completion/index.js'

const props = defineProps({ content: String, comments: Array, readonly: Boolean })
const emit = defineEmits(['update'])

const store = useAppStore()
const editorReadonly = computed(() => props.readonly || !!store.peerFileContent)
provide('editorReadonly', editorReadonly)

// --- Comment highlight ProseMirror plugin ---

const HIGHLIGHT_KEY = new PluginKey('commentHighlight')

function buildDecorations(doc, comments) {
  if (!comments?.length) return DecorationSet.empty
  const decos = []

  for (const comment of comments) {
    if (comment.resolved) continue
    const text = comment.anchor?.quotedText
    if (!text || text.length < 2) continue

    const cls = comment.isAgent
      ? 'comment-highlight agent-highlight'
      : comment.isDemo
        ? 'comment-highlight demo-highlight'
        : 'comment-highlight'

    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      let idx = node.text.indexOf(text)
      while (idx >= 0) {
        decos.push(Decoration.inline(pos + idx, pos + idx + text.length, {
          class: cls,
          'data-comment-id': comment.id,
          title: `${comment.author}: ${comment.text.slice(0, 100)}`
        }))
        idx = node.text.indexOf(text, idx + 1)
      }
    })
  }

  return DecorationSet.create(doc, decos)
}

const highlightPlugin = new Plugin({
  key: HIGHLIGHT_KEY,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, old) {
      const comments = tr.getMeta(HIGHLIGHT_KEY)
      if (comments !== undefined) return buildDecorations(tr.doc, comments)
      return old.map(tr.mapping, tr.doc)
    }
  },
  props: {
    decorations: (state) => HIGHLIGHT_KEY.getState(state)
  }
})

// --- isDark provide ---

const LIGHT_THEMES = new Set(['paper'])
const getIsDark = () => !LIGHT_THEMES.has(document.documentElement.getAttribute('data-theme'))

const isDark = ref(getIsDark())

const themeObserver = new MutationObserver(() => {
  isDark.value = getIsDark()
})
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

provide('isDark', isDark)

// --- Node view factories ---

const nodeViewFactory = useNodeViewFactory()
const pluginViewFactory = usePluginViewFactory()

const floatingToolbarPlugin = $prose((ctx) => new Plugin({
  view: pluginViewFactory({ component: FloatingToolbar })
}))

// --- Wiki-link trigger ---

const wikiTooltipRef = ref(null)

const WIKI_KEY = new PluginKey('wikiLinkTrigger')

const wikiTriggerPlugin = $prose(() => new Plugin({
  key: WIKI_KEY,
  props: {
    handleTextInput(view, _from, _to, text) {
      if (text !== '[') return false
      const before = view.state.doc.textBetween(Math.max(0, _from - 1), _from)
      if (before !== '[') return false

      const bracketStart = _from - 1
      const coords = view.coordsAtPos(_from)
      wikiTooltipRef.value?.open(
        { top: coords.bottom + 4, left: coords.left },
        (name) => insertWikiLink(view, name, bracketStart),
        () => {}
      )
      return false
    }
  }
}))

function insertWikiLink(view, name, bracketStart) {
  const { state, dispatch } = view
  const nodeType = state.schema.nodes.wiki_link
  if (!nodeType) return
  const node = nodeType.create({ name, anchor: null })
  dispatch(state.tr.replaceWith(bracketStart, bracketStart + 2, node))
}

// --- Inline completion ---

const completionConfig = reactive({
  enabled: false, apiKey: '', baseUrl: '', model: '',
  debounceMs: 350, maxTokens: 25, wordBoundaryOnly: true, extraInstructions: '',
})

watch(
  () => store.config,
  (cfg) => {
    if (!cfg) return
    const c = cfg.completion || {}
    const provider = cfg.providers?.find((p) => p.id === c.providerId)
    completionConfig.enabled = c.enabled !== false && !editorReadonly.value && !!provider?.apiKey
    completionConfig.apiKey = provider?.apiKey || ''
    completionConfig.baseUrl = provider?.baseUrl || ''
    completionConfig.model = c.model || 'codestral-latest'
    completionConfig.debounceMs = c.debounceMs ?? 350
    completionConfig.maxTokens = c.maxTokens ?? 25
    completionConfig.wordBoundaryOnly = c.wordBoundaryOnly ?? true
    completionConfig.extraInstructions = c.extraInstructions || ''
  },
  { immediate: true, deep: true }
)

const inlineCompletionPlugin = $prose(() => createInlineCompletionPlugin(completionConfig))

// --- Task lists ---

const taskCheckboxPlugin = $prose(() => new Plugin({
  props: {
    handleClick(view, pos, event) {
      if (!view.editable) return false
      const target = event.target
      if (!(target instanceof HTMLElement)) return false
      const li = target.closest('li[data-item-type="task"]')
      if (!li) return false
      const liRect = li.getBoundingClientRect()
      if (event.clientX - liRect.left > 24) return false
      const $pos = view.state.doc.resolve(pos)
      for (let d = $pos.depth; d >= 0; d--) {
        const node = $pos.node(d)
        if (node.type.name === 'list_item' && node.attrs.checked != null) {
          view.dispatch(view.state.tr.setNodeMarkup($pos.before(d), null, { ...node.attrs, checked: !node.attrs.checked }))
          return true
        }
      }
      return false
    }
  }
}))

// --- Trailing Paragraph ---

const trailingParagraphPlugin = $prose(() => new Plugin({
  appendTransaction(transactions, _oldState, newState) {
    if (!transactions.some(tr => tr.docChanged)) return null
    const { doc, schema, tr } = newState
    const last = doc.lastChild
    if (!last || last.type === schema.nodes.paragraph) return null
    return tr.insert(doc.content.size, schema.nodes.paragraph.create())
  }
}))

// --- Mermaid Auto-convert ---
const mermaidConvertPlugin = $prose(() => new Plugin({
  appendTransaction(transactions, _oldState, newState) {
    if (!transactions.some(tr => tr.docChanged)) return null
    const mermaidType = newState.schema.nodes.mermaid_block
    if (!mermaidType) return null
    let tr = null
    newState.doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block' || node.attrs.language !== 'mermaid') return
      if (!tr) tr = newState.tr
      tr.replaceWith(pos, pos + node.nodeSize, mermaidType.create({ value: node.textContent || '' }))
    })
    return tr
  }
}))

// --- Line numbers plugin ---

const lineNumbersPlugin = $prose(() => new Plugin({
  view(view) {
    const gutter = document.createElement('div')
    gutter.className = 'editor-gutter'
    view.dom.parentNode.insertBefore(gutter, view.dom)

    function update(view) {
      gutter.innerHTML = ''
      const { doc } = view.state
      let lineNumber = 1
      const domRect = view.dom.getBoundingClientRect()

      function renderLine(pos, num) {
        const line = document.createElement('div')
        line.className = 'gutter-line'
        try {
          const coords = view.coordsAtPos(pos)
          line.style.top = `${coords.top - domRect.top}px`
          line.style.height = `${coords.bottom - coords.top}px`
          line.textContent = num
          gutter.appendChild(line)
        } catch (e) {}
      }

      doc.descendants((node, pos) => {
        if (node.isBlock) {
          const isLeafBlock = node.childCount === 0 || (node.firstChild && (node.firstChild.isText || node.firstChild.isInline))
          const isListItem = node.type.name === 'list_item'
          if (isLeafBlock || isListItem) {
            const types = ['paragraph', 'heading', 'list_item', 'blockquote', 'code_block', 'hr']
            if (types.includes(node.type.name)) {
                if (node.type.name === 'paragraph' && view.state.doc.resolve(pos).parent.type.name === 'list_item') return true 
                if (node.type.name === 'code_block') {
                    const lines = node.textContent.split('\n')
                    let offset = 1
                    lines.forEach((_, i) => {
                        renderLine(pos + offset, lineNumber++)
                        offset += lines[i].length + 1
                    })
                } else {
                    renderLine(pos, lineNumber++)
                }
            }
          }
          return true 
        }
        return false
      })
    }
    update(view)
    return { update, destroy() { gutter.remove() } }
  }
}))

// --- Configurable Hotkeys ---

const hotkeys = computed(() => ({
  selectLine: store.config?.hotkeys?.selectLine || 'Mod-l',
  moveUp: store.config?.hotkeys?.moveUp || 'Shift-ArrowUp',
  moveDown: store.config?.hotkeys?.moveDown || 'Shift-ArrowDown',
}))

function isHotkeyMatch(event, hotkey) {
  if (!hotkey) return false
  const parts = hotkey.split('-')
  const key = parts.pop()
  
  const matchKey = event.key.toLowerCase() === key.toLowerCase()
  const matchShift = parts.includes('Shift') === event.shiftKey
  const matchMod = parts.includes('Mod') === (event.metaKey || event.ctrlKey)
  const matchAlt = parts.includes('Alt') === event.altKey
  
  return matchKey && matchShift && matchMod && matchAlt
}

// --- Custom Drag Handle plugin ---

const dragHandlePlugin = $prose(() => {
  let dragSrcStart    = -1
  let dragSrcEnd      = -1
  let dropTargetPos   = -1
  let dropTargetBelow = false
  let isDragging      = false
  let indicatorEl     = null

  function getDragBounds($from, $to) {
    let depth = 1
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'list_item') {
        if ($to.depth >= d && $to.node(d - 1) === $from.node(d - 1)) depth = d
        break
      }
    }
    return { start: $from.before(depth), end: $to.after(depth), depth }
  }

  function resetDragState() {
    isDragging = false
    dragSrcStart = -1
    dragSrcEnd = -1
    dropTargetPos = -1
    if (indicatorEl) indicatorEl.style.display = 'none'
  }

  return new Plugin({
    view(view) {
      const dropIndicator = document.createElement('div')
      dropIndicator.className = 'drop-indicator'
      // Hardcode high visibility CSS
      dropIndicator.style.position = 'fixed'
      dropIndicator.style.zIndex = '999999'
      dropIndicator.style.pointerEvents = 'none'
      dropIndicator.style.height = '3px'
      dropIndicator.style.background = 'var(--accent, #3b82f6)'
      dropIndicator.style.boxShadow = '0 0 5px var(--accent, #3b82f6)'
      indicatorEl = dropIndicator

      view.dom.parentNode.style.position = 'relative'
      document.body.appendChild(dropIndicator)

      return {
        destroy() {
          if (indicatorEl && indicatorEl.parentNode) indicatorEl.parentNode.removeChild(indicatorEl)
        }
      }
    },
    props: {
      handleDOMEvents: {
        dragstart(view, event) {
          if (isDragging) return false
          const { state } = view
          const { selection } = state
          if (selection.empty) return false

          let elevateToBlock = false;
          
          if (selection instanceof NodeSelection) {
            elevateToBlock = true;
          } else if (!selection.$from.sameParent(selection.$to)) {
            // Cross-block selection
            elevateToBlock = true;
          } else if (!selection.$from.parent.isTextblock) {
            // If the selection wraps a whole block, its parent will be the doc or bullet_list
            elevateToBlock = true;
          } else {
            // Check if selection covers at least 50% of the trimmed text (captures hand-selected lines)
            const parentText = (selection.$from.parent.textContent || "").trim();
            const selText = (state.doc.textBetween(selection.from, selection.to) || "").trim();
            if (parentText.length > 0 && (selText.length / parentText.length) >= 0.5) {
              elevateToBlock = true;
            }
          }

          if (!elevateToBlock) return false

          isDragging = true
          const $from = state.doc.resolve(selection.from)
          const $to = state.doc.resolve(selection.to)
          const bounds = getDragBounds($from, $to)
          dragSrcStart = bounds.start
          dragSrcEnd = bounds.end
          view.dom.classList.add('is-dragging')
          return false 
        },
        dragend(view, event) {
          resetDragState()
          view.dom.classList.remove('is-dragging')
          return false
        },
        dragover(view, event) {
          if (!isDragging || !indicatorEl) return false
          const editorRect = view.dom.getBoundingClientRect()
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) return false

          const $pos = view.state.doc.resolve(pos.inside >= 0 ? pos.inside : pos.pos)
          if ($pos.depth < 1) { indicatorEl.style.display = 'none'; dropTargetPos = -1; return false }

          // Only target block positions, we don't care about 'end' for the drop line
          const targetPos = getDragBounds($pos, $pos).start
          
          if (targetPos < 0) { indicatorEl.style.display = 'none'; dropTargetPos = -1; return false }

          dropTargetPos = targetPos
          const nodeDOM = view.nodeDOM(targetPos)
          if (nodeDOM instanceof HTMLElement) {
            const rect = nodeDOM.getBoundingClientRect()
            dropTargetBelow = event.clientY > rect.top + rect.height / 2
            
            indicatorEl.style.top = `${dropTargetBelow ? rect.bottom : rect.top}px`
            indicatorEl.style.left = `${editorRect.left}px`
            indicatorEl.style.width = `${editorRect.width}px`
            indicatorEl.style.display = 'block'
          }
          event.preventDefault()
          return true
        },
        drop(view, event) {
          if (!isDragging) return false
          
          // Completely disable native text dropping mid-line!
          event.preventDefault()

          if (dragSrcStart === -1 || dropTargetPos === -1) {
            resetDragState()
            view.dom.classList.remove('is-dragging')
            return true
          }
          
          const { state, dispatch } = view
          const movingSlice = state.doc.slice(dragSrcStart, dragSrcEnd)
          const size = dragSrcEnd - dragSrcStart

          const $tgt = state.doc.resolve(dropTargetPos + 1)
          if ($tgt.depth < 1) {
            resetDragState()
            view.dom.classList.remove('is-dragging')
            return true
          }
          const tgtBounds = getDragBounds($tgt, $tgt)
          const tgtStart = tgtBounds.start
          const tgtEnd = tgtBounds.end
          
          if (tgtStart >= dragSrcStart && tgtStart <= dragSrcEnd) { 
            resetDragState()
            view.dom.classList.remove('is-dragging')
            return true 
          }

          const insertPos = dropTargetBelow ? tgtEnd : tgtStart
          const tr = state.tr
          
          if (dragSrcStart < insertPos) {
            tr.replace(insertPos, insertPos, movingSlice)
            tr.delete(dragSrcStart, dragSrcEnd)
          } else {
            tr.delete(dragSrcStart, dragSrcEnd)
            tr.replace(insertPos, insertPos, movingSlice)
          }

          const actualInsertPos = dragSrcStart < insertPos ? insertPos - size : insertPos
          const newSelSize = state.selection.to - state.selection.from
          const selStart = actualInsertPos + (state.selection.from - dragSrcStart)
          
          tr.setSelection(TextSelection.create(tr.doc, selStart, selStart + newSelSize))
          
          dispatch(tr)
          resetDragState()
          view.dom.classList.remove('is-dragging')
          return true
        }
      },
      handleKeyDown(view, event) {
        const keys = hotkeys.value

        if (isHotkeyMatch(event, keys.selectLine)) {
          const { state, dispatch } = view
          const { selection } = state
          const $from = state.doc.resolve(selection.from)
          
          let depth = $from.depth
          while (depth > 0 && !$from.node(depth).isTextblock) {
            depth--
          }
          if (depth === 0) depth = Math.max(1, $from.depth)

          const start = $from.start(depth)
          const end = $from.end(depth)
          dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)))
          return true
        }

        const isUp = isHotkeyMatch(event, keys.moveUp)
        const isDown = isHotkeyMatch(event, keys.moveDown)
        if (isUp || isDown) {
          const { state, dispatch } = view
          const { selection } = state
          if (selection.empty) return false

          const dir = isUp ? -1 : 1
          const $from = state.doc.resolve(selection.from)
          const $to = state.doc.resolve(selection.to)
          const bounds = getDragBounds($from, $to)

          let deleteStart = bounds.start
          let deleteEnd = bounds.end

          // Expand deletion to parent wrappers if we are moving the ONLY child(ren).
          // This prevents leaving empty <bullet_list> tags behind.
          while (true) {
            const $s = state.doc.resolve(deleteStart)
            const $e = state.doc.resolve(deleteEnd)
            if ($s.depth > 0 && !$s.nodeBefore && !$e.nodeAfter) {
              deleteStart = $s.before($s.depth)
              deleteEnd = $e.after($e.depth)
            } else {
              break
            }
          }

          // A "moveable" block is any leaf block we want to step over (e.g. paragraphs, list items).
          // We intentionally EXCLUDE wrapper blocks like bullet_list so the loop steps *into* them.
          const isMoveable = (node) => {
            if (!node || !node.isBlock) return false
            if (['bullet_list', 'ordered_list', 'blockquote'].includes(node.type.name)) return false
            return true
          }

          let insertPos = null;
          if (dir === -1) { // Move UP
            let pos = deleteStart
            while (pos > 0) {
              const node = state.doc.resolve(pos).nodeBefore
              if (isMoveable(node)) {
                insertPos = pos - node.nodeSize
                break
              }
              pos--
            }
            if (insertPos === null) return true // Hit top of document
          } else { // Move DOWN
            let pos = deleteEnd
            while (pos < state.doc.content.size) {
              const node = state.doc.nodeAt(pos)
              if (isMoveable(node)) {
                insertPos = pos + node.nodeSize
                break
              }
              pos++
            }
            if (insertPos === null) return true // Hit bottom of document
          }

          const slice = state.doc.slice(bounds.start, bounds.end)
          const sizeToDelete = deleteEnd - deleteStart
          const tr = state.tr

          tr.delete(deleteStart, deleteEnd)
          
          let mappedInsertPos = insertPos
          if (insertPos > deleteStart) mappedInsertPos -= sizeToDelete
          
          const docSizeBefore = tr.doc.content.size
          tr.insert(mappedInsertPos, slice.content)
          const insertedSize = tr.doc.content.size - docSizeBefore
          
          // ProseMirror might auto-wrap the content (e.g., adding <bullet_list> tags).
          // We adjust the selection offset based on how many structural tokens were injected.
          const wrapperOffset = Math.floor((insertedSize - sizeToDelete) / 2)
          const selFrom = mappedInsertPos + (selection.from - deleteStart) + wrapperOffset
          const selTo = mappedInsertPos + (selection.to - deleteStart) + wrapperOffset
          
          const safeFrom = Math.max(0, Math.min(tr.doc.content.size, selFrom))
          const safeTo = Math.max(0, Math.min(tr.doc.content.size, selTo))
          tr.setSelection(TextSelection.create(tr.doc, safeFrom, safeTo))
          
          dispatch(tr)
          return true
        }
        return false
      }
    }
  })
})

// --- Editor setup ---

const { loading, get } = useEditor((root) =>
  Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.content || '')
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
        const fixed = markdown.replace(/\\\[\\\[/g, '[[')
        emit('update', fixed)
      })
      ctx.update(prosePluginsCtx, (plugins) => [...plugins, highlightPlugin])
      ctx.update(remarkPluginsCtx, (plugins) => [
        ...plugins,
        { plugin: mermaidRemarkPlugin, options: {} },
        { plugin: wikiLinkRemarkPlugin, options: {} },
      ])
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(floatingToolbarPlugin)
    .use(taskCheckboxPlugin)
    .use(trailingParagraphPlugin)
    .use(mermaidConvertPlugin)
    .use(mermaidNode)
    .use(
      $view(mermaidNode, () =>
        nodeViewFactory({
          component: MermaidComponent,
          stopEvent: () => true,
        })
      )
    )
    .use(wikiLinkNode)
    .use(wikiTriggerPlugin)
    .use(inlineCompletionPlugin)
    .use(lineNumbersPlugin)
    .use(dragHandlePlugin)
    .use(
      $view(wikiLinkNode, () =>
        nodeViewFactory({
          component: WikiLinkChip,
          as: 'span',
          stopEvent: () => true,
        })
      )
    )
)

onUnmounted(() => themeObserver.disconnect())

function dispatchHighlights(comments) {
  get()?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return
    view.dispatch(view.state.tr.setMeta(HIGHLIGHT_KEY, comments || []))
  })
}

watch(loading, (isLoading) => {
  if (!isLoading) dispatchHighlights(props.comments)
})

watch(() => props.comments, (comments) => {
  if (!loading.value) dispatchHighlights(comments)
}, { deep: true })

function hasLinkAtSelection() {
  return get()?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    const { from, to, $from } = view.state.selection
    const linkMark = view.state.schema.marks.link
    if (!linkMark) return false
    if (from === to) return linkMark.isInSet($from.marks()) != null
    return view.state.doc.rangeHasMark(from, to, linkMark)
  }) ?? false
}

function addLink(url) {
  get()?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return
    const { from, to } = view.state.selection
    const linkMark = view.state.schema.marks.link
    if (!linkMark) return
    const tr = view.state.tr.addMark(from, to, linkMark.create({ href: url }))
    view.dispatch(tr)
  })
}

function removeLink() {
  get()?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return
    const { from, to } = view.state.selection
    const linkMark = view.state.schema.marks.link
    if (!linkMark) return
    view.dispatch(view.state.tr.removeMark(from, to, linkMark))
  })
}

function focusEditor() {
  get()?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    view?.focus()
  })
}

defineExpose({ hasLinkAtSelection, addLink, removeLink, focusEditor })
</script>
