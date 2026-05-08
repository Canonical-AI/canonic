<template>
  <Milkdown />
</template>

<script setup>
import { watch, ref, provide, onUnmounted } from 'vue'
import { Milkdown, useEditor } from '@milkdown/vue'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, prosePluginsCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { mermaidRemark, mermaidNode } from './mermaid/index.js'
import MermaidComponent from './mermaid/MermaidComponent.vue'
import { useNodeViewFactory } from '@prosemirror-adapter/vue'
import { $view } from '@milkdown/utils'

const props = defineProps({ content: String, comments: Array })
const emit = defineEmits(['update'])

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

const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark')

const themeObserver = new MutationObserver(() => {
  isDark.value = document.documentElement.getAttribute('data-theme') === 'dark'
})
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

provide('isDark', isDark)

// --- Node view factory ---

const nodeViewFactory = useNodeViewFactory()

// --- Editor setup ---

const { loading, get } = useEditor((root) =>
  Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.content || '')
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => emit('update', markdown))
      ctx.update(prosePluginsCtx, (plugins) => [...plugins, highlightPlugin])
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(mermaidRemark)
    .use(mermaidNode)
    .use(
      $view(mermaidNode, () =>
        nodeViewFactory({
          component: MermaidComponent,
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
