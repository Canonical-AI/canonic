<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">Settings</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="tabs">
        <button :class="['tab', activeTab === 'profile' && 'active']" @click="activeTab = 'profile'">Profile & AI</button>
        <button :class="['tab', activeTab === 'sharing' && 'active']" @click="activeTab = 'sharing'">Sharing</button>
        <button :class="['tab', activeTab === 'workspace' && 'active']" @click="activeTab = 'workspace'">Workspace</button>
      </div>

      <!-- Profile & AI tab -->
      <div v-if="activeTab === 'profile'" class="tab-content">
        <div class="field">
          <label class="field-label">Display name</label>
          <input v-model="form.displayName" class="field-input" :class="{ error: errors.displayName }" />
          <p v-if="errors.displayName" class="field-error">{{ errors.displayName }}</p>
          <p class="field-hint">Used in git commits and comments.</p>
        </div>

        <div class="field">
          <label class="field-label">Anthropic API key <span class="optional">(optional)</span></label>
          <div class="secret-input">
            <input v-model="form.apiKey" :type="showKey ? 'text' : 'password'" class="field-input" :class="{ error: errors.apiKey }" />
            <button class="reveal-btn" @click="showKey = !showKey" type="button">{{ showKey ? 'Hide' : 'Show' }}</button>
          </div>
          <p v-if="errors.apiKey" class="field-error">{{ errors.apiKey }}</p>
          <p class="field-hint warning">
            ⚠ Stored as plain text in <code>~/.canonic/config.json</code>. Do not commit that file.
          </p>
        </div>

        <div class="field">
          <label class="field-label">AI model</label>
          <select v-model="form.model" class="field-select">
            <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (recommended)</option>
            <option value="claude-opus-4-7">Claude Opus 4.7 (most capable)</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (fastest)</option>
          </select>
        </div>
      </div>

      <!-- Sharing tab -->
      <div v-if="activeTab === 'sharing'" class="tab-content">
        <div class="field">
          <label class="field-label">Default share scope</label>
          <p class="field-hint" style="margin-bottom: 10px">What gets shared when you click "Share document."</p>
          <div class="scope-options">
            <label
              v-for="opt in scopeOptions"
              :key="opt.value"
              :class="['scope-option', form.sharingDefaults.scope === opt.value && 'selected']"
            >
              <input type="radio" v-model="form.sharingDefaults.scope" :value="opt.value" />
              <div class="scope-content">
                <span class="scope-name">{{ opt.label }}</span>
                <span class="scope-desc">{{ opt.desc }}</span>
              </div>
            </label>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Default access level</label>
          <select v-model="form.sharingDefaults.accessLevel" class="field-select">
            <option value="read">Read only</option>
            <option value="comment">Can comment</option>
          </select>
        </div>

        <div class="field">
          <label class="field-label">Ignored paths</label>
          <p class="field-hint" style="margin-bottom: 8px">
            Create a <code>.canonicignore</code> file in a workspace to exclude directories from sharing.
            Same syntax as <code>.gitignore</code>.
          </p>
          <div class="code-example">
            # Example .canonicignore<br>
            Monitoring/<br>
            Implementation/technical-spec.md
          </div>
        </div>
      </div>

      <!-- Workspace tab -->
      <div v-if="activeTab === 'workspace'" class="tab-content">
        <div class="field">
          <label class="field-label">Default workspace location</label>
          <div class="path-input">
            <input v-model="form.defaultWorkspacePath" class="field-input" />
            <button class="browse-btn" @click="browsePath">Browse</button>
          </div>
          <p class="field-hint">New workspaces will be created here by default.</p>
        </div>

        <div v-if="store.workspacePath" class="workspace-info">
          <p class="info-label">Current workspace</p>
          <p class="info-path">{{ store.workspacePath }}</p>
          <button class="switch-btn" @click="switchWorkspace">Switch workspace</button>
        </div>
      </div>

      <div class="modal-footer">
        <p v-if="saveSuccess" class="save-success">✓ Saved</p>
        <p v-if="saveError" class="save-error">{{ saveError }}</p>
        <div class="footer-actions">
          <button class="btn-ghost" @click="$emit('close')">Cancel</button>
          <button class="btn-primary" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save settings' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../store'

const emit = defineEmits(['close'])
const router = useRouter()
const store = useAppStore()

