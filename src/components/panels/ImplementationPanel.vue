<template>
  <div class="ai-control">
    <!-- ── Header: Agent selector + model/effort ── -->
    <div class="ac-header">
      <div class="ac-header-left">
        <AgentSelector
          :agents="store.configuredAgents"
          :active-agent="activeAgentObj"
          :presets="store.agentPresets"
          @select="store.setActiveAgent($event.id)"
          @add-preset="onAddPreset"
          @add-custom="onAddCustom"
        />
      </div>
      <div class="ac-header-right">
        <button
          v-if="activeAgentObj"
          class="popout-btn"
          :disabled="!store.terminalSession"
          title="Open this session in your system terminal"
          @click="popOut"
        >
          <ExternalLink :size="12" /> Pop out
        </button>
      </div>
    </div>

    <!-- ── Flavor pills ── -->
    <div class="ac-flavor-row">
      <FlavorPills v-model="flavorRef" @update:model-value="store.setActiveFlavor($event)" />

      <div v-if="store.activeFlavor === 'implementer'" class="target-dir" @click="store.pickTargetDirectory()" title="Click to change target directory">
        <Folder :size="12" />
        <span>{{ store.targetDir || store.workspacePath || 'No directory set' }}</span>
      </div>
    </div>

    <!-- ── Status line ── -->
    <div v-if="activeAgentObj && store.controlStatus !== 'idle'" class="ac-status">
      <span class="status-agent">{{ activeAgentObj.name }}</span>
      <span class="status-sep">·</span>
      <span class="status-cwd">{{ shortCwd }}</span>
      <span class="status-sep">·</span>
      <span class="status-dot" :class="statusClass" />
      <span class="status-label">{{ statusLabel }}</span>
      <span v-if="store.controlTokenCount > 0" class="status-tokens">~{{ store.controlTokenCount }} tok</span>
    </div>

    <!-- ── Terminal body: agent's native interactive TUI, embedded ── -->
    <div class="ac-terminal-body">
      <div v-if="store.configuredAgents.length === 0" class="ac-empty">
        <Bot :size="32" />
        <p class="empty-title">No agents configured</p>
        <p class="empty-hint">Add a coding agent to run it inside Canonic.</p>
        <button class="empty-btn" @click="openSettings">Configure an agent</button>
      </div>

      <div v-else-if="!store.terminalSession" class="ac-intro">
        <Bot :size="24" />
        <p class="intro-title">{{ activeAgentObj?.name || 'Agent' }} ready</p>
        <p class="intro-hint">Runs interactively here, with Canonic workspace access via MCP.</p>
        <textarea
          v-model="startPrompt"
          class="intro-prompt"
          rows="3"
          placeholder="Optional: first message — auto-sent once the agent loads…"
          @keydown.enter.meta.prevent="startTerminal"
        />
        <button class="empty-btn" :disabled="!activeAgentObj" @click="startTerminal">
          <Play :size="14" /> Start {{ activeAgentObj?.name || 'agent' }}
        </button>
      </div>

      <AgentTerminal
        v-else
        :key="store.terminalSession.id"
        :session="store.terminalSession"
        @exit="onTerminalExit"
      />
    </div>

    <!-- ── Session controls ── -->
    <div v-if="store.terminalSession" class="ac-input-area">
      <div class="ac-actions">
        <span class="term-running">
          <span class="status-dot" :class="{ active: !terminalExited }" />
          {{ store.terminalSession.agentName }} · {{ shortCwd }}
        </span>
        <button class="action-btn accent" @click="endTerminal">
          <Square :size="12" /> {{ terminalExited ? 'Close' : 'End session' }}
        </button>
      </div>
    </div>

    <SessionHistory
      :sessions="store.controlHistory"
      @delete="store.deleteControlHistoryEntry($event)"
      @resume="resumeFromHistory"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '../../store'
import {
  Bot, Folder, Square, Play, ExternalLink
} from 'lucide-vue-next'
import AgentSelector from '../implementation/AgentSelector.vue'
import FlavorPills from '../implementation/FlavorPills.vue'
import SessionHistory from '../implementation/SessionHistory.vue'
import AgentTerminal from '../implementation/AgentTerminal.vue'

const store = useAppStore()
const terminalExited = ref(false)
const startPrompt = ref('')

const flavorRef = computed({
  get: () => store.activeFlavor,
  set: (v) => store.setActiveFlavor(v)
})

const activeAgentObj = computed(() =>
  store.configuredAgents.find(a => a.id === store.activeAgentId) || null
)

const shortCwd = computed(() => {
  const dir = store.targetDir || store.workspacePath || ''
  if (!dir) return ''
  return dir.split('/').slice(-2).join('/') || dir
})

const statusClass = computed(() => {
  switch (store.controlStatus) {
    case 'running': return 'status-running'
    case 'starting': return 'status-running'
    case 'ended': return 'status-ended'
    case 'error': return 'status-error'
    default: return ''
  }
})

const statusLabel = computed(() => {
  switch (store.controlStatus) {
    case 'idle': return 'Ready'
    case 'starting': return 'Starting'
    case 'running': return 'Running'
    case 'ended': return 'Ended'
    case 'error': return 'Error'
    default: return store.controlStatus
  }
})

