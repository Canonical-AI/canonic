// Agent Runner — spawns and manages external coding agent processes.
// Each process runs in the user's target directory with Canonic MCP server URL injected as env.

const { spawn, execFile } = require('child_process')
const path = require('path')
const presets = require('./agent-presets')

// ── Active sessions (in-process) ──────────────────────────────────────────────
const sessions = new Map()  // sessionId → { child, preset, cwd, startedAt, model, effort }

/**
 * Start a new agent session.
 * @param {Object} opts
 * @param {string} opts.sessionId - Unique ID for this session
 * @param {string} opts.agentId - Preset ID (e.g. 'claude-code') or 'custom'
 * @param {string} [opts.binary] - Override binary path (for custom agents)
 * @param {string[]} [opts.args] - Override args (for custom agents)
 * @param {string} opts.cwd - Working directory
 * @param {string} [opts.prompt] - Initial prompt (if any)
 * @param {string} [opts.model] - Model name to pass to agent
 * @param {string} [opts.effort] - Effort level (low/medium/high)
 * @param {number} mcpPort - Port of Canonic MCP server
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onStdout - (sessionId, text) => void
 * @param {Function} callbacks.onStderr - (sessionId, text) => void
 * @param {Function} callbacks.onExit - (sessionId, code, signal) => void
 * @param {Function} callbacks.onError - (sessionId, error) => void
 */
function start(opts, callbacks) {
  const { sessionId, agentId, binary, args, cwd, prompt, model, effort, mcpPort } = opts

  let execBin, execArgs, promptMode

  if (agentId === 'custom') {
    execBin = binary
    // Custom agents run in raw-text mode with whatever args the user supplied.
    execArgs = Array.isArray(args) ? [...args] : []
    promptMode = 'arg'
  } else {
    const preset = presets.getPreset(agentId)
    if (!preset) throw new Error(`Unknown agent preset: ${agentId}`)
    execBin = preset.binary
    // Pre-built args (from resume) win; otherwise derive from the preset's invocation map.
    execArgs = Array.isArray(args) ? [...args] : preset.buildArgs({ model, effort })
    promptMode = preset.promptMode || 'arg'
  }

  // Deliver the prompt. promptMode 'arg' appends it as a positional arg (most agents in
  // -p/print mode); 'stdin' writes it after spawn. Must happen BEFORE spawn for 'arg'.
  if (prompt && promptMode === 'arg') {
    execArgs.push(prompt)
  }

  // Build environment with MCP server URL
  const env = {
    ...process.env,
    CANONIC_MCP_URL: `http://127.0.0.1:${mcpPort}/mcp`,
    CANONIC_MCP_SSE: `http://127.0.0.1:${mcpPort}/sse`,
    // Gemini CLI refuses to run headless in an "untrusted" folder; the user's own workspace
    // is theirs to trust, and without this it errors out instead of producing output.
    GEMINI_CLI_TRUST_WORKSPACE: 'true'
  }

  const child = spawn(execBin, execArgs, {
    cwd: cwd || process.cwd(),
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false  // Use exact binary
  })

  // Buffer for stdout line parsing
  let stdoutBuf = ''

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString()
    // Emit chunks for streaming display
    callbacks.onStdout?.(sessionId, chunk.toString())

    // Flush buffer periodically for tool call detection
    const lines = stdoutBuf.split('\n')
    if (lines.length > 1) {
      stdoutBuf = lines.pop() || ''  // Keep incomplete last line in buffer
    }
  })

  child.stderr.on('data', (chunk) => {
    callbacks.onStderr?.(sessionId, chunk.toString())
  })

  child.on('error', (err) => {
    callbacks.onError?.(sessionId, err.message)
    sessions.delete(sessionId)
  })

  child.on('exit', (code, signal) => {
    callbacks.onExit?.(sessionId, code, signal)
    sessions.delete(sessionId)
  })

  // Finalize prompt delivery: 'stdin' agents read the prompt then EOF; 'arg' agents
  // already have it in argv, so just close stdin so non-TTY agents don't block.
  if (prompt && promptMode === 'stdin') {
    child.stdin.write(prompt + '\n')
  }
  child.stdin.end()

  sessions.set(sessionId, {
    child,
    agentId,
    binary: execBin,
    cwd,
    startedAt: Date.now(),
    model,
    effort,
    promptMode
  })

  return { ok: true, sessionId, pid: child.pid }
}

