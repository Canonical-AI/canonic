import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Isolate config dir per test file so parallel workers don't share one lockfile.
process.env.CANONIC_CONFIG_DIR = path.join(os.tmpdir(), `canonic-test-mcp-${process.pid}`)
const LOCKFILE = path.join(process.env.CANONIC_CONFIG_DIR, 'api.lock')
const apiServer = await import('../../electron/api-server.js')
const mcp = await import('../../electron/mcp-server.js')
const gitService = await import('../../electron/git.js')

let port, token

function mcpRequest(method, params, id = 1) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    const opts = {
      hostname: '127.0.0.1', port, path: '/mcp', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${token}`,
      },
    }
    const req = http.request(opts, (res) => {
      let raw = ''
      res.on('data', (c) => (raw += c))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) }
        catch { resolve({ status: res.statusCode, body: raw }) }
      })
    })
    req.write(body)
    req.end()
  })
}

beforeAll(async () => {
  port = await apiServer.start(() => {})
  const lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf-8'))
  token = lock.token
})

afterAll(() => {
  apiServer.stop()
})

describe('MCP server', () => {
  describe('initialize', () => {
    it('returns server capabilities and version', async () => {
      const res = await mcpRequest('initialize', {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test', version: '1.0' }
      })
      expect(res.status).toBe(200)
      expect(res.body.result.protocolVersion).toBe('2024-11-05')
      expect(res.body.result.capabilities.tools).toBeDefined()
      expect(res.body.result.serverInfo.name).toBe('Canonic')
    })

    it('returns standing instructions naming the canonic tools', async () => {
      mcp.setEditorState({ focusedDoc: null, openDocs: [] })
      const res = await mcpRequest('initialize', {})
      const instr = res.body.result.instructions
      expect(typeof instr).toBe('string')
      expect(instr).toContain('Canonic')
      expect(instr).toContain('get_open_docs')
    })

    it('folds the live focused doc + open tray into instructions', () => {
      // buildInstructions reads module editor-state directly; tested in-process (the server's
      // own copy lives in a separate module instance under the test runner).
      mcp.setEditorState({
        focusedDoc: 'Vision/product-vision.md',
        openDocs: ['Vision/product-vision.md', 'Roadmap/q3.md']
      })
      const instr = mcp.buildInstructions()
      expect(instr).toContain('Vision/product-vision.md')
      expect(instr).toContain('Roadmap/q3.md')
      mcp.setEditorState({ focusedDoc: null, openDocs: [] })  // reset for other tests
    })
  })

  describe('tools/list', () => {
    it('returns all 11 tools', async () => {
      const res = await mcpRequest('tools/list')
      expect(res.status).toBe(200)
      const tools = res.body.result.tools
      expect(tools.length).toBe(11)
      const names = tools.map(t => t.name).sort()
      expect(names).toEqual([
        'create_doc', 'get_doc_changes', 'get_doc_history', 'get_open_docs',
        'get_workspace_info', 'list_docs', 'post_comment', 'read_comments',
        'read_doc', 'start_session', 'write_doc'
      ])
    })

    it('each tool has name, description, inputSchema', async () => {
      const res = await mcpRequest('tools/list')
      for (const tool of res.body.result.tools) {
        expect(tool.name).toBeTruthy()
        expect(tool.description).toBeTruthy()
        expect(tool.inputSchema).toBeDefined()
      }
    })
  })

  describe('read_doc', () => {
    it('returns error when no workspace is set', async () => {
      const res = await mcpRequest('tools/call', {
        name: 'read_doc',
        arguments: { path: 'test.md' }
      })
      expect(res.status).toBe(200)
      expect(res.body.result.content[0].text).toContain('Error')
    })
  })

  describe('get_workspace_info', () => {
    it('returns null workspace info when no workspace set', async () => {
      const res = await mcpRequest('tools/call', {
        name: 'get_workspace_info',
        arguments: {}
      })
      expect(res.status).toBe(200)
      const text = res.body.result.content[0].text
      const info = JSON.parse(text)
      expect(info.path).toBeNull()
    })
  })

  describe('notifications/initialized', () => {
    it('returns 202 accepted', async () => {
      const res = await mcpRequest('notifications/initialized', null, 0)
      expect(res.status).toBe(202)
    })
  })

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const res = await mcpRequest('tools/call', {
        name: 'nonexistent_tool',
        arguments: {}
      })
      expect(res.status).toBe(200)
      expect(res.body.error).toBeDefined()
      expect(res.body.error.message).toContain('Tool not found')
    })
  })

  describe('unknown method', () => {
    it('returns error for unknown JSON-RPC method', async () => {
      const res = await mcpRequest('unknown_method', {})
      expect(res.body.error).toBeDefined()
    })
  })

  describe('ping', () => {
    it('GET /ping returns ok with mcp flag', async () => {
      const result = await new Promise(resolve => {
        http.get(`http://127.0.0.1:${port}/ping`, (res) => {
          let raw = ''
          res.on('data', c => raw += c)
          res.on('end', () => resolve(JSON.parse(raw)))
        })
      })
      expect(result.ok).toBe(true)
      expect(result.mcp).toBe(true)
    })
  })
})

