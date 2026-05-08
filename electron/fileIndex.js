const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')

let watcher = null
let currentIndex = {}
let onUpdateCallback = null

function buildIndex(workspacePath) {
  const index = {}
  const walk = (dir, prefix) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
    catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel)
      } else if (entry.name.endsWith('.md')) {
        const name = entry.name.slice(0, -3)
        const existing = index[name]
        if (!existing || rel.split('/').length < existing.split('/').length) {
          index[name] = rel
        }
      }
    }
  }
  walk(workspacePath, '')
  return index
}

function startWatcher(workspacePath, onUpdate) {
  stopWatcher()
  onUpdateCallback = onUpdate
  currentIndex = buildIndex(workspacePath)
  onUpdate(currentIndex)

  watcher = chokidar.watch(workspacePath, {
    ignoreInitial: true,
    ignored: /(^|[/\\])\.|node_modules/,
    persistent: true,
  })

  const refresh = () => {
    currentIndex = buildIndex(workspacePath)
    onUpdateCallback?.(currentIndex)
  }

  watcher.on('add', refresh)
  watcher.on('unlink', refresh)
  watcher.on('addDir', refresh)
  watcher.on('unlinkDir', refresh)
}

function stopWatcher() {
  watcher?.close()
  watcher = null
  onUpdateCallback = null
  currentIndex = {}
}

function getIndex() {
  return currentIndex
}

module.exports = { buildIndex, startWatcher, stopWatcher, getIndex }
