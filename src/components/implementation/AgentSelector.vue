<template>
  <div class="agent-selector">
    <button class="agent-btn" :class="{ empty: !activeAgent }" @click="open = !open" title="Select coding agent">
      <Bot :size="15" />
      <span v-if="activeAgent">{{ activeAgent.name }}</span>
      <span v-else class="placeholder">Select agent</span>
      <ChevronDown :size="12" class="chevron" :class="{ open }" />
    </button>

    <div v-if="open" class="agent-popup" @click.stop>
      <div class="popup-header">Choose Agent</div>

      <div class="agent-list">
        <div v-for="agent in agents" :key="agent.id" class="agent-item" :class="{ active: activeAgent?.id === agent.id }" @click="select(agent)">
          <div class="agent-item-left">
            <span class="agent-name">{{ agent.name }}</span>
            <span class="agent-type">{{ agent.type === 'preset' ? 'Built-in' : 'Custom' }}</span>
          </div>
          <span v-if="agent.installed === false" class="agent-badge badge-not-installed" :title="agent.installHint">Not installed</span>
          <component :is="Check" v-else-if="activeAgent?.id === agent.id" :size="14" class="check-icon" />
        </div>
      </div>

      <div class="popup-divider" />

      <button class="add-agent-btn" @click="showAddForm = !showAddForm">
        <Plus :size="14" /> Add agent
      </button>

      <div v-if="showAddForm" class="add-agent-form">
        <div class="form-tabs">
          <button :class="['form-tab', { active: addTab === 'preset' }]" @click="addTab = 'preset'">From presets</button>
          <button :class="['form-tab', { active: addTab === 'custom' }]" @click="addTab = 'custom'">Custom</button>
        </div>

        <template v-if="addTab === 'preset'">
          <div class="preset-list">
            <div v-for="preset in unconfiguredPresets" :key="preset.id" class="preset-item" @click="addPreset(preset)">
              <span class="preset-name">{{ preset.name }}</span>
              <span v-if="!preset.installed" class="preset-hint">{{ preset.installHint }}</span>
            </div>
          </div>
          <div v-if="unconfiguredPresets.length === 0" class="form-hint">All presets already configured.</div>
        </template>

        <template v-if="addTab === 'custom'">
          <div class="custom-form-fields">
            <input v-model="customName" class="form-input" placeholder="Agent name" />
            <input v-model="customBinary" class="form-input" placeholder="Binary path (e.g. /usr/local/bin/my-agent)" />
            <input v-model="customArgs" class="form-input" placeholder="Default args (optional, space-separated)" />
            <button class="form-submit" :disabled="!customName.trim() || !customBinary.trim()" @click="addCustom">
              Add {{ customName || 'Agent' }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <div v-if="open" class="backdrop" @click="open = false" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Bot, ChevronDown, Plus, Check } from 'lucide-vue-next'

const props = defineProps({
  agents: { type: Array, default: () => [] },
  activeAgent: { type: Object, default: null },
  presets: { type: Array, default: () => [] }
})
const emit = defineEmits(['select', 'add-preset', 'add-custom'])

const open = ref(false)
const showAddForm = ref(false)
const addTab = ref('preset')
const customName = ref('')
const customBinary = ref('')
const customArgs = ref('')

const unconfiguredPresets = computed(() => {
  const configuredIds = new Set(props.agents.filter(a => a.type === 'preset').map(a => a.presetId || a.id))
  return props.presets.filter(p => !configuredIds.has(p.id))
})

function select(agent) {
  if (agent.installed === false) return
  emit('select', agent)
  open.value = false
}

function addPreset(preset) { emit('add-preset', preset); showAddForm.value = false }
function addCustom() {
  if (!customName.value.trim() || !customBinary.value.trim()) return
  emit('add-custom', { name: customName.value.trim(), binary: customBinary.value.trim(), args: customArgs.value.trim() ? customArgs.value.trim().split(/\s+/) : [] })
  customName.value = ''; customBinary.value = ''; customArgs.value = ''; showAddForm.value = false
}
</script>

<style scoped>
.agent-selector { position: relative; }

.agent-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  min-width: 0;
  transition: border-color 0.12s;
}
.agent-btn:hover { border-color: var(--accent); }
.agent-btn.empty { color: var(--text-muted); }
.placeholder { opacity: 0.6; }
.chevron { transition: transform 0.15s; }
.chevron.open { transform: rotate(180deg); }

.agent-popup {
  position: absolute; top: calc(100% + 4px); left: 0;
  width: 260px;
  background: var(--bg-surface);
  border: 1px solid var(--border-mid);
  border-radius: 8px;
  z-index: 200;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
}

.popup-header {
  padding: 8px 12px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  font-weight: 600;
}

.agent-list { display: flex; flex-direction: column; }

.agent-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 12px;
  cursor: pointer;
  transition: background 0.1s;
  gap: 8px;
}
.agent-item:hover { background: var(--bg-hover); }
.agent-item.active { background: var(--accent-muted); }

.agent-item-left { display: flex; flex-direction: column; min-width: 0; }
.agent-name { font-size: 0.8rem; color: var(--text-primary); }
.agent-type { font-size: 0.65rem; color: var(--text-muted); }

.agent-badge {
  font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; flex-shrink: 0;
}
.badge-not-installed {
  background: rgba(224, 85, 85, 0.12);
  color: #e05555;
}
.check-icon { color: var(--accent); flex-shrink: 0; }

.popup-divider { height: 1px; background: var(--border); margin: 4px 0; }

.add-agent-btn {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 7px 12px;
  background: none; border: none;
  color: var(--text-muted);
  font-size: 0.78rem;
  cursor: pointer;
  text-align: left;
  transition: color 0.1s;
}
.add-agent-btn:hover { color: var(--accent); }

.add-agent-form { padding: 0 12px 8px; }

.form-tabs { display: flex; gap: 2px; margin-bottom: 8px; }

.form-tab {
  flex: 1; padding: 4px 0;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.72rem;
  cursor: pointer;
  transition: color 0.1s, border-color 0.1s;
}
.form-tab.active { color: var(--accent); border-color: var(--accent); }

.preset-list { display: flex; flex-direction: column; gap: 2px; }

.preset-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 0.78rem;
  transition: background 0.1s;
}
.preset-item:hover { background: var(--bg-hover); }
.preset-name { color: var(--text-primary); }
.preset-hint { font-size: 0.65rem; color: var(--text-muted); }

.form-hint { font-size: 0.72rem; color: var(--text-muted); padding: 8px 0; }

.custom-form-fields { display: flex; flex-direction: column; gap: 6px; }

.form-input {
  padding: 5px 8px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.78rem;
  outline: none;
  transition: border-color 0.12s;
}
.form-input:focus { border-color: var(--accent); }

.form-submit {
  padding: 5px 0;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: opacity 0.12s;
}
.form-submit:hover:not(:disabled) { opacity: 0.88; }
.form-submit:disabled { opacity: 0.4; cursor: not-allowed; }

.backdrop { position: fixed; inset: 0; z-index: 199; }
</style>