describe('MCP server tools with workspace set', () => {
  const tmpDir = path.join(os.tmpdir(), 'canonic-mcp-test-' + Date.now())
  const testDoc = 'readme.md'
  const testContent = '# Hello\n\nThis is a test doc.'

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(path.join(tmpDir, testDoc), testContent, 'utf-8')
    apiServer.setWorkspacePath(tmpDir)
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('read_doc returns file content when workspace is set', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'read_doc',
      arguments: { path: testDoc }
    })
    expect(res.status).toBe(200)
    const text = res.body.result.content[0].text
    const parsed = JSON.parse(text)
    expect(parsed.content).toBe(testContent)
  })

  it('read_doc returns error for nonexistent path', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'read_doc',
      arguments: { path: 'nonexistent.md' }
    })
    const text = res.body.result.content[0].text
    expect(text).toContain('Error')
  })

  it('write_doc creates and overwrites file', async () => {
    const newContent = '# Updated!'
    const res = await mcpRequest('tools/call', {
      name: 'write_doc',
      arguments: { path: 'new-doc.md', content: newContent }
    })
    const text = res.body.result.content[0].text
    expect(JSON.parse(text).ok).toBe(true)

    // Verify on disk
    const disk = fs.readFileSync(path.join(tmpDir, 'new-doc.md'), 'utf-8')
    expect(disk).toBe(newContent)
  })

  it('create_doc creates new file with content', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'create_doc',
      arguments: { path: 'subdir/test.md', content: '# Subdir test' }
    })
    const text = res.body.result.content[0].text
    expect(JSON.parse(text).ok).toBe(true)

    expect(fs.existsSync(path.join(tmpDir, 'subdir', 'test.md'))).toBe(true)
  })

  it('create_doc errors when file already exists', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'create_doc',
      arguments: { path: testDoc, content: 'duplicate' }
    })
    const text = res.body.result.content[0].text
    expect(text).toContain('Error')
  })

  it('list_docs returns file tree', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'list_docs',
      arguments: {}
    })
    const text = res.body.result.content[0].text
    const parsed = JSON.parse(text)
    expect(parsed.files).toBeDefined()
    expect(Array.isArray(parsed.files)).toBe(true)
    const paths = parsed.files.map(f => f.path)
    expect(paths).toContain(testDoc)
    expect(paths).toContain('new-doc.md')
  })

  it('list_docs filters by glob', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'list_docs',
      arguments: { glob: 'subdir/**' }
    })
    const text = res.body.result.content[0].text
    const parsed = JSON.parse(text)
    expect(parsed.files.length).toBeGreaterThanOrEqual(1)
    expect(parsed.files.every(f => f.path.startsWith('subdir'))).toBe(true)
  })

  it('list_docs does not throw on a glob with regex specials', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'list_docs',
      arguments: { glob: '(' }
    })
    expect(res.status).toBe(200)
    const parsed = JSON.parse(res.body.result.content[0].text)
    expect(Array.isArray(parsed.files)).toBe(true)
  })

  it('read_doc rejects a path that escapes the workspace', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'read_doc',
      arguments: { path: '../../../../../../etc/passwd' }
    })
    expect(res.status).toBe(200)
    const text = res.body.result.content[0].text
    expect(text).toContain('Error')
    expect(text).toContain('escapes workspace')
  })

  it('write_doc rejects traversal and writes nothing outside the workspace', async () => {
    const outside = path.join(tmpDir, '..', 'canonic-escape-' + Date.now() + '.md')
    const res = await mcpRequest('tools/call', {
      name: 'write_doc',
      arguments: { path: '../' + path.basename(outside), content: 'pwned' }
    })
    expect(res.body.result.content[0].text).toContain('escapes workspace')
    expect(fs.existsSync(outside)).toBe(false)
  })

  it('post_comment creates comment and returns id', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'post_comment',
      arguments: {
        path: testDoc,
        text: 'This is a test comment',
        anchor: { quotedText: 'test doc' }
      }
    })
    const text = res.body.result.content[0].text
    const result = JSON.parse(text)
    expect(result.ok).toBe(true)
    expect(result.commentId).toBeTruthy()
  })

  it('read_comments returns non-resolved comments', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'read_comments',
      arguments: { path: testDoc }
    })
    const text = res.body.result.content[0].text
    const result = JSON.parse(text)
    expect(result.comments).toBeDefined()
    expect(Array.isArray(result.comments)).toBe(true)
  })

  it('start_session returns ok with sessionId', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'start_session',
      arguments: { path: testDoc, prompt: 'Review this' }
    })
    const text = res.body.result.content[0].text
    const result = JSON.parse(text)
    expect(result.ok).toBe(true)
    expect(result.sessionId).toBeTruthy()
  })

  it('get_workspace_info returns workspace details', async () => {
    const res = await mcpRequest('tools/call', {
      name: 'get_workspace_info',
      arguments: {}
    })
    const text = res.body.result.content[0].text
    const info = JSON.parse(text)
    expect(info.name).toBeTruthy()
    expect(info.path).toBe(tmpDir)
  })
})

