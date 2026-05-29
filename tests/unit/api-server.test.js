import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const LOCKFILE = path.join(os.homedir(), '.config', 'canonic', 'api.lock')
const apiServer = await import('../../electron/api-server.js')
// Use require (not import) so we share the SAME mcp-server instance api-server's
// internal require() holds — vitest ESM import would give a separate copy whose
// state (workspace path, editor focus) the server never sees.
const mcp = createRequire(import.meta.url)('../../electron/mcp-server.js')

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
    const start = await request('POST', '/session/start', {
      file: 'spec.md', agentName: 'A', callbackUrl: 'http://127.0.0.1:9/done',
    })
    capturedEvents.length = 0
    const res = await request('POST', '/session/cancel', { sessionId: start.body.sessionId })
    expect(res.status).toBe(200)
    expect(capturedEvents[0].type).toBe('session-cancel')
  })

  it('POST /activity returns 400 when no active session', async () => {
    const res = await request('POST', '/activity', { type: 'web_search' })
    expect(res.status).toBe(400)
  })

  it('POST /activity fires onEvent with activityType and label', async () => {
    await request('POST', '/session/start', {
      file: 'spec.md', agentName: 'A', callbackUrl: 'http://127.0.0.1:9/done',
    })
    capturedEvents.length = 0
    const res = await request('POST', '/activity', { type: 'web_search', label: 'Searching docs…' })
    expect(res.status).toBe(200)
    expect(capturedEvents[0].type).toBe('activity')
    expect(capturedEvents[0].data.activityType).toBe('web_search')
    expect(capturedEvents[0].data.label).toBe('Searching docs…')
  })

  it('POST /activity defaults activityType to thinking when type omitted', async () => {
    capturedEvents.length = 0
    const res = await request('POST', '/activity', {})
    expect(res.status).toBe(200)
    expect(capturedEvents[0].data.activityType).toBe('thinking')
  })

  it('GET /nonexistent returns 404', async () => {
    const res = await request('GET', '/nonexistent', null, false)
    expect(res.status).toBe(404)
  })

  it('GET /session/start returns 405 method not allowed', async () => {
    const res = await request('GET', '/session/start', null)
    expect(res.status).toBe(405)
    expect(res.body.error).toBe('method not allowed')
  })

  it('GET /comments without file returns map of all comments', async () => {
    const commentsDir = path.join(os.homedir(), '.config', 'canonic', 'comments')
    fs.mkdirSync(commentsDir, { recursive: true })
    const fixture = [{ id: 'c1', text: 'Looks good', author: 'john' }]
    const fixtureFile = path.join(commentsDir, '__api_test_doc.json')
    fs.writeFileSync(fixtureFile, JSON.stringify(fixture), 'utf-8')

    try {
      const res = await request('GET', '/comments')
      expect(res.status).toBe(200)
      expect(res.body.comments).toBeTypeOf('object')
      expect(res.body.comments['__api/test/doc']).toBeUndefined()
      // docId underscore decodes to slashes — `__api_test_doc` → `/_api/test/doc` (leading _→/ is harmless)
      expect(Object.values(res.body.comments).some(arr =>
        Array.isArray(arr) && arr.some(c => c.id === 'c1'))).toBe(true)
    } finally {
      fs.unlinkSync(fixtureFile)
    }
  })

  it('GET /comments?file=<relPath> returns comments for that doc', async () => {
    const commentsDir = path.join(os.homedir(), '.config', 'canonic', 'comments')
    fs.mkdirSync(commentsDir, { recursive: true })
    const fixture = [{ id: 'c2', text: 'review me', author: 'priya' }]
    const fixtureFile = path.join(commentsDir, 'apitestVisionDoc.md.json')
    fs.writeFileSync(fixtureFile, JSON.stringify(fixture), 'utf-8')

    try {
      const res = await request('GET', '/comments?file=apitestVisionDoc.md')
      expect(res.status).toBe(200)
      expect(res.body.file).toBe('apitestVisionDoc.md')
      expect(res.body.comments).toEqual(fixture)
    } finally {
      fs.unlinkSync(fixtureFile)
    }
  })

  it('GET /comments?file=<missing> returns empty array', async () => {
    const res = await request('GET', '/comments?file=does-not-exist.md')
    expect(res.status).toBe(200)
    expect(res.body.comments).toEqual([])
  })

  it('GET /comments requires auth', async () => {
    const res = await request('GET', '/comments', null, 'bad-token')
    expect(res.status).toBe(401)
  })

  it('cancelSession() fires session-cancel event so caller-app refocus runs', async () => {
    const start = await request('POST', '/session/start', {
      file: 'spec.md', agentName: 'A', callbackUrl: 'http://127.0.0.1:9/done',
    })
    capturedEvents.length = 0
    const result = apiServer.cancelSession(start.body.sessionId)
    expect(result.ok).toBe(true)
    expect(capturedEvents[0]?.type).toBe('session-cancel')
    expect(capturedEvents[0].data.sessionId).toBe(start.body.sessionId)
  })

  it('cancelSession() is a no-op when sessionId does not match active session', () => {
    capturedEvents.length = 0
    const result = apiServer.cancelSession('nonexistent-sid')
    expect(result.ok).toBe(true)
    expect(capturedEvents.length).toBe(0)
  })

  it('submitAction returns error when callbackUrl is unreachable', async () => {
    const startRes = await request('POST', '/session/start', {
      file: 'spec.md',
      agentName: 'TestAgent',
      callbackUrl: 'http://127.0.0.1:1/done',
    })
    expect(startRes.status).toBe(200)
    const { sessionId } = startRes.body

    const result = await apiServer.submitAction(sessionId, 'Implement this', '# content')
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })
})

