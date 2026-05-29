import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

// Mock IPC responses for agent-control channels
let stdoutCb, stderrCb, exitCb, errorCb, clipboardCb

const mockAgentControl = {
  getPresets: vi.fn().mockResolvedValue([
    { id: 'claude-code', name: 'Claude Code', binary: 'claude', installHint: 'npm install -g @anthropic-ai/claude-code', installed: true },
    { id: 'pi', name: 'Pi', binary: 'pi', installHint: 'npm install -g pi', installed: false }
  ]),
  getCustomAgents: vi.fn().mockResolvedValue([]),
  addCustomAgent: vi.fn().mockResolvedValue({
    ok: true,
    agent: { id: 'custom-abc123', name: 'My Agent', binary: '/usr/bin/myagent', type: 'custom' }
  }),
  removeCustomAgent: vi.fn().mockResolvedValue({ ok: true }),
  startSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'test-session', pid: 12345 }),
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
  resume: vi.fn().mockResolvedValue({ ok: true, sessionId: 'test-session', pid: 6789 }),
  stopSession: vi.fn().mockResolvedValue({ ok: true }),
  openInTerminal: vi.fn().mockResolvedValue({ ok: true, command: 'claude --resume test-session -p' }),
  getHistory: vi.fn().mockResolvedValue([]),
  saveHistory: vi.fn().mockResolvedValue({ ok: true }),
  deleteHistory: vi.fn().mockResolvedValue({ ok: true }),
  checkMcp: vi.fn().mockResolvedValue({ registered: false }),
  registerMcp: vi.fn().mockResolvedValue({ ok: true }),
  optOutMcp: vi.fn().mockResolvedValue({ ok: true }),
  pickDirectory: vi.fn().mockResolvedValue('/test/project'),
  onStdout: vi.fn((cb) => { stdoutCb = cb }),
  onStderr: vi.fn((cb) => { stderrCb = cb }),
  onExit: vi.fn((cb) => { exitCb = cb }),
  onError: vi.fn((cb) => { errorCb = cb }),
  onCopyToClipboard: vi.fn((cb) => { clipboardCb = cb }),
  removeListeners: vi.fn()
}

const mockApi = {
  config: {
    read: vi.fn().mockResolvedValue({
      displayName: 'Test',
      providers: [],
      assistant: { providerId: '', model: '', name: 'Spark', extraInstructions: '' }
    }),
    write: vi.fn().mockResolvedValue({ success: true, config: { displayName: 'Test', providers: [], assistant: { providerId: '', model: '', name: 'Spark', extraInstructions: '' } } }),
    exists: vi.fn(),
    validate: vi.fn()
  },
  workspace: { init: vi.fn().mockResolvedValue({ path: '/test/ws', isExternal: false }), getDefault: vi.fn().mockResolvedValue('/test/canonic'), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn(),
    delete: vi.fn(),
    newDoc: vi.fn(),
    tree: vi.fn(),
    trash: { list: vi.fn().mockResolvedValue([]), delete: vi.fn(), restore: vi.fn(), purge: vi.fn() }
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
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false })
  },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn(), move: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { start: vi.fn(), stop: vi.fn(), openLink: vi.fn(), openShared: vi.fn(), onStats: vi.fn(), listActive: vi.fn().mockResolvedValue([]) },
  peers: { list: vi.fn().mockResolvedValue([]), listDiscovered: vi.fn().mockResolvedValue([]) },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: { check: vi.fn(), install: vi.fn(), onAvailable: vi.fn(), onDownloaded: vi.fn() },
  docBranches: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
  versions: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
  ai: { chat: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), removeListeners: vi.fn() },
  agentSession: {
    onSessionStart: vi.fn(),
    onComment: vi.fn(),
    onActivity: vi.fn(),
    onSessionDone: vi.fn(),
    onSessionCancel: vi.fn(),
    submit: vi.fn(),
    cancel: vi.fn(),
    removeListeners: vi.fn()
  },
  agentControl: mockAgentControl
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

