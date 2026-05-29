// MCP (Model Context Protocol) server for Canonic.
// Agents connect via HTTP/SSE to use Canonic tools (read/write docs, comments, etc.).
// Integrated with api-server.js — shares port, auth token, and event callback.

const fs = require('fs')
const path = require('path')
const os = require('os')

// ── Shared state (set by api-server.js on start) ──────────────────────────────
let _authToken = null
let _workspacePath = null
let _eventCallback = null   // (event) => void — forwarded to renderer

// Live editor state, pushed from the renderer (which owns the UI). Lets agents see what the
// user is actually looking at — the focused doc and the open tray — instead of guessing.
let _focusedDoc = null      // relative path of the doc the user currently has focused, or null
let _openDocs = []          // relative paths of all docs open in the tray (focused last)

// SSE clients currently connected
const sseClients = new Set()

function setAuthToken(token) { _authToken = token }
function setWorkspacePath(wsPath) { _workspacePath = wsPath }
function getWorkspacePath() { return _workspacePath }
function setEventCallback(cb) { _eventCallback = cb }
function setEditorState({ focusedDoc, openDocs } = {}) {
  _focusedDoc = focusedDoc || null
  _openDocs = Array.isArray(openDocs) ? openDocs : []
}
function getEditorState() {
  return { focusedDoc: _focusedDoc, openDocs: _openDocs }
}

// Standing guidance returned in the MCP `initialize` result. Compliant clients (Claude, Codex,
// Gemini, OpenCode) inject this into the agent's context once at connect — protocol-native, no
// typed prompt, no per-CLI flag. We fold in a SNAPSHOT of the current focus/tray so the agent
// starts oriented; for live updates as the user switches docs the agent calls get_open_docs
// (initialize only fires once per connection).
function buildInstructions() {
  const lines = [
    'You are connected to Canonic, the user\'s local Markdown doc workspace.',
    'Use the Canonic tools to act on docs: get_open_docs (what the user is viewing right now), read_doc / write_doc / create_doc, and post_comment / read_comments for inline review.',
    'When the user refers to "this doc" or gives no path, act on the focused doc. Call get_open_docs to refresh — the focus and open tray change as the user works.'
  ]
  if (_focusedDoc) {
    lines.push(`Right now the user is focused on: ${_focusedDoc}`)
  }
  if (_openDocs.length) {
    lines.push(`Open in the tray: ${_openDocs.join(', ')}`)
  }
  return lines.join('\n')
}

// ── IPC bridge to renderer (for post_comment, start_session) ──────────────────
// Set by main.js via setIpcSend
let _ipcSend = null   // (channel, data) => void
function setIpcSend(fn) { _ipcSend = fn }

// ── Comments helpers ──────────────────────────────────────────────────────────
const CANONIC_DIR = path.join(os.homedir(), '.config', 'canonic')
const COMMENTS_DIR = path.join(CANONIC_DIR, 'comments')

function docIdFor(relPath) {
  return relPath.replace(/[\\/]/g, '_')
}

function readCommentsFor(relPath) {
  const file = path.join(COMMENTS_DIR, `${docIdFor(relPath)}.json`)
  if (!fs.existsSync(file)) return []
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return [] }
}

function writeComment(relPath, comment) {
  fs.mkdirSync(COMMENTS_DIR, { recursive: true })
  const file = path.join(COMMENTS_DIR, `${docIdFor(relPath)}.json`)
  const existing = readCommentsFor(relPath)
  existing.push(comment)
  fs.writeFileSync(file, JSON.stringify(existing, null, 2), { mode: 0o600 })
}

// ── Tool implementations ──────────────────────────────────────────────────────

function resolvePath(docPath) {
  if (!_workspacePath) throw new Error('No workspace open')
  // Normalize: strip leading / if present (MCP may send absolute-ish paths)
  const clean = docPath.replace(/^\/+/, '')
  return path.join(_workspacePath, clean)
}

