// Session Store — persists AI Control session history to disk.
// Sessions stored in {workspacePath}/.canonic/sessions.json

const fs = require('fs')
const path = require('path')

function getSessionsPath(workspacePath) {
  return path.join(workspacePath, '.canonic', 'sessions.json')
}

function read(workspacePath) {
  if (!workspacePath) return []
  const file = getSessionsPath(workspacePath)
  if (!fs.existsSync(file)) return []
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return []
  }
}

function write(workspacePath, sessions) {
  if (!workspacePath) return
  const file = getSessionsPath(workspacePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(sessions, null, 2), { mode: 0o600 })
}

function add(workspacePath, session) {
  const sessions = read(workspacePath)
  sessions.unshift(session)  // newest first
  // Keep last 50 sessions max
  if (sessions.length > 50) sessions.length = 50
  write(workspacePath, sessions)
}

function update(workspacePath, sessionId, patch) {
  const sessions = read(workspacePath)
  const idx = sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) return false
  sessions[idx] = { ...sessions[idx], ...patch }
  write(workspacePath, sessions)
  return true
}

function remove(workspacePath, sessionId) {
  const sessions = read(workspacePath)
  const filtered = sessions.filter(s => s.id !== sessionId)
  if (filtered.length === sessions.length) return false
  write(workspacePath, filtered)
  return true
}

function get(workspacePath, sessionId) {
  const sessions = read(workspacePath)
  return sessions.find(s => s.id === sessionId) || null
}

function getRecent(workspacePath, count = 5) {
  const sessions = read(workspacePath)
  return sessions.slice(0, count)
}

module.exports = {
  read,
  write,
  add,
  update,
  remove,
  get,
  getRecent
}
