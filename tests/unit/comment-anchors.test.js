import { describe, it, expect } from 'vitest'
import { isAnchorStale, findStaleCommentIds } from '../../src/utils/comment-anchors.js'

const PLAIN = 'Canonic is a local-first document editor for product managers.\nIt is built on Git.'

function c(over = {}) {
  return { id: 'c1', anchor: { quotedText: 'local-first document editor' }, ...over }
}

describe('isAnchorStale', () => {
  it('not stale when quoted text is present in the doc', () => {
    expect(isAnchorStale(PLAIN, c())).toBe(false)
  })

  it('stale when quoted text no longer appears in the doc', () => {
    expect(isAnchorStale(PLAIN, c({ anchor: { quotedText: 'a local-first writing tool for PMs' } }))).toBe(true)
  })

  it('matches across block boundaries via the "\\n" separator representation', () => {
    // "managers.\nIt" only exists once blocks are joined by a newline
    expect(isAnchorStale(PLAIN, c({ anchor: { quotedText: 'managers.\nIt is built' } }))).toBe(false)
  })

  it('resolved comments are never stale', () => {
    expect(isAnchorStale(PLAIN, c({ resolved: true, anchor: { quotedText: 'gone text' } }))).toBe(false)
  })

  it('quotes shorter than 2 chars are never stale', () => {
    expect(isAnchorStale(PLAIN, c({ anchor: { quotedText: 'x' } }))).toBe(false)
  })

  it('comments without quoted text are never stale', () => {
    expect(isAnchorStale(PLAIN, c({ anchor: { lineNumber: 5 } }))).toBe(false)
    expect(isAnchorStale(PLAIN, c({ anchor: undefined }))).toBe(false)
  })

  it('null doc text (editor not ready) flags nothing', () => {
    expect(isAnchorStale(null, c({ anchor: { quotedText: 'anything' } }))).toBe(false)
  })

  it('empty doc makes any real quote stale', () => {
    expect(isAnchorStale('', c())).toBe(true)
  })
})

describe('findStaleCommentIds', () => {
  it('returns only the ids whose anchor text is missing', () => {
    const comments = [
      c({ id: 'present' }),
      c({ id: 'gone', anchor: { quotedText: 'a local-first writing tool for PMs' } }),
      c({ id: 'resolved-gone', resolved: true, anchor: { quotedText: 'also gone' } }),
    ]
    expect(findStaleCommentIds(PLAIN, comments)).toEqual(['gone'])
  })

  it('handles non-array input', () => {
    expect(findStaleCommentIds(PLAIN, null)).toEqual([])
  })
})
