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

vi.stubGlobal('window', { canonic: mockApi })

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

  it('favoritedPeers computed returns only favorited discoveredPeers', () => {
    store.discoveredPeers = [
      { id: 'alice@host', name: 'alice', online: true },
      { id: 'bob@host', name: 'bob', online: true }
    ]
    store.favoritedPeerIds.add('alice@host')
    expect(store.favoritedPeers).toHaveLength(1)
    expect(store.favoritedPeers[0].id).toBe('alice@host')
  })

  it('discoveredPeers is reactive — favoritedPeers updates when peer added', () => {
    store.favoritedPeerIds.add('charlie@host')
    expect(store.favoritedPeers).toHaveLength(0)
    store.discoveredPeers.push({ id: 'charlie@host', name: 'charlie', online: true })
    expect(store.favoritedPeers).toHaveLength(1)
  })
})
