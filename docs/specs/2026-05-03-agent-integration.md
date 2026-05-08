# Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a local HTTP API from the Canonic Electron app so any AI coding agent can open a doc for human review, write inline comments, and receive the edited content + a chosen next-step prompt.

**Architecture:** A new `electron/api-server.js` module starts a local HTTP server on a random port at app launch and writes `~/.canonic/api.lock` for discovery. Main process routes HTTP events to the renderer via `mainWindow.webContents.send()`. A new `agentSession` IPC namespace in preload lets the Vue store react to sessions and comments, and lets the user submit an action back through the main process which POSTs to the agent's callback URL.

**Tech Stack:** Node.js `http` module (no deps), `crypto` for token/UUID, Vitest for tests, Vue 3 Composition API, Pinia store, Lucide icons.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `electron/api-server.js` | Create | HTTP server, lockfile, token auth, all endpoints |
| `electron/main.js` | Modify | Start/stop server, route events to renderer, new IPC handlers |
| `electron/preload.js` | Modify | Expose `canonic.agentSession` namespace |
| `src/store/index.js` | Modify | `agentSession` ref, actions, listener registration |
| `src/components/layout/AgentSessionPill.vue` | Create | Floating pulsating button + action picker modal |
| `src/components/sidebar/AgentPanel.vue` | Create | Sidebar agent session status panel |
| `src/components/sidebar/FileTree.vue` | Modify | Mount `AgentPanel` |
| `src/components/editor/Editor.vue` | Modify | Mount `AgentSessionPill` |
| `src/components/panels/CommentsPanel.vue` | Modify | Use `agentName` field instead of hardcoded "Claude · suggestion" |
| `tests/unit/api-server.test.js` | Create | Unit tests for HTTP server |
| `tests/integration/agent-session.test.js` | Create | Store integration tests for agent session |

---

## Task 1: HTTP API Server (`electron/api-server.js`)

**Files:**
- Create: `tests/unit/api-server.test.js`
- Create: `electron/api-server.js`

### Step 1: Write failing tests

- [ ] Create `tests/unit/api-server.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'

const LOCKFILE = path.join(os.homedir(), '.canonic', 'api.lock')
const apiServer = await import('../../electron/api-server.js')

let port, token
const capturedEvents = []

function request(method, pathname, body, authOverride) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname: '127.0.0.1', port, path: pathname, method,
      headers: {
        'Content-Type': 'application/json',
        ...(authOverride !== false && { Authorization: `Bearer ${authOverride ?? token}` }),
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    }
    const req = http.request(opts, (res) => {
      let raw = ''
      res.on('data', (c) => (raw += c))
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }))
    })
    if (data) req.write(data)
    req.end()
  })
}

beforeAll(async () => {
  port = await apiServer.start((e) => capturedEvents.push(e))
  const lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf-8'))
  token = lock.token
})

afterAll(() => {
  apiServer.stop()
})

beforeEach(() => {
  capturedEvents.length = 0
})

describe('api-server', () => {
  it('GET /ping returns ok without auth', async () => {
    const res = await request('GET', '/ping', null, false)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.version).toBe('string')
  })

  it('writes lockfile on start', () => {
    expect(fs.existsSync(LOCKFILE)).toBe(true)
    const lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf-8'))
    expect(lock.port).toBe(port)
    expect(typeof lock.token).toBe('string')
    expect(lock.token.length).toBe(32)
  })

  it('POST with wrong token returns 401', async () => {
    const res = await request('POST', '/session/start', {
      file: 'spec.md', agentName: 'A', callbackUrl: 'http://127.0.0.1:9/done',
    }, 'wrong-token')
    expect(res.status).toBe(401)
  })

  it('POST /session/start starts session and fires onEvent', async () => {
    const res = await request('POST', '/session/start', {
      file: 'spec.md', agentName: 'TestAgent',
      callbackUrl: 'http://127.0.0.1:9999/done',
      workspacePath: '/ws',
    })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.sessionId).toBe('string')
    expect(capturedEvents[0].type).toBe('session-start')
    expect(capturedEvents[0].data.agentName).toBe('TestAgent')
    expect(capturedEvents[0].data.file).toBe('spec.md')
  })

  it('rejects non-localhost callbackUrl', async () => {
    const res = await request('POST', '/session/start', {
      file: 'spec.md', agentName: 'A', callbackUrl: 'https://evil.com/steal',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/localhost/)
  })

  it('POST /session/start requires file, agentName, callbackUrl', async () => {
    const res = await request('POST', '/session/start', { file: 'x.md' })
    expect(res.status).toBe(400)
  })

  it('POST /comments fires onEvent with comment data', async () => {
    const res = await request('POST', '/comments', {
      file: 'spec.md',
      anchor: { quotedText: 'some text' },
      text: 'This needs work',
      agentName: 'TestAgent',
    })
    expect(res.status).toBe(200)
    expect(typeof res.body.commentId).toBe('string')
    expect(capturedEvents[0].type).toBe('comment')
    expect(capturedEvents[0].data.text).toBe('This needs work')
    expect(capturedEvents[0].data.agentName).toBe('TestAgent')
  })

  it('POST /session/cancel fires onEvent', async () => {
    // Start a session first
    const start = await request('POST', '/session/start', {
      file: 'spec.md', agentName: 'A', callbackUrl: 'http://127.0.0.1:9/done',
    })
    capturedEvents.length = 0
    const res = await request('POST', '/session/cancel', { sessionId: start.body.sessionId })
    expect(res.status).toBe(200)
    expect(capturedEvents[0].type).toBe('session-cancel')
  })

  it('GET /nonexistent returns 404', async () => {
    const res = await request('GET', '/nonexistent', null, false)
    expect(res.status).toBe(404)
  })
})
```

