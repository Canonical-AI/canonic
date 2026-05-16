<template>
  <div v-if="store.agentSession" class="agent-panel">
    <div class="agent-panel-header">
      <Zap :size="12" />
      <span class="label">Agent Session</span>
    </div>
    <div class="agent-name">{{ store.agentSession.agentName }}</div>
    <div class="agent-file">{{ store.agentSession.file }}</div>
    <div class="agent-status">
      <span class="status-dot" :class="activityClass"></span>
      <span>{{ activityLabel }}</span>
    </div>
    <div class="agent-elapsed">{{ elapsed }}</div>
    <button class="return-btn" @click="store.openActionPicker()">
      Return →
    </button>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '../../store'
import { Zap } from 'lucide-vue-next'

const store = useAppStore()

const ACTIVITY_LABELS = {
  thinking: 'Thinking…',
  web_search: 'Searching the web…',
  browsing: 'Browsing…',
  reading_file: 'Reading file…',
  writing_comment: 'Writing comment…',
  file_edit: 'Editing file…',
  running_code: 'Running code…',
  analyzing: 'Analyzing…',
  waiting_for_input: 'Waiting for you',
}

const activityLabel = computed(() => {
  const a = store.agentActivity
  if (!a) return 'Working…'
  return a.label || ACTIVITY_LABELS[a.activityType] || 'Working…'
})

const activityClass = computed(() => {
  const t = store.agentActivity?.activityType
  if (t === 'waiting_for_input') return 'dot--waiting'
  return 'dot--active'
})
const now = ref(Date.now())
let timer = null

watch(
  () => store.agentSession,
  (session) => {
    if (session) {
      timer = setInterval(() => { now.value = Date.now() }, 1000)
    } else {
      clearInterval(timer)
      timer = null
    }
  },
  { immediate: true }
)

onUnmounted(() => clearInterval(timer))

const elapsed = computed(() => {
  if (!store.agentSession?.startedAt) return ''
  const secs = Math.floor((now.value - store.agentSession.startedAt) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
})
</script>

<style scoped>
.agent-panel {
  margin: 12px 8px 0;
  padding: 10px 12px;
  background: var(--bg, #0d0d1a);
  border: 1px solid var(--accent, #7c8cf8);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-panel-header {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--accent, #7c8cf8);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.label { color: var(--accent, #7c8cf8); }

.agent-name {
  font-size: 0.8rem;
  color: var(--text, #ddd);
  font-weight: 500;
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: var(--text-muted, #888);
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot--active {
  background: var(--accent, #7c8cf8);
  animation: dot-pulse 1.5s ease-in-out infinite;
}
.dot--waiting {
  background: var(--text-muted, #888);
}
@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.agent-file, .agent-elapsed {
  font-size: 0.75rem;
  color: var(--text-muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.return-btn {
  margin-top: 6px;
  padding: 5px 0;
  background: var(--accent, #7c8cf8);
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 0.78rem;
  cursor: pointer;
  width: 100%;
}

.return-btn:hover { filter: brightness(1.1); }
</style>
