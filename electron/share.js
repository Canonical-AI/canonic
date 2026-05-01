const express = require('express')
const http = require('http')
const { WebSocketServer } = require('ws')
const { marked } = require('marked')
const { EventEmitter } = require('events')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

// Singleton emitter — main.js listens here to forward stats to renderer
const emitter = new EventEmitter()

const PEERS_FILE = path.join(os.homedir(), '.canonic', 'peers.json')

// Active shares: filePath -> { app, server, wss, token, port, shutdownTimer }
const activeShares = new Map()

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateToken() {
  return crypto.randomBytes(24).toString('hex')
}

/** Return the first non-internal IPv4 address (the LAN IP). */
function getLanIP() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function loadPeers() {
  if (!fs.existsSync(PEERS_FILE)) return []
  return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf-8'))
}

function savePeer(peer) {
  const peers = loadPeers()
  const existing = peers.findIndex(p => p.id === peer.id)
  if (existing >= 0) {
    peers[existing] = { ...peers[existing], ...peer }
  } else {
    peers.push(peer)
  }
  fs.mkdirSync(path.dirname(PEERS_FILE), { recursive: true })
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2), 'utf-8')
}

function loadIgnorePatterns(workspacePath) {
  const ignoreFile = path.join(workspacePath, '.canonicignore')
  if (!fs.existsSync(ignoreFile)) return []
  return fs.readFileSync(ignoreFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
}

function collectMarkdownFiles(rootDir, workspacePath, ignore = []) {
  const results = []
  const scan = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(workspacePath, full)
      if (ignore.some(p => rel.startsWith(p) || entry.name === p)) continue
      if (entry.isDirectory()) {
        scan(full)
      } else if (entry.name.endsWith('.md')) {
        results.push(rel)
      }
    }
  }
  scan(rootDir)
  return results
}

// ── Rate Limiter ──────────────────────────────────────────────────────────────
//
// Per-IP: 10 req/s, 1000 req/min.
// EMA of req/s across ALL IPs — if trending past 20 req/s and rising, fires the
// onThreaten callback so the caller can shut down the share.

class RateLimiter {
  constructor({ maxPerSecond = 10, maxPerMinute = 1000, emaThreshold = 20, onThreaten }) {
    this.maxPerSecond = maxPerSecond
    this.maxPerMinute = maxPerMinute
    this.emaThreshold = emaThreshold
    this.onThreaten = onThreaten

    // ip -> [timestamp, ...]
    this.buckets = new Map()

    // EMA state for global rate
    this.ema = 0
    this.lastEmaUpdate = Date.now()
    this.threatened = false

    // Tick every second to update EMA and prune old buckets
    this._tick = setInterval(() => this._update(), 1000)
  }

  _now() { return Date.now() }

  _prune(ip) {
    const now = this._now()
    const ts = this.buckets.get(ip) || []
    const pruned = ts.filter(t => t > now - 60000)
    if (pruned.length === 0) this.buckets.delete(ip)
    else this.buckets.set(ip, pruned)
    return pruned
  }

  _update() {
    const now = this._now()
    const elapsed = (now - this.lastEmaUpdate) / 1000
    this.lastEmaUpdate = now

    // Count total requests in the last second across all IPs
    let total = 0
    for (const [ip] of this.buckets) {
      const ts = this._prune(ip)
      total += ts.filter(t => t > now - 1000).length
    }

    // EMA with α = 0.3
    this.ema = 0.3 * (total / Math.max(elapsed, 0.5)) + 0.7 * this.ema

    if (!this.threatened && this.ema > this.emaThreshold) {
      this.threatened = true
      this.onThreaten && this.onThreaten(this.ema)
    }
  }

  /** Returns true if the request should be allowed. */
  allow(ip) {
    const now = this._now()
    const ts = this._prune(ip)

    const perSecond = ts.filter(t => t > now - 1000).length
    const perMinute = ts.length

    if (perSecond >= this.maxPerSecond || perMinute >= this.maxPerMinute) {
      return false
    }

    ts.push(now)
    this.buckets.set(ip, ts)
    return true
  }