- [ ] Run tests to confirm they all fail:

```bash
npx vitest run tests/unit/api-server.test.js
```

Expected: all tests fail with "Cannot find module" or similar.

### Step 2: Implement `electron/api-server.js`

- [ ] Create `electron/api-server.js`:

```js
const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')

const CANONIC_DIR = path.join(os.homedir(), '.canonic')
const LOCKFILE = path.join(CANONIC_DIR, 'api.lock')

let server = null
let token = null
let activeSession = null
let onEventCallback = null

function generateToken() {
  return crypto.randomBytes(16).toString('hex')
}

function writeLockfile(port) {
  fs.mkdirSync(CANONIC_DIR, { recursive: true })
  fs.writeFileSync(LOCKFILE, JSON.stringify({ port, token }), { mode: 0o600 })
}

function deleteLockfile() {
  try { fs.unlinkSync(LOCKFILE) } catch {}
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  })
  res.end(data)
}

function checkAuth(req, res) {
  if (req.headers['authorization'] !== `Bearer ${token}`) {
    sendJson(res, 401, { error: 'unauthorized' })
    return false
  }
  return true
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try { resolve(JSON.parse(raw) || {}) } catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

function isLocalhost(url) {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch { return false }
}

async function handleRequest(req, res) {
  const { pathname } = new URL(req.url, 'http://127.0.0.1')

  if (req.method === 'GET' && pathname === '/ping') {
    return sendJson(res, 200, { ok: true, version: require('../package.json').version })
  }

  if (!checkAuth(req, res)) return

  if (req.method === 'POST' && pathname === '/session/start') {
    const body = await readBody(req)
    if (!body.file || !body.agentName || !body.callbackUrl) {
      return sendJson(res, 400, { error: 'file, agentName, and callbackUrl are required' })
    }
    if (!isLocalhost(body.callbackUrl)) {
      return sendJson(res, 400, { error: 'callbackUrl must be a localhost address' })
    }
    const sessionId = crypto.randomUUID()
    activeSession = {
      sessionId,
      file: body.file,
      agentName: body.agentName,
      callbackUrl: body.callbackUrl,
      workspacePath: body.workspacePath || null,
    }
    onEventCallback?.({ type: 'session-start', data: { sessionId, file: body.file, agentName: body.agentName, workspacePath: body.workspacePath || null } })
    return sendJson(res, 200, { ok: true, sessionId })
  }

  if (req.method === 'POST' && pathname === '/session/cancel') {
    const body = await readBody(req)
    if (activeSession?.sessionId === body.sessionId) {
      const sessionId = activeSession.sessionId
      activeSession = null
      onEventCallback?.({ type: 'session-cancel', data: { sessionId } })
    }
    return sendJson(res, 200, { ok: true })
  }

  if (req.method === 'POST' && pathname === '/comments') {
    const body = await readBody(req)
    if (!body.file || !body.text) {
      return sendJson(res, 400, { error: 'file and text are required' })
    }
    const commentId = crypto.randomUUID()
    onEventCallback?.({
      type: 'comment',
      data: { commentId, file: body.file, anchor: body.anchor || {}, text: body.text, agentName: body.agentName || 'Agent' },
    })
    return sendJson(res, 200, { ok: true, commentId })
  }

  sendJson(res, 404, { error: 'not found' })
}

async function submitAction(sessionId, prompt, content) {
  if (!activeSession || activeSession.sessionId !== sessionId) {
    return { error: 'no active session' }
  }
  const { callbackUrl, file } = activeSession
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, file, content, prompt }),
      signal: AbortSignal.timeout(5000),
    })
    activeSession = null
    onEventCallback?.({ type: 'session-done', data: { sessionId } })
    return { ok: true }
  } catch (err) {
    return { error: err.message }
  }
}

function cancelSession(sessionId) {
  if (activeSession?.sessionId === sessionId) activeSession = null
  return { ok: true }
}

function start(onEvent) {
  return new Promise((resolve, reject) => {
    onEventCallback = onEvent
    token = generateToken()
    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => sendJson(res, 500, { error: err.message }))
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      writeLockfile(port)
      resolve(port)
    })
    server.on('error', reject)
  })
}

function stop() {
  deleteLockfile()
  activeSession = null
  server?.close()
  server = null
}

module.exports = { start, stop, submitAction, cancelSession }
```

