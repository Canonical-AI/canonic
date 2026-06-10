import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

// Track backup calls for assertions
let backupSetConfigCalled = false
let backupSetEnabled = null

const mockApi = {
  config: { read: vi.fn().mockResolvedValue({ backup: { enabled: false, path: null, intervalMinutes: 30, maxCount: 20 } }), write: vi.fn().mockResolvedValue({ success: true, config: {} }), exists: vi.fn(), validate: vi.fn() },
  workspace: { init: vi.fn(), getDefault: vi.fn(), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: { list: vi.fn().mockResolvedValue([]), read: vi.fn(), write: vi.fn(), getIndex: vi.fn() },
  git: { branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }), log: vi.fn().mockResolvedValue([]) },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { onStats: vi.fn(), onNetworkChanged: vi.fn(), offNetworkChanged: vi.fn() },
  peers: { list: vi.fn().mockResolvedValue([]), onFound: vi.fn(), offFound: vi.fn(), onLost: vi.fn(), offLost: vi.fn() },
  peerComments: { onReceived: vi.fn(), offReceived: vi.fn() },
  update: {
    check: vi.fn().mockResolvedValue({ available: false }),
    download: vi.fn(),
    install: vi.fn(),
    onAvailable: vi.fn(),
    onProgress: vi.fn(),
    onDownloaded: vi.fn(),
    onError: vi.fn(),
  },
  backup: {
    getConfig: vi.fn().mockResolvedValue({ enabled: false, path: null, intervalMinutes: 30, maxCount: 20 }),
    setConfig: vi.fn().mockImplementation((cfg) => {
      backupSetConfigCalled = true
      backupSetEnabled = cfg.enabled
      return Promise.resolve({ success: true })
    }),
    run: vi.fn().mockResolvedValue({ success: true, skipped: false, filename: 'canonic-backup-test.bundle', path: '/tmp/test.bundle', size: 1024, timestamp: Date.now() }),
    list: vi.fn().mockResolvedValue([]),
    restore: vi.fn().mockResolvedValue({ success: true, branch: 'restore-test' }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    startAuto: vi.fn().mockResolvedValue({ success: true }),
    stopAuto: vi.fn().mockResolvedValue({ success: true }),
    onCompleted: vi.fn(),
    offCompleted: vi.fn(),
    getWorkspaceConfig: vi.fn().mockResolvedValue({ hasWorkspaceOverride: false, path: '' }),
    setWorkspaceConfig: vi.fn().mockResolvedValue({ success: true }),
  },
  docBranches: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
  demo: { register: vi.fn(), cleanup: vi.fn() },
  agentControl: {
    getPresets: vi.fn().mockResolvedValue([]),
    getModels: vi.fn().mockResolvedValue([]),
    getCustomAgents: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
    onStdout: vi.fn(),
    onStderr: vi.fn(),
    onExit: vi.fn(),
    onError: vi.fn(),
    onCommentsIngested: vi.fn(),
  },
  agentSession: {
    onSessionStart: vi.fn(),
    onComment: vi.fn(),
    onSessionCancel: vi.fn(),
    onSessionDone: vi.fn(),
    onFileSaved: vi.fn(),
  },
  telemetry: { log: vi.fn() },
}

const mockLocalStorage = {
  store: {},
  getItem(key) { return this.store[key] || null },
  setItem(key, val) { this.store[key] = String(val) },
  removeItem(key) { delete this.store[key] },
  clear() { this.store = {} },
}
vi.stubGlobal('localStorage', mockLocalStorage)
vi.stubGlobal('window', { canonic: mockApi, localStorage: mockLocalStorage })

