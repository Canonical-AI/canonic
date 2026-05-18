import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpRoot = path.join(os.tmpdir(), `canonic-wssearch-${process.pid}-${Date.now()}`)

const { searchWorkspace, applyReplacement } = await import('../../electron/workspace-search.js')

function writeFile(rel, content) {
  const full = path.join(tmpRoot, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

describe('searchWorkspace', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpRoot, { recursive: true })
    writeFile('docs/intro.md', 'Hello world\nThis is canonic\nGoodbye world')
    writeFile('docs/spec.md', 'World peace\nworld order')
    writeFile('notes.md', 'random world stuff')
    writeFile('assets/skip.md', 'world should be skipped')
    writeFile('.canonic/internal.md', 'world internal')
    writeFile('node_modules/pkg/x.md', 'world')
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('returns matches across files with line numbers', async () => {
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: 'world',
      opts: { case: false, word: false, regex: false },
    })
    const paths = res.branch.map((r) => r.filePath).sort()
    expect(paths).toEqual(['docs/intro.md', 'docs/spec.md', 'notes.md'])
    const intro = res.branch.find((r) => r.filePath === 'docs/intro.md')
    expect(intro.matches).toHaveLength(2)
    expect(intro.matches[0].line).toBe(1)
    expect(intro.matches[1].line).toBe(3)
  })

  it('skips .canonic, node_modules, assets by default', async () => {
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: 'world',
      opts: {},
    })
    const paths = res.branch.map((r) => r.filePath)
    expect(paths).not.toContain('assets/skip.md')
    expect(paths.find((p) => p.startsWith('.canonic'))).toBeUndefined()
    expect(paths.find((p) => p.startsWith('node_modules'))).toBeUndefined()
  })

  it('respects include glob', async () => {
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: 'world',
      opts: {},
      include: 'docs/**',
    })
    const paths = res.branch.map((r) => r.filePath).sort()
    expect(paths).toEqual(['docs/intro.md', 'docs/spec.md'])
  })

  it('respects exclude glob', async () => {
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: 'world',
      opts: {},
      exclude: 'docs/**',
    })
    const paths = res.branch.map((r) => r.filePath).sort()
    expect(paths).toEqual(['notes.md'])
  })

  it('case-sensitive search', async () => {
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: 'World',
      opts: { case: true },
    })
    const paths = res.branch.map((r) => r.filePath).sort()
    expect(paths).toEqual(['docs/spec.md'])
  })

  it('whole-word search', async () => {
    writeFile('words.md', 'cat catalog scattering cat.')
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: 'cat',
      opts: { word: true },
      include: 'words.md',
    })
    const file = res.branch.find((r) => r.filePath === 'words.md')
    expect(file.matches).toHaveLength(2)
  })

  it('regex search', async () => {
    writeFile('nums.md', 'foo123 bar45 baz6789')
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: '\\d+',
      opts: { regex: true },
      include: 'nums.md',
    })
    const file = res.branch.find((r) => r.filePath === 'nums.md')
    expect(file.matches).toHaveLength(3)
  })

  it('returns lastError for invalid regex', async () => {
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: '([',
      opts: { regex: true },
    })
    expect(res.branch).toEqual([])
    expect(res.error).toMatch(/regex|invalid/i)
  })

  it('returns empty for empty query', async () => {
    const res = await searchWorkspace({
      workspacePath: tmpRoot,
      query: '',
      opts: {},
    })
    expect(res.branch).toEqual([])
  })
})

describe('applyReplacement', () => {
  it('replaces all matches and returns new content', () => {
    const out = applyReplacement({
      content: 'foo bar foo baz',
      query: 'foo',
      replacement: 'qux',
      opts: { case: false, word: false, regex: false },
    })
    expect(out).toBe('qux bar qux baz')
  })

  it('respects case-sensitive', () => {
    const out = applyReplacement({
      content: 'Foo foo FOO',
      query: 'foo',
      replacement: 'x',
      opts: { case: true },
    })
    expect(out).toBe('Foo x FOO')
  })

  it('respects whole-word', () => {
    const out = applyReplacement({
      content: 'foo foobar foo',
      query: 'foo',
      replacement: 'x',
      opts: { word: true },
    })
    expect(out).toBe('x foobar x')
  })

  it('regex with capture groups', () => {
    const out = applyReplacement({
      content: 'a1 b2 c3',
      query: '([a-z])(\\d)',
      replacement: '$2$1',
      opts: { regex: true },
    })
    expect(out).toBe('1a 2b 3c')
  })

  it('returns content unchanged on invalid regex', () => {
    const out = applyReplacement({
      content: 'abc',
      query: '([',
      replacement: 'x',
      opts: { regex: true },
    })
    expect(out).toBe('abc')
  })
})
