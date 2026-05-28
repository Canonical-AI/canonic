<template>
  <div class="session-history">
    <button class="history-toggle" @click="expanded = !expanded">
      <History :size="13" /> <span>History</span>
      <span class="count" v-if="filteredSessions.length">{{ filteredSessions.length }}</span>
      <ChevronDown :size="12" class="chevron" :class="{ open: expanded }" />
    </button>

    <div v-if="expanded" class="history-body">
      <div class="filter-wrap">
        <input v-model="filter" class="filter-input" placeholder="Filter by title..." @click.stop />
      </div>

      <div v-if="filteredSessions.length === 0" class="history-empty">No sessions yet.</div>

      <div v-for="session in filteredSessions" :key="session.id" class="history-item">
        <div class="history-item-main">
          <div class="history-title">{{ session.title }}</div>
          <div class="history-meta">
            <span class="history-agent">{{ session.agentName }}</span>
            <span class="history-dot">·</span>
            <span class="history-date">{{ formatDate(session.startedAt) }}</span>
          </div>
          <div class="history-tags">
            <span class="tag flavor-tag">{{ session.flavor }}</span>
            <span :class="['tag', 'status-tag', session.status]">{{ session.status }}</span>
            <span class="tag" v-if="session.messageCount">{{ session.messageCount }} msgs</span>
          </div>
        </div>
        <button class="history-delete" @click.stop="$emit('delete', session.id)" title="Delete">×</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { History, ChevronDown } from 'lucide-vue-next'

const props = defineProps({ sessions: { type: Array, default: () => [] } })
defineEmits(['delete'])

const expanded = ref(false)
const filter = ref('')

const filteredSessions = computed(() => {
  if (!filter.value) return props.sessions.slice(0, 5)
  const q = filter.value.toLowerCase()
  return props.sessions.filter(s => s.title?.toLowerCase().includes(q)).slice(0, 5)
})

function formatDate(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
    return d.toLocaleDateString()
  } catch { return '' }
}
</script>

<style scoped>
.session-history { border-top: 1px solid var(--border); }

.history-toggle {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 8px 12px;
  background: none; border: none;
  color: var(--text-muted); font-size: 0.75rem;
  cursor: pointer; transition: color 0.1s;
}
.history-toggle:hover { color: var(--text-primary); }

.count {
  font-size: 0.65rem; background: var(--bg-active);
  padding: 0 5px; border-radius: 8px;
}

.chevron { transition: transform 0.15s; margin-left: auto; }
.chevron.open { transform: rotate(180deg); }

.history-body { padding: 0 8px 8px; }

.filter-wrap { margin-bottom: 6px; }

.filter-input {
  width: 100%; padding: 4px 8px;
  background: var(--bg-base); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text-primary);
  font-size: 0.72rem; outline: none; box-sizing: border-box;
  transition: border-color 0.12s;
}
.filter-input:focus { border-color: var(--accent); }

.history-empty {
  font-size: 0.72rem; color: var(--text-muted);
  padding: 8px 4px; text-align: center;
}

.history-item {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 6px 4px; border-radius: 4px; margin-bottom: 2px;
  transition: background 0.1s;
}
.history-item:hover { background: var(--bg-hover); }

.history-title {
  font-size: 0.75rem; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;
}

.history-meta { font-size: 0.65rem; color: var(--text-muted); margin-top: 2px; }
.history-dot { margin: 0 3px; }

.history-tags { display: flex; gap: 4px; margin-top: 3px; }

.tag {
  font-size: 0.6rem; padding: 1px 5px; border-radius: 3px;
  background: var(--bg-active); color: var(--text-muted);
}
.flavor-tag { text-transform: capitalize; }
.status-tag.ended { color: #7ab87a; }
.status-tag.running { color: var(--accent-light); }
.status-tag.error { color: #e05555; }

.history-delete {
  background: none; border: none;
  color: var(--text-muted); font-size: 1rem;
  cursor: pointer; padding: 2px 4px; flex-shrink: 0;
  transition: color 0.1s;
}
.history-delete:hover { color: #e05555; }
</style>
