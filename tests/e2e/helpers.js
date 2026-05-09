import { _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

/**
 * Launch the Electron app with a fresh temp config dir and an empty workspace.
 * Returns { app, page, workspacePath, configDir }.
 */
export async function launchApp() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonic-e2e-'))
  const workspacePath = path.join(configDir, 'workspace')
  fs.mkdirSync(workspacePath)

  // Write a minimal config so the app skips the setup screen
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      displayName: 'E2E Test',
      defaultWorkspacePath: workspacePath,
      providers: [],
      assistant: { providerId: '', model: '' },
      completion: { enabled: false, providerId: '', model: 'codestral-latest' },
      telemetryEnabled: false,
      autoUpdate: false,
    })
  )

  const app = await electron.launch({
    args: [path.join(ROOT, 'electron/main.js')],
    env: {
      ...process.env,
      CANONIC_CONFIG_DIR: configDir,
      NODE_ENV: 'test',
    },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return { app, page, workspacePath, configDir }
}

export async function closeApp(app, configDir) {
  await app.close()
  fs.rmSync(configDir, { recursive: true, force: true })
}

/**
 * Create a new document and open it in the editor.
 * Returns the file path.
 */
export async function createAndOpenDoc(page, workspacePath, name = 'test-doc.md') {
  const filePath = path.join(workspacePath, name)
  fs.writeFileSync(filePath, '')
  // Click the file in the sidebar or use IPC via evaluate
  await page.evaluate((p) => window.canonic.workspace.openFile(p), filePath)
  await page.waitForSelector('.editor')
  return filePath
}

/**
 * Click inside the editor and type text, optionally pressing Enter first.
 */
export async function typeInEditor(page, text, { newLine = false } = {}) {
  const editor = page.locator('.editor')
  await editor.click()
  if (newLine) await page.keyboard.press('Enter')
  await page.keyboard.type(text)
}

/**
 * Get the inner HTML of the editor content area.
 */
export function editorHTML(page) {
  return page.locator('.editor').innerHTML()
}

/**
 * Get all text content of the editor.
 */
export function editorText(page) {
  return page.locator('.editor').innerText()
}
