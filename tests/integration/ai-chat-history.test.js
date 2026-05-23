import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

let chatsOnDisk = null

const mockApi = {
  config: {
    read: vi.fn().mockResolvedValue({
      displayName: 'Test',
      providers: [],
      assistant: { providerId: '', model: '', name: 'Spark', extraInstructions: '' },
    }),
    write: vi.fn(),
    exists: vi.fn(),
    validate: vi.fn(),
  },
  workspace: { init: vi.fn(), getDefault: vi.fn(), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn(async (_ws, path) => {
      if (path === '.canonic/ai-chats.json') return chatsOnDisk
      return null
    }),
    write: vi.fn(async (_ws, path, content) => {
      if (path === '.canonic/ai-chats.json') chatsOnDisk = content
    }),
    delete: vi.fn(),
    newDoc: vi.fn(),
    tree: vi.fn(),
    trash: { list: vi.fn().mockResolvedValue([]), delete: vi.fn(), restore: vi.fn(), purge: vi.fn() },
  },
  git: {
    commit: vi.fn(),
    log: vi.fn().mockResolvedValue([]),
    branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }),
    createBranch: vi.fn(),
    checkout: vi.fn(),
    merge: vi.fn(),
    diff: vi.fn(),
    readCommit: vi.fn(),
    status: vi.fn(),
    logAll: vi.fn().mockResolvedValue([]),
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false }),
  },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn(), move: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(), onStats: vi.fn() },
  peers: { list: vi.fn().mockResolvedValue([]) },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  ai: { chat: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), removeListeners: vi.fn() },
}

const mockLocalStorage = {
  store: {},
  getItem(key) { return this.store[key] || null },
  setItem(key, val) { this.store[key] = String(val) },
  removeItem(key) { delete this.store[key] },
  clear() { this.store = {} },
}
vi.stubGlobal('localStorage', mockLocalStorage)
vi.stubGlobal('window', { canonic: mockApi, localStorage: mockLocalStorage })

describe('ai chat history persistence', () => {
  let store

  beforeEach(() => {
    chatsOnDisk = null
    setActivePinia(createPinia())
    store = useAppStore()
    store.workspacePath = '/ws'
    vi.clearAllMocks()
    mockApi.files.read.mockImplementation(async (_ws, path) => {
      if (path === '.canonic/ai-chats.json') return chatsOnDisk
      return null
    })
    mockApi.files.write.mockImplementation(async (_ws, path, content) => {
      if (path === '.canonic/ai-chats.json') chatsOnDisk = content
    })
  })

  it('loadAiChats() starts a fresh empty session even when prior chats exist on disk', async () => {
    chatsOnDisk = JSON.stringify([
      { id: 'old', title: 'Prior chat', date: new Date().toISOString(), messages: [{ role: 'user', content: 'hello' }] },
    ])

    await store.loadAiChats()

    expect(store.aiChatsList).toHaveLength(1)
    expect(store.aiChatsList[0].id).toBe('old')
    expect(store.aiChatMessages).toEqual([])
    expect(store.aiChatSessionId).toBeTruthy()
    expect(store.aiChatSessionId).not.toBe('old')
  })

  it('loadAiChats() handles missing chats file by initializing empty list + fresh session', async () => {
    chatsOnDisk = null
    await store.loadAiChats()
    expect(store.aiChatsList).toEqual([])
    expect(store.aiChatMessages).toEqual([])
    expect(store.aiChatSessionId).toBeTruthy()
  })

  it('saveCurrentAiChat() persists messages to .canonic/ai-chats.json', async () => {
    store.aiChatSessionId = 'session-1'
    store.aiChatMessages = [
      { id: 'm1', role: 'user', content: 'gaps?' },
      { id: 'm2', role: 'assistant', content: 'Key gap: success metrics.' },
    ]

    store.saveCurrentAiChat()
    // saveCurrentAiChat triggers saveAiChatsToDisk; wait microtask
    await new Promise((r) => setTimeout(r, 0))

    expect(chatsOnDisk).toBeTruthy()
    const stored = JSON.parse(chatsOnDisk)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('session-1')
    expect(stored[0].title).toContain('gaps?')
    expect(stored[0].messages).toHaveLength(2)
  })

  it('newAiChat() saves the current chat then resets messages with a new session id', async () => {
    store.aiChatSessionId = 'session-a'
    store.aiChatMessages = [{ id: 'x', role: 'user', content: 'first turn' }]

    store.newAiChat()
    await new Promise((r) => setTimeout(r, 0))

    expect(store.aiChatMessages).toEqual([])
    expect(store.aiChatSessionId).not.toBe('session-a')
    expect(store.aiChatSessionId).toBeTruthy()
  })

  it('loadAiChatSession() rehydrates messages from history', async () => {
    chatsOnDisk = JSON.stringify([
      {
        id: 'h1',
        title: 'Prior',
        date: new Date().toISOString(),
        messages: [
          { id: 'p1', role: 'user', content: 'old question' },
          { id: 'p2', role: 'assistant', content: 'old answer' },
        ],
      },
    ])
    await store.loadAiChats()
    store.loadAiChatSession('h1')
    expect(store.aiChatSessionId).toBe('h1')
    expect(store.aiChatMessages).toHaveLength(2)
    expect(store.aiChatMessages[0].content).toBe('old question')
  })

  it('deleteAiChat() removes a chat from the list and persists', async () => {
    chatsOnDisk = JSON.stringify([
      { id: 'a', title: 'A', date: '2026-01-01', messages: [] },
      { id: 'b', title: 'B', date: '2026-01-02', messages: [] },
    ])
    await store.loadAiChats()
    store.deleteAiChat('a')
    await new Promise((r) => setTimeout(r, 0))

    expect(store.aiChatsList.map((c) => c.id)).toEqual(['b'])
    const stored = JSON.parse(chatsOnDisk)
    expect(stored.map((c) => c.id)).toEqual(['b'])
  })
})
