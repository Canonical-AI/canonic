import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDir = path.join(os.tmpdir(), `canonic-git-test-${process.pid}`)
const git = await import('../../electron/git.js')

describe('git service', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('initWorkspace() creates a git repo with initial commit', async () => {
    const result = await git.initWorkspace(tmpDir, 'blank')
    expect(result.error).toBeUndefined()
    expect(result.path).toBe(tmpDir)
    expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(true)
  })

  it('initWorkspace() with pm-framework creates folder structure', async () => {
    await git.initWorkspace(tmpDir, 'pm-framework')
    const dirs = ['Vision', 'Strategy', 'Planning', 'Discovery', 'Implementation', 'Monitoring']
    for (const dir of dirs) {
      expect(fs.existsSync(path.join(tmpDir, dir))).toBe(true)
    }
  })

  it('listFiles() returns md files after workspace init', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    const files = await git.listFiles(tmpDir)
    expect(Array.isArray(files)).toBe(true)
  })

  it('commit() saves a file and records a commit', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    const filePath = 'notes.md'
    fs.writeFileSync(path.join(tmpDir, filePath), '# Notes\n\nHello world')
    const result = await git.commit(tmpDir, filePath, 'Add notes')
    expect(result.success).toBe(true)
    expect(result.oid).toBeTruthy()
  })

  it('log() returns commit history for a file', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    const filePath = 'doc.md'
    fs.writeFileSync(path.join(tmpDir, filePath), '# Doc v1')
    await git.commit(tmpDir, filePath, 'First commit')
    fs.writeFileSync(path.join(tmpDir, filePath), '# Doc v2')
    await git.commit(tmpDir, filePath, 'Second commit')
    const log = await git.log(tmpDir, filePath)
    expect(log.length).toBeGreaterThanOrEqual(2)
    expect(log[0].message.trim()).toBe('Second commit')
  })

  it('branches() returns current branch', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    const result = await git.branches(tmpDir)
    expect(result.current).toBeTruthy()
    expect(result.branches).toContain(result.current)
  })

  it('createBranch() and checkout() switch branches', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    const created = await git.createBranch(tmpDir, 'feature-x')
    expect(created.success).toBe(true)
    const checked = await git.checkout(tmpDir, 'feature-x')
    expect(checked.success).toBe(true)
    const { current } = await git.branches(tmpDir)
    expect(current).toBe('feature-x')
  })

  it('initWorkspace() returns isExternal when .git already exists', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    // Call initWorkspace again on the same dir — should detect existing .git
    const result = await git.initWorkspace(tmpDir, 'blank')
    expect(result.isExternal).toBe(true)
    expect(result.alreadyExists).toBe(true)
  })

  it('commit() does not bundle pre-staged external files', async () => {
    await git.initWorkspace(tmpDir, 'blank')

    // Stage an external file (simulates `git add external.py` run in terminal)
    const isogit = await import('isomorphic-git')
    fs.writeFileSync(path.join(tmpDir, 'external.py'), 'print("hello")')
    await isogit.default.add({ fs, dir: tmpDir, filepath: 'external.py' })

    // Commit only the markdown file via Canonic
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# Notes')
    const result = await git.commit(tmpDir, 'notes.md', 'Add notes')
    expect(result.success).toBe(true)

    // external.py should have zero commit history — it was never committed
    const externalLog = await git.log(tmpDir, 'external.py')
    expect(externalLog.length).toBe(0)
  })

  // --- isFileTracked ---

  it('isFileTracked() returns false for untracked file', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    fs.mkdirSync(path.join(tmpDir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'assets', 'image-123.png'), Buffer.from([0x89, 0x50]))
    const tracked = await git.isFileTracked(tmpDir, 'assets/image-123.png')
    expect(tracked).toBe(false)
  })

  it('isFileTracked() returns true after file is committed', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    fs.mkdirSync(path.join(tmpDir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'assets', 'image-456.png'), Buffer.from([0x89, 0x50]))
    await git.commit(tmpDir, 'assets/image-456.png', 'Add image')
    const tracked = await git.isFileTracked(tmpDir, 'assets/image-456.png')
    expect(tracked).toBe(true)
  })

  it('isFileTracked() returns false for nonexistent file', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    const tracked = await git.isFileTracked(tmpDir, 'assets/ghost.png')
    expect(tracked).toBe(false)
  })

  // --- commit() auto-stages assets ---

  it('commit() auto-stages new assets/ files alongside the document', async () => {
    await git.initWorkspace(tmpDir, 'blank')

    // Write doc and a new asset
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '![](canonic-asset://assets/img.png)')
    fs.mkdirSync(path.join(tmpDir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'assets', 'img.png'), Buffer.from([0x89, 0x50]))

    const result = await git.commit(tmpDir, 'doc.md', 'Add doc with image')
    expect(result.success).toBe(true)

    // Asset should now be tracked
    const tracked = await git.isFileTracked(tmpDir, 'assets/img.png')
    expect(tracked).toBe(true)
  })

  it('commit() does not auto-stage already-committed assets', async () => {
    await git.initWorkspace(tmpDir, 'blank')
    fs.mkdirSync(path.join(tmpDir, 'assets'), { recursive: true })

    // Commit the asset first
    fs.writeFileSync(path.join(tmpDir, 'assets', 'old.png'), Buffer.from([0x89, 0x50]))
    await git.commit(tmpDir, 'assets/old.png', 'Add old image')

    // Now commit a doc — should not re-commit the already-tracked asset
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# Doc')
    const result = await git.commit(tmpDir, 'doc.md', 'Add doc')
    expect(result.success).toBe(true)

    const log = await git.log(tmpDir, 'assets/old.png')
    expect(log.length).toBe(1) // still only one commit for the asset
  })
})