const activeTab = ref('profile')
const showKey = ref(false)
const saving = ref(false)
const saveSuccess = ref(false)
const saveError = ref('')
const errors = ref({})

const form = reactive({
  displayName: '',
  apiKey: '',
  model: 'claude-sonnet-4-6',
  defaultWorkspacePath: '',
  sharingDefaults: { scope: 'file', accessLevel: 'read' }
})

const scopeOptions = [
  { value: 'none', label: 'Nothing', desc: 'Sharing disabled by default' },
  { value: 'file', label: 'Current file', desc: 'Share only the open document' },
  { value: 'directory', label: 'Directory', desc: 'Share all docs in the same folder' },
  { value: 'workspace', label: 'Whole workspace', desc: 'Share all documents in the workspace' }
]

onMounted(async () => {
  const cfg = store.config || await store.loadConfig()
  if (cfg) {
    form.displayName = cfg.displayName || ''
    form.apiKey = cfg.apiKey || ''
    form.model = cfg.model || 'claude-sonnet-4-6'
    form.defaultWorkspacePath = cfg.defaultWorkspacePath || ''
    form.sharingDefaults = { ...form.sharingDefaults, ...(cfg.sharingDefaults || {}) }
  }
})

async function browsePath() {
  const chosen = await window.canonic.workspace.openDirectoryDialog()
  if (chosen) form.defaultWorkspacePath = chosen
}

async function save() {
  saving.value = true
  saveError.value = ''
  saveSuccess.value = false
  errors.value = {}

  const result = await store.saveConfig({ ...form })
  saving.value = false

  if (result.success) {
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 2500)
  } else {
    errors.value = result.errors || {}
    saveError.value = 'Please fix the errors above.'
    activeTab.value = 'profile'
  }
}

function switchWorkspace() {
  emit('close')
  router.push('/')
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 500px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
  flex-shrink: 0;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.875rem;
  padding: 4px;
}

.tabs {
  display: flex;
  padding: 12px 24px 0;
  gap: 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab {
  padding: 8px 16px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8375rem;
  cursor: pointer;
  transition: color 0.15s;
  margin-bottom: -1px;
}

.tab.active { color: var(--text-primary); border-bottom-color: var(--accent); }
.tab:hover:not(.active) { color: var(--text-secondary); }

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.field { margin-bottom: 20px; }

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
  transition: border-color 0.15s;
}

.field-input:focus { border-color: var(--accent-muted); }
.field-input.error { border-color: var(--error); }

.field-select {
  width: 100%;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  color: var(--text-primary);
  font-size: 0.875rem;
  outline: none;
  cursor: pointer;
}

.field-error { font-size: 0.775rem; color: var(--error); margin-top: 4px; }

.field-hint {
  font-size: 0.775rem;
  color: var(--text-muted);
  margin-top: 5px;
  line-height: 1.5;
}

.field-hint.warning { color: #f5a623; }

.optional { color: var(--text-muted); font-weight: 400; font-size: 0.75rem; }

.field-hint code {
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg-hover);
  padding: 1px 4px;
  border-radius: 3px;
}

.secret-input, .path-input { display: flex; gap: 8px; }
.secret-input .field-input, .path-input .field-input { flex: 1; }

.reveal-btn, .browse-btn {
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  color: var(--text-muted);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.reveal-btn:hover, .browse-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.scope-options { display: flex; flex-direction: column; gap: 7px; }

.scope-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.scope-option input { display: none; }
.scope-option.selected { border-color: var(--accent); background: var(--bg-active); }
.scope-option:hover:not(.selected) { background: var(--bg-hover); }

.scope-content { display: flex; flex-direction: column; gap: 1px; }
.scope-name { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.scope-desc { font-size: 0.775rem; color: var(--text-muted); }

.code-example {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.775rem;
  color: var(--text-muted);
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  line-height: 1.7;
}

.workspace-info {
  padding: 12px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-top: 8px;
}

.info-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px; }
.info-path { font-size: 0.8125rem; color: var(--text-primary); font-family: 'JetBrains Mono', monospace; margin-bottom: 12px; }

.switch-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
}

.switch-btn:hover { background: var(--bg-hover); }

.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

.save-success { font-size: 0.8125rem; color: var(--success); margin-right: auto; }
.save-error { font-size: 0.8125rem; color: var(--error); margin-right: auto; }

.footer-actions { display: flex; gap: 10px; }

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
