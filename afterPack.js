const fs = require('fs')
const path = require('path')

// electron-builder nests call-bind-apply-helpers inside call-bind/ in the ASAR
// rather than at the top level. Modules inside the ASAR that require it can't find
// it because ASAR require() resolution only walks up within the ASAR virtual fs.
// Node.js resolution DOES cross the ASAR boundary into the real filesystem, so
// placing these modules at Contents/Resources/node_modules/ (mac) or
// resources/node_modules/ (win/linux) makes them findable from any code inside
// the ASAR. We copy the full transitive dep tree of call-bind-apply-helpers.
const MODULES_TO_COPY = ['call-bind-apply-helpers', 'es-errors', 'function-bind']

exports.default = async function ({ appOutDir, packager }) {
  const productName = packager.appInfo.productName
  const platform = packager.platform.nodeName // 'darwin' | 'win32' | 'linux'

  const resourcesDir = platform === 'darwin'
    ? path.join(appOutDir, `${productName}.app`, 'Contents', 'Resources')
    : path.join(appOutDir, 'resources')

  for (const mod of MODULES_TO_COPY) {
    const src = path.join(__dirname, 'node_modules', mod)
    const dest = path.join(resourcesDir, 'node_modules', mod)
    if (!fs.existsSync(dest)) {
      copyDirSync(src, dest)
      console.log('[afterPack] copied', mod, '→', dest)
    }
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    entry.isDirectory() ? copyDirSync(s, d) : fs.copyFileSync(s, d)
  }
}
