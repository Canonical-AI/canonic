import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockApi = {
  config: { read: vi.fn().mockResolvedValue(null), write: vi.fn(), exists: vi.fn().mockResolvedValue(false), validate: vi.fn() },
  workspace: { init: vi.fn(), getDefault: vi.fn(), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(''),
    write: vi.fn().mockResolvedValue(true),
    delete: vi.fn(),
    newDoc: vi.fn(),
    mkdir: vi.fn(),
    move: vi.fn().mockResolvedValue(true),
    trash: { list: vi.fn().mockResolvedValue([]), delete: vi.fn(), restore: vi.fn(), purge: vi.fn() },
  },
  git: {
    commit: vi.fn(),
    log: vi.fn().mockResolvedValue([]),
    branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }),
    createBranch: vi.fn(),
    checkout: vi.fn().mockResolvedValue({ success: true }),
    merge: vi.fn(),
    diff: vi.fn(),
    readCommit: vi.fn(),
    status: vi.fn(),
    logAll: vi.fn().mockResolvedValue([]),
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false }),
  },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn(), move: vi.fn().mockResolvedValue(true) },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  workspaceSearch: {
    search: vi.fn().mockResolvedValue({ branch: [], other: [] }),
    applyReplacement: vi.fn(),
  },
  share: { start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(), onStats: vi.fn() },
  peers: { list: vi.fn().mockResolvedValue([]) },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  docBranches: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue({ success: true }) },
  versions: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
  ai: { chat: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), removeListeners: vi.fn() },
}

vi.stubGlobal('window', { canonic: mockApi })

const { useAppStore } = await import('../../src/store/index.js')