const tools = {
  read_doc: {
    description: 'Return markdown content of a workspace doc',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the doc within the workspace' }
      },
      required: ['path']
    },
    handler: async (args) => {
      const fp = resolvePath(args.path)
      if (!fs.existsSync(fp)) return { error: `Doc not found: ${args.path}` }
      const content = fs.readFileSync(fp, 'utf-8')
      return { content }
    }
  },

  write_doc: {
    description: 'Overwrite a doc; triggers file watcher so editor repaints live',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the doc' },
        content: { type: 'string', description: 'New markdown content' }
      },
      required: ['path', 'content']
    },
    handler: async (args) => {
      const fp = resolvePath(args.path)
      fs.mkdirSync(path.dirname(fp), { recursive: true })
      fs.writeFileSync(fp, args.content, 'utf-8')
      // File watcher (fileIndex.js) picks this up via fs.watch → editor repaints
      return { ok: true }
    }
  },

  create_doc: {
    description: 'Create a new doc at path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path for the new doc' },
        content: { type: 'string', description: 'Initial markdown content (optional)' }
      },
      required: ['path']
    },
    handler: async (args) => {
      const fp = resolvePath(args.path)
      if (fs.existsSync(fp)) return { error: `Doc already exists: ${args.path}` }
      fs.mkdirSync(path.dirname(fp), { recursive: true })
      fs.writeFileSync(fp, args.content || '', 'utf-8')
      return { ok: true }
    }
  },

  list_docs: {
    description: 'Tree of workspace docs (filtered by optional glob)',
    inputSchema: {
      type: 'object',
      properties: {
        glob: { type: 'string', description: 'Optional glob pattern to filter (e.g. "Specs/**")' }
      }
    },
    handler: async (args) => {
      if (!_workspacePath) throw new Error('No workspace open')
      const files = []
      const cwd = _workspacePath

      function walk(dir, base) {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          if (e.name.startsWith('.') && e.name !== '.canonic') continue
          const full = path.join(dir, e.name)
          const rel = path.relative(cwd, full)
          if (e.isDirectory()) {
            walk(full, base)
          } else if (e.isFile() && e.name.endsWith('.md')) {
            files.push({ path: rel, name: e.name })
          }
        }
      }

      walk(cwd, cwd)

      // Simple glob filtering
      if (args.glob) {
        const pattern = args.glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
        const regex = new RegExp('^' + pattern + '(?:/.*)?$', 'i')
        return { files: files.filter(f => regex.test(f.path) || regex.test(f.name)) }
      }

      return { files }
    }
  },

  post_comment: {
    description: 'Leave a comment on a doc, optionally anchored to a quoted passage',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the doc' },
        text: { type: 'string', description: 'Comment body text' },
        anchor: {
          type: 'object',
          properties: {
            quotedText: { type: 'string', description: 'Exact passage to anchor the comment to' }
          }
        }
      },
      required: ['path', 'text']
    },
    handler: async (args) => {
      const commentId = require('crypto').randomUUID()
      const comment = {
        id: commentId,
        anchor: args.anchor || {},
        text: args.text,
        author: 'Agent',
        isAgent: true,
        agentName: 'Agent',
        resolved: false,
        createdAt: new Date().toISOString()
      }
      writeComment(args.path, comment)

      // Emit to renderer so comments panel updates
      if (_eventCallback) {
        _eventCallback({
          type: 'comment',
          data: {
            commentId,
            file: args.path,
            anchor: args.anchor || {},
            text: args.text,
            agentName: 'Agent'
          }
        })
      }

      return { ok: true, commentId }
    }
  },

  read_comments: {
    description: 'Return open comments for a doc',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the doc' }
      },
      required: ['path']
    },
    handler: async (args) => {
      const comments = readCommentsFor(args.path).filter(c => !c.resolved)
      return { comments }
    }
  },

  start_session: {
    description: 'Open a doc in Canonic and show agent-waiting pill (CLI → doc → CLI handoff)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to open' },
        prompt: { type: 'string', description: 'Optional prompt shown to the user' }
      },
      required: ['path']
    },
    handler: async (args) => {
      // Emit session-start event via the existing flow
      // This triggers the agent-waiting pill in the renderer
      const sessionId = require('crypto').randomUUID()
      if (_eventCallback) {
        _eventCallback({
          type: 'session-start',
          data: {
            sessionId,
            file: args.path,
            agentName: 'MCP Agent',
            workspacePath: _workspacePath,
            prompt: args.prompt || null
          }
        })
      }
      return { ok: true, sessionId }
    }
  },

  get_workspace_info: {
    description: 'Workspace name, path, current branch, the focused doc, and all open docs',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      let branch = 'main'

      // Try to read git branch
      try {
        const headPath = path.join(_workspacePath, '.git', 'HEAD')
        if (fs.existsSync(headPath)) {
          const head = fs.readFileSync(headPath, 'utf-8').trim()
          const match = head.match(/ref: refs\/heads\/(.+)/)
          if (match) branch = match[1]
        }
      } catch {}

      // Try to get workspace name
      const name = _workspacePath ? path.basename(_workspacePath) : null

      return {
        name,
        path: _workspacePath,
        branch,
        focusedDoc: _focusedDoc,    // doc the user currently has open/focused (null if none)
        openDocs: _openDocs         // all docs open in the tray
      }
    }
  },

  get_open_docs: {
    description: 'What the user is looking at right now: the focused doc and the open tray. Use this to work on whatever the user currently has open without asking them for a path.',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => ({
      focusedDoc: _focusedDoc,
      openDocs: _openDocs
    })
  }
}

