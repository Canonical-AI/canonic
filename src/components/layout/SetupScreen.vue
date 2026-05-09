<template>
    <div class="setup-screen">
        <div class="setup-card">
            <div class="logo">
                <img src="/canonical-logo.svg" alt="canonic" class="logo-img" />
                <div class="logo-wordmark">
                    <span class="logo-text">canonic</span
                    ><span class="logo-dot">.ai</span>
                </div>
            </div>
            <p class="tagline">Write. Version. Think.</p>

            <div class="steps">
                <!-- Step 1: Profile & API -->
                <div v-if="step === 1" class="step">
                    <h2 class="step-title">Set up your profile</h2>
                    <p class="step-subtitle">
                        This info is stored locally on your machine and never
                        sent to any server.
                    </p>

                    <div class="field">
                        <label class="field-label"
                            >Display name <span class="required">*</span></label
                        >
                        <input
                            v-model="form.displayName"
                            class="field-input"
                            :class="{ error: errors.displayName }"
                            placeholder="Jane Smith"
                            autofocus
                        />
                        <p v-if="errors.displayName" class="field-error">
                            {{ errors.displayName }}
                        </p>
                        <p class="field-hint">
                            Shown on your commits and comments.
                        </p>
                    </div>

                    <div class="field">
                        <label class="field-label"
                            >AI provider
                            <span class="optional">(optional)</span></label
                        >
                        <div class="preset-pills">
                            <button
                                v-for="p in providerPresets"
                                :key="p.url"
                                class="preset-pill"
                                :class="{ active: form.baseUrl === p.url }"
                                @click="applyPreset(p)"
                                type="button"
                            >
                                {{ p.label }}
                            </button>
                        </div>
                        <input
                            v-model="form.providerLabel"
                            class="field-input"
                            placeholder="Provider name (e.g. OpenRouter)"
                            style="margin-top: 6px"
                        />
                        <input
                            v-model="form.baseUrl"
                            class="field-input"
                            placeholder="https://openrouter.ai/api/v1"
                            style="margin-top: 6px"
                        />
                    </div>

                    <div class="field">
                        <label class="field-label"
                            >API key
                            <span class="optional">(optional)</span></label
                        >
                        <div class="secret-input">
                            <input
                                v-model="form.apiKey"
                                :type="showKey ? 'text' : 'password'"
                                class="field-input"
                                placeholder="sk-..."
                            />
                            <button
                                class="reveal-btn"
                                @click="showKey = !showKey"
                                type="button"
                            >
                                {{ showKey ? "Hide" : "Show" }}
                            </button>
                        </div>
                        <p class="field-hint">
                            Enables the AI assistant. You can change this
                            anytime in Settings → Providers.
                        </p>
                    </div>

                    <div class="field">
                        <label class="field-label">Model</label>
                        <input
                            v-model="form.model"
                            class="field-input"
                            placeholder="e.g. anthropic/claude-sonnet-4-5"
                        />
                    </div>

                    <div class="step-actions">
                        <button class="btn-primary" @click="nextStep">
                            Continue →
                        </button>
                    </div>
                </div>

                <!-- Step 2: Default workspace & sharing -->
                <div v-if="step === 2" class="step">
                    <h2 class="step-title">Workspace & sharing defaults</h2>
                    <p class="step-subtitle">
                        These can be changed anytime in Settings.
                    </p>

                    <div class="field">
                        <label class="field-label"
                            >Default workspace location</label
                        >
                        <div class="path-input">
                            <input
                                v-model="form.defaultWorkspacePath"
                                class="field-input"
                                placeholder="~/canonic"
                            />
                            <button
                                class="browse-btn"
                                @click="browsePath"
                                type="button"
                            >
                                Browse
                            </button>
                        </div>
                        <p class="field-hint">
                            Where new workspaces will be created by default.
                        </p>
                    </div>

                    <div class="field">
                        <label class="field-label">Default share scope</label>
                        <div class="scope-options">
                            <label
                                v-for="opt in scopeOptions"
                                :key="opt.value"
                                :class="[
                                    'scope-option',
                                    form.sharingDefaults.scope === opt.value &&
                                        'selected',
                                ]"
                            >
                                <input
                                    type="radio"
                                    v-model="form.sharingDefaults.scope"
                                    :value="opt.value"
                                />
                                <div class="scope-content">
                                    <span class="scope-name">{{
                                        opt.label
                                    }}</span>
                                    <span class="scope-desc">{{
                                        opt.desc
                                    }}</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div class="field">
                        <label class="field-label"
                            >Default access level for shared documents</label
                        >
                        <select
                            v-model="form.sharingDefaults.accessLevel"
                            class="field-select"
                        >
                            <option value="read">
                                Read only — can view but not comment
                            </option>
                            <option value="comment">
                                Can comment — can view and leave comments
                            </option>
                        </select>
                    </div>

                    <div class="step-actions">
                        <button class="btn-ghost" @click="step = 1">
                            ← Back
                        </button>
                        <button class="btn-primary" @click="step = 3">
                            Continue →
                        </button>
                    </div>
                </div>

                <!-- Step 3: Telemetry / Usage logging -->
                <div v-if="step === 3" class="step">
                    <h2 class="step-title">Help improve Canonic</h2>
                    <p class="step-subtitle">
                        Share anonymous usage data to help us build a better
                        tool.
                    </p>

                    <div
                        class="telemetry-card"
                        :class="{ active: form.telemetryEnabled }"
                        @click="form.telemetryEnabled = !form.telemetryEnabled"
                    >
                        <div class="telemetry-header">
                            <span class="telemetry-label">Usage logging</span>
                            <div
                                class="toggle"
                                :class="{ on: form.telemetryEnabled }"
                            >
                                <div class="toggle-thumb"></div>
                            </div>
                        </div>
                        <p class="telemetry-desc">
                            We track feature usage (e.g. "AI chat started",
                            "Version saved") to understand how Canonic is being
                            used.
                            <strong
                                >We never collect your API keys or document
                                content.</strong
                            >
                        </p>
                    </div>

                    <p class="field-hint" style="margin-top: 20px">
                        You can change this preference anytime in Settings. Logs
                        are stored locally in <code>~/.canonic/usage.log</code>.
                    </p>

                    <div class="step-actions">
                        <button class="btn-ghost" @click="step = 2">
                            ← Back
                        </button>
                        <button class="btn-primary" @click="step = 4">
                            Continue →
                        </button>
                    </div>
                </div>

                <!-- Step 4: Inline completions -->
                <div v-if="step === 4" class="step">
                    <h2 class="step-title">Inline completions</h2>
                    <p class="step-subtitle">
                        As you type, Canonic can suggest completions as faint ghost text.
                        Press <kbd class="kbd">Tab</kbd> to accept, <kbd class="kbd">Esc</kbd> to dismiss.
                    </p>

                    <div class="completion-preview">
                        <span class="preview-text">The goal of this initiative is to</span>
                        <span class="preview-ghost"> streamline cross-team collaboration by…</span>
                    </div>

                    <div class="field">
                        <label class="field-label">
                            Codestral API key
                            <span class="optional">(optional — free)</span>
                        </label>
                        <div class="secret-input">
                            <input
                                v-model="form.completionKey"
                                :type="showCompletionKey ? 'text' : 'password'"
                                class="field-input"
                                placeholder="Leave blank to skip for now"
                            />
                            <button
                                class="reveal-btn"
                                @click="showCompletionKey = !showCompletionKey"
                                type="button"
                            >
                                {{ showCompletionKey ? "Hide" : "Show" }}
                            </button>
                        </div>
                        <p class="field-hint">
                            Codestral is Mistral's free completion model — get a key at
                            <strong>mistral.ai/codestral</strong>.
                            You can also set this up later in Settings → Completions.
                        </p>
                    </div>

                    <div class="step-actions">
                        <button class="btn-ghost" @click="step = 3">
                            ← Back
                        </button>
                        <button
                            class="btn-primary"
                            @click="save"
                            :disabled="saving"
                        >
                            {{ saving ? "Saving…" : "Get started" }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Step indicator -->
            <div class="step-dots">
                <div :class="['dot', step >= 1 && 'active']" />
                <div :class="['dot', step >= 2 && 'active']" />
                <div :class="['dot', step >= 3 && 'active']" />
                <div :class="['dot', step >= 4 && 'active']" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../../store";

const emit = defineEmits(["done"]);
const router = useRouter();
const store = useAppStore();

const step = ref(1);
const showKey = ref(false);
const showCompletionKey = ref(false);
const saving = ref(false);
const errors = ref({});
const form = reactive({
    displayName: "",
    providerLabel: "OpenRouter",
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4-5",
    defaultWorkspacePath: "",
    telemetryEnabled: false,
    sharingDefaults: {
        scope: "file",
        accessLevel: "read",
    },
    completionKey: "",
});

const providerPresets = [
    {
        label: "OpenRouter",
        url: "https://openrouter.ai/api/v1",
        model: "anthropic/claude-sonnet-4-5",
    },
    { label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-4o" },
    {
        label: "Mistral",
        url: "https://api.mistral.ai/v1",
        model: "mistral-large-latest",
    },
    {
        label: "DeepSeek",
        url: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
    },
    {
        label: "Groq",
        url: "https://api.groq.com/openai/v1",
        model: "llama-3.3-70b-versatile",
    },
    {
        label: "Ollama (local)",
        url: "http://localhost:11434/v1",
        model: "llama3.2",
    },
];

function applyPreset(p) {
    form.providerLabel = p.label;
    form.baseUrl = p.url;
    form.model = p.model;
}

// Pre-fill defaults from config (username, saved path, etc.)
window.canonic.config.read().then((cfg) => {
    if (cfg?.displayName) form.displayName = cfg.displayName;
    if (cfg?.defaultWorkspacePath)
        form.defaultWorkspacePath = cfg.defaultWorkspacePath;
});

const scopeOptions = [
    { value: "none", label: "Nothing", desc: "Sharing disabled by default" },
    {
        value: "file",
        label: "Current file",
        desc: "Share only the open document (default)",
    },
    {
        value: "directory",
        label: "Directory",
        desc: "Share all docs in the same folder",
    },
    {
        value: "workspace",
        label: "Whole workspace",
        desc: "Share all documents in the workspace",
    },
];

// Pre-fill default path
window.canonic.workspace.getDefault().then((p) => {
    form.defaultWorkspacePath = p;
});

function nextStep() {
    errors.value = {};
    if (!form.displayName.trim())
        errors.value.displayName = "Display name is required";
    if (Object.keys(errors.value).length > 0) return;
    step.value = 2;
}

async function browsePath() {
    const chosen = await window.canonic.workspace.openDirectoryDialog();
    if (chosen) form.defaultWorkspacePath = chosen;
}

function slugify(str) {
    return str
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 40);
}

async function save() {
    saving.value = true;
    const { completionKey, providerLabel, apiKey, baseUrl, model, ...rest } =
        JSON.parse(JSON.stringify(form));

    const providers = [];
    let assistantProviderId = "";

    const mainLabel = (providerLabel || "Provider").trim();
    const mainId = slugify(mainLabel) || "provider";
    if (apiKey || baseUrl) {
        providers.push({ id: mainId, label: mainLabel, baseUrl, apiKey });
        assistantProviderId = mainId;
    }

    let completionProviderId = "";
    const cKey = completionKey.trim();
    if (cKey) {
        const codestralId = "codestral";
        providers.push({
            id: codestralId,
            label: "Codestral",
            baseUrl: "https://codestral.mistral.ai/v1",
            apiKey: cKey,
        });
        completionProviderId = codestralId;
    }

    const configToSave = {
        ...rest,
        providers,
        assistant: { providerId: assistantProviderId, model },
        completion: {
            enabled: !!completionProviderId,
            providerId: completionProviderId,
            model: "codestral-latest",
        },
    };

    const result = await store.saveConfig(configToSave);
    saving.value = false;
    if (result.success) {
        emit("done");
    } else {
        errors.value = result.errors || {};
        step.value = 1;
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
}

.logo-img {
    width: 64px;
    height: 32px;
    object-fit: contain;
}

.logo-wordmark {
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    text-align: center;
}

.logo-text {
    color: var(--text-primary);
}
.logo-dot {
    color: var(--accent);
}

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

.field {
    margin-bottom: 20px;
}

.field-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 6px;
}

.required {
    color: var(--accent);
}
.optional {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 0.75rem;
}

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

.field-input:focus {
    border-color: var(--accent-muted);
}
.field-input.error {
    border-color: var(--error);
}

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
    font-family: "JetBrains Mono", monospace;
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

.preset-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.preset-pill {
    padding: 3px 10px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.775rem;
    cursor: pointer;
    transition:
        background 0.12s,
        color 0.12s,
        border-color 0.12s;
}

.preset-pill:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.preset-pill.active {
    background: var(--accent-muted);
    border-color: var(--accent);
    color: var(--text-primary);
}

.secret-input,
.path-input {
    display: flex;
    gap: 8px;
}

.secret-input .field-input,
.path-input .field-input {
    flex: 1;
}

.reveal-btn,
.browse-btn {
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
    white-space: nowrap;
    transition:
        background 0.15s,
        color 0.15s;
}

.reveal-btn:hover,
.browse-btn:hover {
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
    transition:
        border-color 0.15s,
        background 0.15s;
}

.scope-option input {
    display: none;
}
.scope-option.selected {
    border-color: var(--accent);
    background: var(--bg-active);
}
.scope-option:hover:not(.selected) {
    background: var(--bg-hover);
}

.scope-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.scope-name {
    font-size: 0.875rem;
    color: var(--text-primary);
    font-weight: 500;
}
.scope-desc {
    font-size: 0.775rem;
    color: var(--text-muted);
}

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

.btn-primary:hover:not(:disabled) {
    opacity: 0.85;
}
.btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

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

.btn-ghost:hover {
    background: var(--bg-hover);
}

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

.dot.active {
    background: var(--accent);
}

.telemetry-card {
    padding: 16px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
    transition:
        border-color 0.15s,
        background 0.15s;
}

.telemetry-card:hover {
    border-color: var(--accent-muted);
}
.telemetry-card.active {
    border-color: var(--accent);
    background: var(--bg-active);
}

.telemetry-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.telemetry-label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
}

.telemetry-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.5;
}

.toggle {
    width: 36px;
    height: 20px;
    background: var(--border);
    border-radius: 10px;
    position: relative;
    transition: background 0.2s;
}

.toggle.on {
    background: var(--accent);
}

.toggle-thumb {
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.2s;
}

.toggle.on .toggle-thumb {
    transform: translateX(16px);
}

.kbd {
    display: inline-block;
    padding: 1px 5px;
    border: 1px solid var(--border-mid);
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: "JetBrains Mono", monospace;
    background: var(--bg-hover);
    color: var(--text-secondary);
}

.completion-preview {
    padding: 14px 16px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.9375rem;
    margin-bottom: 20px;
    line-height: 1.6;
}

.preview-text {
    color: var(--text-primary);
}

.preview-ghost {
    color: var(--text-muted);
    opacity: 0.6;
}
</style>
