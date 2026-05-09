<template>
    <div class="provider-form">
        <div class="provider-form-fields">
            <div class="form-row">
                <label class="form-label">Name</label>
                <input v-model="local.label" class="field-input" placeholder="e.g. OpenRouter" @input="autoSlug" />
                <p class="form-slug">id: {{ local.id || '…' }}</p>
            </div>

            <div class="form-row">
                <label class="form-label">Preset</label>
                <div class="preset-pills">
                    <button
                        v-for="p in presets"
                        :key="p.url"
                        class="preset-pill"
                        :class="{ active: local.baseUrl === p.url }"
                        @click="applyPreset(p)"
                        type="button"
                    >
                        {{ p.label }}
                    </button>
                </div>
            </div>

            <div class="form-row">
                <label class="form-label">Base URL</label>
                <input v-model="local.baseUrl" class="field-input" placeholder="https://openrouter.ai/api/v1" />
            </div>

            <div class="form-row">
                <label class="form-label">API key</label>
                <div class="secret-input">
                    <input
                        v-model="local.apiKey"
                        :type="showKey ? 'text' : 'password'"
                        class="field-input"
                        placeholder="Leave blank for Ollama / LM Studio"
                    />
                    <button class="reveal-btn" @click="showKey = !showKey" type="button">
                        {{ showKey ? 'Hide' : 'Show' }}
                    </button>
                </div>
            </div>
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>

        <div class="provider-form-actions">
            <button class="btn-ghost-sm" @click="emit('cancel')" type="button">Cancel</button>
            <button class="btn-primary-sm" @click="submit" type="button">Save provider</button>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive } from 'vue'

const props = defineProps({
    initial: { type: Object, default: null },
    existingIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['save', 'cancel'])

const showKey = ref(false)
const error = ref('')

const presets = [
    { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
    { label: 'OpenAI',     url: 'https://api.openai.com/v1' },
    { label: 'Mistral',    url: 'https://api.mistral.ai/v1' },
    { label: 'Codestral',  url: 'https://codestral.mistral.ai/v1' },
    { label: 'DeepSeek',   url: 'https://api.deepseek.com/v1' },
    { label: 'Groq',       url: 'https://api.groq.com/openai/v1' },
    { label: 'Ollama',     url: 'http://localhost:11434/v1' },
    { label: 'LM Studio',  url: 'http://localhost:1234/v1' },
]

function slugify(str) {
    return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

const local = reactive({
    id: props.initial?.id || '',
    label: props.initial?.label || '',
    baseUrl: props.initial?.baseUrl || '',
    apiKey: props.initial?.apiKey || '',
})

const slugLocked = !!props.initial  // lock slug when editing existing

function autoSlug() {
    if (!slugLocked) {
        local.id = slugify(local.label)
    }
}

function applyPreset(p) {
    local.label = local.label || p.label
    local.baseUrl = p.url
    if (!slugLocked && !local.id) local.id = slugify(p.label)
}

function submit() {
    error.value = ''
    if (!local.label.trim()) { error.value = 'Name is required'; return }
    if (!local.id.trim()) { error.value = 'Name must produce a valid id'; return }
    if (!slugLocked && props.existingIds.includes(local.id)) {
        error.value = `Id "${local.id}" already exists — change the name`; return
    }
    emit('save', { id: local.id, label: local.label.trim(), baseUrl: local.baseUrl.trim(), apiKey: local.apiKey.trim() })
}
</script>

<style scoped>
.provider-form {
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    padding: 14px;
    margin-top: 8px;
    background: var(--bg-active);
}

.provider-form-fields {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.form-label {
    font-size: 0.775rem;
    font-weight: 500;
    color: var(--text-secondary);
}

.form-slug {
    font-size: 0.725rem;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
}

.form-error {
    font-size: 0.775rem;
    color: var(--error);
    margin-top: 6px;
}

.provider-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
}

.preset-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.preset-pill {
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.725rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
}
.preset-pill:hover { background: var(--bg-hover); color: var(--text-primary); }
.preset-pill.active { background: var(--accent-muted); border-color: var(--accent); color: var(--text-primary); }

.secret-input { display: flex; gap: 6px; }
.secret-input .field-input { flex: 1; }

.btn-primary-sm {
    padding: 5px 14px;
    border-radius: 6px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
}
.btn-primary-sm:hover { opacity: 0.85; }

.btn-ghost-sm {
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: background 0.15s;
}
.btn-ghost-sm:hover { background: var(--bg-hover); }
</style>
