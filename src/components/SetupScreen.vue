<template>
  <div class="setup-screen">
    <div class="setup-card">
      <div class="logo">
        <span class="logo-text">canonic</span><span class="logo-dot">.ai</span>
      </div>
      <p class="tagline">Write. Version. Think.</p>

      <div class="steps">
        <!-- Step 1: Profile & API -->
        <div v-if="step === 1" class="step">
          <h2 class="step-title">Set up your profile</h2>
          <p class="step-subtitle">This info is stored locally on your machine and never sent to any server.</p>

          <div class="field">
            <label class="field-label">Display name <span class="required">*</span></label>
            <input
              v-model="form.displayName"
              class="field-input"
              :class="{ error: errors.displayName }"
              placeholder="Jane Smith"
              autofocus
            />
            <p v-if="errors.displayName" class="field-error">{{ errors.displayName }}</p>
            <p class="field-hint">Shown on your commits and comments.</p>
          </div>

          <div class="field">
            <label class="field-label">Anthropic API key <span class="required">*</span></label>
            <div class="secret-input">
              <input
                v-model="form.apiKey"
                :type="showKey ? 'text' : 'password'"
                class="field-input"
                :class="{ error: errors.apiKey }"
                placeholder="sk-ant-..."
              />
              <button class="reveal-btn" @click="showKey = !showKey" type="button">
                {{ showKey ? 'Hide' : 'Show' }}
              </button>
            </div>
            <p v-if="errors.apiKey" class="field-error">{{ errors.apiKey }}</p>
            <p class="field-hint">
              Used only for the AI assistant. Stored in <code>~/.canonic/config.json</code>.
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

          <div class="step-actions">
            <button class="btn-primary" @click="nextStep">Continue →</button>
          </div>
        </div>

        <!-- Step 2: Default workspace & sharing -->
        <div v-if="step === 2" class="step">
          <h2 class="step-title">Workspace & sharing defaults</h2>
          <p class="step-subtitle">These can be changed anytime in Settings.</p>

          <div class="field">
            <label class="field-label">Default workspace location</label>
            <div class="path-input">
              <input
                v-model="form.defaultWorkspacePath"
                class="field-input"
                placeholder="~/canonic"
              />
              <button class="browse-btn" @click="browsePath" type="button">Browse</button>
            </div>
            <p class="field-hint">Where new workspaces will be created by default.</p>
          </div>

          <div class="field">
            <label class="field-label">Default share scope</label>
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
            <label class="field-label">Default access level for shared documents</label>
            <select v-model="form.sharingDefaults.accessLevel" class="field-select">
              <option value="read">Read only — can view but not comment</option>
              <option value="comment">Can comment — can view and leave comments</option>
            </select>
          </div>

          <div class="step-actions">
            <button class="btn-ghost" @click="step = 1">← Back</button>
            <button class="btn-primary" @click="save" :disabled="saving">
              {{ saving ? 'Saving…' : 'Get started' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Step indicator -->
      <div class="step-dots">
        <div :class="['dot', step >= 1 && 'active']" />
        <div :class="['dot', step >= 2 && 'active']" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../store'

const emit = defineEmits(['done'])
const router = useRouter()
const store = useAppStore()

const step = ref(1)
const showKey = ref(false)
const saving = ref(false)
const errors = ref({})

const form = reactive({
  displayName: '',
  apiKey: '',
  model: 'claude-sonnet-4-6',
  defaultWorkspacePath: '',
  sharingDefaults: {
    scope: 'file',
    accessLevel: 'read'
  }
})

const scopeOptions = [
  { value: 'none', label: 'Nothing', desc: 'Sharing disabled by default' },
  { value: 'file', label: 'Current file', desc: 'Share only the open document (default)' },
  { value: 'directory', label: 'Directory', desc: 'Share all docs in the same folder' },
  { value: 'workspace', label: 'Whole workspace', desc: 'Share all documents in the workspace' }
]

// Pre-fill default path
window.canonic.workspace.getDefault().then(p => { form.defaultWorkspacePath = p })

function nextStep() {
  errors.value = {}
  if (!form.displayName.trim()) errors.value.displayName = 'Display name is required'
  if (!form.apiKey.trim()) errors.value.apiKey = 'API key is required'
  if (Object.keys(errors.value).length > 0) return
  step.value = 2
}

async function browsePath() {
  const chosen = await window.canonic.workspace.openDirectoryDialog()
  if (chosen) form.defaultWorkspacePath = chosen
}

async function save() {
  saving.value = true
  const result = await store.saveConfig({ ...form })
  saving.value = false
  if (result.success) {
    emit('done')
  } else {
    errors.value = result.errors || {}
    step.value = 1
  }
}
</script>

<style scoped>
.setup-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-base);
  padding: 24px;
}

.setup-card {
  width: 100%;
  max-width: 480px;
}

.logo {
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
  text-align: center;
}

.logo-text { color: var(--text-primary); }
.logo-dot { color: var(--accent); }

.tagline {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
  margin-bottom: 40px;
}

.step-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.step-subtitle {
  font-size: 0.8375rem;
  color: var(--text-muted);
  margin-bottom: 28px;
  line-height: 1.5;
}

.field { margin-bottom: 20px; }

.field-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.required { color: var(--accent); }

.field-input {
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.field-input:focus { border-color: var(--accent-muted); }
.field-input.error { border-color: var(--error); }

.field-error {
  font-size: 0.775rem;
  color: var(--error);
  margin-top: 4px;
}

.field-hint {
  font-size: 0.775rem;
  color: var(--text-muted);
  margin-top: 6px;
  line-height: 1.5;
}

.field-hint code {
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg-hover);
  padding: 1px 4px;
  border-radius: 3px;
}

.field-select {
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 0.875rem;
  outline: none;
  cursor: pointer;
}

.secret-input, .path-input {
  display: flex;
  gap: 8px;
}

.secret-input .field-input, .path-input .field-input {
  flex: 1;
}

.reveal-btn, .browse-btn {
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-muted);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

.reveal-btn:hover, .browse-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.scope-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scope-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.scope-option input { display: none; }
.scope-option.selected { border-color: var(--accent); background: var(--bg-active); }
.scope-option:hover:not(.selected) { background: var(--bg-hover); }

.scope-content { display: flex; flex-direction: column; gap: 2px; }
.scope-name { font-size: 0.875rem; color: var(--text-primary); font-weight: 500; }
.scope-desc { font-size: 0.775rem; color: var(--text-muted); }

.step-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 28px;
}

.btn-primary {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-ghost {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-ghost:hover { background: var(--bg-hover); }

.step-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 32px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border);
  transition: background 0.2s;
}

.dot.active { background: var(--accent); }
</style>
