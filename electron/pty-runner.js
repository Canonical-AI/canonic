// PTY Runner — spawns external coding agents in a pseudo-terminal so their NATIVE interactive
// TUI runs inside Canonic's embedded terminal. Unlike the headless `-p`/exec path, we parse
// nothing: the agent owns its turns, permission prompts, session memory, and resume. This is
// the consistent layer — every CLI has a working interactive mode; only headless modes diverge.

const pty = require('node-pty')
const presets = require('./agent-presets')

// sessionId → pty process
const sessions = new Map()

/**
 * Spawn an agent interactively in a PTY.
 * @param {Object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.agentId   - preset id or 'custom'
 * @param {string} [opts.binary]  - custom binary
 * @param {string[]} [opts.args]  - custom args
 * @param {string} opts.cwd       - working directory (workspace)
 * @param {number} [opts.cols]
 * @param {number} [opts.rows]
 * @param {number} opts.mcpPort   - live Canonic MCP server port
 * @param {string} [opts.systemPrompt] - context to inject silently via a CLI flag if supported
 * @param {Object} callbacks      - { onData(sessionId, data), onExit(sessionId, code, signal) }
 * @returns {Object} { ok, sessionId, pid, systemPromptInjected } — systemPromptInjected is true
 *   when the context went in silently as args (caller should NOT also type it into the TUI).
 */
function spawn(opts, callbacks) {
  const { sessionId, agentId, binary, args, cwd, cols, rows, mcpPort, systemPrompt } = opts

  let execBin, execArgs
  let systemPromptInjected = false
  if (agentId === 'custom') {
    execBin = binary
    execArgs = Array.isArray(args) ? [...args] : []
  } else {
    const preset = presets.getPreset(agentId)
    if (!preset) throw new Error(`Unknown agent preset: ${agentId}`)
    execBin = preset.binary
    execArgs = []  // bare interactive — no -p/--json; the agent's TUI drives the session
    // Inject Canonic context silently if this CLI supports a system-prompt flag.
    if (systemPrompt && typeof preset.systemPromptArgs === 'function') {
      execArgs.push(...preset.systemPromptArgs(systemPrompt))
      systemPromptInjected = true
    }
  }

  const env = {
    ...process.env,
    CANONIC_MCP_URL: `http://127.0.0.1:${mcpPort}/mcp`,
    CANONIC_MCP_SSE: `http://127.0.0.1:${mcpPort}/sse`,
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    TERM: 'xterm-256color'
  }

  const proc = pty.spawn(execBin, execArgs, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 30,
    cwd: cwd || process.cwd(),
    env
  })

  proc.onData((data) => callbacks.onData?.(sessionId, data))
  proc.onExit(({ exitCode, signal }) => {
    callbacks.onExit?.(sessionId, exitCode, signal)
    sessions.delete(sessionId)
  })

  sessions.set(sessionId, proc)
  return { ok: true, sessionId, pid: proc.pid, systemPromptInjected }
}

function write(sessionId, data) {
  const proc = sessions.get(sessionId)
  if (!proc) return { error: 'session not found' }
  proc.write(data)
  return { ok: true }
}

function resize(sessionId, cols, rows) {
  const proc = sessions.get(sessionId)
  if (!proc) return { error: 'session not found' }
  try { proc.resize(Math.max(1, cols | 0), Math.max(1, rows | 0)) } catch { /* race on exit */ }
  return { ok: true }
}

function kill(sessionId) {
  const proc = sessions.get(sessionId)
  if (!proc) return { error: 'session not found' }
  try { proc.kill() } catch { /* already gone */ }
  sessions.delete(sessionId)
  return { ok: true }
}

function isRunning(sessionId) {
  return sessions.has(sessionId)
}

module.exports = { spawn, write, resize, kill, isRunning }
