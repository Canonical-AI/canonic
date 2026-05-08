const fs = require('fs')
const path = require('path')
const os = require('os')

const PEER_COMMENTS_DIR = path.join(os.homedir(), '.canonic', 'comments', 'peers')

/**
 * Flush locally-queued peer comments to their respective share servers.
 *
 * For each author directory under `commentsDir`, we look up the peer in
 * `onlinePeers`. If the peer is not present (offline) we skip — comments stay
 * queued and will be retried on the next call.  If the peer is online we POST
 * all unsynced comments to their /comments endpoint and mark them synced on
 * success.
 *
 * @param {Array<{name:string, host:string, port:number, token:string}>} onlinePeers
 *   The current list of discovered (online) peers, each with connection details.
 * @param {string} [commentsDir]
 *   Override the comments directory (used in tests). Defaults to PEER_COMMENTS_DIR.
 */
async function flushPeerComments(onlinePeers, commentsDir) {
  const dir = commentsDir ?? PEER_COMMENTS_DIR
  if (!fs.existsSync(dir)) return

  let fetch
  try {
    fetch = (await import('node-fetch')).default
  } catch {
    return
  }

  const authorDirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)

  for (const author of authorDirs) {
    // Only proceed if this peer is currently online
    const peer = onlinePeers.find(p => p.name === author)
    if (!peer) continue

    const authorDir = path.join(dir, author)
    const files = fs.readdirSync(authorDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
      const filePath = path.join(authorDir, file)
      let comments
      try {
        comments = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      } catch {
        continue
      }

      const unsynced = comments.filter(c => !c.synced && !c.private)
      if (!unsynced.length) continue

      const relPath = file.replace(/_/g, '/').replace(/\.json$/, '')
      try {
        const res = await fetch(
          `http://${peer.host}:${peer.port}/comments?token=${peer.token}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: relPath, comments: unsynced }),
            signal: AbortSignal.timeout(5000),
          }
        )
        if (res.ok) {
          const updated = comments.map(c =>
            unsynced.find(u => u.id === c.id) ? { ...c, synced: true } : c
          )
          fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
        }
      } catch {
        // Peer became unreachable — leave unsynced, retry next cycle
      }
    }
  }
}

module.exports = { flushPeerComments, PEER_COMMENTS_DIR }
