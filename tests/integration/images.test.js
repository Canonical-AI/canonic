import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

const mockBinaryStore = {}

const mockApi = {
  config: {
    read: vi.fn().mockResolvedValue({ displayName: 'Test', model: 'claude-sonnet-4-6' }),
    write: vi.fn(),
    exists: vi.fn(),
    validate: vi.fn(),
  },
  workspace: {
    init: vi.fn().mockResolvedValue({ path: '/ws' }),
    getDefault: vi.fn(),
    openDialog: vi.fn(),
    openDirectoryDialog: vi.fn(),
  },
  files: {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn(),
    writeBinary: vi.fn(async (_, filePath, buffer) => {
      mockBinaryStore[filePath] = buffer
      return filePath
    }),
    delete: vi.fn(async (_, filePath) => {
      delete mockBinaryStore[filePath]
    }),
    newDoc: vi.fn(),
    move: vi.fn(),
    trash: {
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      restore: vi.fn(),
      purge: vi.fn(),
    },
  },
  git: {
    commit: vi.fn().mockResolvedValue({ success: true, oid: 'abc123' }),
    log: vi.fn().mockResolvedValue([]),
    branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }),
    createBranch: vi.fn(),
    checkout: vi.fn(),
    merge: vi.fn(),
    diff: vi.fn(),
    readCommit: vi.fn(),
    status: vi.fn(),
    logAll: vi.fn(),
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false }),
    isFileTracked: vi.fn().mockResolvedValue(false),
  },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn(), move: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: {
    start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(),
    onStats: vi.fn(), listActive: vi.fn().mockResolvedValue([]),
  },
  peers: { list: vi.fn().mockResolvedValue([]) },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  docBranches: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
  versions: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
  ai: { chat: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), removeListeners: vi.fn() },
}

vi.stubGlobal('window', { canonic: mockApi })

describe('image assets', () => {
  let store

  beforeEach(async () => {
    setActivePinia(createPinia())
    store = useAppStore()
    Object.keys(mockBinaryStore).forEach(k => delete mockBinaryStore[k])
    vi.clearAllMocks()
    store.workspacePath = '/ws'
  })

  // --- saveAsset ---

  it('saveAsset() writes binary to assets/ dir and returns canonic-asset URL', async () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const url = await store.saveAsset(data, 'png')

    expect(mockApi.files.writeBinary).toHaveBeenCalledWith(
      '/ws',
      expect.stringMatching(/^assets\/image-\d+\.png$/),
      data
    )
    expect(url).toMatch(/^canonic-asset:\/\/assets\/image-\d+\.png$/)
  })

  it('saveAsset() normalises jpeg extension to jpg', async () => {
    const data = new Uint8Array([0xff, 0xd8])
    const url = await store.saveAsset(data, 'jpeg')
    expect(url).toMatch(/\.jpg$/)
    expect(mockApi.files.writeBinary).toHaveBeenCalledWith(
      '/ws',
      expect.stringMatching(/\.jpg$/),
      data
    )
  })

  it('saveAsset() returns null when not in a workspace', async () => {
    store.workspacePath = null
    const url = await store.saveAsset(new Uint8Array([0]), 'png')
    expect(url).toBeNull()
    expect(mockApi.files.writeBinary).not.toHaveBeenCalled()
  })

  it('saveAsset() returns null and skips write in demo mode', async () => {
    store.isDemoMode = true
    const url = await store.saveAsset(new Uint8Array([0]), 'png')
    expect(url).toBeNull()
    expect(mockApi.files.writeBinary).not.toHaveBeenCalled()
  })

  it('saveAsset() returns null when IPC write fails', async () => {
    mockApi.files.writeBinary.mockResolvedValueOnce(null)
    const url = await store.saveAsset(new Uint8Array([0]), 'png')
    expect(url).toBeNull()
  })

  // --- maybeDeleteAsset ---

  it('maybeDeleteAsset() deletes asset file when not tracked in git', async () => {
    mockApi.git.isFileTracked.mockResolvedValueOnce(false)
    await store.maybeDeleteAsset('canonic-asset://assets/image-123.png')

    expect(mockApi.git.isFileTracked).toHaveBeenCalledWith('/ws', 'assets/image-123.png')
    expect(mockApi.files.delete).toHaveBeenCalledWith('/ws', 'assets/image-123.png')
  })

  it('maybeDeleteAsset() keeps asset when tracked in git', async () => {
    mockApi.git.isFileTracked.mockResolvedValueOnce(true)
    await store.maybeDeleteAsset('canonic-asset://assets/image-456.png')

    expect(mockApi.git.isFileTracked).toHaveBeenCalledWith('/ws', 'assets/image-456.png')
    expect(mockApi.files.delete).not.toHaveBeenCalled()
  })

  it('maybeDeleteAsset() no-ops in demo mode', async () => {
    store.isDemoMode = true
    await store.maybeDeleteAsset('canonic-asset://assets/image-789.png')

    expect(mockApi.git.isFileTracked).not.toHaveBeenCalled()
    expect(mockApi.files.delete).not.toHaveBeenCalled()
  })

  it('maybeDeleteAsset() no-ops when no workspace', async () => {
    store.workspacePath = null
    await store.maybeDeleteAsset('canonic-asset://assets/image-000.png')

    expect(mockApi.git.isFileTracked).not.toHaveBeenCalled()
    expect(mockApi.files.delete).not.toHaveBeenCalled()
  })

  it('maybeDeleteAsset() ignores non-canonic-asset URLs', async () => {
    await store.maybeDeleteAsset('https://example.com/image.png')

    expect(mockApi.git.isFileTracked).not.toHaveBeenCalled()
    expect(mockApi.files.delete).not.toHaveBeenCalled()
  })
})
