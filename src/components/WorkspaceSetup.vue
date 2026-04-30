<template>
  <div class="workspace-screen">
    <!-- First-run setup gates everything -->
    <SetupScreen v-if="showSetup" @done="onSetupDone" />

    <!-- Workspace picker -->
    <div v-else class="workspace-card">
      <div class="card-header">
        <div class="logo">
          <span class="logo-text">canonic</span><span class="logo-dot">.ai</span>
        </div>
        <button class="settings-link" @click="showSettings = true">Settings</button>
      </div>

      <!-- Recent workspaces -->
      <div v-if="store.recentWorkspaces.length > 0" class="section">
        <p class="section-label">Recent workspaces</p>
        <div class="recent-list">
          <button
            v-for="ws in store.recentWorkspaces"
            :key="ws.path"
            class="recent-item"
            @click="openRecent(ws.path)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="folder-icon">
              <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
            </svg>
            <div class="recent-info">
              <span class="recent-name">{{ ws.name }}</span>
              <span class="recent-path">{{ ws.path }}</span>
            </div>
            <span class="recent-time">{{ formatTime(ws.openedAt) }}</span>
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="section">
        <p class="section-label">{{ store.recentWorkspaces.length > 0 ? 'Or' : 'Get started' }}</p>
        <div class="action-btns">
          <button class="action-btn" @click="showNewWorkspace = true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 11-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z"/>
            </svg>
            New workspace
          </button>
          <button class="action-btn" @click="openExisting">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
            </svg>
            Open folder
          </button>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <!-- New workspace modal -->
    <div v-if="showNewWorkspace" class="modal-backdrop" @click.self="showNewWorkspace = false">
      <div class="modal">
        <h3 class="modal-title">New workspace</h3>

        <div class="field">
          <label class="field-label">Name</label>
          <input v-model="newName" class="field-input" placeholder="my-product" autofocus @keydown.enter="createWorkspace" />
        </div>

        <div class="field">
          <label class="field-label">Location</label>
          <div class="path-input">
            <input v-model="newPath" class="field-input" />
            <button class="browse-btn" @click="browsePath">Browse</button>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Template</label>
          <div class="template-grid">
            <label
              v-for="tmpl in templates"
              :key="tmpl.id"
              :class="['template-card', selectedTemplate === tmpl.id && 'selected']"
            >
              <input type="radio" v-model="selectedTemplate" :value="tmpl.id" />
              <div class="tmpl-icon">{{ tmpl.icon }}</div>
              <div class="tmpl-info">
                <span class="tmpl-name">{{ tmpl.name }}</span>
                <span class="tmpl-desc">{{ tmpl.desc }}</span>
              </div>
            </label>
          </div>

          <!-- PM Framework preview -->
          <div v-if="selectedTemplate === 'pm-framework'" class="template-preview">
            <p class="preview-label">Creates:</p>
            <div class="preview-tree">
              <span v-for="item in pmPreview" :key="item" class="preview-item">{{ item }}</span>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-ghost" @click="showNewWorkspace = false">Cancel</button>
          <button class="btn-primary" @click="createWorkspace" :disabled="!newName.trim() || creating">
            {{ creating ? 'Creating…' : 'Create workspace' }}
          </button>
        </div>
      </div>
    </div>

    <SettingsModal v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../store'
import SetupScreen from './SetupScreen.vue'
import SettingsModal from './SettingsModal.vue'

const router = useRouter()
const store = useAppStore()

const showSetup = ref(false)
const showNewWorkspace = ref(false)
const showSettings = ref(false)
const error = ref('')
const creating = ref(false)

const newName = ref('')
const newPath = ref('')
const selectedTemplate = ref('pm-framework')

const templates = [
  {
    id: 'pm-framework',
    icon: '📋',
    name: 'PM Framework',
    desc: 'Vision, Strategy, Planning, Discovery, Implementation, Monitoring'
  },
  {
    id: 'blank',
    icon: '📄',
    name: 'Blank',
    desc: 'Empty workspace — start fresh'
  }
]

const pmPreview = [
  'Vision/ (2 docs)', 'Strategy/ (2 docs)', 'Planning/ (2 docs)',
  'Discovery/ (2 docs)', 'Implementation/ (2 docs)', 'Monitoring/ (2 docs)'
]

// Check if first-run setup needed
async function checkSetup() {
  const exists = await window.canonic.config.exists()
  showSetup.value = !exists
  if (!showSetup.value) {
    await store.loadConfig()
  }
}
checkSetup()

// Update path when name changes
watch(newName, async (val) => {
  const base = store.config?.defaultWorkspacePath || (await window.canonic.workspace.getDefault())
  newPath.value = `${base}/${val}`
})

async function onSetupDone() {
  showSetup.value = false
  await store.loadConfig()
}

async function openExisting() {
  const chosen = await window.canonic.workspace.openDialog()
  if (!chosen) return
  await launch(chosen, 'blank')
}

async function openRecent(path) {
  await launch(path, 'blank')
}

async function browsePath() {
  const chosen = await window.canonic.workspace.openDirectoryDialog()
  if (chosen) newPath.value = chosen
}

async function createWorkspace() {
  if (!newName.value.trim() || creating.value) return
  creating.value = true
  await launch(newPath.value, selectedTemplate.value)
  creating.value = false
  showNewWorkspace.value = false
}

async function launch(path, template) {
  error.value = ''
  try {
    await store.openWorkspace(path, template)
    router.push('/workspace')
  } catch (err) {
    error.value = err.message
  }
}

function formatTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString()
}
</script>

<style scoped>
.workspace-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-base);
}

.workspace-card {
  width: 100%;
  max-width: 480px;
  padding: 0 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 36px;
}

.logo {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.logo-text { color: var(--text-primary); }
.logo-dot { color: var(--accent); }

.settings-link {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.875rem;
  cursor: pointer;
  padding: 4px 0;
}

.settings-link:hover { color: var(--text-primary); }

.section { margin-bottom: 28px; }

.section-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.recent-list { display: flex; flex-direction: column; gap: 4px; }

.recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
  width: 100%;
}

.recent-item:hover { background: var(--bg-hover); border-color: var(--accent-muted); }

.folder-icon { color: var(--accent); flex-shrink: 0; }

.recent-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.recent-name { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.recent-path { font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-time { font-size: 0.75rem; color: var(--text-muted); flex-shrink: 0; }

.action-btns { display: flex; gap: 10px; }

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.error { color: var(--error); font-size: 0.8125rem; margin-top: 12px; text-align: center; }

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 24px;
}

.modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px;
  width: 100%;
  max-width: 500px;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.field { margin-bottom: 18px; }

.field-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field-input {
  width: 100%;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  color: var(--text-primary);
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
}

.field-input:focus { border-color: var(--accent-muted); }

.path-input { display: flex; gap: 8px; }
.path-input .field-input { flex: 1; }

.browse-btn {
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  color: var(--text-muted);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
}

.browse-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.template-grid { display: flex; flex-direction: column; gap: 8px; }

.template-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.template-card input { display: none; }
.template-card.selected { border-color: var(--accent); background: var(--bg-active); }
.template-card:hover:not(.selected) { background: var(--bg-hover); }

.tmpl-icon { font-size: 1.25rem; flex-shrink: 0; }
.tmpl-info { display: flex; flex-direction: column; gap: 3px; }
.tmpl-name { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.tmpl-desc { font-size: 0.775rem; color: var(--text-muted); }

.template-preview {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg-base);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.preview-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px; }

.preview-tree {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preview-item {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.btn-ghost {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
}

.btn-ghost:hover { background: var(--bg-hover); }

.btn-primary {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
