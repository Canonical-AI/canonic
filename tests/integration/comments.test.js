import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

// Mock window.canonic IPC bridge
const mockComments = {}
const mockApi = {
  config: { read: vi.fn().mockResolvedValue(null), write: vi.fn(), exists: vi.fn(), validate: vi.fn() },
  workspace: { init: vi.fn(), getDefault: vi.fn(), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: { list: vi.fn().mockResolvedValue([]), read: vi.fn(), write: vi.fn(), delete: vi.fn(), newDoc: vi.fn() },
  git: { commit: vi.fn(), log: vi.fn().mockResolvedValue([]), branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }), createBranch: vi.fn(), checkout: vi.fn(), merge: vi.fn(), diff: vi.fn(), readCommit: vi.fn(), status: vi.fn() },
  comments: {
    get: vi.fn(async (docId) => mockComments[docId] || []),
    save: vi.fn(async (docId, data) => { mockComments[docId] = data })
  },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(), onStats: vi.fn() },
  peers: { list: vi.fn().mockResolvedValue([]) },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  ai: { chat: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), removeListeners: vi.fn() }
}

vi.stubGlobal('window', { canonic: mockApi })

describe('comments store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    // Simulate an open workspace + file
    store.workspacePath = '/fake/workspace'
    store.currentFile = 'vision/product-vision.md'
    store.comments = []
    Object.keys(mockComments).forEach(k => delete mockComments[k])
    vi.clearAllMocks()
  })

  it('addComment() adds to store and persists via IPC', async () => {
    const comment = {
      id: 'test-1',
      author: 'Alice',
      type: 'selection',
      anchor: { quotedText: 'some selected text' },
      text: 'This needs more detail',
      resolved: false,
      createdAt: new Date().toISOString()
    }

    await store.addComment(comment)

    expect(store.comments).toHaveLength(1)
    expect(store.comments[0].text).toBe('This needs more detail')
    expect(mockApi.comments.save).toHaveBeenCalledOnce()

    // Verify what was sent over IPC is a plain object (not a Proxy)
    const saved = mockApi.comments.save.mock.calls[0][1]
    expect(Array.isArray(saved)).toBe(true)
    expect(saved[0].text).toBe('This needs more detail')
  })

  it('resolveComment() marks comment resolved and persists', async () => {
    store.comments = [{ id: 'c1', text: 'todo', resolved: false, author: 'Bob', createdAt: '', anchor: {} }]
    await store.resolveComment('c1')

    expect(store.comments[0].resolved).toBe(true)
    expect(mockApi.comments.save).toHaveBeenCalledOnce()
  })

  it('deleteComment() removes comment and persists', async () => {
    store.comments = [
      { id: 'c1', text: 'keep', resolved: false, author: 'A', createdAt: '', anchor: {} },
      { id: 'c2', text: 'remove', resolved: false, author: 'B', createdAt: '', anchor: {} }
    ]
    await store.deleteComment('c2')

    expect(store.comments).toHaveLength(1)
    expect(store.comments[0].id).toBe('c1')
    expect(mockApi.comments.save).toHaveBeenCalledOnce()
  })

  it('loadComments() reads from IPC and populates store', async () => {
    const existing = [{ id: 'c3', text: 'existing', resolved: false, author: 'C', createdAt: '', anchor: {} }]
    mockApi.comments.get.mockResolvedValueOnce(existing)

    await store.loadComments()

    expect(store.comments).toHaveLength(1)
    expect(store.comments[0].id).toBe('c3')
  })

  it('persisted data is serializable plain JSON (no Proxy)', async () => {
    await store.addComment({ id: 'cx', author: 'X', type: 'selection', anchor: { quotedText: 'hi' }, text: 'ok', resolved: false, createdAt: '' })

    const [, savedData] = mockApi.comments.save.mock.calls[0]
    // If this throws, it was a Proxy — the bug is back
    expect(() => JSON.stringify(savedData)).not.toThrow()
  })
})
