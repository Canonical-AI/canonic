import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Isolate the config dir so we exercise the real file persistence without
// touching the developer's ~/.config/canonic.
const DIR = path.join(os.tmpdir(), `canonic-recents-${process.pid}`)
process.env.CANONIC_CONFIG_DIR = DIR
const recents = await import('../../electron/recents.js')

function reset() {
  fs.rmSync(DIR, { recursive: true, force: true })
}

describe('recents (durable recent-workspace history)', () => {
  beforeEach(reset)
  afterAll(reset)

  it('returns an empty list when nothing is stored yet', () => {
    expect(recents.list()).toEqual([])
  })

  it('add() persists a workspace and survives a re-read', () => {
    recents.add('/ws/a', 'a')
    const list = recents.list()
    expect(list).toHaveLength(1)
    expect(list[0].path).toBe('/ws/a')
    expect(list[0].name).toBe('a')
    expect(fs.existsSync(recents.FILE)).toBe(true)
  })

  it('add() puts the most recent first', () => {
    recents.add('/ws/a', 'a')
    recents.add('/ws/b', 'b')
    expect(recents.list().map((w) => w.path)).toEqual(['/ws/b', '/ws/a'])
  })

  it('re-adding an existing workspace moves it to the front without duplicating', () => {
    recents.add('/ws/a', 'a')
    recents.add('/ws/b', 'b')
    recents.add('/ws/a', 'a')
    const paths = recents.list().map((w) => w.path)
    expect(paths).toEqual(['/ws/a', '/ws/b'])
    expect(paths.filter((p) => p === '/ws/a')).toHaveLength(1)
  })

  it('caps the list at 8 entries', () => {
    for (let i = 0; i < 12; i++) recents.add(`/ws/${i}`, `${i}`)
    const list = recents.list()
    expect(list).toHaveLength(8)
    // newest first → /ws/11 down to /ws/4
    expect(list[0].path).toBe('/ws/11')
  })

  it('defaults the name to the path basename', () => {
    recents.add('/some/place/My Workspace')
    expect(recents.list()[0].name).toBe('My Workspace')
  })

  it('remove() drops a workspace', () => {
    recents.add('/ws/a', 'a')
    recents.add('/ws/b', 'b')
    recents.remove('/ws/a')
    expect(recents.list().map((w) => w.path)).toEqual(['/ws/b'])
  })

  it('tolerates a corrupt store file', () => {
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(recents.FILE, 'not json{', 'utf-8')
    expect(recents.list()).toEqual([])
  })
})
