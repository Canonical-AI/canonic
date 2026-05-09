/**
 * Tests for comment sync (electron/comment-sync.js)
 *
 * Covers two directions:
 *   A) You commenting on a peer's file  → flushPeerComments posts to their server
 *   B) A peer commenting on your file   → your share server's POST /comments stores it
 *
 * Key invariant: sync only happens when the peer is online (present in onlinePeers).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ── Helpers ──────────────────────────────────────────────────────────────────

const tmpBase = path.join(os.tmpdir(), `canonic-sync-test-${process.pid}`)

function makePeerCommentsDir(base) {
  const dir = path.join(base, 'peers')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeComments(dir, author, filename, comments) {
  const authorDir = path.join(dir, author)
  fs.mkdirSync(authorDir, { recursive: true })
  fs.writeFileSync(path.join(authorDir, filename), JSON.stringify(comments, null, 2), 'utf-8')
}

function readComments(dir, author, filename) {
  return JSON.parse(fs.readFileSync(path.join(dir, author, filename), 'utf-8'))
}

async function post(url, body) {
  const { default: fetch } = await import('node-fetch')
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

// ── flushPeerComments ─────────────────────────────────────────────────────────

const shareService = await import('../../electron/share.js')
const { flushPeerComments } = await import('../../electron/comment-sync.js')

const workspaceDir = path.join(tmpBase, 'workspace')
fs.mkdirSync(workspaceDir, { recursive: true })
fs.writeFileSync(path.join(workspaceDir, 'notes.md'), '# Notes', 'utf-8')

describe('flushPeerComments — only syncs when peer is online', () => {
  let peerCommentsDir
  let testDir

  beforeEach(() => {
    testDir = path.join(tmpBase, `run-${Date.now()}`)
    peerCommentsDir = makePeerCommentsDir(testDir)
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('skips authors whose peer is not in onlinePeers (offline)', async () => {
    writeComments(peerCommentsDir, 'alice', 'notes.md.json', [
      { id: 'c1', text: 'Nice doc', synced: false, anchor: {} }
    ])

    // Pass empty onlinePeers — alice is offline
    await flushPeerComments([], peerCommentsDir)

    const saved = readComments(peerCommentsDir, 'alice', 'notes.md.json')
    expect(saved[0].synced).toBe(false)
  })

  it('skips already-synced comments even when peer is online', async () => {
    const share = await shareService.startShare(workspaceDir, 'notes.md', { permission: 'comment' })

    writeComments(peerCommentsDir, share.author ?? 'owner', 'notes.md.json', [
      { id: 'c1', text: 'Already sent', synced: true, anchor: {} }
    ])

    const onlinePeers = [{
      name: share.author ?? 'owner',
      host: '127.0.0.1',
      port: share.port,
      token: share.token
    }]

    await flushPeerComments(onlinePeers, peerCommentsDir)
    shareService.stopShare('notes.md')

    const saved = readComments(peerCommentsDir, share.author ?? 'owner', 'notes.md.json')
    expect(saved[0].synced).toBe(true) // unchanged
  })

  it('POSTs unsynced comments to an online peer and marks them synced', async () => {
    const share = await shareService.startShare(workspaceDir, 'notes.md', { permission: 'comment' })
    const author = share.author ?? 'peer-author'

    writeComments(peerCommentsDir, author, 'notes.md.json', [
      { id: 'c1', text: 'Great point', synced: false, anchor: { quotedText: 'Notes' } },
      { id: 'c2', text: 'Agreed', synced: false, anchor: {} }
    ])

    const onlinePeers = [{
      name: author,
      host: '127.0.0.1',
      port: share.port,
      token: share.token
    }]

    await flushPeerComments(onlinePeers, peerCommentsDir)
    shareService.stopShare('notes.md')

    const saved = readComments(peerCommentsDir, author, 'notes.md.json')
    expect(saved.every(c => c.synced)).toBe(true)
  })

  it('leaves comments unsynced when POST fails (peer unreachable)', async () => {
    writeComments(peerCommentsDir, 'bob', 'notes.md.json', [
      { id: 'c1', text: 'Hello', synced: false, anchor: {} }
    ])

    const onlinePeers = [{
      name: 'bob',
      host: '127.0.0.1',
      port: 1, // nothing listening here
      token: 'tok'
    }]

    await flushPeerComments(onlinePeers, peerCommentsDir)

    const saved = readComments(peerCommentsDir, 'bob', 'notes.md.json')
    expect(saved[0].synced).toBe(false)
  })

  it('skips private comments even when peer is online', async () => {
    const share = await shareService.startShare(workspaceDir, 'notes.md', { permission: 'comment' })
    const author = share.author ?? 'private-author'

    writeComments(peerCommentsDir, author, 'notes.md.json', [
      { id: 'c1', text: 'Private note', synced: false, private: true, anchor: {} },
      { id: 'c2', text: 'Public comment', synced: false, anchor: {} }
    ])

    const onlinePeers = [{
      name: author,
      host: '127.0.0.1',
      port: share.port,
      token: share.token
    }]

    await flushPeerComments(onlinePeers, peerCommentsDir)
    shareService.stopShare('notes.md')

    const saved = readComments(peerCommentsDir, author, 'notes.md.json')
    expect(saved.find(c => c.id === 'c1').synced).toBe(false)  // private — never synced
    expect(saved.find(c => c.id === 'c2').synced).toBe(true)   // public — synced
  })

  it('only POSTs the unsynced subset — not already-synced comments', async () => {
    const share = await shareService.startShare(workspaceDir, 'notes.md', { permission: 'comment' })
    const author = share.author ?? 'mixed-author'

    writeComments(peerCommentsDir, author, 'notes.md.json', [
      { id: 'c1', text: 'Already sent', synced: true, anchor: {} },
      { id: 'c2', text: 'New comment', synced: false, anchor: {} }
    ])

    const onlinePeers = [{
      name: author,
      host: '127.0.0.1',
      port: share.port,
      token: share.token
    }]

    await flushPeerComments(onlinePeers, peerCommentsDir)
    shareService.stopShare('notes.md')

    const saved = readComments(peerCommentsDir, author, 'notes.md.json')
    expect(saved.find(c => c.id === 'c1').synced).toBe(true) // was already true
    expect(saved.find(c => c.id === 'c2').synced).toBe(true) // now synced
  })
})

// ── Receiving comments — POST /comments on your own share ─────────────────────

const workspaceDir2 = path.join(tmpBase, 'workspace2')
fs.mkdirSync(workspaceDir2, { recursive: true })
fs.writeFileSync(path.join(workspaceDir2, 'spec.md'), '# Spec', 'utf-8')

const RECEIVED_FILE = path.join(os.homedir(), '.canonic', 'comments', 'spec.md.json')

function cleanupReceived() {
  if (fs.existsSync(RECEIVED_FILE)) fs.unlinkSync(RECEIVED_FILE)
}

describe('POST /comments — receiving comments on your own share', () => {
  let share

  beforeEach(async () => {
    share = await shareService.startShare(workspaceDir2, 'spec.md', { permission: 'comment' })
    cleanupReceived()
  })

  afterEach(() => {
    shareService.stopShare('spec.md')
    cleanupReceived()
  })

  it('stores received comments with correct structure', async () => {
    const url = `http://127.0.0.1:${share.port}/comments?token=${share.token}`
    const comment = {
      id: 'peer-c1',
      author: 'Priya Nair',
      text: 'Looks good to me',
      anchor: { quotedText: 'Spec' },
      createdAt: new Date().toISOString()
    }
    const res = await post(url, { filePath: 'spec.md', comments: [comment] })
    expect(res.status).toBe(200)

    const saved = JSON.parse(fs.readFileSync(RECEIVED_FILE, 'utf-8'))
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe('peer-c1')
    expect(saved[0].author).toBe('Priya Nair')
    expect(saved[0].text).toBe('Looks good to me')
  })

  it('rejects comments when share has view-only permission', async () => {
    shareService.stopShare('spec.md')
    const viewShare = await shareService.startShare(workspaceDir2, 'spec.md', { permission: 'view' })
    const url = `http://127.0.0.1:${viewShare.port}/comments?token=${viewShare.token}`
    const res = await post(url, {
      filePath: 'spec.md',
      comments: [{ id: 'c1', text: 'Hi', anchor: {} }]
    })
    expect(res.status).toBe(403)
    shareService.stopShare('spec.md')
  })

  it('rejects comments with wrong token regardless of permission', async () => {
    const url = `http://127.0.0.1:${share.port}/comments?token=badtoken`
    const res = await post(url, {
      filePath: 'spec.md',
      comments: [{ id: 'c1', text: 'Hi', anchor: {} }]
    })
    expect(res.status).toBe(403)
  })

  it('deduplicates received comments by id', async () => {
    const url = `http://127.0.0.1:${share.port}/comments?token=${share.token}`
    const comment = { id: 'dup-1', text: 'Duplicate', anchor: {}, createdAt: new Date().toISOString() }
    await post(url, { filePath: 'spec.md', comments: [comment] })
    await post(url, { filePath: 'spec.md', comments: [comment] })

    const saved = JSON.parse(fs.readFileSync(RECEIVED_FILE, 'utf-8'))
    expect(saved.filter(c => c.id === 'dup-1')).toHaveLength(1)
  })

  it('accumulates comments from multiple peers across separate POSTs', async () => {
    const url = `http://127.0.0.1:${share.port}/comments?token=${share.token}`
    await post(url, {
      filePath: 'spec.md',
      comments: [{ id: 'a1', author: 'Alice', text: 'From Alice', anchor: {}, createdAt: new Date().toISOString() }]
    })
    await post(url, {
      filePath: 'spec.md',
      comments: [{ id: 'b1', author: 'Bob', text: 'From Bob', anchor: {}, createdAt: new Date().toISOString() }]
    })

    const saved = JSON.parse(fs.readFileSync(RECEIVED_FILE, 'utf-8'))
    expect(saved).toHaveLength(2)
    expect(saved.map(c => c.id)).toEqual(expect.arrayContaining(['a1', 'b1']))
  })
})
