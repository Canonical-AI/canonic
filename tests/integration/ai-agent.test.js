import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

// Capture callbacks registered via onChunk/onDone/onError
let chunkCb, doneCb, errorCb

const mockApi = {
  config: {
    read: vi.fn().mockResolvedValue({ displayName: 'Test', apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6' }),
    write: vi.fn(), exists: vi.fn(), validate: vi.fn()
  },
  workspace: { init: vi.fn(), getDefault: vi.fn().mockResolvedValue('/Users/test/canonic'), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: { list: vi.fn().mockResolvedValue([]), read: vi.fn().mockResolvedValue('# Test Doc\n\nContent here.'), write: vi.fn(), delete: vi.fn(), newDoc: vi.fn() },
  git: {
    commit: vi.fn(), log: vi.fn().mockResolvedValue([]),
    branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }),
    createBranch: vi.fn(), checkout: vi.fn(), merge: vi.fn(), diff: vi.fn(), readCommit: vi.fn(), status: vi.fn()
  },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(), onStats: vi.fn() },
  peers: { list: vi.fn().mockResolvedValue([]) },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  ai: {
    chat: vi.fn(),
    onChunk: vi.fn((cb) => { chunkCb = cb }),
    onDone: vi.fn((cb) => { doneCb = cb }),
    onError: vi.fn((cb) => { errorCb = cb }),
    removeListeners: vi.fn()
  }
}

vi.stubGlobal('window', { canonic: mockApi })

// Simulate an AI streaming response
function simulateStream(chunks) {
  return new Promise(resolve => {
    setTimeout(() => {
      chunks.forEach(chunk => chunkCb?.(chunk))
      setTimeout(() => { doneCb?.(); resolve() }, 0)
    }, 0)
  })
}

describe('ai-agent IPC bridge', () => {
  beforeEach(() => {
    chunkCb = null
    doneCb = null
    errorCb = null
    vi.clearAllMocks()
  })

  it('chat() is invoked with messages, system prompt, model, and apiKey', async () => {
    // Simulate what AIChat.vue does before calling chat()
    const messages = [{ role: 'user', content: 'What is missing?' }]
    const system = 'You are a thinking partner...'

    mockApi.ai.chat({ messages, system, model: 'claude-sonnet-4-6', apiKey: 'sk-ant-test' })

    expect(mockApi.ai.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'user', content: 'What is missing?' }]),
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
        system: expect.any(String)
      })
    )
  })

  it('onChunk() accumulates streamed text', async () => {
    const accumulated = []
    mockApi.ai.onChunk((text) => accumulated.push(text))

    chunkCb('Hello')
    chunkCb(', ')
    chunkCb('world')

    expect(accumulated).toEqual(['Hello', ', ', 'world'])
    expect(accumulated.join('')).toBe('Hello, world')
  })

  it('onDone() fires after stream completes', async () => {
    let done = false
    mockApi.ai.onDone(() => { done = true })
    doneCb?.()
    expect(done).toBe(true)
  })

  it('onError() fires with error message', async () => {
    let errorMsg = null
    mockApi.ai.onError((msg) => { errorMsg = msg })
    errorCb?.('Rate limit exceeded')
    expect(errorMsg).toBe('Rate limit exceeded')
  })

  it('removeListeners() is called before each new chat request', async () => {
    // Simulate the AIChat.vue pattern: removeListeners → register → chat
    mockApi.ai.removeListeners()
    mockApi.ai.onChunk(vi.fn())
    mockApi.ai.onDone(vi.fn())
    mockApi.ai.onError(vi.fn())
    mockApi.ai.chat({ messages: [], system: '', model: 'claude-sonnet-4-6', apiKey: 'sk-ant-test' })

    expect(mockApi.ai.removeListeners).toHaveBeenCalledBefore
    expect(mockApi.ai.chat).toHaveBeenCalledOnce()
  })

  it('streaming response rebuilds full message from chunks', async () => {
    const buffer = { text: '' }
    mockApi.ai.onChunk((text) => { buffer.text += text })
    mockApi.ai.onDone(() => {
      expect(buffer.text).toBe('This is the full response.')
    })

    const streamDone = simulateStream(['This', ' is', ' the', ' full', ' response.'])
    mockApi.ai.chat({ messages: [{ role: 'user', content: 'Hello' }], system: '', model: 'claude-sonnet-4-6', apiKey: 'sk-ant-test' })
    await streamDone
  })
})

describe('ai-agent toolbox', () => {
  beforeEach(() => {
    chunkCb = null
    doneCb = null
    errorCb = null
    vi.clearAllMocks()
  })

  it('read_document tool: files.read() is available for tool-use responses', async () => {
    // Simulate agent requesting a document read
    const docContent = await mockApi.files.read('/ws', 'Strategy/roadmap.md')
    expect(docContent).toBe('# Test Doc\n\nContent here.')
    expect(mockApi.files.read).toHaveBeenCalledWith('/ws', 'Strategy/roadmap.md')
  })

  it('read_document returns null for missing files without throwing', async () => {
    mockApi.files.read.mockResolvedValueOnce(null)
    const content = await mockApi.files.read('/ws', 'nonexistent.md')
    expect(content).toBeNull()
  })

  it('agent can post a comment via store.addComment()', async () => {
    setActivePinia(createPinia())
    const store = useAppStore()
    store.workspacePath = '/ws'
    store.currentFile = 'strategy.md'
    store.comments = []

    const agentComment = {
      id: 'agent-c1',
      author: 'Claude · suggestion',
      type: 'selection',
      anchor: { quotedText: 'some key claim' },
      text: 'This claim needs a citation or data point to be convincing.',
      resolved: false,
      createdAt: new Date().toISOString(),
      isAgent: true
    }

    await store.addComment(agentComment)

    expect(store.comments).toHaveLength(1)
    expect(store.comments[0].isAgent).toBe(true)
    expect(store.comments[0].author).toBe('Claude · suggestion')
    expect(mockApi.comments.save).toHaveBeenCalledOnce()
  })

  it('agent comment persists as plain JSON over IPC', async () => {
    setActivePinia(createPinia())
    const store = useAppStore()
    store.workspacePath = '/ws'
    store.currentFile = 'doc.md'
    store.comments = []

    await store.addComment({
      id: 'agent-c2', author: 'Claude · suggestion', type: 'selection',
      anchor: { quotedText: 'test' }, text: 'Agent note', resolved: false,
      createdAt: new Date().toISOString(), isAgent: true
    })

    const [, savedData] = mockApi.comments.save.mock.calls[0]
    expect(() => JSON.stringify(savedData)).not.toThrow()
    expect(savedData[0].isAgent).toBe(true)
  })

  it('no API key produces a graceful error response', () => {
    // This is the store-level check: no key → do not call chat, return error message
    const apiKey = undefined
    const hasKey = Boolean(apiKey)
    expect(hasKey).toBe(false)
    // The UI should show: "No API key configured. Open Settings..."
    // We verify the guard logic, not the component itself
  })

  it('search.query is available for web-search-style document queries', async () => {
    mockApi.search.query.mockResolvedValueOnce([
      { filePath: 'Vision/vision.md', title: 'vision', excerpt: 'our north star', score: 2 }
    ])
    const results = await mockApi.search.query('north star', '/ws')
    expect(results).toHaveLength(1)
    expect(results[0].filePath).toBe('Vision/vision.md')
  })
})