### Step 3: Run tests

- [ ] Run tests:

```bash
npx vitest run tests/unit/api-server.test.js
```

Expected: all 9 tests pass.

### Step 4: Commit

```bash
git add electron/api-server.js tests/unit/api-server.test.js
git commit -m "feat: add local HTTP API server with lockfile and token auth"
```

---

## Task 2: Wire Server into Main Process + Preload Bridge

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`

### Step 1: Start server in `electron/main.js`

- [ ] Add `const apiServer = require('./api-server')` after the existing requires at the top of `electron/main.js` (after line 7):

```js
const apiServer = require('./api-server')
```

- [ ] In `app.whenReady().then(...)` (around line 89), start the server after `createWindow()`:

Replace:
```js
app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers();
  setupAutoUpdater();
```

With:
```js
app.whenReady().then(async () => {
  createWindow();
  setupIpcHandlers();
  setupAutoUpdater();
  await apiServer.start((event) => {
    mainWindow?.webContents.send(`agent:${event.type}`, event.data)
  })
```

- [ ] Stop server on quit. Replace the existing `app.on("window-all-closed", ...)` block (around line 131):

```js
app.on("window-all-closed", () => {
  apiServer.stop()
  if (process.platform !== "darwin") app.quit();
});
```

### Step 2: Add IPC handlers for agent:submit and agent:cancel

- [ ] At the end of `setupIpcHandlers()` (just before the closing `}` of the function, around line 657), add:

```js
  // --- Agent session ---
  ipcMain.handle('agent:submit', async (_, { sessionId, prompt, content }) => {
    return await apiServer.submitAction(sessionId, prompt, content)
  })

  ipcMain.handle('agent:cancel', async (_, sessionId) => {
    return apiServer.cancelSession(sessionId)
  })
```

### Step 3: Add `agentSession` namespace to `electron/preload.js`

- [ ] Add the following before the final `});` closing the `contextBridge.exposeInMainWorld` call (after the `ai` block, around line 177):

```js
  // Agent session bridge
  agentSession: {
    onSessionStart: (cb) => ipcRenderer.on('agent:session-start', (_, data) => cb(data)),
    onComment: (cb) => ipcRenderer.on('agent:comment', (_, data) => cb(data)),
    onSessionCancel: (cb) => ipcRenderer.on('agent:session-cancel', (_, data) => cb(data)),
    onSessionDone: (cb) => ipcRenderer.on('agent:session-done', (_, data) => cb(data)),
    submit: (params) => ipcRenderer.invoke('agent:submit', params),
    cancel: (sessionId) => ipcRenderer.invoke('agent:cancel', sessionId),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('agent:session-start')
      ipcRenderer.removeAllListeners('agent:comment')
      ipcRenderer.removeAllListeners('agent:session-cancel')
      ipcRenderer.removeAllListeners('agent:session-done')
    },
  },
