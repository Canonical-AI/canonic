import { describe, it, expect } from 'vitest'
import { computeMatches, cycleIndex } from '../../src/components/editor/findReplacePlugin.js'

describe('computeMatches', () => {
  const doc = 'The quick brown fox.\nThe lazy dog watches the fox.'

  it('returns empty array for empty query', () => {
    expect(computeMatches(doc, '', {})).toEqual([])
  })

  it('returns all matches case-insensitive by default', () => {
    const m = computeMatches(doc, 'the', {})
    expect(m).toHaveLength(3)
  })

  it('respects case-sensitive option', () => {
    const m = computeMatches(doc, 'the', { case: true })
    expect(m).toHaveLength(1)
    const upper = computeMatches(doc, 'The', { case: true })
    expect(upper).toHaveLength(2)
  })

  it('respects whole-word option', () => {
    const m = computeMatches('foxes fox foxy', 'fox', { word: true })
    expect(m).toHaveLength(1)
    expect(m[0].from).toBe(6)
  })

  it('handles regex option', () => {
    const m = computeMatches('a1 b22 c333', '\\d+', { regex: true })
    expect(m).toHaveLength(3)
    expect(m[1].text).toBe('22')
  })

  it('returns empty array for invalid regex without throwing', () => {
    const m = computeMatches('abc', '([', { regex: true })
    expect(m).toEqual([])
  })

  it('escapes special chars when regex is off', () => {
    const m = computeMatches('a.b a.b axb', 'a.b', {})
    expect(m).toHaveLength(2)
  })
})

describe('cycleIndex', () => {
  it('next wraps from last to first', () => {
    expect(cycleIndex(2, 3, 1)).toBe(0)
  })
  it('prev wraps from first to last', () => {
    expect(cycleIndex(0, 3, -1)).toBe(2)
  })
  it('moves forward in middle', () => {
    expect(cycleIndex(0, 5, 1)).toBe(1)
  })
  it('returns -1 when no matches', () => {
    expect(cycleIndex(0, 0, 1)).toBe(-1)
  })
})
