const { EventEmitter } = require('events')
const os = require('os')

const emitter = new EventEmitter()
let bonjour = null
let browser = null
const publishedServices = new Map() // port -> service handle

let _BonjourCtor = null
function getBonjourCtor() {
  if (!_BonjourCtor) {
    const lib = require('bonjour-service')
    _BonjourCtor = lib.default || lib
  }
  return _BonjourCtor
}

function startDiscovery() {
  if (bonjour) return
  const Bonjour = getBonjourCtor()
  bonjour = new Bonjour()
  browser = bonjour.find({ type: 'canonic' })
  browser.on('up', (svc) => emitter.emit('peer:found', svcToPeer(svc)))
  browser.on('down', (svc) => emitter.emit('peer:lost', { id: peerIdFromSvc(svc) }))
}

function announceShare({ port, token, scope, permission, author }) {
  if (!bonjour) return
  const svc = bonjour.publish({
    name: `${author} (${os.hostname()})`,
    type: 'canonic',
    port,
    txt: { token, scope, permission, author }
  })
  publishedServices.set(port, svc)
}

function unpublishShare(port) {
  const svc = publishedServices.get(port)
  if (!svc) return
  svc.stop()
  publishedServices.delete(port)
}

function stopDiscovery() {
  publishedServices.forEach(svc => svc.stop())
  publishedServices.clear()
  if (browser) { browser.stop(); browser = null }
  if (bonjour) { bonjour.destroy(); bonjour = null }
}

function svcToPeer(svc) {
  return {
    id: `${svc.txt?.author || svc.name}@${svc.host}`,
    name: svc.txt?.author || svc.name,
    host: svc.host,
    port: svc.port,
    token: svc.txt?.token,
    scope: svc.txt?.scope,
    permission: svc.txt?.permission,
    online: true
  }
}

function peerIdFromSvc(svc) {
  return `${svc.txt?.author || svc.name}@${svc.host}`
}

function _setConstructor(Ctor) { _BonjourCtor = Ctor }

module.exports = { startDiscovery, announceShare, unpublishShare, stopDiscovery, emitter, _setConstructor }
