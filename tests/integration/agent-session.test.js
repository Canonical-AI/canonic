import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

let sessionStartCb, commentCb, sessionDoneCb, sessionCancelCb

const mockApi = {
  config: { read: vi.fn().mockResolvedValue(null), write: vi.fn(), exists: vi.fn(), validate: vi.fn() },
  workspace: { init: vi.fn(), getDefault: vi.fn(), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue('# Spec\n'),
    write: vi.fn(), delete: vi.fn(), newDoc: vi.fn(), move: vi.fn(),
    trash: { list: vi.fn().mockResolvedValue([]), delete: vi.fn(), restore: vi.fn(), purge: vi.fn() },
  },
  git: {
    commit: vi.fn(), log: vi.fn().mockResolvedValue([]),
    branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }),
    createBranch: vi.fn(), checkout: vi.fn(), merge: vi.fn(), diff: vi.fn(),
    readCommit: vi.fn(), status: vi.fn(), logAll: vi.fn().mockResolvedValue([]),
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false }),
  },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn(), move: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(), onStats: vi.fn() },
  peers: { list: vi.fn().mockResolvedValue([]) },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  docBranches: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
  versions: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
  ai: { chat: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), removeListeners: vi.fn() },
  agentSession: {
    onSessionStart: vi.fn((cb) => { sessionStartCb = cb }),
    onComment: vi.fn((cb) => { commentCb = cb }),
    onSessionDone: vi.fn((cb) => { sessionDoneCb = cb }),
    onSessionCancel: vi.fn((cb) => { sessionCancelCb = cb }),
    submit: vi.fn().mockResolvedValue({ ok: true }),
    cancel: vi.fn().mockResolvedValue({ ok: true }),
    removeListeners: vi.fn(),
  },
}

vi.stubGlobal('window', { canonic: mockApi })

describe('agent session store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    store.workspacePath = '/ws'
    store.currentFile = 'spec.md'
    store.currentContent = '# Spec\n'
    vi.clearAllMocks()
    // Re-register mocks after clearAllMocks
    mockApi.agentSession.onSessionStart.mockImplementation((cb) => { sessionStartCb = cb })
    mockApi.agentSession.onComment.mockImplementation((cb) => { commentCb = cb })
    mockApi.agentSession.onSessionDone.mockImplementation((cb) => { sessionDoneCb = cb })
    mockApi.agentSession.onSessionCancel.mockImplementation((cb) => { sessionCancelCb = cb })
  })

  it('agentSession is null initially', () => {
    expect(store.agentSession).toBeNull()
  })

  it('startAgentSession() sets agentSession and opens file', async () => {
    await store.startAgentSession({ sessionId: 'sid1', file: 'spec.md', agentName: 'Claude Code', workspacePath: '/ws' })
    expect(store.agentSession).not.toBeNull()
    expect(store.agentSession.sessionId).toBe('sid1')
    expect(store.agentSession.agentName).toBe('Claude Code')
    expect(store.currentFile).toBe('spec.md')
  })

  it('cancelAgentSession() clears agentSession and calls IPC cancel', async () => {
    await store.startAgentSession({ sessionId: 'sid1', file: 'spec.md', agentName: 'Claude Code', workspacePath: '/ws' })
    await store.cancelAgentSession()
    expect(store.agentSession).toBeNull()
    expect(mockApi.agentSession.cancel).toHaveBeenCalledWith('sid1')
  })

  it('submitAgentAction() calls IPC submit with content and clears session', async () => {
    await store.startAgentSession({ sessionId: 'sid1', file: 'spec.md', agentName: 'Claude Code', workspacePath: '/ws' })
    store.currentContent = '# Spec\n\nEdited.'
    await store.submitAgentAction('Implement this')
    expect(mockApi.agentSession.submit).toHaveBeenCalledWith({
      sessionId: 'sid1',
      prompt: 'Implement this',
      content: '# Spec\n\nEdited.',
    })
    expect(store.agentSession).toBeNull()
  })

  it('addAgentComment() adds comment with isAgent:true to comments array', async () => {
    await store.addAgentComment({
      commentId: 'cid1',
      file: 'spec.md',
      anchor: { quotedText: 'some text' },
      text: 'Needs clarification',
      agentName: 'Claude Code',
    })
    expect(store.comments).toHaveLength(1)
    expect(store.comments[0].isAgent).toBe(true)
    expect(store.comments[0].agentName).toBe('Claude Code')
    expect(store.comments[0].text).toBe('Needs clarification')
  })

  it('actionPickerOpen defaults to false', () => {
    expect(store.actionPickerOpen).toBe(false)
  })

  it('openActionPicker() sets actionPickerOpen to true', () => {
    store.openActionPicker()
    expect(store.actionPickerOpen).toBe(true)
  })

  it('closeActionPicker() sets actionPickerOpen to false', () => {
    store.openActionPicker()
    store.closeActionPicker()
    expect(store.actionPickerOpen).toBe(false)
  })

  it('onSessionDone callback clears agentSession', async () => {
    await store.startAgentSession({ sessionId: 'sid1', file: 'spec.md', agentName: 'Claude Code', workspacePath: '/ws' })
    store.openActionPicker()
    sessionDoneCb()
    expect(store.agentSession).toBeNull()
    expect(store.actionPickerOpen).toBe(false)
  })

  it('onSessionCancel callback clears agentSession', async () => {
    await store.startAgentSession({ sessionId: 'sid1', file: 'spec.md', agentName: 'Claude Code', workspacePath: '/ws' })
    store.openActionPicker()
    sessionCancelCb()
    expect(store.agentSession).toBeNull()
    expect(store.actionPickerOpen).toBe(false)
  })

  it('addAgentComment() ignores comments for non-current file', async () => {
    await store.addAgentComment({
      commentId: 'cid1',
      file: 'other.md',
      anchor: { quotedText: 'text' },
      text: 'Ignored',
      agentName: 'Claude Code',
    })
    expect(store.comments).toHaveLength(0)
  })

  it('cancelAgentSession() also resets actionPickerOpen', async () => {
    await store.startAgentSession({ sessionId: 'sid1', file: 'spec.md', agentName: 'Claude Code', workspacePath: '/ws' })
    store.openActionPicker()
    await store.cancelAgentSession()
    expect(store.actionPickerOpen).toBe(false)
  })

  it('submitAgentAction() resets actionPickerOpen', async () => {
    await store.startAgentSession({ sessionId: 'sid1', file: 'spec.md', agentName: 'Claude Code', workspacePath: '/ws' })
    store.openActionPicker()
    await store.submitAgentAction('Implement this')
    expect(store.actionPickerOpen).toBe(false)
  })

  it('cancelAgentSession() does nothing when no session active', async () => {
    await expect(store.cancelAgentSession()).resolves.not.toThrow()
    expect(store.agentSession).toBeNull()
  })
})