describe('workspace find/replace', () => {
  let store
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    vi.clearAllMocks()
    store.workspacePath = '/fake/ws'
    store.currentFile = null
    store.currentContent = ''
    store.isDirty = false
  })

  it('searchViewOpen defaults to false', () => {
    expect(store.searchViewOpen).toBe(false)
  })

  it('openWorkspaceSearchResult closes searchViewOpen', () => {
    store.searchViewOpen = true
    store.openWorkspaceSearchResult({ filePath: 'whatever.md', line: 2 })
    expect(store.searchViewOpen).toBe(false)
  })

  it('openFile closes searchViewOpen', async () => {
    store.searchViewOpen = true
    await store.openFile('any.md')
    expect(store.searchViewOpen).toBe(false)
  })

  it('wsSearch slice exists with defaults', () => {
    expect(store.wsSearch).toBeDefined()
    expect(store.wsSearch.query).toBe('')
    expect(store.wsSearch.replace).toBe('')
    expect(store.wsSearch.opts).toEqual({ case: false, word: false, regex: false })
    expect(store.wsSearch.allBranches).toBe(false)
    expect(store.wsSearch.results).toEqual({ branch: [], other: [] })
  })

  it('runWorkspaceSearch calls IPC and stores results', async () => {
    mockApi.workspaceSearch.search.mockResolvedValueOnce({
      branch: [
        { filePath: 'a.md', branch: 'main', matches: [{ line: 1, col: 0, text: 'hello world', length: 5 }] },
      ],
      other: [],
    })
    store.wsSearch.query = 'hello'
    await store.runWorkspaceSearch()
    expect(mockApi.workspaceSearch.search).toHaveBeenCalledOnce()
    expect(store.wsSearch.results.branch).toHaveLength(1)
  })

  it('empty query does not call IPC', async () => {
    store.wsSearch.query = ''
    await store.runWorkspaceSearch()
    expect(mockApi.workspaceSearch.search).not.toHaveBeenCalled()
  })

  it('replaceAll dirties open file', async () => {
    store.currentFile = 'a.md'
    store.currentContent = 'foo bar foo'
    store.wsSearch.query = 'foo'
    store.wsSearch.replace = 'qux'
    store.wsSearch.results = {
      branch: [{ filePath: 'a.md', branch: 'main', matches: [{ line: 1, col: 0, text: 'foo', length: 3 }, { line: 1, col: 8, text: 'foo', length: 3 }] }],
      other: [],
    }
    await store.replaceAllInWorkspace()
    expect(store.currentContent).toBe('qux bar qux')
    expect(store.isDirty).toBe(true)
  })

  it('replaceAll on closed file writes to unsavedBuffer', async () => {
    mockApi.files.read.mockResolvedValue('old foo content')
    store.wsSearch.query = 'foo'
    store.wsSearch.replace = 'bar'
    store.wsSearch.results = {
      branch: [{ filePath: 'closed.md', branch: 'main', matches: [{ line: 1, col: 4, text: 'foo', length: 3 }] }],
      other: [],
    }
    await store.replaceAllInWorkspace()
    expect(store.unsavedBuffer['closed.md']).toBe('old bar content')
  })

  it('replaceAll skips cross-branch matches', async () => {
    store.currentFile = 'a.md'
    store.currentContent = 'foo'
    store.wsSearch.query = 'foo'
    store.wsSearch.replace = 'bar'
    store.wsSearch.results = {
      branch: [{ filePath: 'a.md', branch: 'main', matches: [{ line: 1, col: 0, text: 'foo', length: 3 }] }],
      other: [{ filePath: 'b.md', branch: 'feature', matches: [{ line: 1, col: 0, text: 'foo', length: 3 }] }],
    }
    const result = await store.replaceAllInWorkspace()
    expect(result.skipped).toBe(1)
    expect(result.replaced).toBe(1)
  })

  it('demo mode runWorkspaceSearch uses in-memory files', async () => {
    store.isDemoMode = true
    store.demoFiles = {
      'docs/vision.md': 'We want to dominate the market\nVision dominates strategy',
      'docs/plan.md': 'Quarterly plan',
    }
    store.wsSearch.query = 'dominate'
    await store.runWorkspaceSearch()
    expect(mockApi.workspaceSearch.search).not.toHaveBeenCalled()
    expect(store.wsSearch.results.branch.length).toBeGreaterThan(0)
    const vision = store.wsSearch.results.branch.find((r) => r.filePath === 'docs/vision.md')
    expect(vision.matches).toHaveLength(2)
  })

  it('demo mode replaceAll is read-only', async () => {
    store.isDemoMode = true
    store.demoFiles = { 'a.md': 'foo' }
    store.wsSearch.query = 'foo'
    store.wsSearch.replace = 'bar'
    store.wsSearch.results = {
      branch: [{ filePath: 'a.md', branch: 'main', matches: [{ line: 1, col: 0, text: 'foo', length: 3 }] }],
      other: [],
    }
    const result = await store.replaceAllInWorkspace()
    expect(result.replaced).toBe(0)
    expect(store.wsSearch.lastError).toMatch(/demo|read-only/i)
  })
})

describe('find keybindings', () => {
  let store
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    vi.clearAllMocks()
  })

  it('config defaults include find shortcuts', async () => {
    mockApi.config.read.mockResolvedValueOnce({
      displayName: 'Test',
      apiKey: 'k',
      model: 'claude-sonnet-4-6',
    })
    await store.loadConfig()
    const hotkeys = store.findHotkeys
    expect(hotkeys.findInDoc).toBe('Mod-f')
    expect(hotkeys.findInWorkspace).toBe('Mod-Shift-f')
    expect(hotkeys.findNext).toBe('Mod-g')
    expect(hotkeys.findPrev).toBe('Mod-Shift-g')
  })

  it('custom hotkeys from config override defaults', async () => {
    mockApi.config.read.mockResolvedValueOnce({
      displayName: 'Test',
      hotkeys: { findInDoc: 'Mod-Shift-h' },
    })
    await store.loadConfig()
    expect(store.findHotkeys.findInDoc).toBe('Mod-Shift-h')
    expect(store.findHotkeys.findInWorkspace).toBe('Mod-Shift-f')
  })
})
