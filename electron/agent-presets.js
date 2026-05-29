// Agent preset definitions for AI Control.
// Each preset defines how to detect, launch, resume, and configure an external coding agent.
//
// Invocation model — each preset is self-describing so agent-runner stays generic:
//   buildArgs({ model, effort })  -> string[]   args before the prompt (structured-output + model + effort flags)
//   resumeArgs(sessionId, opts)   -> string[]   args to resume a prior session
//   promptMode: 'arg' | 'stdin'                 how the prompt is delivered (default 'arg' = positional, appended last)
//   outputFormat: 'stream-json' | 'json' | 'text'   how the agent's stdout should be parsed
//   efforts: string[]                           reasoning-effort levels the agent accepts ([] = no effort control)
//
// Model/effort flags are only emitted when a concrete value is supplied. Until a session
// starts the UI shows "default" and passes empty values, so the agent uses its own default.

const os = require('os')
const path = require('path')
const { execSync } = require('child_process')

const HOME = os.homedir()

// A model value the UI uses before a session has reported its real model.
// buildArgs treats this (and empty) as "let the agent decide".
const DEFAULT_SENTINELS = new Set(['', 'default', null, undefined])
function hasValue(v) { return !DEFAULT_SENTINELS.has(v) }

const PRESETS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    binary: 'claude',
    // Prompt via stdin, NOT argv: `--allowedTools` is variadic and would otherwise swallow a
    // trailing positional prompt. stdin also keeps long injected prompts off the arg list.
    promptMode: 'stdin',
    outputFormat: 'stream-json',
    efforts: [],  // Claude Code has no CLI reasoning-effort flag
    // Pre-approve the canonic MCP tools plus read/edit/nav file tools so headless `-p` runs
    // don't stall on permission prompts (which can't be answered non-interactively). Bash and
    // other tools stay gated.
    allowedTools: ['mcp__canonic', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
    buildArgs({ model } = {}) {
      const args = ['-p', '--output-format', 'stream-json', '--verbose', '--allowedTools', ...this.allowedTools]
      if (hasValue(model)) args.push('--model', model)
      return args
    },
    resumeArgs(sessionId, { model } = {}) {
      const args = ['--resume', sessionId, '-p', '--output-format', 'stream-json', '--verbose', '--allowedTools', ...this.allowedTools]
      if (hasValue(model)) args.push('--model', model)
      return args
    },
    continueArgs: ['-c'],  // bare `claude -c` reopens last session in interactive TUI for handoff
    // Interactive resume command for terminal handoff — NO print/json flags, so it opens the TUI.
    terminalResumeArgs: (sessionId) => ['--resume', sessionId],
    // Silent context injection for the embedded TUI: `--append-system-prompt` adds to the system
    // prompt without printing anything into the conversation. Lets us prime Canonic context
    // without a visible wall of text.
    systemPromptArgs: (text) => ['--append-system-prompt', text],
    mcpConfigPath: path.join(HOME, '.claude.json'),
    mcpConfigKey: 'mcpServers.canonic',
    mcpConfigFormat: 'json',
    // Streamable-HTTP transport (POST /mcp). Our /sse handshake is incomplete (never sends
    // `event: endpoint`), so SSE clients hang "connecting" forever. /mcp works correctly.
    mcpEntryTemplate: (port) => ({
      type: 'http',
      url: `http://127.0.0.1:${port}/mcp`
    }),
    structuredOutput: true,
    installHint: 'npm install -g @anthropic-ai/claude-code',
    knownModels: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-3-5'],
    defaultModel: 'claude-sonnet-4-5'
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    binary: 'gemini',
    promptMode: 'arg',         // `gemini ... -p "<prompt>"` — `-p` left last so prompt follows it
    outputFormat: 'json',      // single JSON object on stdout at completion
    efforts: [],
    buildArgs({ model } = {}) {
      const args = ['--output-format', 'json']
      if (hasValue(model)) args.push('-m', model)
      args.push('-p')
      return args
    },
    resumeArgs(sessionId, { model } = {}) {
      const args = ['--resume', sessionId, '--output-format', 'json']
      if (hasValue(model)) args.push('-m', model)
      args.push('-p')
      return args
    },
    continueArgs: ['--resume'],
    terminalResumeArgs: (sessionId) => ['--resume', sessionId],
    mcpConfigPath: path.join(HOME, '.gemini', 'settings.json'),
    mcpConfigKey: 'mcpServers.canonic',
    mcpConfigFormat: 'json',
    // Gemini: `httpUrl` selects streamable-HTTP transport; plain `url` would be the broken SSE.
    mcpEntryTemplate: (port) => ({
      httpUrl: `http://127.0.0.1:${port}/mcp`
    }),
    structuredOutput: true,
    installHint: 'npm install -g @google/gemini-cli',
    knownModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash'
  },
  {
    id: 'codex',
    name: 'Codex',
    binary: 'codex',
    promptMode: 'arg',
    outputFormat: 'jsonl',     // JSONL event stream via `exec --json`
    efforts: ['low', 'medium', 'high'],  // model_reasoning_effort
    buildArgs({ model, effort } = {}) {
      const args = ['exec', '--json']
      if (hasValue(model)) args.push('-m', model)
      if (hasValue(effort)) args.push('-c', `model_reasoning_effort="${effort}"`)
      return args
    },
    resumeArgs(sessionId, { model, effort } = {}) {
      const args = ['exec', 'resume', sessionId, '--json']
      if (hasValue(model)) args.push('-m', model)
      if (hasValue(effort)) args.push('-c', `model_reasoning_effort="${effort}"`)
      return args
    },
    resumeLastArgs: ['exec', 'resume', '--last'],
    terminalResumeArgs: (sessionId) => ['resume', sessionId],  // interactive TUI resume (no exec)
    mcpConfigPath: path.join(HOME, '.codex', 'config.toml'),
    mcpConfigKey: 'mcp_servers.canonic',
    mcpConfigFormat: 'toml',
    mcpEntryTemplate: (port) => '' +
      `[mcp_servers.canonic]\n` +
      `url = "http://127.0.0.1:${port}/mcp"\n`,
    structuredOutput: true,
    installHint: 'npm install -g @openai/codex',
    knownModels: ['gpt-5-codex', 'gpt-5', 'o4-mini', 'gpt-4.1'],
    defaultModel: 'gpt-5-codex'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    binary: 'opencode',
    promptMode: 'arg',
    outputFormat: 'jsonl',     // `--format json` emits one JSON event per line
    efforts: [],
    buildArgs({ model } = {}) {
      const args = ['run', '--format', 'json']
      if (hasValue(model)) args.push('-m', model)  // provider/model form
      return args
    },
    resumeArgs(sessionId, { model } = {}) {
      // Re-spawn against the prior session id; keep --format json so follow-ups parse too.
      const args = ['run', '--session', sessionId, '--format', 'json']
      if (hasValue(model)) args.push('-m', model)
      return args
    },
    continueArgs: ['run', '-c'],  // resume most recent session (no captured id)
    terminalResumeArgs: (sessionId) => ['--session', sessionId],
    mcpConfigPath: path.join(HOME, '.config', 'opencode', 'opencode.json'),
    // OpenCode's schema uses `mcp.<name>` with type "remote" (NOT a top-level `mcpServers`
    // object — that key fails schema validation and bricks the whole config).
    mcpConfigKey: 'mcp.canonic',
    mcpConfigFormat: 'json',
    mcpEntryTemplate: (port) => ({
      type: 'remote',
      url: `http://127.0.0.1:${port}/mcp`,
      enabled: true
    }),
    structuredOutput: false,
    installHint: 'npm install -g opencode-ai',
    // `opencode models` prints one `provider/model` per line.
    modelsArgs: ['models'],
    parseModels: (stdout) => stdout
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('/') && !l.startsWith('#')),
    knownModels: ['anthropic/claude-sonnet-4-5', 'openai/gpt-5', 'google/gemini-2.5-flash'],
    defaultModel: 'anthropic/claude-sonnet-4-5'
  },
  {
    id: 'pi',
    name: 'Pi',
    binary: 'pi',
    promptMode: 'arg',
    outputFormat: 'jsonl',     // `--mode json` emits JSONL events
    efforts: [],
    buildArgs({ model } = {}) {
      const args = ['-p', '--mode', 'json']
      if (hasValue(model)) args.push('--model', model)
      return args
    },
    resumeArgs(sessionId, { model } = {}) {
      const args = ['--session', sessionId, '-p', '--mode', 'json']
      if (hasValue(model)) args.push('--model', model)
      return args
    },
    continueArgs: ['--continue'],
    terminalResumeArgs: (sessionId) => ['--session', sessionId],
    // Pi supports silent injection like Claude: --append-system-prompt keeps the context out of
    // the visible chat so the terminal only shows the user's prompt.
    systemPromptArgs: (text) => ['--append-system-prompt', text],
    // Pi prefers inline context over MCP: its tool calls are permission-gated, so instead of
    // wiring the MCP server we inject the live workspace data into the prompt and let Pi use
    // its built-in file tools to edit docs directly in the working dir.
    injectContext: true,
    mcpConfigPath: path.join(HOME, '.pi', 'agent', 'mcp.json'),
    mcpConfigKey: 'mcpServers.canonic',
    mcpConfigFormat: 'json',
    mcpEntryTemplate: (port) => ({
      transport: 'sse',
      url: `http://127.0.0.1:${port}/sse`
    }),
    structuredOutput: true,
    installHint: 'npm install -g @earendil-works/pi-coding-agent',
    // Best-effort: `pi models` lists available model ids (one per line, may have bullets/cols).
    modelsArgs: ['models'],
    parseModels: (stdout) => stdout
      .split('\n')
      .map(l => l.replace(/^[\s*\-•]+/, '').trim())
      .map(l => l.split(/\s{2,}|\t/)[0].trim())  // first column if tabular
      .filter(l => l && !/^(models?|available|name|id)\b/i.test(l)),
    knownModels: ['claude-sonnet-4-5', 'gemini-2.5-flash', 'gpt-5'],
    defaultModel: 'claude-sonnet-4-5'
  }
]

// ── Helper to find a preset by ID ──
function getPreset(id) {
  return PRESETS.find(p => p.id === id) || null
}

// ── Check if a binary is installed (available on PATH) ──
function isInstalled(binary) {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${binary}` : `which ${binary}`
    execSync(checkCmd, { stdio: 'ignore', timeout: 3000 })
    return true
  } catch {
    return false
  }
}

module.exports = PRESETS
module.exports.getPreset = getPreset
module.exports.isInstalled = isInstalled
module.exports.hasValue = hasValue
