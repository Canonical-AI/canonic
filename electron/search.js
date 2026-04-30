const path = require('path')
const os = require('os')
const fs = require('fs')

const INDEX_FILE = path.join(os.homedir(), '.canonic', 'search-index.json')

// In-memory index. We persist document metadata to disk for cold-start search.
// flexsearch is ESM-only in v0.8, so we use a simple inverted-index approach here.

let docStore = {}   // { key: { filePath, workspace, title, content, source } }

function loadIndex() {
  if (fs.existsSync(INDEX_FILE)) {
    try {
      docStore = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
    } catch {
      docStore = {}
    }
  }
}

function saveIndex() {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(docStore), 'utf-8')
}

loadIndex()

function index(workspacePath, filePath, content) {
  const key = `${workspacePath}::${filePath}`
  const title = path.basename(filePath, '.md')
  docStore[key] = { filePath, workspace: workspacePath, title, content, source: workspacePath }
  saveIndex()
  return true
}

function search(query, workspacePath) {
  if (!query || query.trim().length < 2) return []

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const results = []

  for (const [, doc] of Object.entries(docStore)) {
    const haystack = (doc.title + ' ' + doc.content).toLowerCase()
    const score = terms.filter(t => haystack.includes(t)).length

    if (score === 0) continue

    // Build excerpt around first match
    const firstTerm = terms.find(t => haystack.includes(t))
    const idx = haystack.indexOf(firstTerm)
    const start = Math.max(0, idx - 60)
    const end = Math.min(doc.content.length, idx + 120)
    let excerpt = doc.content.slice(start, end).replace(/\n+/g, ' ').trim()

    // Highlight matched terms
    for (const term of terms) {
      const re = new RegExp(`(${escapeRe(term)})`, 'gi')
      excerpt = excerpt.replace(re, '<mark>$1</mark>')
    }

    results.push({
      filePath: doc.filePath,
      workspace: doc.workspace,
      title: doc.title,
      excerpt: (start > 0 ? '…' : '') + excerpt + (end < doc.content.length ? '…' : ''),
      isOwn: doc.workspace === workspacePath,
      score
    })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = { index, search }
