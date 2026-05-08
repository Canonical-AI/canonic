import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir
let buildIndex, stopWatcher

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonic-idx-'))
  const mod = await import('../../electron/fileIndex.js')
  buildIndex = mod.buildIndex
  stopWatcher = mod.stopWatcher
})

afterEach(() => {
  stopWatcher()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('buildIndex', () => {
  it('returns empty object for empty workspace', () => {
    expect(buildIndex(tmpDir)).toEqual({})
  })

  it('indexes root-level md files by name without extension', () => {
    fs.writeFileSync(path.join(tmpDir, 'design.md'), '')
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '')
    const idx = buildIndex(tmpDir)
    expect(idx['design']).toBe('design.md')
    expect(idx['notes']).toBe('notes.md')
  })

  it('indexes nested md files', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs'))
    fs.writeFileSync(path.join(tmpDir, 'docs', 'roadmap.md'), '')
    const idx = buildIndex(tmpDir)
    expect(idx['roadmap']).toBe('docs/roadmap.md')
  })

  it('prefers shortest path when name collision exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'sub'))
    fs.writeFileSync(path.join(tmpDir, 'design.md'), '')
    fs.writeFileSync(path.join(tmpDir, 'sub', 'design.md'), '')
    const idx = buildIndex(tmpDir)
    expect(idx['design']).toBe('design.md')
  })

  it('ignores non-md files', () => {
    fs.writeFileSync(path.join(tmpDir, 'image.png'), '')
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '')
    expect(buildIndex(tmpDir)).toEqual({})
  })

  it('ignores dot-files and node_modules', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD.md'), '')
    fs.mkdirSync(path.join(tmpDir, 'node_modules'))
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg.md'), '')
    expect(buildIndex(tmpDir)).toEqual({})
  })
})
