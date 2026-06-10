import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

// Covers the in-app side of browser commenting: the live-ingest listener that surfaces
// comments POSTed to an active share, plus reply threads and version stamping. The browser
// page script itself lives in src-tauri/src/server.rs and is covered by Rust tests.
const mockApi = {
  config: { read: vi.fn().mockResolvedValue(null), write: vi.fn(), exists: vi.fn(), validate: vi.fn() },
  workspace: { init: vi.fn(), getDefault: vi.fn(), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: { list: vi.fn().mockResolvedValue([]), read: vi.fn(), write: vi.fn(), delete: vi.fn(), newDoc: vi.fn() },
  git: { commit: vi.fn(), log: vi.fn().mockResolvedValue([]), branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }), createBranch: vi.fn(), checkout: vi.fn(), merge: vi.fn(), diff: vi.fn(), readCommit: vi.fn(), status: vi.fn() },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn(), move: vi.fn() },
  versions: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(), onStats: vi.fn(), startWorkspace: vi.fn(), stopWorkspace: vi.fn(), getWorkspaceStats: vi.fn(), onNetworkChanged: vi.fn(), offNetworkChanged: vi.fn() },
  peers: {
    list: vi.fn().mockResolvedValue([]),
    listDiscovered: vi.fn().mockResolvedValue([]),
    favorite: vi.fn().mockResolvedValue({ success: true }),
    unfavorite: vi.fn().mockResolvedValue({ success: true }),
    fetchManifest: vi.fn().mockResolvedValue({ success: true, files: [] }),
    openFile: vi.fn().mockResolvedValue({ success: true, content: '', filePath: '' }),
    onFound: vi.fn(), offFound: vi.fn(), onLost: vi.fn(), offLost: vi.fn()
  },
  peerComments: { onReceived: vi.fn(), offReceived: vi.fn() },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  ai: { chat: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), removeListeners: vi.fn() }
}

const mockLocalStorage = {
  store: {},
  getItem(key) { return this.store[key] || null },
  setItem(key, val) { this.store[key] = String(val) },
  removeItem(key) { delete this.store[key] },
  clear() { this.store = {} }
}
vi.stubGlobal('localStorage', mockLocalStorage)
vi.stubGlobal('window', { canonic: mockApi, localStorage: mockLocalStorage })

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('browser comments — in-app ingest, replies, version stamping', () => {
  let store
  let onReceivedCb

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApi.config.read.mockResolvedValue(null)
    mockApi.comments.get.mockResolvedValue([])
    store = useAppStore()
    // The store registers its live-ingest listener during setup.
    onReceivedCb = mockApi.peerComments.onReceived.mock.calls.at(-1)?.[0]
    store.isDemoMode = false
  })

  it('registers a comments:received listener on setup', () => {
    expect(mockApi.peerComments.onReceived).toHaveBeenCalled()
    expect(onReceivedCb).toBeTypeOf('function')
  })

  it('reloads comments when a comment arrives for the open file', async () => {
    store.currentFile = 'Vision/product-vision.md'
    mockApi.comments.get.mockResolvedValue([{ id: 'c1', author: 'Sam', text: 'from browser' }])

    await onReceivedCb({ filePath: 'Vision/product-vision.md' })
    await flush()

    expect(mockApi.comments.get).toHaveBeenCalled()
    expect(store.comments.map((c) => c.id)).toContain('c1')
  })

  it('ignores comments for a different file', async () => {
    store.currentFile = 'Vision/product-vision.md'
    store.comments = [{ id: 'existing', author: 'P', text: 'keep' }]
    mockApi.comments.get.mockClear()

    await onReceivedCb({ filePath: 'Strategy/other.md' })
    await flush()

    expect(mockApi.comments.get).not.toHaveBeenCalled()
    expect(store.comments.map((c) => c.id)).toEqual(['existing'])
  })

  it('addReply appends a one-level reply and persists', async () => {
    store.currentFile = 'Vision/product-vision.md'
    store.comments = [{ id: 'c1', author: 'P', text: 'hi' }]

    await store.addReply('c1', { id: 'r1', author: 'You', text: 'agree' })

    expect(store.comments[0].replies.map((r) => r.id)).toEqual(['r1'])
    expect(mockApi.comments.save).toHaveBeenCalled()
  })

  it('addReply on a missing comment is a no-op', async () => {
    store.currentFile = 'Vision/product-vision.md'
    store.comments = [{ id: 'c1', author: 'P', text: 'hi' }]

    await store.addReply('ghost', { id: 'r1', author: 'You', text: 'lost' })

    expect(store.comments[0].replies).toBeUndefined()
  })

  it('addComment stamps the current commit oid for version filtering', async () => {
    store.currentFile = 'Vision/product-vision.md'
    store.commitLog = [{ oid: 'abc123' }]
    store.comments = []

    await store.addComment({
      id: 'c9', author: 'You', type: 'selection',
      anchor: { quotedText: 'x' }, text: 'note', resolved: false,
    })

    expect(store.comments.find((c) => c.id === 'c9').commitOid).toBe('abc123')
  })

  it('addComment keeps an explicit commitOid', async () => {
    store.currentFile = 'Vision/product-vision.md'
    store.commitLog = [{ oid: 'head' }]
    store.comments = []

    await store.addComment({ id: 'c10', author: 'You', text: 'on old version', commitOid: 'older' })

    expect(store.comments.find((c) => c.id === 'c10').commitOid).toBe('older')
  })
})
