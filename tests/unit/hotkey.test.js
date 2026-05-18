import { describe, it, expect } from 'vitest'
import { matchesHotkey, normalizeBinding } from '../../src/utils/hotkey.js'

function ev({ key, meta = false, ctrl = false, shift = false, alt = false }) {
  return { key, metaKey: meta, ctrlKey: ctrl, shiftKey: shift, altKey: alt, preventDefault: () => {} }
}

describe('matchesHotkey', () => {
  it('matches Mod-f with cmd+f on mac', () => {
    expect(matchesHotkey(ev({ key: 'f', meta: true }), 'Mod-f')).toBe(true)
  })

  it('matches Mod-f with ctrl+f on windows', () => {
    expect(matchesHotkey(ev({ key: 'f', ctrl: true }), 'Mod-f')).toBe(true)
  })

  it('does not match Mod-f when no modifier pressed', () => {
    expect(matchesHotkey(ev({ key: 'f' }), 'Mod-f')).toBe(false)
  })

  it('distinguishes Mod-f from Mod-Shift-f', () => {
    expect(matchesHotkey(ev({ key: 'f', meta: true, shift: true }), 'Mod-f')).toBe(false)
    expect(matchesHotkey(ev({ key: 'F', meta: true, shift: true }), 'Mod-Shift-f')).toBe(true)
  })

  it('matches case-insensitively on key', () => {
    expect(matchesHotkey(ev({ key: 'G', meta: true, shift: true }), 'Mod-Shift-g')).toBe(true)
  })

  it('requires alt when binding has Alt', () => {
    expect(matchesHotkey(ev({ key: 'm', meta: true, alt: true }), 'Mod-Alt-m')).toBe(true)
    expect(matchesHotkey(ev({ key: 'm', meta: true }), 'Mod-Alt-m')).toBe(false)
  })

  it('returns false for invalid or empty binding', () => {
    expect(matchesHotkey(ev({ key: 'f', meta: true }), '')).toBe(false)
    expect(matchesHotkey(ev({ key: 'f', meta: true }), null)).toBe(false)
  })
})

describe('normalizeBinding', () => {
  it('lowercases tokens', () => {
    expect(normalizeBinding('MOD-Shift-F')).toBe('mod-shift-f')
  })

  it('handles Cmd as alias for Mod', () => {
    expect(normalizeBinding('Cmd-f')).toBe('mod-f')
  })
})
