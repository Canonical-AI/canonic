import { describe, it, expect, beforeEach, vi } from 'vitest'

const discovery = await import('../../electron/discovery.js')

// Stable mock objects — injected via _setConstructor
const mockServiceHandle = { stop: vi.fn() }
const mockBrowser = { on: vi.fn(), stop: vi.fn() }
const mockBonjourInstance = {
  publish: vi.fn(),
  find: vi.fn(),
  destroy: vi.fn()
}
const MockBonjour = vi.fn()

beforeEach(() => {
  // Re-establish implementations before stopping (stopDiscovery may call destroy/stop)
  MockBonjour.mockImplementation(function () { return mockBonjourInstance })
  mockBonjourInstance.publish.mockImplementation(function () { return mockServiceHandle })
  mockBonjourInstance.find.mockImplementation(function () { return mockBrowser })
  // Inject mock constructor and reset singleton state
  discovery._setConstructor(MockBonjour)
  discovery.stopDiscovery()
  // Clear call histories AFTER stopDiscovery so cleanup calls don't affect assertions
  MockBonjour.mockClear()
  mockServiceHandle.stop.mockClear()
  mockBrowser.on.mockClear()
  mockBrowser.stop.mockClear()
  mockBonjourInstance.publish.mockClear()
  mockBonjourInstance.find.mockClear()
  mockBonjourInstance.destroy.mockClear()
})

describe('discovery', () => {
  it('startDiscovery() starts browsing _canonic._tcp', () => {
    discovery.startDiscovery()
    expect(mockBonjourInstance.find).toHaveBeenCalledWith({ type: 'canonic' })
    expect(mockBrowser.on).toHaveBeenCalledWith('up', expect.any(Function))
    expect(mockBrowser.on).toHaveBeenCalledWith('down', expect.any(Function))
  })

  it('startDiscovery() is idempotent — second call is a no-op', () => {
    discovery.startDiscovery()
    discovery.startDiscovery()
    expect(mockBonjourInstance.find).toHaveBeenCalledOnce()
  })

  it('announceShare() publishes a service with correct TXT record', () => {
    discovery.startDiscovery()
    discovery.announceShare({ port: 3801, token: 'tok1', scope: 'workspace', permission: 'copy', author: 'alice' })
    expect(mockBonjourInstance.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'canonic',
        port: 3801,
        txt: expect.objectContaining({ token: 'tok1', scope: 'workspace', permission: 'copy', author: 'alice' })
      })
    )
  })

  it('unpublishShare() stops the service for that port', () => {
    discovery.startDiscovery()
    discovery.announceShare({ port: 3801, token: 'tok1', scope: 'file', permission: 'view', author: 'bob' })
    discovery.unpublishShare(3801)
    expect(mockServiceHandle.stop).toHaveBeenCalledOnce()
  })

  it('unpublishShare() on unknown port does not throw', () => {
    discovery.startDiscovery()
    expect(() => discovery.unpublishShare(9999)).not.toThrow()
  })

  it('stopDiscovery() destroys bonjour instance and stops browser', () => {
    discovery.startDiscovery()
    discovery.stopDiscovery()
    expect(mockBrowser.stop).toHaveBeenCalledOnce()
    expect(mockBonjourInstance.destroy).toHaveBeenCalledOnce()
  })

  it('peer:found event fires when browser emits up', () => {
    discovery.startDiscovery()
    const handler = vi.fn()
    discovery.emitter.on('peer:found', handler)

    const upCb = mockBrowser.on.mock.calls.find(c => c[0] === 'up')[1]
    upCb({ name: 'alice (alice-mac)', host: 'alice-mac.local', port: 3801, txt: { token: 'tok1', scope: 'workspace', permission: 'copy', author: 'alice' } })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'alice@alice-mac.local', name: 'alice', port: 3801, permission: 'copy', online: true })
    )
    discovery.emitter.off('peer:found', handler)
  })

  it('peer:lost event fires when browser emits down', () => {
    discovery.startDiscovery()
    const handler = vi.fn()
    discovery.emitter.on('peer:lost', handler)

    const downCb = mockBrowser.on.mock.calls.find(c => c[0] === 'down')[1]
    downCb({ name: 'alice (alice-mac)', host: 'alice-mac.local', txt: { author: 'alice' } })

    expect(handler).toHaveBeenCalledWith({ id: 'alice@alice-mac.local' })
    discovery.emitter.off('peer:lost', handler)
  })
})