```

### Step 4: Verify the app still starts

- [ ] Run:

```bash
npm run dev
```

Expected: app opens, no console errors, `~/.canonic/api.lock` exists after launch. Check:

```bash
cat ~/.canonic/api.lock
```

Expected output (port will vary):
```json
{"port":52341,"token":"<32 hex chars>"}
```

### Step 5: Commit

```bash
git add electron/main.js electron/preload.js
git commit -m "feat: start API server at launch, add agent IPC bridge in preload"
```

---

## Task 3: Store — Agent Session State + Actions

**Files:**
- Modify: `src/store/index.js`
- Create: `tests/integration/agent-session.test.js`

### Step 1: Write failing integration tests

- [ ] Create `tests/integration/agent-session.test.js`:

```js
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
})
```

- [ ] Run to confirm failure:

```bash
npx vitest run tests/integration/agent-session.test.js
```

Expected: fails — `store.agentSession`, `store.startAgentSession`, etc. are undefined.

### Step 2: Add agent session state and actions to `src/store/index.js`

- [ ] After the `const isDemoMode = ref(false)` block (around line 43), add:

```js
  const agentSession = ref(null)   // { sessionId, agentName, file, startedAt }
  const actionPickerOpen = ref(false)
```

- [ ] After the `const api = window.canonic` line (around line 47), add the listener registration block:

```js
  // Register agent session IPC listeners once
  if (api.agentSession) {
    api.agentSession.onSessionStart((data) => startAgentSession(data))
    api.agentSession.onComment((data) => addAgentComment(data))
    api.agentSession.onSessionDone(() => { agentSession.value = null })
    api.agentSession.onSessionCancel(() => { agentSession.value = null })
  }
```

Note: `startAgentSession` and `addAgentComment` are hoisted by the `function` keyword below, so this forward-reference is safe.

- [ ] Add these four functions anywhere before the `return` statement (group them near the other comment functions around line 526):

```js
  async function startAgentSession({ sessionId, file, agentName, workspacePath }) {
    agentSession.value = { sessionId, agentName, file, startedAt: Date.now() }
    const ws = workspacePath || workspacePath.value
    if (file && ws) {
      await openFile(file)
    }
  }

  async function cancelAgentSession() {
    if (!agentSession.value) return
    const { sessionId } = agentSession.value
    agentSession.value = null
    actionPickerOpen.value = false
    await api.agentSession.cancel(sessionId)
  }

  async function submitAgentAction(prompt) {
    if (!agentSession.value) return
    const { sessionId } = agentSession.value
    await api.agentSession.submit({ sessionId, prompt, content: currentContent.value })
    agentSession.value = null
    actionPickerOpen.value = false
  }

  async function addAgentComment({ commentId, file, anchor, text, agentName }) {
    if (file !== currentFile.value) return
    const comment = {
      id: commentId,
      isAgent: true,
      agentName,
      author: agentName,
      anchor,
      text,
      resolved: false,
      createdAt: new Date().toISOString(),
    }
    comments.value.push(comment)
    await persistComments()
  }

  function openActionPicker() { actionPickerOpen.value = true }
  function closeActionPicker() { actionPickerOpen.value = false }
```

- [ ] Add the new refs and actions to the store's `return` statement (before the final `}`):

```js
    agentSession,
    actionPickerOpen,
    startAgentSession,
    cancelAgentSession,
    submitAgentAction,
    addAgentComment,
    openActionPicker,
    closeActionPicker,
```

### Step 3: Run tests

- [ ] Run:

```bash
npx vitest run tests/integration/agent-session.test.js
```

Expected: all 8 tests pass.

- [ ] Run the full test suite to confirm no regressions:

```bash
npm test
```

Expected: all existing tests still pass.

### Step 4: Commit

```bash
git add src/store/index.js tests/integration/agent-session.test.js
git commit -m "feat: add agent session state and actions to store"
```

---

## Task 4: Floating Pill + Action Picker (`AgentSessionPill.vue`)

**Files:**
- Create: `src/components/layout/AgentSessionPill.vue`
- Modify: `src/components/editor/Editor.vue`

### Step 1: Create `src/components/layout/AgentSessionPill.vue`

- [ ] Create the file:

```vue
<template>
  <div v-if="store.agentSession" class="agent-pill-wrapper">
    <!-- Floating pill button -->
    <button class="agent-pill" @click="store.openActionPicker()">
      <Zap :size="13" />
      <span>{{ store.agentSession.agentName }} is waiting</span>
    </button>

    <!-- Action picker modal overlay -->
    <Teleport to="body">
      <div v-if="store.actionPickerOpen" class="action-picker-overlay" @click.self="store.closeActionPicker()">
        <div class="action-picker">
          <div class="picker-header">
            <Zap :size="14" />
            <span>Send back to {{ store.agentSession.agentName }}</span>
          </div>

          <div class="prompt-chips">
            <button
              v-for="p in presets"
              :key="p"
              class="prompt-chip"
              @click="submit(p)"
            >
              {{ p }}
            </button>
          </div>

          <div class="custom-prompt-row">
            <input
              v-model="customPrompt"
              class="custom-input"
              placeholder="Or type a custom prompt…"
              @keydown.enter="submitCustom"
            />
            <button class="send-btn" :disabled="!customPrompt.trim()" @click="submitCustom">
              Send
            </button>
          </div>

          <button class="cancel-link" @click="cancelSession">Cancel session</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '../../store'
