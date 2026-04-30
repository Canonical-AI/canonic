const express = require('express')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

const PEERS_FILE = path.join(os.homedir(), '.canonic', 'peers.json')

// Active shares: filePath -> { app, server, token, tunnel }
const activeShares = new Map()

function generateToken() {
  return crypto.randomBytes(24).toString('hex')
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
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2), 'utf-8')
}

async function startShare(workspacePath, filePath, options = {}, mainWindow) {
  const token = generateToken()
  const fullPath = path.join(workspacePath, filePath)

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: 'File not found' }
  }

  // Start local express server for this document
  const app = express()
  const PORT = 3800 + Math.floor(Math.random() * 200)

  app.get('/doc', (req, res) => {
    if (req.query.token !== token) {
      return res.status(403).json({ error: 'Invalid token' })
    }
    const content = fs.readFileSync(fullPath, 'utf-8')
    const commentsFile = path.join(os.homedir(), '.canonic', 'comments', `${filePath.replace(/\//g, '_')}.json`)
    const comments = fs.existsSync(commentsFile) ? JSON.parse(fs.readFileSync(commentsFile, 'utf-8')) : []
    res.json({
      filePath,
      content,
      comments,
      sharedAt: new Date().toISOString(),
      author: os.userInfo().username
    })
  })

  app.get('/health', (_, res) => res.json({ ok: true }))

  const server = app.listen(PORT)

  // Try to start cloudflared tunnel
  let tunnelUrl = null
  try {
    tunnelUrl = await startCloudflaredTunnel(PORT, token, mainWindow)
  } catch (err) {
    // Tunnel failed — fall back to local network only
    console.log('Cloudflared not available, local network only:', err.message)
  }

  activeShares.set(filePath, { app, server, token, tunnelUrl })

  const localUrl = `http://localhost:${PORT}/doc?token=${token}`
  return {
    success: true,
    token,
    localUrl,
    tunnelUrl: tunnelUrl ? `${tunnelUrl}/doc?token=${token}` : null,
    port: PORT
  }
}

function startCloudflaredTunnel(port, token, mainWindow) {
  return new Promise((resolve, reject) => {
    // Look for cloudflared in common locations
    const candidates = [
      '/usr/local/bin/cloudflared',
      '/opt/homebrew/bin/cloudflared',
      path.join(process.resourcesPath || '', 'bin', 'cloudflared')
    ]

    const cloudflaredPath = candidates.find(p => {
      try { return fs.existsSync(p) } catch { return false }
    })

    if (!cloudflaredPath) {
      return reject(new Error('cloudflared not installed'))
    }

    const tunnel = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'])

    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) reject(new Error('Tunnel startup timeout'))
    }, 15000)

    tunnel.stderr.on('data', (data) => {
      const output = data.toString()
      // cloudflared prints the URL to stderr
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (match && !resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve(match[0])
      }
    })

    tunnel.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(err)
      }
    })
  })
}

function stopShare(filePath) {
  const share = activeShares.get(filePath)
  if (!share) return { success: false, error: 'No active share' }

  share.server.close()
  if (share.tunnel) share.tunnel.kill()
  activeShares.delete(filePath)
  return { success: true }
}

async function fetchSharedDoc(url, token) {
  try {
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args))
    const separator = url.includes('?') ? '&' : '?'
    const fetchUrl = `${url}${separator}token=${token}`
    const response = await fetch(fetchUrl, { timeout: 10000 })
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` }
    const data = await response.json()

    // Cache the document locally
    const cacheDir = path.join(os.homedir(), '.canonic', 'peers', data.author)
    fs.mkdirSync(cacheDir, { recursive: true })
    const cacheFile = path.join(cacheDir, path.basename(data.filePath))
    fs.writeFileSync(cacheFile, data.content, 'utf-8')

    // Save peer info
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

module.exports = { startShare, stopShare, fetchSharedDoc }
