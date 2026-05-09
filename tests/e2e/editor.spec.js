import { test, expect } from '@playwright/test'
import { launchApp, closeApp, createAndOpenDoc, typeInEditor, editorHTML } from './helpers.js'

// Each test group gets its own app instance
test.describe('editor inputs', () => {
  let app, page, workspacePath, configDir

  test.beforeEach(async () => {
    ;({ app, page, workspacePath, configDir } = await launchApp())
    await createAndOpenDoc(page, workspacePath)
  })

  test.afterEach(async () => {
    await closeApp(app, configDir)
  })

  // ── Headings ──────────────────────────────────────────────────────────────

  test('# heading → h1 node', async () => {
    await typeInEditor(page, '# Hello world')
    await expect(page.locator('.editor h1')).toHaveText('Hello world')
  })

  test('## heading → h2 node', async () => {
    await typeInEditor(page, '## Section')
    await expect(page.locator('.editor h2')).toHaveText('Section')
  })

  // ── Inline formatting ─────────────────────────────────────────────────────

  test('**bold** → strong node', async () => {
    await typeInEditor(page, '**bold text**')
    await expect(page.locator('.editor strong')).toHaveText('bold text')
  })

  test('*italic* → em node', async () => {
    await typeInEditor(page, '*italic text*')
    await expect(page.locator('.editor em')).toHaveText('italic text')
  })

  test('`code` → inline code node', async () => {
    await typeInEditor(page, '`inline code`')
    await expect(page.locator('.editor code')).toHaveText('inline code')
  })

  // ── Lists ─────────────────────────────────────────────────────────────────

  test('- bullet → list item', async () => {
    await typeInEditor(page, '- item one')
    await expect(page.locator('.editor ul li')).toHaveText('item one')
  })

  test('1. ordered list → ol item', async () => {
    await typeInEditor(page, '1. first item')
    await expect(page.locator('.editor ol li')).toHaveText('first item')
  })

  // ── Task list / checkboxes ────────────────────────────────────────────────

  test('- [ ] creates unchecked task item', async () => {
    // Type a bullet first, then the task syntax
    await typeInEditor(page, '- ')
    await page.keyboard.type('[ ] ')
    await page.keyboard.type('buy milk')
    const li = page.locator('.editor li[data-item-type="task"]')
    await expect(li).toBeVisible()
    await expect(li).toHaveAttribute('data-checked', 'false')
    await expect(li).toContainText('buy milk')
  })

  test('- [x] creates checked task item', async () => {
    await typeInEditor(page, '- ')
    await page.keyboard.type('[x] ')
    await page.keyboard.type('done task')
    const li = page.locator('.editor li[data-item-type="task"]')
    await expect(li).toHaveAttribute('data-checked', 'true')
  })

  test('clicking checkbox area toggles checked state', async () => {
    await typeInEditor(page, '- ')
    await page.keyboard.type('[ ] ')
    await page.keyboard.type('toggle me')
    const li = page.locator('.editor li[data-item-type="task"]')
    await expect(li).toHaveAttribute('data-checked', 'false')
    // Click the left edge (checkbox zone)
    const box = await li.boundingBox()
    await page.mouse.click(box.x + 8, box.y + box.height / 2)
    await expect(li).toHaveAttribute('data-checked', 'true')
  })

  // ── Code blocks ───────────────────────────────────────────────────────────

  test('``` code block → pre/code node', async () => {
    await typeInEditor(page, '```')
    await page.keyboard.press('Enter')
    await page.keyboard.type('const x = 1')
    await expect(page.locator('.editor pre code')).toBeVisible()
  })

  // ── Mermaid ───────────────────────────────────────────────────────────────

  test('```mermaid block → mermaid diagram component', async () => {
    await typeInEditor(page, '```mermaid')
    await page.keyboard.press('Enter')
    await page.keyboard.type('graph TD; A-->B')
    await page.keyboard.press('Escape') // exit code block
    // Mermaid component renders a custom node view
    await expect(page.locator('.editor [data-type="mermaid_block"], .editor .mermaid-block')).toBeVisible({ timeout: 5000 })
  })

  // ── Wiki links ────────────────────────────────────────────────────────────

  test('[[ triggers wiki link tooltip', async () => {
    await typeInEditor(page, '[[')
    // The wiki link tooltip/popover should appear
    await expect(page.locator('.wiki-link-tooltip, [class*="wiki"][class*="tooltip"]')).toBeVisible({ timeout: 3000 })
  })

  test('completing a wiki link inserts a chip', async () => {
    await typeInEditor(page, '[[')
    // Type a name in the tooltip and confirm
    await page.keyboard.type('My Doc')
    await page.keyboard.press('Enter')
    await expect(page.locator('.wiki-link-chip')).toBeVisible()
    await expect(page.locator('.chip-name')).toHaveText('My Doc')
  })

  // ── Blockquote ────────────────────────────────────────────────────────────

  test('> blockquote → blockquote node', async () => {
    await typeInEditor(page, '> quote text')
    await expect(page.locator('.editor blockquote')).toContainText('quote text')
  })

  // ── Horizontal rule ───────────────────────────────────────────────────────

  test('--- horizontal rule → hr node', async () => {
    await typeInEditor(page, '---')
    await page.keyboard.press('Enter')
    await expect(page.locator('.editor hr')).toBeVisible()
  })

  // ── Links ─────────────────────────────────────────────────────────────────

  test('[text](url) → anchor node', async () => {
    await typeInEditor(page, '[click here](https://example.com)')
    const link = page.locator('.editor a[href="https://example.com"]')
    await expect(link).toHaveText('click here')
  })

  // ── Tables (GFM) ─────────────────────────────────────────────────────────

  test('GFM table → table node', async () => {
    await typeInEditor(page, '| A | B |')
    await page.keyboard.press('Enter')
    await page.keyboard.type('|---|---|')
    await page.keyboard.press('Enter')
    await page.keyboard.type('| 1 | 2 |')
    await expect(page.locator('.editor table')).toBeVisible()
    await expect(page.locator('.editor td').first()).toHaveText('1')
  })
})
