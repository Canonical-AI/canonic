const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const configService = require('./config')

const isDev = process.env.NODE_ENV !== 'production'
const CANONIC_DIR = path.join(os.homedir(), '.canonic')
const PEERS_FILE = path.join(CANONIC_DIR, 'peers.json')

// Ensure ~/.canonic exists
if (!fs.existsSync(CANONIC_DIR)) {
  fs.mkdirSync(CANONIC_DIR, { recursive: true })
  fs.mkdirSync(path.join(CANONIC_DIR, 'peers'), { recursive: true })
  fs.mkdirSync(path.join(CANONIC_DIR, 'comments'), { recursive: true })
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1a1a2e'
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  setupIpcHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function setupIpcHandlers() {
  const gitService = require('./git')
  const searchService = require('./search')
  const shareService = require('./share')

  // --- Workspace ---
  ipcMain.handle('workspace:open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Open or create a Canonic workspace'
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('workspace:init', async (_, workspacePath, template = 'blank') => {
    return gitService.initWorkspace(workspacePath, template)
  })

  ipcMain.handle('workspace:get-default', async () => {
    const defaultPath = path.join(os.homedir(), 'canonic')
    return defaultPath
  })

  // --- Files ---
  ipcMain.handle('files:list', async (_, workspacePath) => {
    return gitService.listFiles(workspacePath)
  })

  ipcMain.handle('files:read', async (_, workspacePath, filePath) => {
    const fullPath = path.join(workspacePath, filePath)
    if (!fs.existsSync(fullPath)) return null
    return fs.readFileSync(fullPath, 'utf-8')
  })

  ipcMain.handle('files:write', async (_, workspacePath, filePath, content) => {
    const fullPath = path.join(workspacePath, filePath)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    return true
  })

  ipcMain.handle('files:delete', async (_, workspacePath, filePath) => {
    const fullPath = path.join(workspacePath, filePath)
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    return true
  })

  ipcMain.handle('files:new', async (_, workspacePath, fileName) => {
    const filePath = fileName.endsWith('.md') ? fileName : `${fileName}.md`
    const fullPath = path.join(workspacePath, filePath)
    const template = `# ${fileName.replace('.md', '')}\n\n`
    fs.writeFileSync(fullPath, template, 'utf-8')
    return filePath
  })

  // --- Git ---
  ipcMain.handle('git:commit', async (_, workspacePath, filePath, message) => {
    return gitService.commit(workspacePath, filePath, message)
  })

  ipcMain.handle('git:log', async (_, workspacePath, filePath) => {
    return gitService.log(workspacePath, filePath)
  })

  ipcMain.handle('git:branches', async (_, workspacePath) => {
    return gitService.branches(workspacePath)
  })

  ipcMain.handle('git:create-branch', async (_, workspacePath, branchName) => {
    return gitService.createBranch(workspacePath, branchName)
  })

  ipcMain.handle('git:checkout', async (_, workspacePath, branchName) => {
    return gitService.checkout(workspacePath, branchName)
  })

  ipcMain.handle('git:merge', async (_, workspacePath, fromBranch, message) => {
    return gitService.merge(workspacePath, fromBranch, message)
  })

  ipcMain.handle('git:diff', async (_, workspacePath, filePath, oid) => {
    return gitService.diff(workspacePath, filePath, oid)
  })

  ipcMain.handle('git:read-commit', async (_, workspacePath, filePath, oid) => {
    return gitService.readCommit(workspacePath, filePath, oid)
  })

  ipcMain.handle('git:status', async (_, workspacePath) => {
    return gitService.status(workspacePath)
  })

  // --- Comments ---
  ipcMain.handle('comments:get', async (_, docId) => {
    const commentsFile = path.join(CANONIC_DIR, 'comments', `${docId}.json`)
    if (!fs.existsSync(commentsFile)) return []
    return JSON.parse(fs.readFileSync(commentsFile, 'utf-8'))
  })

  ipcMain.handle('comments:save', async (_, docId, comments) => {
    const commentsFile = path.join(CANONIC_DIR, 'comments', `${docId}.json`)
    fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2), 'utf-8')
    return true
  })

  // --- Search ---
  ipcMain.handle('search:query', async (_, query, workspacePath) => {
    return searchService.search(query, workspacePath)
  })

  ipcMain.handle('search:index', async (_, workspacePath, filePath, content) => {
    return searchService.index(workspacePath, filePath, content)
  })

  // --- Sharing ---
  ipcMain.handle('share:start', async (_, workspacePath, filePath, options) => {
    return shareService.startShare(workspacePath, filePath, options, mainWindow)
  })

  ipcMain.handle('share:stop', async (_, filePath) => {
    return shareService.stopShare(filePath)
  })

  ipcMain.handle('share:open-link', async (_, url) => {
    shell.openExternal(url)
  })

  // --- Peers ---
  ipcMain.handle('peers:list', async () => {
    if (!fs.existsSync(PEERS_FILE)) return []
    return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf-8'))
  })

  ipcMain.handle('peers:open-shared', async (_, url, token) => {
    return shareService.fetchSharedDoc(url, token)
  })

  // --- Config ---
  ipcMain.handle('config:read', async () => {
    return configService.read()
  })

  ipcMain.handle('config:write', async (_, config) => {
    const { valid, errors } = configService.validate(config)
    if (!valid) return { success: false, errors }
    const saved = configService.write(config)
    // Hot-reload author in git service
    const gitService = require('./git')
    gitService.setAuthor({ name: saved.displayName, email: `${saved.displayName.replace(/\s+/g, '.')}@canonic.local` })
    return { success: true, config: saved }
  })

  ipcMain.handle('config:exists', async () => {
    return configService.exists()
  })

  ipcMain.handle('config:validate', async (_, config) => {
    return configService.validate(config)
  })

  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
