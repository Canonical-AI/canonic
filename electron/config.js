const fs = require('fs')
const path = require('path')
const os = require('os')

const CONFIG_PATH = path.join(os.homedir(), '.canonic', 'config.json')

const DEFAULTS = {
  displayName: os.hostname().replace(/\.local$/, ''),
  apiKey: '',
  model: 'claude-sonnet-4-6',
  defaultWorkspacePath: path.join(os.homedir(), 'canonic'),
  sharingDefaults: {
    scope: 'file',       // none | file | directory | workspace
    accessLevel: 'read'  // read | comment
  }
}

function read() {
  if (!fs.existsSync(CONFIG_PATH)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    // Merge with defaults to handle older config files missing new fields
    return { ...DEFAULTS, ...raw, sharingDefaults: { ...DEFAULTS.sharingDefaults, ...(raw.sharingDefaults || {}) } }
  } catch {
    return null
  }
}

function write(config) {
  const merged = { ...DEFAULTS, ...config, sharingDefaults: { ...DEFAULTS.sharingDefaults, ...(config.sharingDefaults || {}) } }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}

function exists() {
  return fs.existsSync(CONFIG_PATH)
}

function validate(config) {
  const errors = {}
  if (!config.displayName?.trim()) errors.displayName = 'Display name is required'
  // API key is optional — AI features just won't work without it
  return { valid: Object.keys(errors).length === 0, errors }
}

module.exports = { read, write, exists, validate, CONFIG_PATH }