  middleware() {
    return (req, res, next) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown'
      if (this.allow(ip)) {
        next()
      } else {
        res.status(429).json({ error: 'Too many requests' })
      }
    }
  }

  destroy() {
    clearInterval(this._tick)
  }
}

// ── HTML renderer for browser view ───────────────────────────────────────────

function renderDocPage(title, content, author, docUrl) {
  // canonic://open?url=<encoded> — Electron handles this if the user has Canonic installed
  const deepLink = `canonic://open?url=${encodeURIComponent(docUrl)}`
  const html = marked.parse(content)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Canonic</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #1a1a1a;
    background: #f9f8f7;
    padding: 0 16px;
  }
  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 56px 0 96px;
  }
  .meta {
    font-size: 0.8125rem;
    color: #888;
    margin-bottom: 40px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e8e5e1;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .meta-dot { color: #ccc; }
  .open-app-btn {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: white;
    background: #4A7A9B;
    text-decoration: none;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 5px;
  }
  .open-app-btn:hover { opacity: 0.85; }
  h1 { font-size: 1.875rem; font-weight: 700; margin: 0 0 8px; color: #111; line-height: 1.25; }
  h2 { font-size: 1.375rem; font-weight: 600; margin: 40px 0 12px; color: #111; }
  h3 { font-size: 1.125rem; font-weight: 600; margin: 32px 0 10px; color: #111; }
  h4 { font-size: 1rem; font-weight: 600; margin: 24px 0 8px; }
  p { margin: 0 0 20px; }
  ul, ol { margin: 0 0 20px 24px; }
  li { margin-bottom: 4px; }
  blockquote {
    border-left: 3px solid #4A7A9B;
    padding: 4px 0 4px 16px;
    margin: 0 0 20px;
    color: #555;
    font-style: italic;
  }
  code {
    font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
    font-size: 0.875em;
    background: #ede9e5;
    padding: 2px 6px;
    border-radius: 4px;
  }
  pre {
    background: #1a1a1a;
    color: #e8e5e1;
    padding: 20px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0 0 20px;
  }
  pre code { background: none; padding: 0; color: inherit; font-size: 0.875rem; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 20px;
    font-size: 0.9rem;
  }
  th, td { padding: 10px 14px; border: 1px solid #e0dbd5; text-align: left; }
  th { background: #f0ece8; font-weight: 600; }
  tr:nth-child(even) { background: #faf8f6; }
  a { color: #4A7A9B; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  hr { border: none; border-top: 1px solid #e8e5e1; margin: 32px 0; }
  .open-in-app {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 40px;
    padding: 10px 18px;
    background: #4A7A9B;
    color: white;
    border-radius: 8px;
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .open-in-app:hover { opacity: 0.85; }
</style>
</head>
<body>
<div class="page">
  <div class="meta">
    <span>Shared by <strong>${escapeHtml(author)}</strong></span>
    <span class="meta-dot">·</span>
    <span>View only</span>
    <a class="open-app-btn" href="${deepLink}" title="Open in Canonic app">Open in Canonic ↗</a>
  </div>
  ${html}
</div>
</body>
</html>`
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Share start/stop ──────────────────────────────────────────────────────────

const WORKSPACE_KEY = '__workspace__'

function emitStats(filePath, share) {
  const stats = { filePath, reads: share.reads, connected: share.wss.clients.size }
  emitter.emit('stats', stats)
}

// ── Browse page for workspace-level shares ────────────────────────────────────

function renderBrowsePage(author, files, token, baseUrl) {
  const fileLinks = files.map(f => {
    const title = f.replace(/\.md$/, '').split('/').pop()
    const url = `${baseUrl}/file?path=${encodeURIComponent(f)}&token=${token}`
    return `<a class="doc-link" href="${url}">${escapeHtml(title)}<span class="doc-path">${escapeHtml(f)}</span></a>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workspace — ${escapeHtml(author)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #f9f8f7; color: #1a1a1a; padding: 0 16px; }
  .page { max-width: 640px; margin: 0 auto; padding: 48px 0 80px; }
  .header { margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid #e8e5e1; }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
  .meta { font-size: 0.8125rem; color: #888; }
  .doc-link {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; padding: 12px 14px; border-radius: 8px;
    text-decoration: none; color: #1a1a1a;
    border: 1px solid #e8e5e1; margin-bottom: 6px;
    transition: background 0.1s, border-color 0.1s;
    font-size: 0.9375rem; font-weight: 500;
  }
  .doc-link:hover { background: #f0ece8; border-color: #d0cac4; }
  .doc-path { font-size: 0.75rem; color: #999; font-weight: 400; font-family: monospace; }
  .empty { color: #888; font-size: 0.875rem; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>${escapeHtml(author)}'s workspace</h1>
    <p class="meta">${files.length} document${files.length !== 1 ? 's' : ''} · view only</p>
  </div>
  ${files.length ? fileLinks : '<p class="empty">No documents found.</p>'}
</div>
</body>
</html>`
}

async function startWorkspaceShare(workspacePath) {
  if (activeShares.has(WORKSPACE_KEY)) {
    const s = activeShares.get(WORKSPACE_KEY)
    const lanIP = getLanIP()
    return { success: true, token: s.token, localUrl: `http://${lanIP}:${s.port}/browse?token=${s.token}`, port: s.port, reads: s.reads }
  }

  const token = generateToken()
  const PORT = 3800 + Math.floor(Math.random() * 200)
  const ignore = loadIgnorePatterns(workspacePath)
  const author = os.userInfo().username

  const share = { reads: 0, token, port: PORT, wss: null, server: null, heartbeat: null, limiter: null }

  const app = express()
  app.set('trust proxy', true)

  const limiter = new RateLimiter({
    maxPerSecond: 10, maxPerMinute: 1000, emaThreshold: 20,
    onThreaten: (ema) => { console.warn(`[share:workspace] EMA ${ema.toFixed(1)} req/s — auto-stopping`); stopWorkspaceShare() }
  })
  share.limiter = limiter
  app.use(limiter.middleware())

  app.get('/health', (_, res) => res.json({ ok: true }))

  // HTML workspace browser
  app.get('/browse', (req, res) => {
    if (req.query.token !== token) return res.status(403).send('Forbidden')
    share.reads++
    emitStats(WORKSPACE_KEY, share)
    const files = collectMarkdownFiles(workspacePath, workspacePath, ignore)
    const baseUrl = `${req.protocol}://${req.headers.host}`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(renderBrowsePage(author, files, token, baseUrl))
  })

  // JSON manifest for Canonic app
  app.get('/manifest', (req, res) => {
    if (req.query.token !== token) return res.status(403).json({ error: 'Invalid token' })
    const files = collectMarkdownFiles(workspacePath, workspacePath, ignore)
    res.json({ scope: 'workspace', files, sharedAt: new Date().toISOString(), author })
  })

  // Individual file
  app.get('/file', (req, res) => {
    if (req.query.token !== token) return res.status(403).json({ error: 'Invalid token' })
    const relPath = req.query.path
    if (!relPath) return res.status(400).json({ error: 'Missing path' })
    const resolved = path.resolve(workspacePath, relPath)
    if (!resolved.startsWith(workspacePath)) return res.status(403).json({ error: 'Path outside workspace' })
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Not found' })

    share.reads++
    emitStats(WORKSPACE_KEY, share)

    const content = fs.readFileSync(resolved, 'utf-8')
    const commentsFile = path.join(os.homedir(), '.canonic', 'comments', `${relPath.replace(/\//g, '_')}.json`)
    const comments = fs.existsSync(commentsFile) ? JSON.parse(fs.readFileSync(commentsFile, 'utf-8')) : []

    const accept = req.headers['accept'] || ''
    if (accept.includes('text/html')) {
      const title = path.basename(relPath, '.md')
      const docUrl = `${req.protocol}://${req.headers.host}${req.originalUrl}`
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(renderDocPage(title, content, author, docUrl))
    }
    res.json({ filePath: relPath, content, comments })
  })

  const server = http.createServer(app)
  const wss = new WebSocketServer({ server })
  share.server = server
  share.wss = wss

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    if (url.searchParams.get('token') !== token) { ws.close(4003, 'Unauthorized'); return }
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    ws.on('close', () => emitStats(WORKSPACE_KEY, share))
    ws.send(JSON.stringify({ type: 'manifest', author }))
    emitStats(WORKSPACE_KEY, share)
  })

  const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => { if (!ws.isAlive) { ws.terminate(); return } ws.isAlive = false; ws.ping() })
  }, 30000)
  share.heartbeat = heartbeat

  server.listen(PORT, '0.0.0.0')
  activeShares.set(WORKSPACE_KEY, share)

  const lanIP = getLanIP()
  return { success: true, token, localUrl: `http://${lanIP}:${PORT}/browse?token=${token}`, port: PORT, reads: 0 }
}

function stopWorkspaceShare() {
  const share = activeShares.get(WORKSPACE_KEY)
  if (!share) return { success: false, error: 'No active workspace share' }
  clearInterval(share.heartbeat)
  share.limiter.destroy()
  share.wss.close()
  share.server.close()
  activeShares.delete(WORKSPACE_KEY)
  return { success: true }
}

async function startShare(workspacePath, filePath, options = {}) {
  if (activeShares.has(filePath)) {
    const s = activeShares.get(filePath)
    const lanIP = getLanIP()
    return {
      success: true,
      token: s.token,
      localUrl: `http://${lanIP}:${s.port}/doc?token=${s.token}`,
      port: s.port,
      reads: s.reads
    }
  }

  const fullPath = path.join(workspacePath, filePath)
  if (!fs.existsSync(fullPath)) {
    return { success: false, error: 'File not found' }
  }

  const token = generateToken()
  const PORT = 3800 + Math.floor(Math.random() * 200)
  const scope = options.scope || 'file'
  const ignore = loadIgnorePatterns(workspacePath)
  const author = os.userInfo().username

  // Stub share object so emitStats can reference it inside closures
  const share = { reads: 0, token, port: PORT, wss: null, server: null, heartbeat: null, limiter: null }

  const app = express()
  app.set('trust proxy', true)

  // Rate limiter — auto-stops share if EMA exceeds 20 req/s
  const limiter = new RateLimiter({
    maxPerSecond: 10,
    maxPerMinute: 1000,
    emaThreshold: 20,
    onThreaten: (ema) => {
      console.warn(`[share] EMA ${ema.toFixed(1)} req/s — auto-stopping share for ${filePath}`)
      stopShare(filePath)
    }
  })
  share.limiter = limiter

  app.use(limiter.middleware())

  // ── /health — no auth ────────────────────────────────────────────────────
  app.get('/health', (_, res) => res.json({ ok: true }))

  // ── /doc — main endpoint; HTML for browsers, JSON for Canonic app ─────────
  app.get('/doc', (req, res) => {
    if (req.query.token !== token) return res.status(403).json({ error: 'Invalid token' })

    share.reads++
    emitStats(filePath, share)

    const content = fs.readFileSync(fullPath, 'utf-8')
    const commentsFile = path.join(
      os.homedir(), '.canonic', 'comments',
      `${filePath.replace(/\//g, '_')}.json`
    )
    const comments = fs.existsSync(commentsFile)
      ? JSON.parse(fs.readFileSync(commentsFile, 'utf-8'))
      : []

    const accept = req.headers['accept'] || ''
    if (accept.includes('text/html')) {
      const title = path.basename(filePath, '.md')
      const docUrl = `${req.protocol}://${req.headers.host}${req.originalUrl}`
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(renderDocPage(title, content, author, docUrl))
    }

    res.json({ scope: 'file', filePath, content, comments, sharedAt: new Date().toISOString(), author })
  })

  // ── /manifest — workspace file list ─────────────────────────────────────
  app.get('/manifest', (req, res) => {
    if (req.query.token !== token) return res.status(403).json({ error: 'Invalid token' })

    let rootDir = workspacePath
    if (scope === 'directory') rootDir = path.dirname(fullPath)

    const files = collectMarkdownFiles(rootDir, workspacePath, ignore)
    res.json({ scope, rootDir: path.relative(workspacePath, rootDir) || '.', files, sharedAt: new Date().toISOString(), author })
  })

  // ── /file — individual file within a multi-doc share ────────────────────
  app.get('/file', (req, res) => {
    if (req.query.token !== token) return res.status(403).json({ error: 'Invalid token' })
    const relPath = req.query.path
    if (!relPath) return res.status(400).json({ error: 'Missing path' })

    const resolved = path.resolve(workspacePath, relPath)
    if (!resolved.startsWith(workspacePath)) return res.status(403).json({ error: 'Path outside workspace' })
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Not found' })

    share.reads++
    emitStats(filePath, share)

    const content = fs.readFileSync(resolved, 'utf-8')
    const commentsFile = path.join(
      os.homedir(), '.canonic', 'comments',
      `${relPath.replace(/\//g, '_')}.json`
    )
    const comments = fs.existsSync(commentsFile)
      ? JSON.parse(fs.readFileSync(commentsFile, 'utf-8'))
      : []

    const accept = req.headers['accept'] || ''
    if (accept.includes('text/html')) {
      const title = path.basename(relPath, '.md')
      const docUrl = `${req.protocol}://${req.headers.host}${req.originalUrl}`
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(renderDocPage(title, content, author, docUrl))
    }

    res.json({ filePath: relPath, content, comments })
  })

  // ── HTTP + WebSocket server on the same port ──────────────────────────────
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server })
  share.server = server
  share.wss = wss

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    if (url.searchParams.get('token') !== token) {
      ws.close(4003, 'Unauthorized')
      return
    }

    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    ws.on('close', () => emitStats(filePath, share))

    // Send current doc state immediately on connect
    const content = fs.readFileSync(fullPath, 'utf-8')
    ws.send(JSON.stringify({ type: 'doc', filePath, content, author }))

    emitStats(filePath, share)
  })

  // Heartbeat — drop dead connections every 30s
  const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) { ws.terminate(); return }
      ws.isAlive = false
      ws.ping()
    })
  }, 30000)
  share.heartbeat = heartbeat

  server.listen(PORT, '0.0.0.0')
  activeShares.set(filePath, share)

  const lanIP = getLanIP()
  const localUrl = `http://${lanIP}:${PORT}/doc?token=${token}`

  return { success: true, token, localUrl, port: PORT, reads: 0 }
}

