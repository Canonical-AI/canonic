const git = require('isomorphic-git')
const fs = require('fs')
const path = require('path')
const os = require('os')

const AUTHOR = {
  name: os.userInfo().username,
  email: `${os.userInfo().username}@canonic.local`
}

async function initWorkspace(workspacePath) {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true })
  }

  // Check if already a git repo
  const gitDir = path.join(workspacePath, '.git')
  if (!fs.existsSync(gitDir)) {
    await git.init({ fs, dir: workspacePath, defaultBranch: 'main' })
    // Create initial README
    const readmePath = path.join(workspacePath, 'README.md')
    fs.writeFileSync(readmePath, `# My Canonic Workspace\n\nThis workspace uses git for version control.\n\n- **Branch** = a working draft or experiment\n- **Commit** = a saved checkpoint in a document's history\n- **Merge** = incorporate a branch's changes into main\n`)
    await git.add({ fs, dir: workspacePath, filepath: 'README.md' })
    await git.commit({
      fs,
      dir: workspacePath,
      message: 'Initialize workspace',
      author: AUTHOR
    })
  }

  return { path: workspacePath }
}

async function listFiles(workspacePath) {
  if (!fs.existsSync(workspacePath)) return []

  const entries = []
  const scanDir = (dirPath, prefix = '') => {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue
      const relPath = prefix ? `${prefix}/${item.name}` : item.name
      if (item.isDirectory()) {
        entries.push({ name: item.name, path: relPath, type: 'directory', children: [] })
        scanDir(path.join(dirPath, item.name), relPath)
      } else if (item.name.endsWith('.md')) {
        const stat = fs.statSync(path.join(dirPath, item.name))
        entries.push({
          name: item.name.replace('.md', ''),
          path: relPath,
          type: 'file',
          modified: stat.mtimeMs
        })
      }
    }
  }
  scanDir(workspacePath)

  // Build tree structure
  return buildTree(entries)
}

function buildTree(flatList) {
  const root = []
  const map = {}

  for (const item of flatList) {
    map[item.path] = { ...item, children: item.type === 'directory' ? [] : undefined }
  }

  for (const item of flatList) {
    const parts = item.path.split('/')
    if (parts.length === 1) {
      root.push(map[item.path])
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      if (map[parentPath]) {
        map[parentPath].children = map[parentPath].children || []
        map[parentPath].children.push(map[item.path])
      }
    }
  }

  return root
}

async function commit(workspacePath, filePath, message) {
  try {
    await git.add({ fs, dir: workspacePath, filepath: filePath })
    const oid = await git.commit({
      fs,
      dir: workspacePath,
      message: message || 'Update document',
      author: AUTHOR
    })
    return { success: true, oid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function log(workspacePath, filePath) {
  try {
    const commits = await git.log({ fs, dir: workspacePath, filepath: filePath })
    return commits.map(c => ({
      oid: c.oid,
      message: c.commit.message,
      author: c.commit.author.name,
      timestamp: c.commit.author.timestamp * 1000
    }))
  } catch (err) {
    return []
  }
}

async function branches(workspacePath) {
  try {
    const allBranches = await git.listBranches({ fs, dir: workspacePath })
    const current = await git.currentBranch({ fs, dir: workspacePath })
    return { branches: allBranches, current }
  } catch (err) {
    return { branches: ['main'], current: 'main' }
  }
}

async function createBranch(workspacePath, branchName) {
  try {
    await git.branch({ fs, dir: workspacePath, ref: branchName, checkout: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function checkout(workspacePath, branchName) {
  try {
    await git.checkout({ fs, dir: workspacePath, ref: branchName })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function merge(workspacePath, fromBranch, message) {
  try {
    const result = await git.merge({
      fs,
      dir: workspacePath,
      ours: 'main',
      theirs: fromBranch,
      message: message || `Merge branch '${fromBranch}' into main`,
      author: AUTHOR,
      fastForward: false
    })
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message, conflict: err.code === 'MergeConflictError' }
  }
}

async function diff(workspacePath, filePath, oid) {
  try {
    // Get content at commit oid vs HEAD
    const commitContent = await readCommit(workspacePath, filePath, oid)
    const currentPath = path.join(workspacePath, filePath)
    const currentContent = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf-8') : ''
    return { before: commitContent, after: currentContent }
  } catch (err) {
    return { before: '', after: '' }
  }
}

async function readCommit(workspacePath, filePath, oid) {
  try {
    const { blob } = await git.readBlob({
      fs,
      dir: workspacePath,
      oid,
      filepath: filePath
    })
    return Buffer.from(blob).toString('utf-8')
  } catch (err) {
    // Try walking the commit tree
    try {
      const { commit } = await git.readCommit({ fs, dir: workspacePath, oid })
      const treeOid = commit.tree
      const { blob } = await git.readBlob({
        fs,
        dir: workspacePath,
        oid: treeOid,
        filepath: filePath
      })
      return Buffer.from(blob).toString('utf-8')
    } catch (e) {
      return ''
    }
  }
}

async function status(workspacePath) {
  try {
    const statusMatrix = await git.statusMatrix({ fs, dir: workspacePath })
    const modified = statusMatrix
      .filter(([, head, workdir]) => head !== workdir)
      .map(([filepath]) => filepath)
    return { modified }
  } catch (err) {
    return { modified: [] }
  }
}

module.exports = {
  initWorkspace,
  listFiles,
  commit,
  log,
  branches,
  createBranch,
  checkout,
  merge,
  diff,
  readCommit,
  status
}