onMounted(async () => {
  await store.loadAgentPresets()
  await store.loadConfiguredAgents()
  store.hydrateAgentControlPrefs()
  await store.loadControlHistory()
  await store.loadMcpPort()
})

async function startTerminal() {
  terminalExited.value = false
  await store.startTerminalSession({ prompt: startPrompt.value })
  startPrompt.value = ''
}

function endTerminal() {
  store.endTerminalSession()
  terminalExited.value = false
}

function onTerminalExit() {
  // Agent process ended — keep the final output on screen until the user closes it.
  terminalExited.value = true
}

async function popOut() {
  await store.popOutTerminal()
}

// Re-launch a past session in a fresh embedded terminal (same agent + cwd + prompt).
async function resumeFromHistory(entry) {
  terminalExited.value = false
  await store.resumeTerminalFromHistory(entry)
}

function onAddPreset(preset) {
  store.setActiveAgent(preset.id)
}

async function onAddCustom(config) {
  await store.addCustomAgent(config)
  const last = store.configuredAgents[store.configuredAgents.length - 1]
  if (last) store.setActiveAgent(last.id)
}

function openSettings() {
  window.dispatchEvent(new CustomEvent('canonic:open-settings'))
}
</script>

<style scoped>
.ai-control {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-sidebar);
  color: var(--text-primary);
}

.ac-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ac-header-left { flex-shrink: 0; }
.ac-header-right { display: flex; gap: 4px; align-items: center; }

.popout-btn {
  padding: 3px 8px;
  background: var(--bg-active);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 0.68rem;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: background 0.12s, color 0.12s;
}

.popout-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.popout-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.ac-flavor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.target-dir {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
  transition: color 0.12s;
}

.target-dir:hover { color: var(--text-secondary); }

.ac-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 0.65rem;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.status-sep { opacity: 0.4; }

.status-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-running { background: var(--accent); animation: ac-pulse 1.5s infinite; }
.status-ended { background: #7ab87a; }
.status-error { background: #e05555; }

@keyframes ac-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.status-label { text-transform: capitalize; }
.status-tokens { margin-left: auto; font-family: var(--font-mono, monospace); }

.ac-terminal-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.term-running {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.ac-empty, .ac-intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-muted);
  text-align: center;
  padding: 20px;
}

.empty-title, .intro-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.empty-hint, .intro-hint {
  font-size: 0.75rem;
  margin: 0;
  max-width: 200px;
  color: var(--text-secondary);
}

.empty-btn {
  margin-top: 8px;
  padding: 6px 14px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: opacity 0.12s;
}

.empty-btn:hover { opacity: 0.88; }
.empty-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.intro-prompt {
  margin-top: 8px;
  width: 100%;
  max-width: 320px;
  resize: none;
  padding: 8px 10px;
  background: var(--bg-editor);
  color: var(--text-primary);
  border: 1px solid var(--bg-hover);
  border-radius: 6px;
  font-size: 0.78rem;
  font-family: inherit;
  line-height: 1.4;
  text-align: left;
}
.intro-prompt:focus {
  outline: none;
  border-color: var(--accent);
}
.intro-prompt::placeholder { color: var(--text-muted); }

.thinking-indicator {
  padding: 4px 0;
  font-size: 0.72rem;
  color: var(--text-muted);
  font-style: italic;
  display: flex;
  align-items: center;
  gap: 4px;
}

.thinking-dots span {
  animation: ac-dot-blink 1.4s infinite;
  animation-fill-mode: both;
}
.thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes ac-dot-blink {
  0%, 80%, 100% { opacity: 0; }
  40% { opacity: 1; }
}

.token-count { margin-left: auto; font-family: var(--font-mono, monospace); font-style: normal; }

.ac-input-area {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  padding: 8px 8px 4px;
}

.ac-input-row { display: flex; gap: 6px; align-items: flex-end; }

.ac-input {
  flex: 1;
  padding: 7px 10px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.8rem;
  font-family: inherit;
  resize: none;
  outline: none;
  line-height: 1.4;
  max-height: 120px;
  transition: border-color 0.12s;
}

.ac-input:focus { border-color: var(--accent); }
.ac-input:disabled { opacity: 0.4; }

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px; height: 34px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.12s;
}

.send-btn:hover:not(:disabled) { opacity: 0.88; }
.send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.stop-btn { background: #d44; }
.stop-btn:hover { background: #c33; }

.ac-actions { display: flex; gap: 6px; padding: 4px 0; }

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-muted);
  font-size: 0.72rem;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}

.action-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
.action-btn.accent { background: var(--accent); color: #fff; border-color: var(--accent); }
.action-btn.accent:hover { opacity: 0.88; }

.terminal-toast {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  margin: 0 8px 4px;
  background: var(--bg-active);
  border: 1px solid var(--accent-muted);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  animation: ac-toast-in 0.2s ease;
}

.terminal-toast code {
  font-family: var(--font-mono, monospace);
  font-size: 0.68rem;
  color: var(--accent-light);
}

@keyframes ac-toast-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
