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
import { Plugin, PluginKey } from 'prosemirror-state'
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

// --- isDark provide (for MermaidComponent) ---

const LIGHT_THEMES = new Set(['paper'])
const getIsDark = () => !LIGHT_THEMES.has(document.documentElement.getAttribute('data-theme'))

const isDark = ref(getIsDark())

const themeObserver = new MutationObserver(() => {
  isDark.value = getIsDark()
})
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

provide('isDark', isDark)

// --- Node view factory ---

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

      const { state } = view
      // The first [ is immediately before the insertion point (_from)
      const before = state.doc.textBetween(Math.max(0, _from - 1), _from)
      if (before !== '[') return false

      // Capture the start of [[ at trigger time so insertWikiLink isn't
      // sensitive to cursor movement while the tooltip is open.
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
  // After handleTextInput returns false the second [ is inserted, so [[ spans
  // bracketStart to bracketStart + 2.
  const node = nodeType.create({ name, anchor: null })
  dispatch(state.tr.replaceWith(bracketStart, bracketStart + 2, node))
}

// --- Inline completion plugin ---

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

// --- Task list checkbox click-to-toggle ---
const taskCheckboxPlugin = $prose(() => new Plugin({
  props: {
    handleClick(view, pos, event) {
      if (!view.editable) return false
      const target = event.target
      if (!(target instanceof HTMLElement)) return false
      const li = target.closest('li[data-item-type="task"]')
      if (!li) return false

      // Only toggle when clicking the checkbox zone (left ~24px)
      const liRect = li.getBoundingClientRect()
      if (event.clientX - liRect.left > 24) return false

      const $pos = view.state.doc.resolve(pos)
      for (let d = $pos.depth; d >= 0; d--) {
        const node = $pos.node(d)
        if (node.type.name === 'list_item' && node.attrs.checked != null) {
          view.dispatch(
            view.state.tr.setNodeMarkup($pos.before(d), null, {
              ...node.attrs,
              checked: !node.attrs.checked,
            })
          )
          return true
        }
      }
      return false
    }
  }
}))


// --- Trailing paragraph plugin ---
// ProseMirror atom nodes (mermaid_block, wiki_link) at the end of the doc leave no
// place to put the cursor. This plugin ensures there is always a trailing paragraph.
const trailingParagraphPlugin = $prose(() => new Plugin({
  appendTransaction(transactions, _oldState, newState) {
    if (!transactions.some(tr => tr.docChanged)) return null
    const { doc, schema, tr } = newState
    const last = doc.lastChild
    if (!last || last.type === schema.nodes.paragraph) return null
    return tr.insert(doc.content.size, schema.nodes.paragraph.create())
  }
}))

// --- Mermaid code-block → mermaid_block auto-conversion ---
// When the user types ```mermaid, commonmark creates a code_block with language='mermaid'.
// This plugin converts it to a mermaid_block node so the diagram card renders.
const mermaidConvertPlugin = $prose(() => new Plugin({
  appendTransaction(transactions, _oldState, newState) {
    if (!transactions.some(tr => tr.docChanged)) return null
    const mermaidType = newState.schema.nodes.mermaid_block
    if (!mermaidType) return null

    let tr = null
    newState.doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block' || node.attrs.language !== 'mermaid') return
      const content = node.textContent || ''
      if (!tr) tr = newState.tr
      tr.replaceWith(pos, pos + node.nodeSize, mermaidType.create({ value: content }))
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
        
        // Use view.coordsAtPos to find the vertical position of the start of the block
        try {
          const coords = view.coordsAtPos(pos)
          line.style.top = `${coords.top - domRect.top}px`
          line.style.height = `${coords.bottom - coords.top}px`
          line.textContent = num
          gutter.appendChild(line)
        } catch (e) {
          // Ignore errors if pos is not valid/mappable yet
        }
      }

      doc.descendants((node, pos) => {
        if (node.isBlock) {
          // If it's a leaf block (like a paragraph, heading, or list item)
          // or a code block (which we treat as a single block for now, but could split)
          const isLeafBlock = node.childCount === 0 || (node.firstChild && (node.firstChild.isText || node.firstChild.isInline))
          const isListItem = node.type.name === 'list_item'
          
          if (isLeafBlock || isListItem) {
            // list_item often contains a paragraph, so we only number the list_item itself
            // to avoid double numbering if it's a "simple" list item.
            // However, if the paragraph is the first child, coordsAtPos(pos) will be the same.
            
            // Logic: number if it's a paragraph, heading, list_item, etc.
            // But skip the container if we are numbering the contents.
            const typesToNumber = ['paragraph', 'heading', 'list_item', 'blockquote', 'code_block', 'hr']
            if (typesToNumber.includes(node.type.name)) {
                // Special check for list_item to avoid double-counting its internal paragraph
                if (node.type.name === 'paragraph' && view.state.doc.resolve(pos).parent.type.name === 'list_item') {
                    return true 
                }

                if (node.type.name === 'code_block') {
                    // Number each line inside the code block
                    const lines = node.textContent.split('\n')
                    const startPos = pos + 1
                    let currentOffset = 0
                    
                    lines.forEach((_, i) => {
                        // We find the position of the start of this line of text
                        renderLine(startPos + currentOffset, lineNumber++)
                        currentOffset += lines[i].length + 1
                    })
                } else {
                    renderLine(pos, lineNumber++)
                }
            }
          }
          return true // Always go deeper to find nested blocks
        }
        return false
      })
    }

    update(view)
    return {
      update,
      destroy() { gutter.remove() }
    }
  }
}))

// --- Editor setup ---

const { loading, get } = useEditor((root) =>
  Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.content || '')
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
        // remark-stringify escapes [[ to \[\[ — unescape wiki-link openings
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

// Apply highlights once the editor is ready
watch(loading, (isLoading) => {
  if (!isLoading) dispatchHighlights(props.comments)
})

// Reapply when comments list changes (add, resolve, delete, demo inject)
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
