<template>
  <div class="branch-menu" @keydown.esc="$emit('close')">
    <div class="menu-section">
      <p class="menu-label">Switch branch</p>
      <button
        v-for="branch in store.branches"
        :key="branch"
        :class="['branch-item', branch === store.currentBranch && 'active']"
        @click="switchBranch(branch)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H7a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 017 7h2a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25z"/>
        </svg>
        {{ branch }}
        <svg v-if="branch === store.currentBranch" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="margin-left: auto">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>
      </button>
    </div>

    <div class="menu-divider" />

    <div class="menu-section">
      <p class="menu-label">New branch</p>
      <div class="new-branch-input">
        <input
          v-model="newBranchName"
          placeholder="branch-name"
          @keydown.enter="createBranch"
          @click.stop
        />
        <button @click.stop="createBranch" :disabled="!newBranchName.trim()">
          Create
        </button>
      </div>
      <p class="branch-hint">Branches off current: <strong>{{ store.currentBranch }}</strong></p>
    </div>

    <div v-if="store.branches.length > 1" class="menu-section">
      <div class="menu-divider" />
      <button class="merge-trigger" @click="showMerge = true">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218zm1.55 5.596a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0zm4.5-2.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM4 4.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0z"/>
        </svg>
        Merge a branch into main…
      </button>
    </div>

    <!-- Inline merge panel -->
    <div v-if="showMerge" class="merge-panel" @click.stop>
      <p class="menu-label">Merge into main</p>
      <select v-model="mergeBranch" class="merge-select">
        <option disabled value="">Select branch</option>
        <option v-for="b in otherBranches" :key="b" :value="b">{{ b }}</option>
      </select>
      <input v-model="mergeMessage" placeholder="Merge commit message (optional)" class="merge-msg" />
      <button class="merge-btn" @click="doMerge" :disabled="!mergeBranch">Merge</button>
      <p v-if="mergeError" class="merge-error">{{ mergeError }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '../store'

const emit = defineEmits(['close'])
const store = useAppStore()
const newBranchName = ref('')
const showMerge = ref(false)
const mergeBranch = ref('')
const mergeMessage = ref('')
const mergeError = ref('')

const otherBranches = computed(() => store.branches.filter(b => b !== 'main'))

async function switchBranch(branch) {
  if (branch === store.currentBranch) { emit('close'); return }
  await store.checkoutBranch(branch)
  emit('close')
}

async function createBranch() {
  const name = newBranchName.value.trim().replace(/\s+/g, '-')
  if (!name) return
  await store.createBranch(name)
  newBranchName.value = ''
  emit('close')
}

async function doMerge() {
  if (!mergeBranch.value) return
  mergeError.value = ''
  const result = await store.mergeBranch(mergeBranch.value, mergeMessage.value)
  if (result.success) {
    emit('close')
  } else {
    mergeError.value = result.conflict ? 'Merge conflict — resolve manually.' : result.error
  }
}
</script>

<style scoped>
.branch-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 200;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px;
  min-width: 220px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}

.menu-section { padding: 4px 0; }

.menu-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 4px 8px 2px;
  margin: 0;
}

.branch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}

.branch-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.branch-item.active { color: var(--text-primary); }

.menu-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.new-branch-input {
  display: flex;
  gap: 6px;
  padding: 4px 8px;
}

.new-branch-input input {
  flex: 1;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 5px 8px;
  color: var(--text-primary);
  font-size: 0.8rem;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
}

.new-branch-input input:focus { border-color: var(--accent-muted); }

.new-branch-input button {
  padding: 5px 10px;
  border-radius: 5px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.8rem;
  cursor: pointer;
}

.new-branch-input button:disabled { opacity: 0.4; cursor: not-allowed; }

.branch-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 2px 8px;
  margin: 0;
}

.merge-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8125rem;
  cursor: pointer;
  text-align: left;
}

.merge-trigger:hover { background: var(--bg-hover); color: var(--text-primary); }

.merge-panel {
  padding: 4px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.merge-select, .merge-msg {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 6px 8px;
  color: var(--text-primary);
  font-size: 0.8rem;
  outline: none;
  width: 100%;
}

.merge-btn {
  padding: 6px;
  border-radius: 5px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.8rem;
  cursor: pointer;
}

.merge-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.merge-error { font-size: 0.775rem; color: var(--error); margin: 0; }
</style>