describe('AI Control store', () => {
  let store

  beforeEach(async () => {
    setActivePinia(createPinia())
    store = useAppStore()
    store.config = {
      displayName: 'Test',
      providers: [],
      assistant: { providerId: '', model: '', name: 'Spark', extraInstructions: '' }
    }
    // Reset all IPC listener registrations
    vi.clearAllMocks()
  })

  describe('agent configuration', () => {
    it('agentPresets starts empty', () => {
      expect(store.agentPresets).toEqual([])
    })

    it('loadAgentPresets populates presets from IPC', async () => {
      await store.loadAgentPresets()
      expect(store.agentPresets.length).toBe(2)
      expect(store.agentPresets[0].name).toBe('Claude Code')
    })

    it('loadConfiguredAgents populates configured agents from presets + custom', async () => {
      await store.loadAgentPresets()
      await store.loadConfiguredAgents()
      expect(store.configuredAgents.length).toBe(2)
      expect(store.configuredAgents[0].type).toBe('preset')
    })

    it('addCustomAgent adds to configuredAgents', async () => {
      await store.addCustomAgent({ name: 'My Agent', binary: '/usr/bin/my' })
      expect(mockAgentControl.addCustomAgent).toHaveBeenCalled()
      expect(store.configuredAgents.length).toBe(1)
    })

    it('removeCustomAgent removes from configuredAgents', async () => {
      store.configuredAgents = [
        { id: 'agent-1', name: 'Agent 1', type: 'preset', presetId: 'claude-code' },
        { id: 'custom-1', name: 'Custom', type: 'custom' }
      ]
      await store.removeCustomAgent('custom-1')
      expect(mockAgentControl.removeCustomAgent).toHaveBeenCalledWith('custom-1')
      expect(store.configuredAgents.length).toBe(1)
    })

    it('setActiveAgent switches active agent and resets session', () => {
      store.controlMessages = [{ id: '1', role: 'user', content: 'test' }]
      store.controlStatus = 'running'
      store.setActiveAgent('agent-1')
      expect(store.activeAgentId).toBe('agent-1')
      expect(store.controlMessages).toEqual([])
      expect(store.controlStatus).toBe('idle')
    })
  })

  describe('flavor and target', () => {
    it('setActiveFlavor changes flavor', () => {
      store.setActiveFlavor('implementer')
      expect(store.activeFlavor).toBe('implementer')
    })

    it('setTargetDir updates target directory', () => {
      store.setTargetDir('/my/project')
      expect(store.targetDir).toBe('/my/project')
    })

    it('pickTargetDirectory opens picker and sets dir', async () => {
      await store.pickTargetDirectory()
      expect(mockAgentControl.pickDirectory).toHaveBeenCalled()
      expect(store.targetDir).toBe('/test/project')
    })
  })

  describe('session control', () => {
    beforeEach(async () => {
      store.configuredAgents = [
        { id: 'claude-code', name: 'Claude Code', type: 'preset', presetId: 'claude-code', binary: 'claude' }
      ]
      store.activeAgentId = 'claude-code'
    })

    it('startControlSession creates session and sets running status', async () => {
      await store.startControlSession({ prompt: 'Implement login' })
      expect(mockAgentControl.startSession).toHaveBeenCalled()
      expect(store.controlStatus).toBe('running')
      expect(store.controlSession).not.toBeNull()
    })

    it('startControlSession adds context injection messages', async () => {
      store.workspacePath = '/test/canonic-demo'
      await store.startControlSession({
        prompt: 'Review this',
        contextDoc: 'Specs/auth.md',
        contextSelection: 'The auth flow uses JWT tokens issued by'
      })
      // workspace + doc + user prompt = 3 messages (contextSelection is passed as prompt context, not separate message)
      expect(store.controlMessages.length).toBe(3)
      expect(store.controlMessages[0].type).toBe('context-injection')
      expect(store.controlMessages[0].content).toContain('workspace:')
      expect(store.controlMessages[1].type).toBe('context-injection')
      expect(store.controlMessages[1].content).toContain('doc:')
      expect(store.controlMessages[2].role).toBe('user')
    })

    it('startControlSession sets error status on failure', async () => {
      mockAgentControl.startSession.mockResolvedValueOnce({ error: 'Binary not found' })
      await store.startControlSession({ prompt: 'test' })
      expect(store.controlStatus).toBe('error')
    })

    it('startControlSession surfaces install hint when CLI not installed', async () => {
      mockAgentControl.startSession.mockResolvedValueOnce({
        error: 'Claude Code is not installed',
        notInstalled: true,
        installHint: 'npm install -g @anthropic-ai/claude-code'
      })
      await store.startControlSession({ prompt: 'test' })
      expect(store.controlStatus).toBe('error')
      const errMsg = store.controlMessages.find(m => m.type === 'error')
      expect(errMsg.notInstalled).toBe(true)
      expect(errMsg.content).toContain('npm install -g @anthropic-ai/claude-code')
    })

    it('handleControlStdout appends to stream buffer', () => {
      store.controlSession = { id: 'test-session' }
      store.handleControlStdout({ sessionId: 'test-session', text: 'Hello' })
      expect(store.controlStreamBuffer).toBe('Hello')
    })

    it('handleControlStdout ignores wrong session', () => {
      store.controlSession = { id: 'test-session' }
      store.handleControlStdout({ sessionId: 'other-session', text: 'Hello' })
      expect(store.controlStreamBuffer).toBe('')
    })

    it('handleControlExit finalizes message and sets ended status', () => {
      store.controlSession = { id: 'test-session', agentName: 'Claude', status: 'running', startedAt: Date.now(), agentId: 'claude-code', model: '', effort: 'medium', flavor: 'reviewer', cwd: '/test' }
      store.controlStreamBuffer = 'Response text'
      store.controlMessages = [{ id: '1', role: 'user', content: 'test', type: 'user', timestamp: Date.now() }]
      store.handleControlExit({ sessionId: 'test-session', code: 0 })
      expect(store.controlStatus).toBe('ended')
      expect(store.controlMessages.length).toBe(2)
      expect(store.controlHistory.length).toBe(1)
    })

    it('handleControlError sets error status', () => {
      store.controlSession = { id: 'test-session', agentName: 'Claude', status: 'running', startedAt: Date.now(), agentId: 'claude-code', model: '', effort: 'medium', flavor: 'reviewer', cwd: '/test' }
      store.handleControlError({ sessionId: 'test-session', error: 'Segfault' })
      expect(store.controlStatus).toBe('error')
    })

    it('stopControlSession calls IPC stop', async () => {
      store.controlSession = { id: 'test-session', agentName: 'Claude', status: 'running', startedAt: Date.now(), agentId: 'claude-code', model: '', effort: 'medium', flavor: 'reviewer', cwd: '/test' }
      await store.stopControlSession()
      expect(mockAgentControl.stopSession).toHaveBeenCalled()
      expect(store.controlStatus).toBe('ended')
    })

    it('openInTerminal calls IPC with session info', async () => {
      store.controlSession = { id: 'test-session', agentId: 'claude-code', agentName: 'Claude', model: '', effort: 'medium', flavor: 'reviewer', cwd: '/test', status: 'running', startedAt: Date.now() }
      await store.openInTerminal()
      expect(mockAgentControl.openInTerminal).toHaveBeenCalled()
    })

    it('openInTerminal passes the captured agent session id for exact resume', async () => {
      store.controlSession = { id: 'test-session', agentId: 'claude-code', agentSessionId: 'claude-real-id', agentName: 'Claude', cwd: '/test', status: 'running', startedAt: Date.now() }
      await store.openInTerminal()
      expect(mockAgentControl.openInTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ agentSessionId: 'claude-real-id', agentId: 'claude-code' })
      )
    })

    it('sendControlMessage on a running session writes to stdin (no resume)', async () => {
      store.controlSession = { id: 'test-session', agentId: 'claude-code', cwd: '/test', status: 'running', startedAt: Date.now() }
      store.controlStatus = 'running'
      await store.sendControlMessage('next thing')
      expect(mockAgentControl.sendMessage).toHaveBeenCalledWith({ sessionId: 'test-session', prompt: 'next thing' })
      expect(mockAgentControl.resume).not.toHaveBeenCalled()
    })

    it('sendControlMessage on an exited single-shot session resumes, keeping the thread', async () => {
      store.controlSession = { id: 'test-session', agentId: 'opencode', agentSessionId: 'ses_abc', model: 'openai/gpt-5', effort: '', cwd: '/test', status: 'ended', startedAt: Date.now() }
      store.controlStatus = 'ended'
      store.controlMessages = [{ id: '1', role: 'user', content: 'first', type: 'user', timestamp: Date.now() }]
      await store.sendControlMessage('follow up')
      // user message appended to the SAME thread (not wiped)
      expect(store.controlMessages.map(m => m.content)).toEqual(['first', 'follow up'])
      expect(mockAgentControl.resume).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'test-session', agentId: 'opencode', previousSessionId: 'ses_abc', prompt: 'follow up' })
      )
      expect(store.controlStatus).toBe('running')
    })

    it('sendControlMessage errors (no fresh spawn) when no resumable id was captured', async () => {
      store.controlSession = { id: 'test-session', agentId: 'opencode', cwd: '/test', status: 'ended', startedAt: Date.now() }
      store.controlStatus = 'ended'
      await store.sendControlMessage('follow up')
      expect(mockAgentControl.resume).not.toHaveBeenCalled()
      expect(store.controlStatus).toBe('error')
      expect(store.controlMessages.some(m => m.type === 'error')).toBe(true)
    })
  })

  describe('structured output parsing', () => {
    beforeEach(() => {
      store.controlSession = { id: 's1' }
      store.controlMessages = []
      store.controlTokenCount = 0
      store.controlHasRealTokens = false
      store.controlStreamBuffer = ''
      store.controlLineBuffer = ''
    })

    it('parses Claude stream-json: session id, assistant text, tool_use, real tokens', () => {
      const lines = [
        JSON.stringify({ type: 'system', subtype: 'init', session_id: 'claude-abc' }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello there' }], usage: { input_tokens: 100, output_tokens: 40 } } }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'read_doc', input: { path: 'spec.md' } }] } }),
      ].join('\n')
      store.handleControlStdout({ sessionId: 's1', text: lines })

      expect(store.controlSession.agentSessionId).toBe('claude-abc')
      const agentMsg = store.controlMessages.find(m => m.type === 'agent')
      expect(agentMsg.content).toBe('Hello there')
      const tool = store.controlMessages.find(m => m.type === 'tool-call')
      expect(tool.toolName).toBe('read_doc')
      // real tokens override the char estimate
      expect(store.controlHasRealTokens).toBe(true)
      expect(store.controlTokenCount).toBe(140)
    })

    it('Claude result event reports final usage without duplicating streamed text', () => {
      store.handleControlStdout({ sessionId: 's1', text: JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Streamed answer' }] } }) })
      store.handleControlStdout({ sessionId: 's1', text: JSON.stringify({ type: 'result', subtype: 'success', result: 'Streamed answer', usage: { input_tokens: 10, output_tokens: 5 } }) })
      const agentMsgs = store.controlMessages.filter(m => m.type === 'agent')
      expect(agentMsgs.length).toBe(1)
      expect(store.controlTokenCount).toBe(15)
    })

    it('parses Codex JSONL agent_message and token_count', () => {
      store.handleControlStdout({ sessionId: 's1', text: JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Codex reply' } }) })
      store.handleControlStdout({ sessionId: 's1', text: JSON.stringify({ type: 'token_count', info: { total_token_usage: { input_tokens: 200, output_tokens: 50 } } }) })
      expect(store.controlMessages.find(m => m.type === 'agent').content).toBe('Codex reply')
      expect(store.controlTokenCount).toBe(250)
    })

    it('parses Pi schema: skips streaming deltas, captures model + final text + real tokens', () => {
      const usage = { input: 1023, output: 69, cacheRead: 5504, cacheWrite: 0, totalTokens: 6596, cost: { total: 0.0005 } }
      const lines = [
        // streaming deltas — must NOT produce bubbles
        JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Work' } }),
        JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'ing!' } }),
        // final consolidated message
        JSON.stringify({ type: 'message_end', message: { role: 'assistant', model: 'deepseek-v4-pro', content: [{ type: 'thinking', thinking: 'simple test' }, { type: 'text', text: 'Working! What next?' }], usage } }),
      ].join('\n')
      store.handleControlStdout({ sessionId: 's1', text: lines })

      const agentMsgs = store.controlMessages.filter(m => m.type === 'agent')
      expect(agentMsgs.length).toBe(1)
      expect(agentMsgs[0].content).toBe('Working! What next?')
      expect(store.controlSession.model).toBe('deepseek-v4-pro')
      expect(store.controlHasRealTokens).toBe(true)
      // New tokens only (input 1023 + output 69) — cacheRead 5504 is excluded so a tiny
      // turn over a large cached context doesn't read as thousands of tokens.
      expect(store.controlTokenCount).toBe(1092)
    })

    it('surfaces Pi tool_execution events as tool-call + result, skips updates', () => {
      const lines = [
        JSON.stringify({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'list_docs', args: { path: '.' } }),
        JSON.stringify({ type: 'tool_execution_update', toolCallId: 'c1', delta: 'noise' }),
        JSON.stringify({ type: 'tool_execution_end', toolCallId: 'c1', toolName: 'list_docs', result: { content: [{ type: 'text', text: 'doc-a.md\ndoc-b.md' }] }, isError: false }),
      ].join('\n')
      store.handleControlStdout({ sessionId: 's1', text: lines })

      const tool = store.controlMessages.find(m => m.type === 'tool-call')
      expect(tool.toolName).toBe('list_docs')
      const result = store.controlMessages.find(m => m.type === 'context-injection')
      expect(result.content).toContain('doc-a.md')
      expect(store.controlMessages.some(m => m.type === 'error')).toBe(false)
    })

    it('does not double a tool call that appears in both tool_execution_start and message_end', () => {
      // Pi embeds the tool call in the assistant message_end content AND emits a
      // separate tool_execution_start for it. Only one tool bubble should result.
      const lines = [
        JSON.stringify({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'bash', args: { cmd: 'ls' } }),
        JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [
          { type: 'thinking', text: 'planning' },
          { type: 'tool_use', name: 'bash', input: { cmd: 'ls' } },
          { type: 'text', text: 'Done.' },
        ], usage: { totalTokens: 5 } } }),
      ].join('\n')
      store.handleControlStdout({ sessionId: 's1', text: lines })

      const toolCalls = store.controlMessages.filter(m => m.type === 'tool-call')
      expect(toolCalls.length).toBe(1)
      const texts = store.controlMessages.filter(m => m.type === 'agent')
      expect(texts.map(t => t.content)).toEqual(['Done.'])
    })

    it('parses Gemini single-JSON output: response text + summed new tokens, no raw dump', () => {
      store.controlSession = { id: 's1', outputFormat: 'json' }
      const obj = {
        session_id: 'gem-1',
        response: "Hello. I'm Gemini.",
        stats: { models: {
          'gemini-flash-lite': { tokens: { prompt: 100, candidates: 10, thoughts: 5, cached: 9999 } },
          'gemini-pro': { tokens: { prompt: 200, candidates: 20, thoughts: 0, cached: 0 } },
        } }
      }
      // pretty-printed, multi-line — must NOT be dumped line-by-line while streaming
      store.handleControlStdout({ sessionId: 's1', text: JSON.stringify(obj, null, 2) })
      expect(store.controlMessages.filter(m => m.type === 'agent').length).toBe(0)  // nothing yet
      store.handleControlExit({ sessionId: 's1', code: 0, signal: null })

      const agentMsgs = store.controlMessages.filter(m => m.type === 'agent')
      expect(agentMsgs.length).toBe(1)
      expect(agentMsgs[0].content).toBe("Hello. I'm Gemini.")
      expect(store.controlSession.model).toBe('gemini-pro')
      // (100+10+5) + (200+20+0) = 335; cached reads excluded
      expect(store.controlTokenCount).toBe(335)
    })

    it('parses OpenCode --format json: text parts, tool_use, session id + tokens', () => {
      const sid = 'ses_abc123'
      const lines = [
        JSON.stringify({ type: 'step_start', sessionID: sid, part: { type: 'step-start' } }),
        JSON.stringify({ type: 'text', sessionID: sid, part: { id: 'p1', type: 'text', text: 'One. Two.' } }),
        JSON.stringify({ type: 'tool_use', sessionID: sid, part: { type: 'tool', tool: 'read', state: { status: 'completed', input: { filePath: '/tmp' }, output: 'file listing' } } }),
        JSON.stringify({ type: 'step_finish', sessionID: sid, part: { type: 'step-finish', tokens: { total: 10179, input: 10165, output: 3, reasoning: 11, cache: { read: 9000, write: 0 } } } }),
      ].join('\n')
      store.handleControlStdout({ sessionId: 's1', text: lines })

      const agentMsgs = store.controlMessages.filter(m => m.type === 'agent')
      expect(agentMsgs.map(m => m.content)).toEqual(['One. Two.'])
      const tool = store.controlMessages.find(m => m.type === 'tool-call')
      expect(tool.toolName).toBe('read')
      expect(tool.content).toContain('/tmp')
      // session id captured for resume continuity
      expect(store.controlSession.agentSessionId).toBe(sid)
      // input + output only (10165 + 3); cache reads excluded
      expect(store.controlTokenCount).toBe(10168)
    })

    it('reassembles a JSONL event split across two stdout chunks', () => {
      const evt = JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Split parse' }], usage: { totalTokens: 12 } } })
      const mid = Math.floor(evt.length / 2)
      store.handleControlStdout({ sessionId: 's1', text: evt.slice(0, mid) })
      store.handleControlStdout({ sessionId: 's1', text: evt.slice(mid) + '\n' })
      expect(store.controlMessages.find(m => m.type === 'agent').content).toBe('Split parse')
      expect(store.controlTokenCount).toBe(12)
    })

    it('falls back to char estimate when no usage is reported', () => {
      store.handleControlStdout({ sessionId: 's1', text: 'plain raw output with no json' })
      expect(store.controlHasRealTokens).toBe(false)
      expect(store.controlTokenCount).toBeGreaterThan(0)
    })
  })

  describe('inline context injection (Pi)', () => {
    beforeEach(() => {
      store.configuredAgents = [
        { id: 'pi', name: 'Pi', type: 'preset', presetId: 'pi', binary: 'pi', injectContext: true, installed: true }
      ]
      store.activeAgentId = 'pi'
      store.mcpPort = 9000
      store.workspacePath = '/test/my-workspace'
      store.files = [{ path: 'Vision/vision.md', name: 'vision', type: 'file' }, { path: 'specs/spec.md', name: 'spec', type: 'file' }]
      store.comments = [{ id: 'c1', text: 'tighten this', anchor: { quotedText: 'the goal' } }]
      store.currentFile = 'Vision/vision.md'
      store.currentContent = '# Vision\nbody'
    })

    it('injects workspace + files + comments inline and skips the MCP tool hint', async () => {
      await store.startControlSession({ prompt: 'improve the vision' })
      const arg = mockAgentControl.startSession.mock.calls[0][0]
      expect(arg.prompt).toContain('<workspace name="my-workspace">')
      expect(arg.prompt).toContain('- Vision/vision.md')
      expect(arg.prompt).toContain('<current_document path="Vision/vision.md">')
      expect(arg.prompt).toContain('on "the goal": tighten this')
      expect(arg.prompt).toContain('improve the vision')
      // No MCP tool advertisement for inject-context agents.
      expect(arg.prompt).not.toContain('Canonic MCP tools')
      // Comment protocol: file inbox, not a doc edit.
      expect(arg.prompt).toContain('.canonic/comments.inbox.jsonl')
      expect(arg.prompt).toContain('NEVER write comment text into the document')
    })

    it('does not auto-register the MCP server for inject-context agents', async () => {
      await store.startControlSession({ prompt: 'hi' })
      expect(mockAgentControl.registerMcp).not.toHaveBeenCalled()
    })
  })

  describe('session history', () => {
    it('loadControlHistory reads from IPC', async () => {
      mockAgentControl.getHistory.mockResolvedValueOnce([
        { id: 'h1', title: 'Test session', agentName: 'Claude Code' }
      ])
      await store.loadControlHistory()
      expect(store.controlHistory.length).toBe(1)
      expect(store.controlHistory[0].title).toBe('Test session')
    })

    it('deleteControlHistoryEntry removes from IPC and local state', async () => {
      store.controlHistory = [
        { id: 'h1', title: 'Test 1' },
        { id: 'h2', title: 'Test 2' }
      ]
      await store.deleteControlHistoryEntry('h1')
      expect(mockAgentControl.deleteHistory).toHaveBeenCalled()
      expect(store.controlHistory.length).toBe(1)
      expect(store.controlHistory[0].id).toBe('h2')
    })
  })

  describe('MCP registration', () => {
    it('checkMcpRegistration returns IPC result', async () => {
      const result = await store.checkMcpRegistration('claude-code')
      expect(result.registered).toBe(false)
      expect(mockAgentControl.checkMcp).toHaveBeenCalled()
    })

    it('registerMcp calls IPC with agentId and port', async () => {
      store.mcpPort = 9020
      await store.registerMcp('claude-code')
      expect(mockAgentControl.registerMcp).toHaveBeenCalledWith({ agentId: 'claude-code', port: 9020 })
    })

    it('optOutMcp calls IPC', async () => {
      await store.optOutMcp('gemini-cli')
      expect(mockAgentControl.optOutMcp).toHaveBeenCalled()
    })
  })

  describe('demo mode', () => {
    it('demo mode loads configured agents and history', async () => {
      await store.enableDemoMode()
      expect(store.isDemoMode).toBe(true)
      expect(store.configuredAgents.length).toBeGreaterThanOrEqual(1)
      expect(store.controlHistory.length).toBeGreaterThanOrEqual(1)
    })

    it('disableDemoMode clears AI control state', () => {
      store.configuredAgents = [{ id: 'test', name: 'Test' }]
      store.controlHistory = [{ id: 'h1' }]
      store.activeAgentId = 'test'
      store.disableDemoMode()
      expect(store.configuredAgents).toEqual([])
      expect(store.controlHistory).toEqual([])
      expect(store.activeAgentId).toBeNull()
    })
  })
})
