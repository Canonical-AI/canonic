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
