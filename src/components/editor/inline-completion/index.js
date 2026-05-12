import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

const COMPLETION_KEY = new PluginKey('inlineCompletion')

// Only trigger at word/sentence boundaries — mirrors Zed's approach
const BOUNDARY_RE = /[\s,;:.!?)\]}"']$/

function isInCodeContext(state) {
  const sel = state.selection
  if (!sel.empty) return true
  const { $cursor } = sel
  if (!$cursor) return true
  const parentName = $cursor.parent.type.name
  if (parentName === 'code_block' || parentName === 'mermaid_block') return true
  const codeMark = state.schema.marks.code
  if (codeMark && codeMark.isInSet($cursor.marks())) return true
  return false
}

function extractContext(state) {
  const { $cursor } = state.selection
  if (!$cursor) return null
  const pos = $cursor.pos
  const docSize = state.doc.content.size
  const prefix = state.doc.textBetween(Math.max(0, pos - 2000), pos, '\n', '￼')
  const suffix = state.doc.textBetween(pos, Math.min(docSize, pos + 500), '\n', '￼')
  return { prefix, suffix, cursorPos: pos }
}

function atWordBoundary(prefix) {
  if (!prefix) return false
  return BOUNDARY_RE.test(prefix)
}

function isAtEndOfLine(suffix) {
  if (!suffix) return true
  return /^\s*(\n|$)/.test(suffix)
}

function buildGhostDecoration(doc, pos, text) {
  const widget = document.createElement('span')
  widget.className = 'inline-completion-ghost'
  widget.textContent = text
  widget.setAttribute('aria-hidden', 'true')
  return DecorationSet.create(doc, [
    Decoration.widget(pos, widget, {
      side: 1,
      key: 'inline-completion',
      ignoreSelection: true,
      stopEvent: () => true,
    }),
  ])
}

function getFirstWord(text) {
  const match = text.match(/^(\s*\S+)/)
  return match ? match[1] : ''
}

function acceptSuggestion(view, text, anchorPos) {
  view.dispatch(
    view.state.tr
      .insertText(text, anchorPos)
      .setMeta(COMPLETION_KEY, { type: 'clear' })
  )
}

export function createInlineCompletionPlugin(config) {
  let debounceTimer = null
  let currentAbort = null

  async function triggerCompletion(view, ctx) {
    if (!config.enabled || !config.apiKey || view.isDestroyed) return

    // Cancel any in-flight request
    currentAbort?.abort()
    const abort = new AbortController()
    currentAbort = abort

    try {
      const result = await window.canonic.ai.complete({
        prefix: ctx.prefix,
        suffix: ctx.suffix,
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        maxTokens: config.maxTokens ?? 25,
        extraInstructions: config.extraInstructions || '',
      })

      if (abort.signal.aborted || view.isDestroyed) return

      const currentCtx = extractContext(view.state)
      if (!currentCtx || currentCtx.prefix !== ctx.prefix) return
      if (isInCodeContext(view.state)) return

      // Single line only — ghost text must stay on the same line
      const text = (result?.text || '').split('\n')[0]
      if (!text.trim()) return

      view.dispatch(
        view.state.tr.setMeta(COMPLETION_KEY, {
          type: 'show',
          text,
          pos: ctx.cursorPos,
        })
      )
    } catch {
      // Completions are best-effort — silent on failure
    }
  }

  return new Plugin({
    key: COMPLETION_KEY,

    state: {
      init() {
        return { suggestion: '', cursorPos: null, decos: DecorationSet.empty }
      },
      apply(tr, prev) {
        const meta = tr.getMeta(COMPLETION_KEY)
        if (meta?.type === 'show') {
          return {
            suggestion: meta.text,
            cursorPos: meta.pos,
            decos: buildGhostDecoration(tr.doc, meta.pos, meta.text),
          }
        }
        if (meta?.type === 'clear') {
          return { suggestion: '', cursorPos: null, decos: DecorationSet.empty }
        }
        if (tr.docChanged) {
          return { suggestion: '', cursorPos: null, decos: DecorationSet.empty }
        }
        return { ...prev, decos: prev.decos.map(tr.mapping, tr.doc) }
      },
    },

    props: {
      decorations(state) {
        return COMPLETION_KEY.getState(state).decos
      },

      handleKeyDown(view, event) {
        const { suggestion, cursorPos } = COMPLETION_KEY.getState(view.state)

        if (!suggestion) return false

        if (event.key === 'Tab') {
          event.preventDefault()
          clearTimeout(debounceTimer)
          currentAbort?.abort()
          acceptSuggestion(view, suggestion, cursorPos)
          return true
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          clearTimeout(debounceTimer)
          currentAbort?.abort()
          view.dispatch(view.state.tr.setMeta(COMPLETION_KEY, { type: 'clear' }))
          return true
        }

        if (event.key === 'ArrowRight' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          clearTimeout(debounceTimer)
          currentAbort?.abort()
          const word = getFirstWord(suggestion)
          if (word) acceptSuggestion(view, word, cursorPos)
          return true
        }

        clearTimeout(debounceTimer)
        currentAbort?.abort()
        return false
      },
    },

    view() {
      return {
        update(view, prevState) {
          if (!config.enabled || !config.apiKey) return
          if (!view.state.doc.eq(prevState.doc)) {
            clearTimeout(debounceTimer)
            if (isInCodeContext(view.state)) return
            const ctx = extractContext(view.state)
            if (!ctx) return
            if (ctx.prefix.trim().length < 3) return
            if (config.wordBoundaryOnly && !atWordBoundary(ctx.prefix)) return
            if (!isAtEndOfLine(ctx.suffix)) return
            debounceTimer = setTimeout(() => triggerCompletion(view, ctx), config.debounceMs ?? 350)
          }
        },
        destroy() {
          clearTimeout(debounceTimer)
          currentAbort?.abort()
        },
      }
    },
  })
}