/** Push a doc update to all connected WebSocket clients for a share. */
function pushUpdate(filePath, content) {
  const share = activeShares.get(filePath)
  if (!share) return
  const payload = JSON.stringify({ type: 'update', filePath, content })
  share.wss.clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) ws.send(payload)
  })
}

function stopShare(filePath) {
  const share = activeShares.get(filePath)
  if (!share) return { success: false, error: 'No active share' }

  clearInterval(share.heartbeat)
  share.limiter.destroy()
  share.wss.close()
  share.server.close()
  activeShares.delete(filePath)
  return { success: true }
}

async function fetchSharedDoc(url, token) {
  try {
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args))
    const separator = url.includes('?') ? '&' : '?'
    const fetchUrl = `${url}${separator}token=${token}`
    const response = await fetch(fetchUrl, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    })
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` }
    const data = await response.json()

    // Cache locally
    const cacheDir = path.join(os.homedir(), '.canonic', 'peers', data.author)
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, path.basename(data.filePath)), data.content, 'utf-8')

    savePeer({
      id: data.author,
      name: data.author,
      lastUrl: url,
      lastToken: token,
      lastSeen: Date.now()
    })

    return { success: true, ...data, cachedAt: Date.now() }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getStats(filePath) {
  const share = activeShares.get(filePath)
  if (!share) return null
  return { filePath, reads: share.reads, connected: share.wss.clients.size }
}

module.exports = { startShare, stopShare, startWorkspaceShare, stopWorkspaceShare, pushUpdate, fetchSharedDoc, getStats, emitter, WORKSPACE_KEY }
