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
          class="model-btn"
          @click="showModelPicker = !showModelPicker"
        >
          {{ store.activeModel || 'Default model' }}
          <ChevronDown :size="10" />
        </button>
        <button
          v-if="activeAgentObj"
          class="effort-btn"
          @click="cycleEffort"
          title="Click to cycle effort level"
        >
          {{ store.activeEffort }}
        </button>
      </div>
    </div>

    <!-- ── Model picker dropdown ── -->
    <div v-if="showModelPicker" class="model-picker">
      <div v-if="store.modelsLoading" class="model-loading">
        <Loader2 :size="13" class="spin" />
        <span>Loading models…</span>
      </div>
      <div v-else-if="store.availableModels.length > 0" class="model-list">
        <div
          v-for="m in store.availableModels"
          :key="m"
          :class="['model-item', { active: store.activeModel === m }]"
          @click="applyModelPreset(m)"
        >
          {{ m }}
        </div>
      </div>
      <div v-else class="model-empty">
        No model list from this CLI — type one below{{ store.defaultModelHint ? ` (default: ${store.defaultModelHint})` : '' }}.
      </div>
      <div class="model-custom-row">
        <input
          v-model="modelInput"
          class="model-input"
          placeholder="Or type custom model..."
          @keydown.enter="applyModel"
          @keydown.escape="showModelPicker = false"
          ref="modelInputRef"
        />
        <button class="model-apply" @click="applyModel">Set</button>
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
      <span class="status-model">{{ store.activeModel || 'default' }}</span>
      <span class="status-sep">·</span>
      <span class="status-cwd">{{ shortCwd }}</span>
      <span class="status-sep">·</span>
      <span class="status-dot" :class="statusClass" />
      <span class="status-label">{{ statusLabel }}</span>
      <span v-if="store.controlTokenCount > 0" class="status-tokens">~{{ store.controlTokenCount }} tok</span>
    </div>

    <!-- ── Chat body ── -->
    <div class="ac-chat" ref="chatBodyRef">
      <div v-if="store.configuredAgents.length === 0" class="ac-empty">
        <Bot :size="32" />
        <p class="empty-title">No agents configured</p>
        <p class="empty-hint">Add a coding agent to start implementing from Canonic.</p>
        <button class="empty-btn" @click="openSettings">Configure an agent</button>
      </div>

      <div v-else-if="!store.controlSession && store.controlStatus === 'idle'" class="ac-intro">
        <Bot :size="24" />
        <p class="intro-title">{{ activeAgentObj?.name || 'Agent' }} ready</p>
        <p class="intro-hint">
          {{ store.activeFlavor === 'reviewer' ? 'Agent will review docs and write comments.' : 'Agent will implement changes in the target directory.' }}
        </p>
      </div>

      <ChatMessage
        v-for="msg in store.controlMessages"
        :key="msg.id"
        :role="msg.role"
        :content="msg.content"
        :type="msg.type"
        :tool-name="msg.toolName"
        :tool-summary="msg.toolSummary"
        :timestamp="msg.timestamp"
      />

      <div v-if="store.controlStatus === 'running' || store.controlStatus === 'starting'" class="thinking-indicator">
        <span class="thinking-label">{{ store.controlStatus === 'starting' ? 'Starting agent' : 'Thinking' }}</span>
        <span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
        <span v-if="store.controlTokenCount > 0" class="token-count">~{{ store.controlTokenCount }} tokens</span>
      </div>
    </div>

    <!-- ── Input area ── -->
    <div class="ac-input-area">
      <div class="ac-input-row">
        <textarea
          ref="inputRef"
          v-model="userInput"
          class="ac-input"
          placeholder="Give a prompt to your agent..."
          rows="2"
          :disabled="!activeAgentObj"
          @keydown.enter="handleEnter"
          @keydown.escape="handleEscape"
        />
        <button
          v-if="store.controlStatus === 'running'"
          class="send-btn stop-btn"
          @click="store.stopControlSession()"
          title="Stop session"
        >
          <Square :size="14" />
        </button>
        <button
          v-else
          class="send-btn"
          :disabled="!userInput.trim() || !activeAgentObj"
          @click="sendMessage"
          title="Send"
        >
          <SendHorizonal :size="14" />
        </button>
      </div>

      <div class="ac-actions">
        <button
          v-if="store.controlStatus === 'running' || store.controlStatus === 'ended' || store.controlStatus === 'error'"
          class="action-btn"
          @click="store.openInTerminal()"
          title="Copy resume command to clipboard"
        >
          <ExternalLink :size="12" />
          Open in terminal
        </button>
        <button
          v-if="store.controlStatus === 'ended' || store.controlStatus === 'error'"
          class="action-btn accent"
          @click="newSession"
        >
          New session
        </button>
      </div>
    </div>

    <!-- ── Terminal toast ── -->
    <div v-if="terminalToast" class="terminal-toast">
      <CheckCheck :size="12" /> Copied to clipboard: <code>{{ terminalToast }}</code>
    </div>

    <SessionHistory
      :sessions="store.controlHistory"
      @delete="store.deleteControlHistoryEntry($event)"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useAppStore } from '../../store'
