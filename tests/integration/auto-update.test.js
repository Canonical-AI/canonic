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

  it('installUpdate clears the prompt in demo mode without IPC', () => {
    store.isDemoMode = true
    store.updateReady = true
    store.updateInfo = { version: '0.3.0' }
    store.installUpdate()
    expect(store.updateReady).toBe(false)
    expect(store.updateAvailable).toBe(false)
    expect(store.updateInfo).toBe(null)
    expect(mockApi.update.install).not.toHaveBeenCalled()
  })

  it('downloadUpdate invokes the IPC download in live mode', () => {
    store.isDemoMode = false
    store.downloadUpdate()
    expect(store.updateDownloading).toBe(true)
    expect(store.updateAvailable).toBe(false)
    expect(mockApi.update.download).toHaveBeenCalledTimes(1)
  })

  it('installUpdate invokes the IPC install in live mode', () => {
    store.isDemoMode = false
    store.installUpdate()
    expect(mockApi.update.install).toHaveBeenCalledTimes(1)
  })
})
