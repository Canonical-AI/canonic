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
  const { pathname } = new URL(req.url, 'http://127.0.0.1')

  if (req.method === 'GET' && pathname === '/ping') {
    return sendJson(res, 200, { ok: true, version: getAppVersion() })
  }

  const knownRoutes = ['/session/start', '/session/cancel', '/comments']
  if (!knownRoutes.includes(pathname)) {
    return sendJson(res, 404, { error: 'not found' })
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
