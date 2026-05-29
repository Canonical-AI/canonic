<template>
  <div class="agent-terminal">
    <div class="agent-terminal-surface" ref="elRef"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// One embedded terminal = one PTY session. The parent owns the session descriptor
// (id + spawn params). We register PTY listeners BEFORE spawning so no initial agent
// output is lost, then stream keystrokes back over IPC. We parse nothing.
const props = defineProps({
  session: { type: Object, required: true }  // { id, agentId, type, binary, args, cwd, mcpPort }
})
const emit = defineEmits(['exit'])

const api = window.canonic
const elRef = ref(null)
let term = null
let fit = null
let ro = null
let themeObserver = null

// Initial-prompt auto-send: write the prompt once the CLI's startup render has settled.
// We can't know "ready" generically, so we wait for the data stream to go idle (900ms with
// no new output), with a hard 4s cap in case a TUI redraws a spinner continuously.
let sentInitial = false
let idleTimer = null
let hardTimer = null

// Resolve a CSS custom property off the document root, honoring the active [data-theme].
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// Parse a CSS color (#rgb, #rrggbb, rgb()/rgba()) to [r,g,b] 0–255. null if unparseable.
function parseColor(c) {
  if (!c) return null
  let m = c.match(/^#([0-9a-f]{3})$/i)
  if (m) { const h = m[1]; return [h[0] + h[0], h[1] + h[1], h[2] + h[2]].map(x => parseInt(x, 16)) }
  m = c.match(/^#([0-9a-f]{6})$/i)
  if (m) { const h = m[1]; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
  // Handles both legacy `rgb(r,g,b)` / `rgba(r,g,b,a)` and modern `rgb(r g b / a)` syntax —
  // window-blur mode resolves bg vars to the modern slash form. Grab the first three numbers.
  m = c.match(/rgba?\(([^)]+)\)/i)
  if (m) {
    const nums = m[1].match(/[\d.]+/g)
    if (nums && nums.length >= 3) return [nums[0], nums[1], nums[2]].map(Number)
  }
  return null
}

// Pack [r,g,b] back into an opaque #rrggbb for xterm fields that should stay solid.
function rgbToHex(rgb) {
  if (!rgb) return null
  return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

// Resolve a CSS var straight to an opaque hex for xterm.
function cssHex(name, fallback) {
  return rgbToHex(parseColor(cssVar(name, fallback))) || fallback
}

function rgbToRgbaCss(rgb, alpha) {
  if (!rgb) return null
  const [r, g, b] = rgb.map(v => Math.max(0, Math.min(255, Math.round(v))))
  const a = Math.max(0, Math.min(1, Number(alpha) || 1))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function isWindowTransparencyEnabled() {
  return document.documentElement.classList.contains('window-transparency')
}

// WCAG relative luminance (0 dark … 1 light).
function luminance(rgb) {
  if (!rgb) return 0
  const [r, g, b] = rgb.map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Is the active theme's terminal background light? Drives both the xterm auto-contrast below and
// the COLORFGBG hint we hand the spawned agent — TUIs (OpenCode et al.) read COLORFGBG to choose
// readable text and otherwise assume a dark terminal, painting near-white text on our light bg.
function isLightTheme() {
  return luminance(parseColor(cssVar('--bg-sidebar', '#0c0e12'))) > 0.5
}

function buildTheme() {
  // Match the surrounding AI Control panel (which uses --bg-sidebar) so the terminal blends in
  // rather than reading as a separate boxed window.
  const bgRgb = parseColor(cssVar('--bg-sidebar', '#0c0e12'))
  const bg = isWindowTransparencyEnabled()
    ? (rgbToRgbaCss(bgRgb, cssVar('--blur-opacity', '0.88')) || 'rgba(12, 14, 18, 0.88)')
    : (rgbToHex(bgRgb) || '#0c0e12')
  // Auto-contrast: light text on dark bg, dark text on light bg. Overrides --text-primary so a
  // mismatched theme can't render unreadable terminal text.
  const isLightBg = luminance(bgRgb) > 0.5
  const fg = isLightBg ? '#1c1c1c' : '#e6e6e6'
  return {
    background: bg,
    foreground: fg,
    cursor: cssVar('--accent-light', '#6a97b5'),
    cursorAccent: bg,
    selectionBackground: cssHex('--bg-hover', '#282f3b'),
    black: isLightBg ? '#3a3a3a' : cssHex('--bg-surface', '#161a21'),
    red: cssVar('--error', '#e74c3c'),
    green: cssVar('--success', '#4b7d6f'),
    yellow: cssVar('--warning', '#f39c12'),
    blue: cssVar('--accent', '#4a7a9b'),
    magenta: cssVar('--secondary', '#d1a181'),
    cyan: cssVar('--accent-light', '#6a97b5'),
    white: fg,
    brightBlack: cssVar('--text-muted', '#5a5560'),
    brightWhite: fg
  }
}

function syncSize() {
  if (!term || !fit) return
  try { fit.fit() } catch { /* not laid out yet */ }
  api?.agentControl?.ptyResize({ sessionId: props.session.id, cols: term.cols, rows: term.rows })
}

// The text auto-typed into the TUI once it settles. Computed after spawn: if the CLI accepted
// the context as a silent system prompt, this is just the user's prompt; otherwise the one-line
// context is prepended. Empty = nothing to send (don't spam a context-only message).
let autoSendText = ''
let autoArmed = false

function sendInitialPrompt() {
  if (sentInitial || !autoSendText) return
  sentInitial = true
  clearTimeout(idleTimer)
  clearTimeout(hardTimer)
  api?.agentControl?.ptyInput({ sessionId: props.session.id, data: autoSendText + '\r' })
}

function onAgentOutput() {
  if (!autoArmed || sentInitial || !autoSendText) return
  if (!hardTimer) hardTimer = setTimeout(sendInitialPrompt, 4000)  // cap from first output
  clearTimeout(idleTimer)
  idleTimer = setTimeout(sendInitialPrompt, 900)                    // fire on first idle gap
}

onMounted(async () => {
  term = new Terminal({
    // Track the app's mono font (terminal must stay monospace — TUIs break with proportional).
    fontFamily: cssVar('--font-mono', 'ui-monospace, SFMono-Regular, Menlo, monospace'),
    fontSize: 12,
    allowTransparency: true,
    cursorBlink: true,
    convertEol: false,
    theme: buildTheme()
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(elRef.value)
  fit.fit()

  // Re-theme live when the user switches themes or toggles transparency/opacity on <html>.
  themeObserver = new MutationObserver(() => { if (term) term.options.theme = buildTheme() })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })

  // Keystrokes → PTY
  term.onData((data) => api?.agentControl?.ptyInput({ sessionId: props.session.id, data }))

  // PTY → terminal (filter to this session; ignore stray events after the term is disposed)
  api?.agentControl?.onPtyData(({ sessionId, data }) => {
    if (!term || sessionId !== props.session.id) return
    term.write(data)
    onAgentOutput()
  })
  api?.agentControl?.onPtyExit(({ sessionId, code }) => {
    if (!term || sessionId !== props.session.id) return
    term.write(`\r\n\x1b[90m[process exited${code != null ? ` (code ${code})` : ''}]\x1b[0m\r\n`)
    emit('exit', { code })
  })

  // Keep the PTY's dimensions matched to the rendered terminal.
  ro = new ResizeObserver(() => syncSize())
  ro.observe(elRef.value)

  // Listeners are attached — now spawn.
  const result = await api?.agentControl?.ptySpawn({
    sessionId: props.session.id,
    agentId: props.session.agentId,
    customBinary: props.session.binary,
    customArgs: props.session.args,
    cwd: props.session.cwd,
    cols: term.cols,
    rows: term.rows,
    mcpPort: props.session.mcpPort,
    systemPrompt: props.session.systemPrompt,
    colorScheme: isLightTheme() ? 'light' : 'dark'
  })

  if (result?.error) {
    term.write(`\r\n\x1b[31m${result.error}\x1b[0m\r\n`)
    if (result.installHint) term.write(`\x1b[90mInstall: ${result.installHint}\x1b[0m\r\n`)
    return
  }

  // Decide what to auto-type. Silent injection (Claude --append-system-prompt) means the context
  // is already in the system prompt, so we only type the user's prompt. Otherwise prepend the
  // one-line context — but only when there's a prompt; never send a lone context message.
  const userPrompt = (props.session.userPrompt || '').trim()
  if (result?.systemPromptInjected) {
    autoSendText = userPrompt
  } else if (userPrompt) {
    autoSendText = [props.session.systemPrompt, userPrompt].filter(Boolean).join('\n\n')
  }
  autoArmed = true
  if (autoSendText) onAgentOutput()  // arm timers in case output already settled before this point

  await nextTick()
  syncSize()
  term.focus()
})

onBeforeUnmount(() => {
  ro?.disconnect()
  themeObserver?.disconnect()
  clearTimeout(idleTimer)
  clearTimeout(hardTimer)
  // Drop the IPC listeners before disposing so a late pty:data/exit can't hit a dead terminal.
  api?.agentControl?.removeListeners?.()
  const t = term
  term = null
  t?.dispose()
})
</script>

<style scoped>
.agent-terminal {
  flex: 1;
  min-height: 0;
  display: flex;
  background: var(--bg-sidebar);
  overflow: hidden;
  padding: 6px 8px;
}
.agent-terminal-surface {
  flex: 1;
  min-height: 0;
}

.agent-terminal-surface :deep(.xterm),
.agent-terminal-surface :deep(.xterm .xterm-viewport),
.agent-terminal-surface :deep(.xterm .xterm-screen) {
  background: transparent !important;
}
</style>
