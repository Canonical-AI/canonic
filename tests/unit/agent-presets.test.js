import { describe, it, expect } from 'vitest'
const presets = await import('../../electron/agent-presets.js')

const get = (id) => presets.getPreset(id)

describe('agent-presets invocation map', () => {
  it('every preset exposes buildArgs, resumeArgs, outputFormat, efforts', () => {
    for (const p of presets.default) {
      expect(typeof p.buildArgs).toBe('function')
      expect(typeof p.resumeArgs).toBe('function')
      expect(p.outputFormat).toBeTruthy()
      expect(Array.isArray(p.efforts)).toBe(true)
    }
  })

  describe('claude-code', () => {
    const p = get('claude-code')
    it('uses stream-json structured output with pre-approved tools', () => {
      const args = p.buildArgs({})
      expect(args).toEqual([
        '-p', '--output-format', 'stream-json', '--verbose',
        '--allowedTools', 'mcp__canonic', 'Read', 'Edit', 'Write', 'Glob', 'Grep'
      ])
    })
    it('adds --model only when a concrete model is given', () => {
      expect(p.buildArgs({ model: 'claude-opus-4-1' })).toContain('--model')
      expect(p.buildArgs({ model: 'claude-opus-4-1' })).toContain('claude-opus-4-1')
      expect(p.buildArgs({ model: 'default' })).not.toContain('--model')
      expect(p.buildArgs({ model: '' })).not.toContain('--model')
    })
    it('ignores effort (no CLI flag)', () => {
      expect(p.buildArgs({ effort: 'high' })).not.toContain('high')
      expect(p.efforts).toEqual([])
    })
    it('resumeArgs passes the session id', () => {
      expect(p.resumeArgs('sess-123', {})).toEqual([
        '--resume', 'sess-123', '-p', '--output-format', 'stream-json', '--verbose',
        '--allowedTools', 'mcp__canonic', 'Read', 'Edit', 'Write', 'Glob', 'Grep'
      ])
    })
  })

  describe('terminal resume (interactive handoff)', () => {
    it('every preset gives an interactive resume command with no print/json flags', () => {
      for (const p of presets.default) {
        const args = p.terminalResumeArgs('SID')
        expect(args).toContain('SID')
        expect(args).not.toContain('-p')
        expect(args).not.toContain('--mode')
        expect(args).not.toContain('stream-json')
      }
    })
    it('claude resumes via --resume <id>', () => {
      expect(get('claude-code').terminalResumeArgs('abc')).toEqual(['--resume', 'abc'])
    })
    it('codex resumes via resume <id> (no exec)', () => {
      expect(get('codex').terminalResumeArgs('abc')).toEqual(['resume', 'abc'])
    })
  })

  describe('codex', () => {
    const p = get('codex')
    it('uses exec --json and supports reasoning effort', () => {
      const args = p.buildArgs({ model: 'gpt-5-codex', effort: 'high' })
      expect(args.slice(0, 2)).toEqual(['exec', '--json'])
      expect(args).toContain('-m')
      expect(args).toContain('gpt-5-codex')
      expect(args).toContain('-c')
      expect(args).toContain('model_reasoning_effort="high"')
      expect(p.efforts).toEqual(['low', 'medium', 'high'])
    })
    it('omits model/effort flags when not provided', () => {
      expect(p.buildArgs({})).toEqual(['exec', '--json'])
    })
    it('resumeArgs uses exec resume <id>', () => {
      expect(p.resumeArgs('abc', {}).slice(0, 3)).toEqual(['exec', 'resume', 'abc'])
    })
  })

  describe('gemini-cli', () => {
    const p = get('gemini-cli')
    it('puts -p last so the appended prompt follows it', () => {
      const args = p.buildArgs({ model: 'gemini-2.5-pro' })
      expect(args[args.length - 1]).toBe('-p')
      expect(args).toContain('--output-format')
      expect(args).toContain('json')
      expect(args).toContain('-m')
    })
  })

  describe('opencode', () => {
    const p = get('opencode')
    it('runs json events via run subcommand', () => {
      expect(p.outputFormat).toBe('jsonl')
      expect(p.buildArgs({})).toEqual(['run', '--format', 'json'])
      expect(p.buildArgs({ model: 'openai/gpt-5' })).toEqual(['run', '--format', 'json', '-m', 'openai/gpt-5'])
    })
    it('resumeArgs continues a session id with json events', () => {
      expect(p.resumeArgs('ses_abc', {})).toEqual(['run', '--session', 'ses_abc', '--format', 'json'])
    })
  })

  describe('pi', () => {
    const p = get('pi')
    it('uses --mode json', () => {
      expect(p.buildArgs({})).toEqual(['-p', '--mode', 'json'])
      expect(p.outputFormat).toBe('jsonl')
    })
  })

  describe('live model listing', () => {
    it('opencode + pi define modelsArgs + parseModels; claude/codex/gemini do not', () => {
      expect(typeof get('opencode').parseModels).toBe('function')
      expect(typeof get('pi').parseModels).toBe('function')
      expect(get('claude-code').modelsArgs).toBeUndefined()
      expect(get('codex').modelsArgs).toBeUndefined()
      expect(get('gemini-cli').modelsArgs).toBeUndefined()
    })

    it('opencode.parseModels keeps provider/model lines, drops junk', () => {
      const out = '# Available models\nanthropic/claude-sonnet-4-5\nopenai/gpt-5\n\n  google/gemini-2.5-flash  \nnonsense-line'
      expect(get('opencode').parseModels(out)).toEqual([
        'anthropic/claude-sonnet-4-5', 'openai/gpt-5', 'google/gemini-2.5-flash'
      ])
    })

    it('pi.parseModels strips bullets and header rows', () => {
      const out = 'Available models:\n  - claude-sonnet-4-5\n  * gpt-5\ngemini-2.5-flash   provider'
      expect(get('pi').parseModels(out)).toEqual([
        'claude-sonnet-4-5', 'gpt-5', 'gemini-2.5-flash'
      ])
    })
  })
})

describe('agent-runner listModels', () => {
  it('falls back to curated knownModels for agents without a list command', async () => {
    const runner = await import('../../electron/agent-runner.js')
    const res = await runner.listModels('claude-code')
    expect(res.source).toBe('known')
    expect(res.models).toContain('claude-sonnet-4-5')
    expect(res.defaultModel).toBe('claude-sonnet-4-5')
  })

  it('returns empty source none for unknown agent', async () => {
    const runner = await import('../../electron/agent-runner.js')
    const res = await runner.listModels('does-not-exist')
    expect(res.source).toBe('none')
    expect(res.models).toEqual([])
  })
})
