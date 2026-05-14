const fs = require('fs')
const path = require('path')
function resolveSafePath(base, target) {
  const path = require('path');
  // If target is an absolute path and base is null, allow it (for workspace-less files)
  if (!base && path.isAbsolute(target)) {
    return target;
  }
  if (!base) {
    throw new Error("Base path required for relative targets");
  }
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(base, target);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    throw new Error("Path traversal blocked: " + target);
  }
  return resolvedTarget;
}


function getVersionsPath(workspacePath) {
  return resolveSafePath(workspacePath, '.canonic', 'versions.json')
}

function readAll(workspacePath) {
  const p = getVersionsPath(workspacePath)
  if (!fs.existsSync(p)) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return {} }
}

function writeAll(workspacePath, data) {
  const p = getVersionsPath(workspacePath)
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
}

function list(workspacePath, filePath) {
  return readAll(workspacePath)[filePath] || []
}

function save(workspacePath, filePath, name, oid, message) {
  const all = readAll(workspacePath)
  if (!all[filePath]) all[filePath] = []
  all[filePath] = all[filePath].filter(v => v.name !== name)
  all[filePath].unshift({ name, oid, message: message || '', createdAt: new Date().toISOString() })
  writeAll(workspacePath, all)
  return all[filePath]
}

function remove(workspacePath, filePath, versionName) {
  const all = readAll(workspacePath)
  if (all[filePath]) all[filePath] = all[filePath].filter(v => v.name !== versionName)
  writeAll(workspacePath, all)
}

module.exports = { list, save, remove }