describe('MCP server doc history & changes', () => {
  const tmpDir = path.join(os.tmpdir(), 'canonic-mcp-git-' + Date.now())
  const doc = 'spec.md'
  const v1 = '# Spec\n\nOriginal line.\n'
  let firstOid

  function call(name, args) {
    return mcpRequest('tools/call', { name, arguments: args }).then(r =>
      JSON.parse(r.body.result.content[0].text)
    )
  }

  beforeAll(async () => {
    await gitService.initWorkspace(tmpDir, 'blank')
    fs.writeFileSync(path.join(tmpDir, doc), v1, 'utf-8')
    const r = await gitService.commit(tmpDir, doc, 'Add spec')
    firstOid = r.oid
    apiServer.setWorkspacePath(tmpDir)
  })

  afterAll(() => {
    apiServer.setWorkspacePath(null)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('get_doc_history lists the commit that added the doc', async () => {
    const res = await call('get_doc_history', { path: doc })
    expect(Array.isArray(res.revisions)).toBe(true)
    expect(res.revisions.length).toBeGreaterThanOrEqual(1)
    expect(res.revisions[0].message).toContain('Add spec')
    expect(res.revisions[0].oid).toBe(firstOid)
    expect(res.revisions[0].shortOid).toBe(firstOid.slice(0, 8))
  })

  it('get_doc_changes reports uncommitted edits as a unified diff', async () => {
    // Simulate "I updated the document" — edit on disk without committing.
    fs.writeFileSync(path.join(tmpDir, doc), '# Spec\n\nUpdated line.\n', 'utf-8')
    const res = await call('get_doc_changes', { path: doc })
    expect(res.hasChanges).toBe(true)
    expect(res.added).toBeGreaterThanOrEqual(1)
    expect(res.removed).toBeGreaterThanOrEqual(1)
    expect(res.diff).toContain('+ Updated line.')
    expect(res.diff).toContain('- Original line.')
    expect(res.comparedAgainst).toContain('uncommitted')
  })

  it('get_doc_changes with `since` diffs the current version against an older revision', async () => {
    const res = await call('get_doc_changes', { path: doc, since: firstOid })
    expect(res.hasChanges).toBe(true)
    expect(res.diff).toContain('+ Updated line.')
    expect(res.comparedAgainst).toContain(firstOid.slice(0, 8))
  })

  it('get_doc_changes reports no changes when the doc matches its last commit', async () => {
    fs.writeFileSync(path.join(tmpDir, doc), '# Spec\n\nUpdated line.\n', 'utf-8')
    await gitService.commit(tmpDir, doc, 'Update spec')
    const res = await call('get_doc_changes', { path: doc })
    // No uncommitted edits → falls back to what the latest commit introduced.
    expect(res.comparedAgainst).toContain('vs its parent')
  })

  it('get_doc_changes errors for a nonexistent doc', async () => {
    const r = await mcpRequest('tools/call', {
      name: 'get_doc_changes', arguments: { path: 'nope.md' }
    })
    expect(r.body.result.content[0].text).toContain('Error')
  })
})

describe('REST API index (GET /)', () => {
  function get(pathname, headers = {}) {
    return new Promise((resolve) => {
      http.get({ hostname: '127.0.0.1', port, path: pathname, headers }, (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) }
          catch { resolve({ status: res.statusCode, body: raw }) }
        })
      })
    })
  }

  it('returns a self-describing index with REST routes and MCP pointer', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Canonic local API')
    expect(res.body.version).toBeTruthy()
    expect(typeof res.body.instructions).toBe('string')
    expect(res.body.instructions).toContain('Canonic')
    const paths = res.body.rest.map((r) => r.path)
    expect(paths).toContain('/doc?path=<relPath>')
    expect(paths).toContain('/comment')
    expect(res.body.mcp.endpoint).toBe('/mcp')
  })

  it('lists the live MCP tool set including the diff tools', async () => {
    const res = await get('/')
    expect(res.body.mcp.tools).toContain('get_doc_changes')
    expect(res.body.mcp.tools).toContain('get_doc_history')
    expect(res.body.mcp.tools).toContain('read_doc')
  })

  it('documents both token-free and bearer auth', async () => {
    const res = await get('/')
    expect(res.body.auth.tokenFree).toBeTruthy()
    expect(res.body.auth.bearer).toContain('Bearer')
  })

  it('rejects the index from a foreign web Origin with 403', async () => {
    const res = await get('/', { Origin: 'https://evil.example.com' })
    expect(res.status).toBe(403)
  })
})

describe('MCP server Origin guard', () => {
  function postMcp(headers) {
    return new Promise((resolve) => {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      const req = http.request({
        hostname: '127.0.0.1', port, path: '/mcp', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
      }, (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => resolve({ status: res.statusCode }))
      })
      req.write(body)
      req.end()
    })
  }

  it('rejects a request from a foreign web Origin with 403', async () => {
    const res = await postMcp({ Origin: 'https://evil.example.com' })
    expect(res.status).toBe(403)
  })

  it('allows a request with no Origin (agents / curl)', async () => {
    const res = await postMcp({})
    expect(res.status).toBe(200)
  })

  it('allows a localhost Origin', async () => {
    const res = await postMcp({ Origin: 'http://localhost:5173' })
    expect(res.status).toBe(200)
  })
})
