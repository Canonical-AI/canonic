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

function announceShare({ port, token, scope, permission, author, taggedOnly }) {
  if (!bonjour) return
  const svc = bonjour.publish({
    // Add port to name to prevent collision on same machine
    name: `${author} (${os.hostname()}) - ${port}`,
    type: 'canonic',
    port,
    txt: { token, scope, permission, author, taggedOnly: !!taggedOnly }
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
  // 1. Determine the best host (IP preferred over hostname)
  let resolvedHost = svc.host;
  if (svc.addresses && svc.addresses.length > 0) {
    const ipv4 = svc.addresses.find(a => a.includes('.') && !a.includes(':'));
    if (ipv4) resolvedHost = ipv4;
    else resolvedHost = svc.addresses[0];
  }

  // 2. Clean up hostnames (trim trailing dots, append .local if it's a bare hostname)
  if (typeof resolvedHost === 'string') {
    resolvedHost = resolvedHost.replace(/\.$/, ''); // Remove trailing dot if any
    if (!resolvedHost.includes('.') && !resolvedHost.includes(':') && resolvedHost !== 'localhost') {
      resolvedHost = `${resolvedHost}.local`;
    }
  }

  const author = svc.txt?.author || svc.name;
  
  return {
    // Stable ID based on network address, allows name updates without treating as new peer
    id: `${resolvedHost}:${svc.port}`,
    name: author,
    host: resolvedHost,
    port: svc.port,
    token: svc.txt?.token,
    scope: svc.txt?.scope,
    permission: svc.txt?.permission,
    taggedOnly: svc.txt?.taggedOnly === 'true',
    online: true
  }
}

function peerIdFromSvc(svc) {
  // Must match the ID logic in svcToPeer for 'down' events to work
  let h = svc.host;
  if (svc.addresses && svc.addresses.length > 0) {
    const ipv4 = svc.addresses.find(a => a.includes('.') && !a.includes(':'));
    if (ipv4) h = ipv4;
    else h = svc.addresses[0];
  }
  if (typeof h === 'string') {
    h = h.replace(/\.$/, '');
    if (!h.includes('.') && !h.includes(':') && h !== 'localhost') h = `${h}.local`;
  }
  return `${h}:${svc.port}`
}

function _setConstructor(Ctor) { _BonjourCtor = Ctor }

module.exports = { startDiscovery, announceShare, unpublishShare, stopDiscovery, emitter, _setConstructor }