/**
 * Send a message/prompt to a running session.
 */
function send(sessionId, prompt) {
  const session = sessions.get(sessionId)
  if (!session) return { error: 'session not found' }
  
  if (session.child.stdin.writable) {
    session.child.stdin.write(prompt + '\n')
    return { ok: true }
  }
  return { error: 'stdin not writable (session may have ended)' }
}

/**
 * Stop a running session.
 */
function stop(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return { error: 'session not found' }
  
  session.child.kill('SIGTERM')
  
  // Force kill after 5s if still running
  setTimeout(() => {
    if (session.child.exitCode === null) {
      session.child.kill('SIGKILL')
    }
  }, 5000)
  
  return { ok: true }
}

/**
 * Resume a previous session by session ID (passes --resume to agent).
 */
function resume(sessionId, previousSessionId, prompt, opts, callbacks) {
  // For resume, we re-spawn with resume args. Prompt is delivered by start() per the
  // agent's promptMode, so we only build the resume args here (no prompt append).
  const { agentId, binary, cwd, model, effort, mcpPort } = opts

  let execArgs

  if (agentId === 'custom') {
    execArgs = []  // Custom agents: user must specify resume args
  } else {
    const preset = presets.getPreset(agentId)
    if (!preset) throw new Error(`Unknown agent preset: ${agentId}`)
    execArgs = preset.resumeArgs(previousSessionId, { model, effort })
  }

  return start(
    { sessionId, agentId, binary, args: execArgs, cwd, prompt, model, effort, mcpPort },
    callbacks
  )
}

/**
 * Check if a session is running.
 */
function isRunning(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return false
  return session.child.exitCode === null
}

/**
 * Get session info.
 */
function getSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return null
  return {
    sessionId,
    agentId: session.agentId,
    binary: session.binary,
    cwd: session.cwd,
    startedAt: session.startedAt,
    model: session.model,
    effort: session.effort,
    pid: session.child.pid,
    running: session.child.exitCode === null
  }
}

/**
 * Get all active session IDs.
 */
function listSessions() {
  return Array.from(sessions.keys())
}

/**
 * Fetch available models for an agent. If the preset defines `modelsArgs`, shells the
 * binary to enumerate models live, then merges with curated `knownModels`. Falls back to
 * `knownModels` when the binary is missing, has no list command, or the call fails/times out.
 * @returns {Promise<{models:string[], defaultModel?:string, source:'cli'|'known'|'none'}>}
 */
function listModels(agentId) {
  return new Promise((resolve) => {
    const preset = presets.getPreset(agentId)
    if (!preset) return resolve({ models: [], source: 'none' })

    const known = preset.knownModels || []
    const fallback = { models: known, defaultModel: preset.defaultModel, source: 'known' }

    // No live-list command, or binary not installed → curated list.
    if (!preset.modelsArgs || typeof preset.parseModels !== 'function' || !presets.isInstalled(preset.binary)) {
      return resolve(fallback)
    }

    execFile(preset.binary, preset.modelsArgs, { timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(fallback)
      let parsed = []
      try { parsed = preset.parseModels(stdout) || [] } catch { parsed = [] }
      if (!parsed.length) return resolve(fallback)
      // Live models first, then any curated ones not already present.
      const merged = [...new Set([...parsed, ...known])]
      resolve({ models: merged, defaultModel: preset.defaultModel, source: 'cli' })
    })
  })
}

/**
 * Check if a preset agent binary is installed.
 */
function checkInstalled(agentId) {
  const preset = presets.getPreset(agentId)
  if (!preset) return { installed: false, error: 'unknown preset' }
  return { installed: presets.isInstalled(preset.binary), binary: preset.binary }
}

module.exports = {
  start,
  send,
  stop,
  resume,
  isRunning,
  getSession,
  listSessions,
  listModels,
  checkInstalled
}