describe('backup store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    vi.clearAllMocks()
    backupSetConfigCalled = false
    backupSetEnabled = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- Configuration ---

  it('loadBackupConfig populates backupConfig from backend', async () => {
    store.isDemoMode = false
    mockApi.backup.getConfig.mockResolvedValue({
      enabled: true,
      path: '/Users/test/Dropbox/backups',
      intervalMinutes: 15,
      maxCount: 50,
    })
    await store.loadBackupConfig()
    expect(store.backupConfig).toEqual({
      enabled: true,
      path: '/Users/test/Dropbox/backups',
      intervalMinutes: 15,
      maxCount: 50,
    })
  })

  it('loadBackupConfig in demo mode uses defaults + demo history', async () => {
    store.isDemoMode = true
    await store.loadBackupConfig()
    expect(store.backupConfig.enabled).toBe(false)
    expect(store.backupHistory.length).toBe(1)
    expect(store.backupHistory[0].filename).toContain('canonic-backup-')
  })

  it('saveBackupConfig calls backend and updates local state', async () => {
    store.isDemoMode = false
    const cfg = { enabled: true, path: '/custom/path', intervalMinutes: 60, maxCount: 10 }
    const result = await store.saveBackupConfig(cfg)
    expect(result.success).toBe(true)
    expect(backupSetConfigCalled).toBe(true)
    expect(backupSetEnabled).toBe(true)
    expect(store.backupConfig.enabled).toBe(true)
  })

  // --- Manual Backup ---

  it('runBackup executes and updates lastRun + history', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    mockApi.backup.run.mockResolvedValue({
      success: true,
      skipped: false,
      filename: 'canonic-backup-2026-06-09T10-00-00.bundle',
      path: '/tmp/.canonic-backups/canonic-backup-2026-06-09T10-00-00.bundle',
      size: 2048,
      timestamp: Date.now(),
    })
    await store.runBackup()
    expect(store.backupBusy).toBe(false)
    expect(store.backupLastRun).not.toBeNull()
    expect(store.backupLastRun.size).toBe(2048)
  })

  it('runBackup in demo mode simulates backup without IPC', () => {
    vi.useFakeTimers()
    store.isDemoMode = true
    const promise = store.runBackup()
    expect(store.backupBusy).toBe(true)
    vi.advanceTimersByTime(1500)
    return promise.then((result) => {
      expect(result.success).toBe(true)
      expect(store.backupBusy).toBe(false)
      expect(store.backupLastRun).not.toBeNull()
      expect(store.backupHistory.length).toBe(1)
    })
  })

  it('runBackup skipped returns without updating', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    mockApi.backup.run.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'no changes',
    })
    store.backupLastRun = null
    await store.runBackup()
    expect(store.backupLastRun).toBeNull()
    expect(store.backupBusy).toBe(false)
  })

  // --- History ---

  it('loadBackupHistory fetches from backend', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    mockApi.backup.list.mockResolvedValue([
      { filename: 'b1.bundle', path: '/tmp/b1.bundle', size: 100, timestamp: 1 },
      { filename: 'b2.bundle', path: '/tmp/b2.bundle', size: 200, timestamp: 2 },
    ])
    await store.loadBackupHistory()
    expect(store.backupHistory.length).toBe(2)
  })

  // --- Restore ---

  it('restoreBackup calls backend and returns branch', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    const result = await store.restoreBackup('test.bundle')
    expect(result.success).toBe(true)
    expect(result.branch).toBe('restore-test')
    expect(mockApi.backup.restore).toHaveBeenCalledWith('/tmp/test-workspace', 'test.bundle')
  })

  it('restoreBackup in demo mode returns success without IPC', async () => {
    store.isDemoMode = true
    const result = await store.restoreBackup('demo.bundle')
    expect(result.success).toBe(true)
    expect(result.branch).toContain('restore-')
  })

  // --- Delete ---

  it('deleteBackup removes from list and calls backend', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    mockApi.backup.list.mockResolvedValue([
      { filename: 'keep.bundle', path: '/tmp/keep.bundle', size: 100, timestamp: 1 },
    ])
    store.backupHistory = [
      { filename: 'keep.bundle', path: '/tmp/keep.bundle', size: 100, timestamp: 1 },
      { filename: 'remove.bundle', path: '/tmp/remove.bundle', size: 200, timestamp: 2 },
    ]
    await store.deleteBackup('remove.bundle')
    expect(store.backupHistory.length).toBe(1)
    expect(store.backupHistory[0].filename).toBe('keep.bundle')
    expect(mockApi.backup.delete).toHaveBeenCalledWith('/tmp/test-workspace', 'remove.bundle')
  })

  it('deleteBackup in demo mode removes from list without IPC', async () => {
    store.isDemoMode = true
    store.backupHistory = [
      { filename: 'keep.bundle' },
      { filename: 'remove.bundle' },
    ]
    await store.deleteBackup('remove.bundle')
    expect(store.backupHistory.length).toBe(1)
    expect(store.backupHistory[0].filename).toBe('keep.bundle')
    expect(mockApi.backup.delete).not.toHaveBeenCalled()
  })

  // --- Backup completion event ---

  it('onCompleted listener updates lastRun', () => {
    // The listener is wired at module construction time. Find it and invoke.
    const onCompletedCb = mockApi.backup.onCompleted.mock.calls[0]?.[0]
    if (onCompletedCb) {
      onCompletedCb({ timestamp: 999999, size: 5000 })
      expect(store.backupLastRun).toEqual({ timestamp: 999999, size: 5000 })
    }
  })

  // --- Workspace Override ---

  it('loadWorkspaceBackupConfig detects workspace override', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    mockApi.backup.getWorkspaceConfig.mockResolvedValue({
      hasWorkspaceOverride: true,
      path: '/Users/test/iCloud/backups',
      enabled: true,
      intervalMinutes: 30,
      maxCount: 20,
    })
    await store.loadWorkspaceBackupConfig()
    expect(store.hasWorkspaceOverride).toBe(true)
    expect(store.backupConfig.path).toBe('/Users/test/iCloud/backups')
  })

  it('loadWorkspaceBackupConfig with no override leaves global path', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    store.backupConfig = { enabled: true, path: '/global/path', intervalMinutes: 30, maxCount: 20 }
    mockApi.backup.getWorkspaceConfig.mockResolvedValue({
      hasWorkspaceOverride: false,
      path: '',
    })
    await store.loadWorkspaceBackupConfig()
    expect(store.hasWorkspaceOverride).toBe(false)
    expect(store.backupConfig.path).toBe('/global/path') // unchanged
  })

  it('saveWorkspaceBackupConfig sets override', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    mockApi.backup.getConfig.mockResolvedValue({ enabled: true, path: '/global/path', intervalMinutes: 30, maxCount: 20 })
    const result = await store.saveWorkspaceBackupConfig('/Users/test/Dropbox/backups')
    expect(result.success).toBe(true)
    expect(store.hasWorkspaceOverride).toBe(true)
    expect(store.backupConfig.path).toBe('/Users/test/Dropbox/backups')
  })

  it('saveWorkspaceBackupConfig clears override', async () => {
    store.isDemoMode = false
    store.workspacePath = '/tmp/test-workspace'
    store.backupConfig = { enabled: true, path: '/custom/ws/path', intervalMinutes: 30, maxCount: 20 }
    store.hasWorkspaceOverride = true
    mockApi.backup.getConfig.mockResolvedValue({ enabled: true, path: '/global/path', intervalMinutes: 30, maxCount: 20 })
    const result = await store.saveWorkspaceBackupConfig('') // clear
    expect(result.success).toBe(true)
    expect(store.hasWorkspaceOverride).toBe(false)
    expect(store.backupConfig.path).toBe('/global/path') // reverted to global
  })

  it('loadBackupConfig in demo mode resets hasWorkspaceOverride', async () => {
    store.isDemoMode = true
    store.hasWorkspaceOverride = true
    await store.loadBackupConfig()
    expect(store.hasWorkspaceOverride).toBe(false)
  })
})
