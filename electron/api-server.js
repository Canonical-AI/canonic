const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')
const mcp = require('./mcp-server')

const CANONIC_DIR = path.join(os.homedir(), '.config', 'canonic')
const LOCKFILE = path.join(CANONIC_DIR, 'api.lock')
const COMMENTS_DIR = path.join(CANONIC_DIR, 'comments')

function docIdFor(relPath) {
  return relPath.replace(/[\\/]/g, '_')
}

function readCommentsFor(relPath) {
  const file = path.join(COMMENTS_DIR, `${docIdFor(relPath)}.json`)
  if (!fs.existsSync(file)) return []
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return []
  }
}

function readAllComments() {
  if (!fs.existsSync(COMMENTS_DIR)) return {}
  const out = {}
  for (const entry of fs.readdirSync(COMMENTS_DIR)) {
    if (!entry.endsWith('.json')) continue
    const relPath = entry.slice(0, -5).replace(/_/g, '/')
    try {
      out[relPath] = JSON.parse(fs.readFileSync(path.join(COMMENTS_DIR, entry), 'utf-8'))
    } catch {
      out[relPath] = []
    }
  }
  return out
}

let server = null
let token = null
let activeSession = null
let onEventCallback = null
let activePort = null  // live listening port, kept in-memory so callers needn't read the lockfile

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

function getAppVersion() {
  try {
    return require('../package.json').version
  } catch {
    try {
      // Fallback for some production builds
      return require('./package.json').version
    } catch {
      return '0.1.0'
    }
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1')
  const { pathname } = url

  // ── MCP routes (delegated to mcp-server.js) ──
  if (pathname === '/mcp') {
    return await mcp.handleMcpRequest(req, res)
  }

  if (pathname === '/mcp/sse' || pathname === '/sse') {
    return mcp.handleSseRequest(req, res)
  }

  if (req.method === 'GET' && pathname === '/ping') {
    return sendJson(res, 200, { ok: true, version: getAppVersion(), mcp: true })
  }

  // ── Plain REST routes (token-free, localhost-only) ───────────────────────────
  // Mirror the MCP tools for agents that can't speak MCP and just curl (e.g. Pi).
  // Same security posture as /mcp: bound to 127.0.0.1, no token required.
  if (pathname === '/workspace' && req.method === 'GET') {
    const info = await mcp.tools.get_workspace_info.handler({})
    let files = []
    try { files = (await mcp.tools.list_docs.handler({})).files || [] } catch {}
    return sendJson(res, 200, { ...info, files })
  }

  if (pathname === '/doc') {
    if (req.method === 'GET') {
      let p = url.searchParams.get('path')
      if (!p) p = mcp.getEditorState().focusedDoc   // no path → the doc the user is focused on
      if (!p) return sendJson(res, 404, { error: 'no path given and no focused doc' })
      const result = await mcp.tools.read_doc.handler({ path: p })
      if (result.error) return sendJson(res, 404, result)
      return sendJson(res, 200, { path: p, content: result.content })
    }
    if (req.method === 'POST') {
      const body = await readBody(req)
      if (!body.path || typeof body.content !== 'string') {
        return sendJson(res, 400, { error: 'path and content are required' })
      }
      const result = await mcp.tools.write_doc.handler({ path: body.path, content: body.content })
      return sendJson(res, 200, result)
    }
    return sendJson(res, 405, { error: 'method not allowed' })
  }

  if (pathname === '/comment') {
    if (req.method === 'GET') {
      const p = url.searchParams.get('path') || url.searchParams.get('file')
      if (!p) return sendJson(res, 400, { error: 'path is required' })
      const result = await mcp.tools.read_comments.handler({ path: p })
      return sendJson(res, 200, result)
    }
    if (req.method === 'POST') {
      const body = await readBody(req)
      const p = body.path || body.file
      if (!p || !body.text) return sendJson(res, 400, { error: 'path and text are required' })
      const result = await mcp.tools.post_comment.handler({ path: p, text: body.text, anchor: body.anchor || {} })
      return sendJson(res, 200, result)
    }
    return sendJson(res, 405, { error: 'method not allowed' })
  }

  const knownRoutes = ['/session/start', '/session/cancel', '/comments', '/activity']
  if (!knownRoutes.includes(pathname)) {
    return sendJson(res, 404, { error: 'not found' })
  }

  if (!checkAuth(req, res)) return

  if (req.method === 'GET' && pathname === '/comments') {
    const file = url.searchParams.get('file')
    if (file) {
      return sendJson(res, 200, { file, comments: readCommentsFor(file) })
    }
    return sendJson(res, 200, { comments: readAllComments() })
  }

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

  if (req.method === 'POST' && pathname === '/activity') {
    const body = await readBody(req)
    if (!activeSession) return sendJson(res, 400, { error: 'no active session' })
    onEventCallback?.({
      type: 'activity',
      data: { sessionId: activeSession.sessionId, activityType: body.type || 'thinking', label: body.label || null },
    })
    return sendJson(res, 200, { ok: true })
  }

  sendJson(res, 405, { error: 'method not allowed' })
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
  if (activeSession?.sessionId === sessionId) {
    const sid = activeSession.sessionId
    activeSession = null
    onEventCallback?.({ type: 'session-cancel', data: { sessionId: sid } })
  }
  return { ok: true }
}

function start(onEvent) {
  return new Promise((resolve, reject) => {
    onEventCallback = onEvent
    token = generateToken()
    mcp.setAuthToken(token)
    mcp.setEventCallback(onEvent)
    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => sendJson(res, 500, { error: err.message }))
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      activePort = port
      writeLockfile(port)
      resolve(port)
    })
    server.on('error', reject)
  })
}

function stop() {
  deleteLockfile()
  activeSession = null
  activePort = null
  server?.close()
  server = null
}

function getPort() {
  return activePort
}

function setWorkspacePath(wsPath) {
  mcp.setWorkspacePath(wsPath)
}

function getWorkspacePath() {
  return mcp.getWorkspacePath()
}

module.exports = { start, stop, getPort, submitAction, cancelSession, setWorkspacePath, getWorkspacePath }
