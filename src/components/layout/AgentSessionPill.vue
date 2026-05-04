<template>
  <div v-if="store.agentSession" class="agent-pill-wrapper">
    <!-- Floating pill button -->
    <button class="agent-pill" @click="store.openActionPicker()">
      <Zap :size="13" />
      <span>{{ store.agentSession.agentName }} is waiting</span>
    </button>

    <!-- Action picker modal overlay -->
    <Teleport to="body">
      <div v-if="store.actionPickerOpen" class="action-picker-overlay" @click.self="store.closeActionPicker()">
        <div class="action-picker">
          <div class="picker-header">
            <Zap :size="14" />
            <span>Send back to {{ store.agentSession.agentName }}</span>
          </div>

          <div class="prompt-chips">
            <button
              v-for="p in presets"
              :key="p"
              class="prompt-chip"
              @click="submit(p)"
            >
              {{ p }}
            </button>
          </div>

          <div class="custom-prompt-row">
            <input
              v-model="customPrompt"
              class="custom-input"
              placeholder="Or type a custom prompt…"
              @keydown.enter="submitCustom"
            />
            <button class="send-btn" :disabled="!customPrompt.trim()" @click="submitCustom">
              Send
            </button>
          </div>

          <button class="cancel-link" @click="cancelSession">Cancel session</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '../../store'
import { Zap } from 'lucide-vue-next'

const store = useAppStore()
const customPrompt = ref('')

const presets = [
  'Implement this',
  'Research this',
  'Review and suggest changes',
  'Create a task list',
  'Write tests for this',
]

async function submit(prompt) {
  await store.submitAgentAction(prompt)
}

async function submitCustom() {
  if (!customPrompt.value.trim()) return
  await store.submitAgentAction(customPrompt.value.trim())
  customPrompt.value = ''
}

async function cancelSession() {
  store.closeActionPicker()
  await store.cancelAgentSession()
}
</script>

<style scoped>
.agent-pill-wrapper {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 50;
}

.agent-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--accent, #7c8cf8);
  color: white;
  border: none;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  animation: pulse-glow 2s ease-in-out infinite;
}

.agent-pill:hover {
  filter: brightness(1.1);
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 140, 248, 0.5); }
  50% { box-shadow: 0 0 0 8px rgba(124, 140, 248, 0); }
}

.action-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  padding-bottom: 80px;
}

.action-picker {
  background: var(--surface, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
  padding: 20px;
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.picker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent, #7c8cf8);
}

.prompt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.prompt-chip {
  padding: 6px 14px;
  background: var(--bg, #0d0d1a);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--text, #ddd);
  cursor: pointer;
}

.prompt-chip:hover {
  border-color: var(--accent, #7c8cf8);
  color: var(--accent, #7c8cf8);
}

.custom-prompt-row {
  display: flex;
  gap: 8px;
}

.custom-input {
  flex: 1;
  padding: 7px 12px;
  background: var(--bg, #0d0d1a);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--text, #ddd);
  outline: none;
}

.custom-input:focus { border-color: var(--accent, #7c8cf8); }

.send-btn {
  padding: 7px 16px;
  background: var(--accent, #7c8cf8);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
}

.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.cancel-link {
  background: none;
  border: none;
  color: var(--text-muted, #666);
  font-size: 0.75rem;
  cursor: pointer;
  text-align: center;
  text-decoration: underline;
}
</style>
