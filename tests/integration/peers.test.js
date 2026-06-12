import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

const mockApi = {
  config: { read: vi.fn().mockResolvedValue(null), write: vi.fn(), exists: vi.fn(), validate: vi.fn() },
  workspace: { init: vi.fn(), getDefault: vi.fn(), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: { list: vi.fn().mockResolvedValue([]), read: vi.fn(), write: vi.fn(), delete: vi.fn(), newDoc: vi.fn() },
  git: { commit: vi.fn(), log: vi.fn().mockResolvedValue([]), branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }), createBranch: vi.fn(), checkout: vi.fn(), merge: vi.fn(), diff: vi.fn(), readCommit: vi.fn(), status: vi.fn() },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(), onStats: vi.fn(), startWorkspace: vi.fn(), stopWorkspace: vi.fn(), getWorkspaceStats: vi.fn(), onNetworkChanged: vi.fn(), offNetworkChanged: vi.fn() },
  peers: {
    list: vi.fn().mockResolvedValue([
      { id: 'alice@alice-mac.local', name: 'alice', favorited: true, online: false }
    ]),
    listDiscovered: vi.fn().mockResolvedValue([]),
    favorite: vi.fn().mockResolvedValue({ success: true }),
    unfavorite: vi.fn().mockResolvedValue({ success: true }),
    fetchManifest: vi.fn().mockResolvedValue({ success: true, files: ['notes.md'] }),
    connectManual: vi.fn().mockResolvedValue({ id: '192.168.1.5:41234', name: 'dana', host: '192.168.1.5', port: 41234, online: true, manual: true }),
    openFile: vi.fn().mockResolvedValue({ success: true, content: '# Notes', filePath: 'notes.md' }),
    onFound: vi.fn(),
    offFound: vi.fn(),
    onLost: vi.fn(),
    offLost: vi.fn()
  },
  peerComments: { onReceived: vi.fn(), offReceived: vi.fn() },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  ai: { chat: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), removeListeners: vi.fn() }
}

const mockLocalStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};
vi.stubGlobal("localStorage", mockLocalStorage);
vi.stubGlobal("window", { canonic: mockApi, localStorage: mockLocalStorage });

describe('peers store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    vi.clearAllMocks()
    // Re-establish return values after clearAllMocks
    mockApi.config.read.mockResolvedValue(null)
    mockApi.files.list.mockResolvedValue([])
    mockApi.git.log.mockResolvedValue([])
    mockApi.git.branches.mockResolvedValue({ branches: ['main'], current: 'main' })
    mockApi.peers.list.mockResolvedValue([
      { id: 'alice@alice-mac.local', name: 'alice', favorited: true, online: false }
    ])
    mockApi.peers.favorite.mockResolvedValue({ success: true })
    mockApi.peers.unfavorite.mockResolvedValue({ success: true })
    mockApi.peers.listDiscovered.mockResolvedValue([])
  })

  it('favoritePeer() calls IPC and adds id to favoritedPeerIds', async () => {
    await store.favoritePeer('alice@alice-mac.local')
    expect(mockApi.peers.favorite).toHaveBeenCalledWith('alice@alice-mac.local')
    expect(store.favoritedPeerIds.has('alice@alice-mac.local')).toBe(true)
  })

  it('unfavoritePeer() calls IPC and removes id from favoritedPeerIds', async () => {
    store.favoritedPeerIds.add('alice@alice-mac.local')
    await store.unfavoritePeer('alice@alice-mac.local')
    expect(mockApi.peers.unfavorite).toHaveBeenCalledWith('alice@alice-mac.local')
    expect(store.favoritedPeerIds.has('alice@alice-mac.local')).toBe(false)
  })

  it('favoritedPeers computed returns favorited peers even if offline', () => {
    store.discoveredPeers = [
      { id: 'alice@host', name: 'alice', online: true },
    ]
    store.favoritedPeerIds.add('alice@host')
    store.favoritedPeerIds.add('bob@host')
    // alice is online, bob is offline (not in discoveredPeers)
    expect(store.favoritedPeers).toHaveLength(2)
    expect(store.favoritedPeers.find(p => p.id === 'alice@host').online).toBe(true)
    expect(store.favoritedPeers.find(p => p.id === 'bob@host').online).toBe(false)
  })

  it('discoveredPeers is reactive — favoritedPeers updates online status', () => {
    store.favoritedPeerIds.add('charlie@host')
    expect(store.favoritedPeers).toHaveLength(1)
    expect(store.favoritedPeers[0].online).toBe(false)

    store.discoveredPeers.push({ id: 'charlie@host', name: 'charlie', online: true })
    expect(store.favoritedPeers).toHaveLength(1)
    expect(store.favoritedPeers[0].online).toBe(true)
  })

  it('connectPeerManual() validates via IPC and adds the peer to discoveredPeers', async () => {
    const peer = await store.connectPeerManual('  http://192.168.1.5:41234/?token=abc  ')
    expect(mockApi.peers.connectManual).toHaveBeenCalledWith('http://192.168.1.5:41234/?token=abc')
    expect(peer.id).toBe('192.168.1.5:41234')
    expect(store.discoveredPeers.find(p => p.id === '192.168.1.5:41234')).toBeTruthy()
  })

  it('connectPeerManual() upserts rather than duplicating an existing peer', async () => {
    await store.connectPeerManual('http://192.168.1.5:41234/?token=abc')
    await store.connectPeerManual('http://192.168.1.5:41234/?token=abc')
    expect(store.discoveredPeers.filter(p => p.id === '192.168.1.5:41234')).toHaveLength(1)
  })

  it('connectPeerManual() rejects an empty address without calling IPC', async () => {
    await expect(store.connectPeerManual('   ')).rejects.toThrow()
    expect(mockApi.peers.connectManual).not.toHaveBeenCalled()
  })

  it('connectPeerManual() in demo mode fabricates a peer without IPC', async () => {
    store.isDemoMode = true
    const peer = await store.connectPeerManual('http://10.0.0.9:8080/?token=x')
    expect(mockApi.peers.connectManual).not.toHaveBeenCalled()
    expect(peer.id).toBe('10.0.0.9:8080')
    expect(peer.manual).toBe(true)
    expect(store.discoveredPeers.find(p => p.id === '10.0.0.9:8080')).toBeTruthy()
  })
})

