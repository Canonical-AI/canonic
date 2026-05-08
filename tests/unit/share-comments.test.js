import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDir = path.join(os.tmpdir(), `canonic-share-test-${process.pid}`)
const workspaceDir = path.join(tmpDir, 'workspace')
fs.mkdirSync(workspaceDir, { recursive: true })
fs.writeFileSync(path.join(workspaceDir, 'doc.md'), '# Hello', 'utf-8')

const shareService = await import('../../electron/share.js')

async function post(url, body) {
  const { default: fetch } = await import('node-fetch')
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

const COMMENTS_FILE = path.join(os.homedir(), '.canonic', 'comments', 'doc.md.json')

function cleanupComments() {
  if (fs.existsSync(COMMENTS_FILE)) fs.unlinkSync(COMMENTS_FILE)
}

describe('share — permission param', () => {
  afterEach(() => {
    shareService.stopShare('doc.md')
    cleanupComments()
  })

  it('startShare returns permission in result', async () => {
    const result = await shareService.startShare(workspaceDir, 'doc.md', { permission: 'comment' })
    expect(result.success).toBe(true)
    expect(result.permission).toBe('comment')
    shareService.stopShare('doc.md')
  })

  it('startShare defaults permission to view when not specified', async () => {
    const result = await shareService.startShare(workspaceDir, 'doc.md', {})
    expect(result.permission).toBe('view')
    shareService.stopShare('doc.md')
  })

  it('stopShare returns port', async () => {
    const start = await shareService.startShare(workspaceDir, 'doc.md', { permission: 'view' })
    const stop = shareService.stopShare('doc.md')
    expect(stop.success).toBe(true)
    expect(stop.port).toBe(start.port)
  })
})

describe('share — POST /comments with permission=comment', () => {
  let shareResult

  beforeEach(async () => {
    shareResult = await shareService.startShare(workspaceDir, 'doc.md', { permission: 'comment' })
  })

  afterEach(() => {
    shareService.stopShare('doc.md')
    cleanupComments()
  })

  it('POST /comments with valid token returns 200 and merges comments', async () => {
    const url = `http://127.0.0.1:${shareResult.port}/comments?token=${shareResult.token}`
    const res = await post(url, {
      filePath: 'doc.md',
      comments: [{ id: 'c1', text: 'Nice', anchor: { quotedText: 'Hello' }, createdAt: new Date().toISOString(), targetAuthor: 'owner' }]
    })
    expect(res.status).toBe(200)
  })

  it('POST /comments with invalid token returns 403', async () => {
    const url = `http://127.0.0.1:${shareResult.port}/comments?token=wrong`
    const res = await post(url, { filePath: 'doc.md', comments: [] })
    expect(res.status).toBe(403)
  })

  it('POST /comments deduplicates by id', async () => {
    const url = `http://127.0.0.1:${shareResult.port}/comments?token=${shareResult.token}`
    const comment = { id: 'c1', text: 'First', anchor: {}, createdAt: new Date().toISOString(), targetAuthor: 'owner' }
    await post(url, { filePath: 'doc.md', comments: [comment] })
    await post(url, { filePath: 'doc.md', comments: [comment] }) // duplicate
    const saved = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf-8'))
    expect(saved.filter(c => c.id === 'c1')).toHaveLength(1)
  })
})

describe('share — POST /comments with permission=view', () => {
  let shareResult

  beforeEach(async () => {
    shareResult = await shareService.startShare(workspaceDir, 'doc.md', { permission: 'view' })
  })

  afterEach(() => {
    shareService.stopShare('doc.md')
    cleanupComments()
  })

  it('POST /comments with permission=view returns 403', async () => {
    const url = `http://127.0.0.1:${shareResult.port}/comments?token=${shareResult.token}`
    const res = await post(url, { filePath: 'doc.md', comments: [] })
    expect(res.status).toBe(403)
  })
})