import {
  Bot, ChevronDown, Folder, Square, SendHorizonal, ExternalLink, CheckCheck, Loader2
} from 'lucide-vue-next'
import AgentSelector from '../implementation/AgentSelector.vue'
import FlavorPills from '../implementation/FlavorPills.vue'
import ChatMessage from '../implementation/ChatMessage.vue'
import SessionHistory from '../implementation/SessionHistory.vue'

const store = useAppStore()
const userInput = ref('')
const showModelPicker = ref(false)
const modelInput = ref('')
const modelInputRef = ref(null)
const chatBodyRef = ref(null)
const inputRef = ref(null)
const terminalToast = ref('')
let terminalToastTimer = null

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

function scrollToBottom() {
  nextTick(() => {
    if (chatBodyRef.value) {
      chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
    }
  })
}

watch(() => store.controlMessages.length, scrollToBottom)
watch(() => store.controlStreamBuffer, scrollToBottom)

onMounted(async () => {
  await store.loadAgentPresets()
  await store.loadConfiguredAgents()
  store.hydrateAgentControlPrefs()
  await store.loadControlHistory()
  await store.loadMcpPort()

  // Listen for terminal command clipboard feedback
  if (window.canonic?.agentControl?.onTerminalCommand) {
    window.canonic.agentControl.onTerminalCommand(({ command }) => {
      terminalToast.value = command
      clearTimeout(terminalToastTimer)
      terminalToastTimer = setTimeout(() => { terminalToast.value = '' }, 4000)
    })
  }
})

function handleEnter(e) {
  const isMod = e.metaKey || e.ctrlKey
  if (e.shiftKey && !isMod) return
  if (isMod) return
  e.preventDefault()
  sendMessage()
}

function handleEscape() {
  if (showModelPicker.value) showModelPicker.value = false
}

async function sendMessage() {
  const prompt = userInput.value.trim()
  if (!prompt) return
  userInput.value = ''

  // An existing session (running OR an exited single-shot agent) continues the thread;
  // sendControlMessage resumes the agent server-side. Only start fresh when idle.
  if (store.controlSession && store.controlStatus !== 'idle') {
    await store.sendControlMessage(prompt)
  } else {
    await store.startControlSession({ prompt })
  }
  scrollToBottom()
}

function newSession() {
  userInput.value = ''
  store.controlMessages = []
  store.controlSession = null
  store.controlStatus = 'idle'
  store.controlTokenCount = 0
  store.controlStreamBuffer = ''
}

function cycleEffort() {
  const levels = ['low', 'medium', 'high']
  const idx = levels.indexOf(store.activeEffort)
  store.setAgentEffort(levels[(idx + 1) % 3])
}

function applyModel() {
  store.setAgentModel(modelInput.value.trim())
  showModelPicker.value = false
  modelInput.value = ''
}

function applyModelPreset(model) {
  store.setAgentModel(model)
  showModelPicker.value = false
}

watch(showModelPicker, async (val) => {
  if (val) {
    // Fetch models live when the picker opens (loading state handled in store).
    store.openModelSelector()
    await nextTick()
    modelInput.value = store.activeModel
    modelInputRef.value?.focus()
  }
})

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

.model-btn, .effort-btn {
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

.model-btn:hover, .effort-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.effort-btn { text-transform: capitalize; }

.model-picker {
  padding: 6px 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 140px;
  overflow-y: auto;
  margin-bottom: 6px;
}

.model-item {
  padding: 4px 8px;
  font-size: 0.72rem;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.1s;
}

.model-item:hover { background: var(--bg-hover); }
.model-item.active {
  background: var(--accent-muted);
  color: var(--accent-light);
}

.model-custom-row {
  display: flex;
  gap: 6px;
}

.model-input {
  flex: 1;
  padding: 4px 8px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.72rem;
  outline: none;
}

.model-input:focus { border-color: var(--accent); }

.model-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.model-empty {
  padding: 6px 8px;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.model-apply {
  padding: 4px 10px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.72rem;
  cursor: pointer;
  transition: opacity 0.12s;
}

.model-apply:hover { opacity: 0.88; }

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

.ac-chat {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
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
