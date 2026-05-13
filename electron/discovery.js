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
  console.log('[Discovery] Raw service found:', JSON.stringify({
    name: svc.name,
    host: svc.host,
    port: svc.port,
    addresses: svc.addresses,
    txt: svc.txt
  }, null, 2));
  
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
  
  const peer = {
    // Include port in ID to allow multiple instances on one machine
    id: `${author}@${resolvedHost}:${svc.port}`,
    name: author,
    host: resolvedHost,
    port: svc.port,
    token: svc.txt?.token,
    scope: svc.txt?.scope,
    permission: svc.txt?.permission,
    taggedOnly: svc.txt?.taggedOnly === 'true',
    online: true
  }
  
  console.log('[Discovery] Resolved peer object:', JSON.stringify(peer, null, 2));
  return peer
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
  return `${svc.txt?.author || svc.name}@${h}:${svc.port}`
}

function _setConstructor(Ctor) { _BonjourCtor = Ctor }

module.exports = { startDiscovery, announceShare, unpublishShare, stopDiscovery, emitter, _setConstructor }
