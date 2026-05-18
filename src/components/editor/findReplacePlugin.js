import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

export const FIND_KEY = new PluginKey('find-replace')

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRegex(query, opts) {
  if (!query) return null
  try {
    let pattern = opts.regex ? query : escapeRegex(query)
    if (opts.word) pattern = `\\b(?:${pattern})\\b`
    const flags = 'g' + (opts.case ? '' : 'i')
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}

function findAll(text, re) {
  const out = []
  if (!re || !text) return out
  for (const m of text.matchAll(re)) {
    if (m[0].length === 0) continue
    out.push({ from: m.index, to: m.index + m[0].length, text: m[0] })
  }
  return out
}

export function computeMatches(text, query, opts = {}) {
  if (!query) return []
  const re = buildRegex(query, opts)
  if (!re) return []
  return findAll(text, re)
}

export function cycleIndex(current, total, direction) {
  if (total === 0) return -1
  return (current + direction + total) % total
}

function findMatchesInDoc(doc, query, opts) {
  if (!query) return []
  const re = buildRegex(query, opts)
  if (!re) return []
  const matches = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const m of findAll(node.text || '', re)) {
      matches.push({ from: pos + m.from, to: pos + m.to, text: m.text })
    }
  })
  return matches
}

function buildDecorations(doc, matches, currentIndex) {
  if (!matches.length) return DecorationSet.empty
  const decos = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === currentIndex ? 'find-match find-match-current' : 'find-match',
    })
  )
  return DecorationSet.create(doc, decos)
}

const EMPTY_STATE = {
  query: '',
  opts: { case: false, word: false, regex: false },
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
}

export function findReplacePlugin() {
  return new Plugin({
    key: FIND_KEY,
    state: {
      init() { return { ...EMPTY_STATE } },
      apply(tr, prev) {
        const meta = tr.getMeta(FIND_KEY)

        if (meta) {
          if (meta.type === 'clear') {
            return { ...EMPTY_STATE }
          }
          if (meta.type === 'set') {
            const query = meta.query ?? prev.query
            const opts = meta.opts ?? prev.opts
            const matches = findMatchesInDoc(tr.doc, query, opts)
            const current = matches.length ? 0 : -1
            return {
              query,
              opts,
              matches,
              current,
              decorations: buildDecorations(tr.doc, matches, current),
            }
          }
          if (meta.type === 'cycle') {
            const current = cycleIndex(prev.current, prev.matches.length, meta.direction)
            return {
              ...prev,
              current,
              decorations: buildDecorations(tr.doc, prev.matches, current),
            }
          }
        }

        if (tr.docChanged && prev.query) {
          const matches = findMatchesInDoc(tr.doc, prev.query, prev.opts)
          const current = matches.length
            ? Math.min(prev.current >= 0 ? prev.current : 0, matches.length - 1)
            : -1
          return {
            ...prev,
            matches,
            current,
            decorations: buildDecorations(tr.doc, matches, current),
          }
        }

        if (tr.docChanged) {
          return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) }
        }

        return prev
      },
    },
    props: {
      decorations(state) {
        return this.getState(state).decorations
      },
    },
  })
}

export function findReplaceSet(view, query, opts) {
  view.dispatch(view.state.tr.setMeta(FIND_KEY, { type: 'set', query, opts }))
}

export function findReplaceCycle(view, direction) {
  const state = FIND_KEY.getState(view.state)
  if (!state || state.matches.length === 0) return null
  const nextIdx = cycleIndex(state.current, state.matches.length, direction)
  view.dispatch(view.state.tr.setMeta(FIND_KEY, { type: 'cycle', direction }))
  return nextIdx
}

export function findReplaceClear(view) {
  view.dispatch(view.state.tr.setMeta(FIND_KEY, { type: 'clear' }))
}

export function findReplaceState(view) {
  return FIND_KEY.getState(view.state)
}