import { Zap } from 'lucide-vue-next'

const store = useAppStore()
const customPrompt = ref('')

const presets = [
  'Implement this',
  'Research this',
  'Review and suggest changes',
  'Create a task list',
  'Write tests for this',
]

async function submit(prompt) {
  await store.submitAgentAction(prompt)
}

async function submitCustom() {
  if (!customPrompt.value.trim()) return
  await store.submitAgentAction(customPrompt.value.trim())
  customPrompt.value = ''
}

async function cancelSession() {
  store.closeActionPicker()
  await store.cancelAgentSession()
}
</script>

<style scoped>
.agent-pill-wrapper {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 50;
}

.agent-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--accent, #7c8cf8);
  color: white;
  border: none;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  animation: pulse-glow 2s ease-in-out infinite;
}

.agent-pill:hover {
  filter: brightness(1.1);
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 140, 248, 0.5); }
  50% { box-shadow: 0 0 0 8px rgba(124, 140, 248, 0); }
}

.action-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  padding-bottom: 80px;
}

.action-picker {
  background: var(--surface, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
  padding: 20px;
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.picker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent, #7c8cf8);
}

.prompt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.prompt-chip {
  padding: 6px 14px;
  background: var(--bg, #0d0d1a);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--text, #ddd);
  cursor: pointer;
}

.prompt-chip:hover {
  border-color: var(--accent, #7c8cf8);
  color: var(--accent, #7c8cf8);
}

.custom-prompt-row {
  display: flex;
  gap: 8px;
}

.custom-input {
  flex: 1;
  padding: 7px 12px;
  background: var(--bg, #0d0d1a);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--text, #ddd);
  outline: none;
}

.custom-input:focus { border-color: var(--accent, #7c8cf8); }

.send-btn {
  padding: 7px 16px;
  background: var(--accent, #7c8cf8);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
}

.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.cancel-link {
  background: none;
  border: none;
  color: var(--text-muted, #666);
  font-size: 0.75rem;
  cursor: pointer;
  text-align: center;
  text-decoration: underline;
}
</style>
```

### Step 2: Mount in `src/components/editor/Editor.vue`

- [ ] Find where the editor wrapper `<div>` closes. Add the import at the top of the `<script setup>` section alongside other component imports:

```js
import AgentSessionPill from '../layout/AgentSessionPill.vue'
```

- [ ] In the template, find the outermost editor wrapper `<div>` and add the pill as the last child before its closing tag. The editor wrapper typically has `position: relative` or you may need to add it. Look for a wrapping element that spans the full editor area and add:

```html
<AgentSessionPill />
```

Make sure the parent div has `position: relative` so the pill anchors to the bottom-right of the editor, not the viewport.

### Step 3: Verify visually

- [ ] Start the app:

```bash
npm run dev
```

In the browser devtools console, simulate a session:
```js
window.canonic.agentSession  // should exist
```

Then manually trigger a store action from devtools (or test by POSTing to the lockfile port).

### Step 4: Commit

```bash
git add src/components/layout/AgentSessionPill.vue src/components/editor/Editor.vue
git commit -m "feat: add floating agent session pill and action picker"
```

---

## Task 5: Sidebar Agent Panel

**Files:**
- Create: `src/components/sidebar/AgentPanel.vue`
- Modify: `src/components/sidebar/FileTree.vue`

### Step 1: Create `src/components/sidebar/AgentPanel.vue`

- [ ] Create the file:

```vue
<template>
  <div v-if="store.agentSession" class="agent-panel">
    <div class="agent-panel-header">
      <Zap :size="12" />
      <span class="label">Agent Session</span>
    </div>
    <div class="agent-name">{{ store.agentSession.agentName }}</div>
    <div class="agent-file">{{ store.agentSession.file }}</div>
    <div class="agent-elapsed">{{ elapsed }}</div>
    <button class="return-btn" @click="store.openActionPicker()">
      Return →
    </button>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../../store'
import { Zap } from 'lucide-vue-next'

const store = useAppStore()
const now = ref(Date.now())
let timer

onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(timer))

const elapsed = computed(() => {
  if (!store.agentSession) return ''
  const secs = Math.floor((now.value - store.agentSession.startedAt) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
})
</script>

<style scoped>
.agent-panel {
  margin: 12px 8px 0;
  padding: 10px 12px;
  background: var(--bg, #0d0d1a);
  border: 1px solid var(--accent, #7c8cf8);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-panel-header {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--accent, #7c8cf8);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.label { color: var(--accent, #7c8cf8); }

.agent-name {
  font-size: 0.8rem;
  color: var(--text, #ddd);
  font-weight: 500;
}

.agent-file, .agent-elapsed {
  font-size: 0.75rem;
  color: var(--text-muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.return-btn {
  margin-top: 6px;
  padding: 5px 0;
  background: var(--accent, #7c8cf8);
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 0.78rem;
  cursor: pointer;
  width: 100%;
}

.return-btn:hover { filter: brightness(1.1); }
</style>
```

### Step 2: Mount in `src/components/sidebar/FileTree.vue`

- [ ] In the `<script setup>` block, add the import alongside existing imports:

```js
import AgentPanel from './AgentPanel.vue'
```

- [ ] In the template, after the `<TrashBin />` component and before the closing `</div>` of `.file-tree`:

```html
<AgentPanel />
```

### Step 3: Run the app and verify

- [ ] Start the app:

```bash
npm run dev
```

The sidebar should show no agent panel. To test, open devtools and call:
```js
const store = window.__pinia_stores__?.app  // or inspect via Vue devtools
```

### Step 4: Commit

```bash
git add src/components/sidebar/AgentPanel.vue src/components/sidebar/FileTree.vue
git commit -m "feat: add agent session panel in sidebar"
```

---

## Task 6: Fix Agent Comment Display in CommentsPanel

**Files:**
- Modify: `src/components/panels/CommentsPanel.vue`

The panel already renders agent comments with `isAgent` styling (purple left border, italic author). The only issue: line 20 hardcodes `'Claude · suggestion'` instead of using `agentName`.

### Step 1: Fix the hardcoded agent label

- [ ] In `src/components/panels/CommentsPanel.vue`, find line 20:

```html
{{ comment.isAgent ? 'Claude · suggestion' : comment.author }}
```

Replace with:

```html
{{ comment.isAgent ? `${comment.agentName || 'Agent'} · suggestion` : comment.author }}
```

### Step 2: Run the full test suite

- [ ] Run:

```bash
npm test
```

Expected: all tests pass. (This change has no test coverage because it's a template expression — the integration tests for store cover the data model, not the template rendering.)

### Step 3: Commit

```bash
git add src/components/panels/CommentsPanel.vue
git commit -m "fix: show actual agentName in comments panel instead of hardcoded label"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Local HTTP server with random port + lockfile — Task 1
- ✅ Token auth, 127.0.0.1 binding, localhost-only callbackUrl — Task 1
- ✅ GET /ping, POST /session/start, /session/cancel, /comments — Task 1
- ✅ Focus window on session start — Task 2 (mainWindow.focus() called by `webContents.send` triggering store which calls openFile; note: `mainWindow.focus()` should be explicitly called in the main.js IPC event route for `session-start`)
- ✅ Callback POST with { file, content, prompt } — Task 1 (submitAction)
- ✅ Auto-start server at launch, stop on quit — Task 2
- ✅ Store agentSession state + actions — Task 3
- ✅ Floating pulsating pill — Task 4
- ✅ Action picker with presets + custom prompt — Task 4
- ✅ Sidebar agent panel with elapsed time — Task 5
- ✅ Agent comments in panel with agentName badge — Task 6
- ✅ Agent comment inline highlight (already implemented via `isAgent` in MilkdownEditor.vue) — no new task needed

**One gap found:** `mainWindow.focus()` is not explicitly called when the `session-start` event fires. Fix in Task 2 Step 1 — update the event routing callback:

```js
await apiServer.start((event) => {
  if (event.type === 'session-start') {
    mainWindow?.focus()
    if (process.platform === 'darwin') app.focus({ steal: true })
  }
  mainWindow?.webContents.send(`agent:${event.type}`, event.data)
})
```