describe('peer file viewer store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    vi.clearAllMocks()
    mockApi.config.read.mockResolvedValue(null)
    mockApi.files.list.mockResolvedValue([])
    mockApi.git.log.mockResolvedValue([])
    mockApi.git.branches.mockResolvedValue({ branches: ['main'], current: 'main' })
    mockApi.peers.list.mockResolvedValue([])
    mockApi.peers.listDiscovered.mockResolvedValue([])
  })

  it('openPeerFile() stores peer content and pre-loads comments', () => {
    const peer = { id: 'priya@host', name: 'Priya', permission: 'comment' }
    const comments = [{ id: 'c1', author: 'Priya', text: 'Good point', anchor: { quotedText: 'Hello' } }]
    store.openPeerFile({ peer, relPath: 'Vision/vision.md', content: '# Vision', comments })

    expect(store.peerFileContent).toMatchObject({ relPath: 'Vision/vision.md' })
    expect(store.peerFileComments).toHaveLength(1)
    expect(store.peerFileComments[0].id).toBe('c1')
  })

  it('openPeerFile(null) clears content, comments, and activeCommentId', () => {
    store.openPeerFile({ peer: { id: 'p', name: 'P' }, relPath: 'a.md', content: '# A', comments: [] })
    store.setActiveComment('c1')
    store.openPeerFile(null)

    expect(store.peerFileContent).toBeNull()
    expect(store.peerFileComments).toHaveLength(0)
    expect(store.activeCommentId).toBeNull()
  })

  it('addPeerComment() prepends to peerFileComments', () => {
    store.openPeerFile({ peer: { id: 'p', name: 'P' }, relPath: 'a.md', content: '#', comments: [
      { id: 'existing', text: 'old', anchor: {} }
    ]})
    store.addPeerComment({ id: 'new-c', text: 'new', anchor: { quotedText: 'word' } })
    expect(store.peerFileComments[0].id).toBe('new-c')
    expect(store.peerFileComments).toHaveLength(2)
  })

  it('updatePeerComment() patches an existing comment by id', () => {
    store.openPeerFile({ peer: { id: 'p', name: 'P' }, relPath: 'a.md', content: '#', comments: [
      { id: 'c1', text: 'draft', synced: false, anchor: {} }
    ]})
    store.updatePeerComment('c1', { synced: true })
    expect(store.peerFileComments[0].synced).toBe(true)
    expect(store.peerFileComments[0].text).toBe('draft') // unchanged fields preserved
  })

  it('setActiveComment() sets activeCommentId', () => {
    expect(store.activeCommentId).toBeNull()
    store.setActiveComment('c42')
    expect(store.activeCommentId).toBe('c42')
  })

  it('setActiveComment() can be cleared by setting null', () => {
    store.setActiveComment('c42')
    store.setActiveComment(null)
    expect(store.activeCommentId).toBeNull()
  })
})
