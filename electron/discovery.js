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

// Defensively convert TXT record values — bonjour-service returns Buffers on some platforms
function txtStr(v) {
  if (v == null) return v
  if (Buffer.isBuffer(v)) return v.toString('utf8')
  return String(v)
}

function getLanIP() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
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
  const ip = getLanIP()
  const svc = bonjour.publish({
    name: `${author} (${os.hostname()}) - ${port}`,
    type: 'canonic',
    port,
    // ip in TXT lets remote peers skip .local hostname resolution (cross-platform fix)
    txt: { token, scope, permission, author, taggedOnly: !!taggedOnly, ip }
  })
  publishedServices.set(port, svc)

  // mDNS doesn't loop back to our own browser — emit self so our UI shows us
  emitter.emit('peer:found', {
    id: `127.0.0.1:${port}`,
    name: author,
    host: '127.0.0.1',
    port,
    token,
    scope,
    permission,
    taggedOnly: !!taggedOnly,
    online: true,
    isSelf: true,
  })
}

function unpublishShare(port) {
  const svc = publishedServices.get(port)
  if (!svc) return
  svc.stop()
  publishedServices.delete(port)
  emitter.emit('peer:lost', { id: `127.0.0.1:${port}` })
}

function stopDiscovery() {
  publishedServices.forEach(svc => svc.stop())
  publishedServices.clear()
  if (browser) { browser.stop(); browser = null }
  if (bonjour) { bonjour.destroy(); bonjour = null }
}

function svcToPeer(svc) {
  // Prefer explicit IP from TXT record — reliable across platforms/OS hostname resolution
  const txtIp = txtStr(svc.txt?.ip)
  let resolvedHost = (txtIp && /^\d+\.\d+\.\d+\.\d+$/.test(txtIp))
    ? txtIp
    : svc.host

  if (!txtIp) {
    // Fall back to addresses array
    if (svc.addresses && svc.addresses.length > 0) {
      const ipv4 = svc.addresses.find(a => a.includes('.') && !a.includes(':'))
      if (ipv4) resolvedHost = ipv4
      else resolvedHost = svc.addresses[0]
    }
    // Clean up hostnames
    if (typeof resolvedHost === 'string') {
      resolvedHost = resolvedHost.replace(/\.$/, '')
      if (!resolvedHost.includes('.') && !resolvedHost.includes(':') && resolvedHost !== 'localhost') {
        resolvedHost = `${resolvedHost}.local`
      }
    }
  }

  return {
    id: `${resolvedHost}:${svc.port}`,
    name: txtStr(svc.txt?.author) || svc.name,
    host: resolvedHost,
    port: svc.port,
    token: txtStr(svc.txt?.token),
    scope: txtStr(svc.txt?.scope),
    permission: txtStr(svc.txt?.permission),
    taggedOnly: txtStr(svc.txt?.taggedOnly) === 'true',
    online: true
  }
}

function peerIdFromSvc(svc) {
  const txtIp = txtStr(svc.txt?.ip)
  if (txtIp && /^\d+\.\d+\.\d+\.\d+$/.test(txtIp)) return `${txtIp}:${svc.port}`

  let h = svc.host
  if (svc.addresses && svc.addresses.length > 0) {
    const ipv4 = svc.addresses.find(a => a.includes('.') && !a.includes(':'))
    if (ipv4) h = ipv4
    else h = svc.addresses[0]
  }
  if (typeof h === 'string') {
    h = h.replace(/\.$/, '')
    if (!h.includes('.') && !h.includes(':') && h !== 'localhost') h = `${h}.local`
  }
  return `${h}:${svc.port}`
}

function _setConstructor(Ctor) { _BonjourCtor = Ctor }

module.exports = { startDiscovery, announceShare, unpublishShare, stopDiscovery, emitter, _setConstructor }
