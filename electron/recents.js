// Recent-workspace history, persisted in the main process.
//
// Previously this lived in the renderer's localStorage, which for the packaged
// app runs on a file:// origin — Chromium does not reliably persist localStorage
// there, so the recent list (and the auto-open-last behaviour that depends on it)
// would intermittently come back empty. Owning it in the main process as a plain
// JSON file in the config dir makes it durable across launches.

const fs = require('fs')
const path = require('path')
const os = require('os')

const CANONIC_DIR =
  process.env.CANONIC_CONFIG_DIR || path.join(os.homedir(), '.config', 'canonic')
const FILE = path.join(CANONIC_DIR, 'workspaces.json')
const MAX = 8

function list() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    return Array.isArray(data.recents) ? data.recents : []
  } catch {
    return []
  }
}

// Move (or insert) a workspace to the front of the list, newest first, capped at MAX.
function add(workspacePath, name) {
  if (!workspacePath) return list()
  const entry = {
    path: workspacePath,
    name: name || path.basename(workspacePath),
    openedAt: Date.now(),
  }
  const recents = [entry, ...list().filter((w) => w.path !== workspacePath)].slice(
    0,
    MAX,
  )
  try {
    fs.mkdirSync(CANONIC_DIR, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify({ recents }, null, 2), { mode: 0o600 })
  } catch {
    // Non-fatal: a failed write just means this open won't be remembered.
  }
  return recents
}

function remove(workspacePath) {
  const recents = list().filter((w) => w.path !== workspacePath)
  try {
    fs.mkdirSync(CANONIC_DIR, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify({ recents }, null, 2), { mode: 0o600 })
  } catch {}
  return recents
}

module.exports = { list, add, remove, FILE }