// ── JSON-RPC handler ──────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', c => raw += c)
    req.on('end', () => {
      try { resolve(JSON.parse(raw)) } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function checkMcpAuth(req) {
  const header = req.headers['authorization']
  if (!_authToken) return true  // MCP auth is optional if token not set
  if (header !== `Bearer ${_authToken}`) return false
  return true
}

async function handleMcpRequest(req, res) {
  // CORS for localhost MCP connections
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return
  }

  const body = await parseBody(req)
  if (!body || !body.method) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(rpcError(null, -32700, 'Parse error')))
    return
  }

  const { id, method, params } = body

  try {
    switch (method) {
      case 'initialize': {
        const result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'Canonic',
            version: '1.0.0'
          },
          instructions: buildInstructions()
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(rpcResult(id, result)))
        return
      }

      case 'tools/list': {
        const toolList = Object.entries(tools).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(rpcResult(id, { tools: toolList })))
        return
      }

      case 'tools/call': {
        const { name, arguments: toolArgs } = params || {}
        const tool = tools[name]
        if (!tool) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(rpcError(id, -32601, `Tool not found: ${name}`)))
          return
        }
        try {
          const result = await tool.handler(toolArgs || {})

          // Format as MCP content
          const content = []
          if (result.error) {
            content.push({ type: 'text', text: `Error: ${result.error}` })
            content.push({ type: 'text', text: `isError: true` })
          } else {
            content.push({ type: 'text', text: JSON.stringify(result, null, 2) })
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(rpcResult(id, { content })))
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(rpcResult(id, {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true
          })))
        }
        return
      }

      case 'notifications/initialized':
        // No response needed for notifications
        res.writeHead(202)
        res.end()
        return

      // Custom: allow listing tools without JSON-RPC wrapper (for debugging)
      case 'ping':
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return

      default:
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(rpcError(id, -32601, `Method not found: ${method}`)))
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(rpcError(id, -32603, err.message)))
  }
}

// ── SSE endpoint ──────────────────────────────────────────────────────────────

function handleSseRequest(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })

  res.write('event: connected\ndata: {}\n\n')

  sseClients.add(res)

  req.on('close', () => {
    sseClients.delete(res)
  })
}

// Send SSE event to all connected clients
function sseBroadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    client.write(payload)
  }
}

function sseGetEndpoint() {
  return '/mcp/sse'
}

// ── Module exports ────────────────────────────────────────────────────────────

module.exports = {
  handleMcpRequest,
  handleSseRequest,
  sseBroadcast,
  sseGetEndpoint,
  setAuthToken,
  setWorkspacePath,
  getWorkspacePath,
  setEventCallback,
  setEditorState,
  getEditorState,
  buildInstructions,
  setIpcSend,
  tools   // exposed so api-server can back token-free REST routes (curl-only agents like Pi)
}
