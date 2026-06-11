import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../../src/store/index.js'

// Minimal window.canonic — the store wires update.* listeners at construction
// and the download/install actions call update.download / update.install.
const mockApi = {
  config: { read: vi.fn().mockResolvedValue(null), write: vi.fn(), exists: vi.fn(), validate: vi.fn() },
  workspace: { init: vi.fn(), getDefault: vi.fn(), openDialog: vi.fn(), openDirectoryDialog: vi.fn() },
  files: { list: vi.fn().mockResolvedValue([]), read: vi.fn(), write: vi.fn() },
  git: { branches: vi.fn().mockResolvedValue({ branches: ['main'], current: 'main' }), log: vi.fn().mockResolvedValue([]) },
  comments: { get: vi.fn().mockResolvedValue([]), save: vi.fn() },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { onStats: vi.fn(), onNetworkChanged: vi.fn(), offNetworkChanged: vi.fn(), openLink: vi.fn() },
  app: { getVersion: vi.fn().mockResolvedValue('0.3.0') },
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

describe('auto-update store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    vi.clearAllMocks()
    mockLocalStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('downloadUpdate simulates progress to ready in demo mode without IPC', () => {
    vi.useFakeTimers()
    store.isDemoMode = true
    store.updateAvailable = true
    store.downloadUpdate()
    expect(store.updateDownloading).toBe(true)
    expect(store.updateAvailable).toBe(false)
    // 5 ticks × 20% = 100% → ready.
    vi.advanceTimersByTime(250 * 5)
    expect(store.updateReady).toBe(true)
    expect(store.updateDownloading).toBe(false)
    expect(store.downloadProgress).toBe(0)
    expect(mockApi.update.download).not.toHaveBeenCalled()
  })

  it('installUpdate clears the prompt and greets in demo mode without IPC', () => {
    store.isDemoMode = true
    store.updateReady = true
    store.updateInfo = { version: '0.3.0' }
    store.installUpdate()
    expect(store.updateReady).toBe(false)
    expect(store.updateAvailable).toBe(false)
    expect(store.updateInfo).toBe(null)
    expect(store.recentlyUpdated).toBe(true)
    expect(store.recentlyUpdatedVersion).toBe('0.3.0')
    expect(mockApi.update.install).not.toHaveBeenCalled()
  })

  it('downloadUpdate invokes the IPC download in live mode', () => {
    store.isDemoMode = false
    store.downloadUpdate()
    expect(store.updateDownloading).toBe(true)
    expect(store.updateAvailable).toBe(false)
    expect(mockApi.update.download).toHaveBeenCalledTimes(1)
  })

  it('installUpdate invokes the IPC install in live mode and stashes the target version', () => {
    store.isDemoMode = false
    store.updateInfo = { version: '0.3.0' }
    store.installUpdate()
    expect(mockApi.update.install).toHaveBeenCalledTimes(1)
    expect(mockLocalStorage.getItem('canonic:updatingTo')).toBe('0.3.0')
  })

  it('dismissUpdateNotice hides the persistent sidebar widget', () => {
    expect(store.updateNoticeDismissed).toBe(false)
    store.dismissUpdateNotice()
    expect(store.updateNoticeDismissed).toBe(true)
  })

  it('releaseNotesUrl points at the GitHub tag for the pending update', () => {
    store.updateInfo = { version: '0.3.0' }
    expect(store.releaseNotesUrl).toBe(
      'https://github.com/Canonical-AI/canonic/releases/tag/v0.3.0',
    )
  })

  it('releaseNotesUrl prefers the just-updated version after a restart', () => {
    store.recentlyUpdated = true
    store.recentlyUpdatedVersion = '0.4.1'
    expect(store.releaseNotesUrl).toBe(
      'https://github.com/Canonical-AI/canonic/releases/tag/v0.4.1',
    )
  })

  it('openReleaseNotes opens the release URL via the bridge', () => {
    store.updateInfo = { version: '0.3.0' }
    store.openReleaseNotes()
    expect(mockApi.share.openLink).toHaveBeenCalledWith(
      'https://github.com/Canonical-AI/canonic/releases/tag/v0.3.0',
    )
  })

  it('checkRecentlyUpdated greets when the running version matches the stashed target', async () => {
    mockLocalStorage.setItem('canonic:updatingTo', '0.3.0')
    mockApi.app.getVersion.mockResolvedValueOnce('0.3.0')
    await store.checkRecentlyUpdated()
    expect(store.recentlyUpdated).toBe(true)
    expect(store.recentlyUpdatedVersion).toBe('0.3.0')
    // Marker consumed so the greeting fires exactly once.
    expect(mockLocalStorage.getItem('canonic:updatingTo')).toBe(null)
  })

  it('checkRecentlyUpdated does not greet if the update did not land, and clears the marker', async () => {
    mockLocalStorage.setItem('canonic:updatingTo', '0.3.0')
    mockApi.app.getVersion.mockResolvedValueOnce('0.2.2-alpha')
    await store.checkRecentlyUpdated()
    expect(store.recentlyUpdated).toBe(false)
    expect(mockLocalStorage.getItem('canonic:updatingTo')).toBe(null)
  })

  it('checkRecentlyUpdated is a no-op when no update was pending', async () => {
    await store.checkRecentlyUpdated()
    expect(store.recentlyUpdated).toBe(false)
    expect(mockApi.app.getVersion).not.toHaveBeenCalled()
  })

  it('applyUpdateInfo marks a critical update mandatory with severity + advisory', () => {
    store.applyUpdateInfo({
      version: '0.2.5-alpha',
      mandatory: true,
      severity: 'critical',
      advisory: 'https://example.com/advisory',
    })
    expect(store.updateAvailable).toBe(true)
    expect(store.updateMandatory).toBe(true)
    expect(store.updateSeverity).toBe('critical')
    expect(store.advisoryUrl).toBe('https://example.com/advisory')
  })

  it('applyUpdateInfo leaves a normal update non-mandatory', () => {
    store.applyUpdateInfo({ version: '0.2.5-alpha' })
    expect(store.updateMandatory).toBe(false)
    expect(store.updateSeverity).toBe('')
    expect(store.advisoryUrl).toBe('')
  })

  it('openAdvisory opens the advisory URL via the bridge', () => {
    store.applyUpdateInfo({
      version: '0.2.5-alpha',
      mandatory: true,
      advisory: 'https://example.com/advisory',
    })
    store.openAdvisory()
    expect(mockApi.share.openLink).toHaveBeenCalledWith('https://example.com/advisory')
  })
})