// Token-free REST routes that back curl-only agents (Pi). Bound to localhost, no auth.
describe('api-server REST (curl) routes', () => {
  let ws
  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'canonic-rest-'))
    fs.mkdirSync(path.join(ws, 'Specs'), { recursive: true })
    fs.writeFileSync(path.join(ws, 'Specs', 'plan.md'), '# Plan\n\nfirst draft', 'utf-8')
    mcp.setWorkspacePath(ws)
    mcp.setEditorState({ focusedDoc: 'Specs/plan.md', openDocs: ['Specs/plan.md'] })
  })
  afterAll(() => {
    mcp.setEditorState({ focusedDoc: null, openDocs: [] })
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('GET /workspace returns name, focus, open tray and files without auth', async () => {
    const res = await request('GET', '/workspace', null, false)
    expect(res.status).toBe(200)
    expect(res.body.focusedDoc).toBe('Specs/plan.md')
    expect(res.body.openDocs).toEqual(['Specs/plan.md'])
    expect(res.body.files.some(f => f.path === 'Specs/plan.md')).toBe(true)
  })

  it('GET /doc with no path returns the focused doc', async () => {
    const res = await request('GET', '/doc', null, false)
    expect(res.status).toBe(200)
    expect(res.body.path).toBe('Specs/plan.md')
    expect(res.body.content).toContain('first draft')
  })

  it('GET /doc?path returns that doc', async () => {
    const res = await request('GET', '/doc?path=Specs/plan.md', null, false)
    expect(res.status).toBe(200)
    expect(res.body.content).toContain('# Plan')
  })

  it('GET /doc with no path and no focus returns 404', async () => {
    mcp.setEditorState({ focusedDoc: null, openDocs: [] })
    const res = await request('GET', '/doc', null, false)
    expect(res.status).toBe(404)
    mcp.setEditorState({ focusedDoc: 'Specs/plan.md', openDocs: ['Specs/plan.md'] })
  })

  it('POST /doc writes the doc', async () => {
    const res = await request('POST', '/doc', { path: 'Specs/plan.md', content: '# Plan\n\nrewritten' }, false)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(fs.readFileSync(path.join(ws, 'Specs', 'plan.md'), 'utf-8')).toContain('rewritten')
  })

  it('POST /doc requires path and content', async () => {
    const res = await request('POST', '/doc', { path: 'Specs/plan.md' }, false)
    expect(res.status).toBe(400)
  })

  it('POST /comment posts a comment and fires onEvent; GET /comment reads it back', async () => {
    capturedEvents.length = 0
    const post = await request('POST', '/comment', {
      path: 'Specs/plan.md', text: 'tighten this', anchor: { quotedText: 'first draft' },
    }, false)
    expect(post.status).toBe(200)
    expect(typeof post.body.commentId).toBe('string')
    expect(capturedEvents[0].type).toBe('comment')

    const get = await request('GET', '/comment?path=Specs/plan.md', null, false)
    expect(get.status).toBe(200)
    expect(get.body.comments.some(c => c.text === 'tighten this')).toBe(true)

    // cleanup the comment file this test created
    const cdir = path.join(os.homedir(), '.config', 'canonic', 'comments')
    const cfile = path.join(cdir, 'Specs_plan.md.json')
    if (fs.existsSync(cfile)) fs.unlinkSync(cfile)
  })

  it('POST /comment requires path and text', async () => {
    const res = await request('POST', '/comment', { path: 'Specs/plan.md' }, false)
    expect(res.status).toBe(400)
  })

  // Raw request that lets us set arbitrary headers (the shared `request` helper can't).
  function rawRequest(method, pathname, body, headers) {
    return new Promise((resolve) => {
      const data = body ? JSON.stringify(body) : null
      const req = http.request({
        hostname: '127.0.0.1', port, path: pathname, method,
        headers: { 'Content-Type': 'application/json', ...(data && { 'Content-Length': Buffer.byteLength(data) }), ...headers },
      }, (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) } catch { resolve({ status: res.statusCode, body: raw }) } })
      })
      if (data) req.write(data)
      req.end()
    })
  }

  it('rejects a REST request from a foreign web Origin with 403', async () => {
    const res = await rawRequest('GET', '/workspace', null, { Origin: 'https://evil.example.com' })
    expect(res.status).toBe(403)
  })

  it('allows a REST request from a localhost Origin', async () => {
    const res = await rawRequest('GET', '/workspace', null, { Origin: 'http://localhost:5173' })
    expect(res.status).toBe(200)
  })

  it('POST /doc rejects traversal and writes nothing outside the workspace', async () => {
    const outside = path.join(ws, '..', 'canonic-rest-escape-' + Date.now() + '.md')
    const res = await rawRequest('POST', '/doc', { path: '../' + path.basename(outside), content: 'pwned' }, {})
    expect(res.status).not.toBe(200)
    expect(fs.existsSync(outside)).toBe(false)
  })
})
