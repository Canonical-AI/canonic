<template>
    <div class="modal-backdrop" @click.self="$emit('close')">
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Settings</h3>
                <button class="close-btn" @click="$emit('close')">✕</button>
            </div>

            <div class="tabs">
                <button
                    :class="['tab', activeTab === 'profile' && 'active']"
                    @click="activeTab = 'profile'"
                >
                    Profile & AI
                </button>
                <button
                    :class="['tab', activeTab === 'sharing' && 'active']"
                    @click="activeTab = 'sharing'"
                >
                    Sharing
                </button>
                <button
                    :class="['tab', activeTab === 'workspace' && 'active']"
                    @click="activeTab = 'workspace'"
                >
                    Workspace
                </button>
                <button
                    :class="['tab', activeTab === 'privacy' && 'active']"
                    @click="activeTab = 'privacy'"
                >
                    Privacy
                </button>
                <button
                    :class="['tab', activeTab === 'danger' && 'active']"
                    @click="activeTab = 'danger'"
                >
                    Reset
                </button>
            </div>

            <!-- Profile & AI tab -->
            <div v-if="activeTab === 'profile'" class="tab-content">
                <div class="field">
                    <label class="field-label">Display name</label>
                    <input
                        v-model="form.displayName"
                        class="field-input"
                        :class="{ error: errors.displayName }"
                    />
                    <p v-if="errors.displayName" class="field-error">
                        {{ errors.displayName }}
                    </p>
                    <p class="field-hint">Used in git commits and comments.</p>
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
                        v-model="form.baseUrl"
                        class="field-input"
                        placeholder="https://openrouter.ai/api/v1"
                        style="margin-top: 6px"
                    />
                    <p class="field-hint">
                        Any OpenAI-compatible endpoint.
                        <strong>OpenRouter</strong> gives you access to every
                        provider with one key.
                    </p>
                </div>

                <div class="field">
                    <label class="field-label"
                        >API key <span class="optional">(optional)</span></label
                    >
                    <div class="secret-input">
                        <input
                            v-model="form.apiKey"
                            :type="showKey ? 'text' : 'password'"
                            class="field-input"
                        />
                        <button
                            class="reveal-btn"
                            @click="showKey = !showKey"
                            type="button"
                        >
                            {{ showKey ? "Hide" : "Show" }}
                        </button>
                    </div>
                    <p class="field-hint warning">
                        ⚠ Stored as plain text in
                        <code>~/.canonic/config.json</code>. Do not commit that
                        file.
                    </p>
                </div>

                <div class="field">
                    <label class="field-label">Model</label>
                    <input
                        v-model="form.model"
                        class="field-input"
                        placeholder="e.g. anthropic/claude-sonnet-4-5"
                    />
                    <p class="field-hint">
                        Enter any model ID supported by your provider.
                    </p>
                </div>

                <div
                    class="field"
                    style="
                        margin-top: 32px;
                        padding-top: 24px;
                        border-top: 1px solid var(--border);
                    "
                >
                    <label class="field-label">Application</label>
                    <div class="update-check">
                        <button
                            class="btn-ghost"
                            @click="checkUpdates"
                            :disabled="checkingUpdates"
                        >
                            {{
                                checkingUpdates
                                    ? "Checking for updates..."
                                    : "Check for updates"
                            }}
                        </button>
                        <span v-if="updateStatus" class="update-status">{{
                            updateStatus
                        }}</span>
                    </div>
                </div>
            </div>

            <!-- Sharing tab -->
            <div v-if="activeTab === 'sharing'" class="tab-content">
                <div class="field">
                    <label class="field-label">Default share scope</label>
                    <p class="field-hint" style="margin-bottom: 10px">
                        What gets shared when you click "Share document."
                    </p>
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
                                <span class="scope-name">{{ opt.label }}</span>
                                <span class="scope-desc">{{ opt.desc }}</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div class="field">
                    <label class="field-label">Default access level</label>
                    <select
                        v-model="form.sharingDefaults.accessLevel"
                        class="field-select"
                    >
                        <option value="read">Read only</option>
                        <option value="comment">Can comment</option>
                    </select>
                </div>

                <div class="field">
                    <label class="field-label">Ignored paths</label>
                    <p class="field-hint" style="margin-bottom: 8px">
                        Create a <code>.canonicignore</code> file in a workspace
                        to exclude directories from sharing. Same syntax as
                        <code>.gitignore</code>.
                    </p>
                    <div class="code-example">
                        # Example .canonicignore<br />
                        Monitoring/<br />
                        Implementation/technical-spec.md
                    </div>
                </div>
            </div>

            <!-- Reset / Danger tab -->
            <div v-if="activeTab === 'danger'" class="tab-content">
                <p class="danger-intro">
                    These actions are permanent. Use them to clean up your
                    installation or start fresh.
                </p>

                <div class="danger-card">
                    <div class="danger-card-header">
                        <span class="danger-card-title"
                            >Reset configuration</span
                        >
                        <span class="danger-badge">Irreversible</span>
                    </div>
                    <p class="danger-card-desc">
                        Deletes <code>~/.canonic/</code> — your settings, API
                        key, comments, search index, and peer cache. Your
                        workspace documents are <strong>not</strong> deleted.
                        The app will show first-run setup next launch.
                    </p>
                    <div class="danger-paths" v-if="cleanupPaths">
                        <span class="path-chip">{{
                            cleanupPaths.configDir
                        }}</span>
                    </div>
                    <button
                        class="danger-btn"
                        @click="confirmReset"
                        :disabled="dangerBusy"
                    >
                        {{
                            dangerBusy ? "Deleting…" : "Delete config and reset"
                        }}
                    </button>
                </div>

                <div class="danger-card" v-if="store.workspacePath">
                    <div class="danger-card-header">
                        <span class="danger-card-title"
                            >Delete current workspace</span
                        >
                        <span class="danger-badge">Irreversible</span>
                    </div>
                    <p class="danger-card-desc">
                        Permanently deletes the workspace folder and all
                        documents inside it. This cannot be undone.
                    </p>
                    <div class="danger-paths">
                        <span class="path-chip">{{ store.workspacePath }}</span>
                    </div>
                    <button
                        class="danger-btn"
                        @click="confirmDeleteWorkspace"
                        :disabled="dangerBusy"
                    >
                        Delete workspace folder
                    </button>
                </div>

                <div class="danger-card">
                    <div class="danger-card-header">
                        <span class="danger-card-title">Uninstall script</span>
                    </div>
                    <p class="danger-card-desc">
                        Run this in your terminal to remove all Canonic data
                        after uninstalling the app:
                    </p>
                    <div class="code-block">
                        <pre>rm -rf ~/.canonic</pre>
                        <button class="copy-code-btn" @click="copyUninstall">
                            {{ copiedUninstall ? "✓ Copied" : "Copy" }}
                        </button>
                    </div>
                </div>

                <p v-if="dangerError" class="danger-error">{{ dangerError }}</p>
                <p v-if="dangerSuccess" class="danger-success">
                    {{ dangerSuccess }}
                </p>
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

                <!-- Workspace sharing -->
                <div class="ws-share-section" v-if="store.workspacePath">
                    <div class="ws-share-header">
                        <div>
                            <p class="field-label" style="margin:0 0 2px">Share workspace</p>
                            <p class="field-hint" style="margin:0">
                                Serve your entire workspace over the local network.
                                Anyone with the link can browse and read all docs.
                            </p>
                        </div>
                    </div>

                    <!-- Not sharing -->
                    <div v-if="!store.workspaceShareInfo">
                        <button class="ws-share-btn" @click="startWsShare" :disabled="wsShareLoading">
                            {{ wsShareLoading ? 'Starting…' : 'Start workspace sharing' }}
                        </button>
                        <p v-if="wsShareError" class="field-error">{{ wsShareError }}</p>
                    </div>

                    <!-- Active -->
                    <div v-else class="ws-share-active">
                        <div class="ws-stat-bar">
                            <div class="ws-status-live">
                                <span class="status-dot" />
                                <span>Sharing live</span>
                            </div>
                            <div class="ws-pills">
                                <span class="ws-pill" :class="store.workspaceShareStats.connected > 0 && 'ws-pill--on'">
                                    {{ store.workspaceShareStats.connected }} viewing
                                </span>
                                <span class="ws-pill">
                                    {{ store.workspaceShareStats.reads }} reads
                                </span>
                            </div>
                        </div>
                        <div class="ws-link-row">
                            <span class="ws-link-text">{{ store.workspaceShareInfo.localUrl }}</span>
                            <button class="ws-copy-btn" :class="wsShareCopied && 'copied'" @click="copyWsLink">
                                {{ wsShareCopied ? '✓' : 'Copy' }}
                            </button>
                        </div>
                        <div class="ws-actions">
                            <button class="ws-open-btn" @click="openWsInBrowser">Preview in browser</button>
                            <button class="ws-stop-btn" @click="stopWsShare">Stop sharing</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Privacy tab -->
            <div v-if="activeTab === 'privacy'" class="tab-content">
                <div class="field">
                    <label class="field-label">Usage Logging</label>
                    <p class="field-hint" style="margin-bottom: 12px">
                        Help improve Canonic by sharing anonymous usage data.
                    </p>

                    <div
                        class="telemetry-card"
                        :class="{ active: form.telemetryEnabled }"
                        @click="form.telemetryEnabled = !form.telemetryEnabled"
                    >
                        <div class="telemetry-header">
                            <span class="telemetry-label"
                                >Enable usage logging</span
                            >
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
                    <p class="field-hint" style="margin-top: 12px">
                        Logs are stored locally in
                        <code>~/.canonic/usage.log</code>.
                    </p>
                </div>
            </div>

            <div class="modal-footer">
                <p v-if="saveSuccess" class="save-success">✓ Saved</p>
                <p v-if="saveError" class="save-error">{{ saveError }}</p>
                <div class="footer-actions">
                    <button class="btn-ghost" @click="$emit('close')">
                        Cancel
                    </button>
                    <button
                        class="btn-primary"
                        @click="save"
                        :disabled="saving"
                    >
                        {{ saving ? "Saving…" : "Save settings" }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../../store";

const emit = defineEmits(["close"]);
const router = useRouter();
const store = useAppStore();

const activeTab = ref("profile");
const showKey = ref(false);
const saving = ref(false);
const saveSuccess = ref(false);
const saveError = ref("");
const errors = ref({});
const dangerBusy = ref(false);
const dangerError = ref("");
const dangerSuccess = ref("");
const cleanupPaths = ref(null);
const copiedUninstall = ref(false);
const checkingUpdates = ref(false);
const updateStatus = ref("");
const wsShareLoading = ref(false);
const wsShareError = ref("");
const wsShareCopied = ref(false);

window.canonic.cleanup.getPaths().then((p) => {
    cleanupPaths.value = p;
});

const form = reactive({
    displayName: "",
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4-5",
    defaultWorkspacePath: "",
    telemetryEnabled: false,
    sharingDefaults: { scope: "file", accessLevel: "read" },
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
    form.baseUrl = p.url;
    form.model = p.model;
}

const scopeOptions = [
    { value: "none", label: "Nothing", desc: "Sharing disabled by default" },
    {
        value: "file",
        label: "Current file",
        desc: "Share only the open document",
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

onMounted(async () => {
    const cfg = store.config || (await store.loadConfig());
    if (cfg) {
        form.displayName = cfg.displayName || "";
        form.apiKey = cfg.apiKey || "";
        form.baseUrl = cfg.baseUrl || "https://openrouter.ai/api/v1";
        form.model = cfg.model || "anthropic/claude-sonnet-4-5";
        form.defaultWorkspacePath = cfg.defaultWorkspacePath || "";
        form.telemetryEnabled = !!cfg.telemetryEnabled;
        form.sharingDefaults = JSON.parse(
            JSON.stringify({
                ...form.sharingDefaults,
                ...(cfg.sharingDefaults || {}),
            }),
        );
    }
});

async function browsePath() {
    const chosen = await window.canonic.workspace.openDirectoryDialog();
    if (chosen) form.defaultWorkspacePath = chosen;
}

async function checkUpdates() {
    checkingUpdates.value = true;
    updateStatus.value = "";
    try {
        const result = await window.canonic.update.check();
        if (result?.isDev) {
            updateStatus.value = "Update check skipped in development mode.";
        } else if (result?.updateInfo) {
            updateStatus.value = `New version available: ${result.updateInfo.version}`;
        } else {
            updateStatus.value = "You are on the latest version.";
        }
    } catch (err) {
        updateStatus.value = "Error checking for updates.";
        console.error(err);
    } finally {
        checkingUpdates.value = false;
    }
}

async function save() {
    saving.value = true;
    saveError.value = "";
    saveSuccess.value = false;
    errors.value = {};

    const result = await store.saveConfig(JSON.parse(JSON.stringify(form)));
    saving.value = false;

    if (result.success) {
        saveSuccess.value = true;
        setTimeout(() => {
            saveSuccess.value = false;
        }, 2500);
    } else {
        errors.value = result.errors || {};
        saveError.value = "Please fix the errors above.";
        activeTab.value = "profile";
    }
}

function switchWorkspace() {
    emit("close");
    router.push("/");
}

async function confirmReset() {
    if (
        !confirm(
            "This will delete ~/.canonic/ and all Canonic settings. Your workspace documents are kept. Continue?",
        )
    )
        return;
    dangerBusy.value = true;
    dangerError.value = "";
    const result = await window.canonic.cleanup.resetConfig();
    dangerBusy.value = false;
    if (result.success) {
        dangerSuccess.value =
            "Config deleted. Restart the app to run first-time setup.";
    } else {
        dangerError.value = result.error;
    }
}

async function confirmDeleteWorkspace() {
    if (!store.workspacePath) return;
    if (
        !confirm(
            `Permanently delete "${store.workspacePath}" and all files inside? This cannot be undone.`,
        )
    )
        return;
    dangerBusy.value = true;
    dangerError.value = "";
    const result = await window.canonic.cleanup.deleteWorkspace(
        store.workspacePath,
    );
    dangerBusy.value = false;
    if (result.success) {
        dangerSuccess.value = "Workspace deleted.";
        emit("close");
        router.push("/");
    } else {
        dangerError.value = result.error;
    }
}

async function startWsShare() {
    wsShareLoading.value = true;
    wsShareError.value = "";
    const result = await store.startWorkspaceShare();
    wsShareLoading.value = false;
    if (!result?.success) wsShareError.value = result?.error || "Failed to start";
}

async function stopWsShare() {
    await store.stopWorkspaceShare();
}

async function copyWsLink() {
    await navigator.clipboard.writeText(store.workspaceShareInfo.localUrl);
    wsShareCopied.value = true;
    setTimeout(() => { wsShareCopied.value = false; }, 2000);
}

function openWsInBrowser() {
    if (store.workspaceShareInfo?.localUrl) {
        window.canonic.share.openLink(store.workspaceShareInfo.localUrl);
    }
}

async function copyUninstall() {
    await navigator.clipboard.writeText("rm -rf ~/.canonic");
    copiedUninstall.value = true;
    setTimeout(() => {
        copiedUninstall.value = false;
    }, 2000);
}
</script>

<style scoped>
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
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

.tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent);
}
.tab:hover:not(.active) {
    color: var(--text-secondary);
}

.tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
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

.field-input:focus {
    border-color: var(--accent-muted);
}
.field-input.error {
    border-color: var(--error);
}

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

.field-error {
    font-size: 0.775rem;
    color: var(--error);
    margin-top: 4px;
}

.field-hint {
    font-size: 0.775rem;
    color: var(--text-muted);
    margin-top: 5px;
    line-height: 1.5;
}

.field-hint.warning {
    color: #f5a623;
}

.optional {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 0.75rem;
}

.field-hint code {
    font-family: "JetBrains Mono", monospace;
    background: var(--bg-hover);
    padding: 1px 4px;
    border-radius: 3px;
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
    background: var(--bg-base);
    color: var(--text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
}

.reveal-btn:hover,
.browse-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.update-check {
    display: flex;
    align-items: center;
    gap: 12px;
}

.update-status {
    font-size: 0.8125rem;
    color: var(--text-muted);
}

.scope-options {
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.scope-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
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
    gap: 1px;
}
.scope-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
}
.scope-desc {
    font-size: 0.775rem;
    color: var(--text-muted);
}

.code-example {
    font-family: "JetBrains Mono", monospace;
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

.info-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 4px;
}
.info-path {
    font-size: 0.8125rem;
    color: var(--text-primary);
    font-family: "JetBrains Mono", monospace;
    margin-bottom: 12px;
}

.switch-btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
}

.switch-btn:hover {
    background: var(--bg-hover);
}

.modal-footer {
    padding: 14px 24px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-shrink: 0;
}

.save-success {
    font-size: 0.8125rem;
    color: var(--success);
    margin-right: auto;
}
.save-error {
    font-size: 0.8125rem;
    color: var(--error);
    margin-right: auto;
}

.footer-actions {
    display: flex;
    gap: 10px;
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

.btn-ghost:hover {
    background: var(--bg-hover);
}

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

.btn-primary:hover:not(:disabled) {
    opacity: 0.85;
}
.btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* Danger / Reset tab */
.danger-intro {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-bottom: 16px;
    line-height: 1.5;
}

.danger-card {
    border: 1px solid rgba(231, 76, 60, 0.25);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
    background: rgba(231, 76, 60, 0.04);
}

.danger-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}

.danger-card-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
}

.danger-badge {
    font-size: 0.7rem;
    padding: 2px 7px;
    border-radius: 10px;
    background: rgba(231, 76, 60, 0.15);
    color: var(--error);
    border: 1px solid rgba(231, 76, 60, 0.3);
}

.danger-card-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.55;
    margin-bottom: 10px;
}

.danger-card-desc strong {
    color: var(--text-secondary);
}
.danger-card-desc code {
    font-family: "JetBrains Mono", monospace;
    background: var(--bg-hover);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.775rem;
}

.danger-paths {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
}

.path-chip {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.725rem;
    color: var(--text-muted);
    background: var(--bg-base);
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
}

.danger-btn {
    padding: 7px 14px;
    border-radius: 7px;
    border: 1px solid rgba(231, 76, 60, 0.4);
    background: rgba(231, 76, 60, 0.08);
    color: var(--error);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: background 0.15s;
}

.danger-btn:hover:not(:disabled) {
    background: rgba(231, 76, 60, 0.18);
}
.danger-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.code-block {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 8px 12px;
}

.code-block pre {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.775rem;
    color: var(--text-secondary);
    white-space: pre;
}

.copy-code-btn {
    flex-shrink: 0;
    padding: 3px 10px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
}

.copy-code-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.telemetry-card {
    padding: 16px;
    background: var(--bg-base);
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

.danger-error {
    font-size: 0.8rem;
    color: var(--error);
    margin-top: 10px;
}
.danger-success {
    font-size: 0.8rem;
    color: var(--success);
    margin-top: 10px;
}

/* ── Workspace sharing ── */
.ws-share-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.ws-share-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.ws-share-btn {
    width: 100%;
    padding: 8px 0;
    border-radius: 7px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
}
.ws-share-btn:hover:not(:disabled) { opacity: 0.85; }
.ws-share-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.ws-share-active {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.ws-stat-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.ws-status-live {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--success);
}

.status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

.ws-pills {
    display: flex;
    gap: 5px;
}

.ws-pill {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 20px;
    border: 1px solid var(--border);
    color: var(--text-muted);
    background: var(--bg-base);
}

.ws-pill--on {
    border-color: var(--success);
    color: var(--success);
    background: rgba(75, 125, 111, 0.08);
}

.ws-link-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 7px 10px;
}

.ws-link-text {
    flex: 1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ws-copy-btn {
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.72rem;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
}
.ws-copy-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.ws-copy-btn.copied { color: var(--success); border-color: var(--success); }

.ws-actions {
    display: flex;
    gap: 6px;
}

.ws-open-btn {
    flex: 1;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.775rem;
    cursor: pointer;
    transition: background 0.1s;
}
.ws-open-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.ws-stop-btn {
    flex: 1;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.775rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}
.ws-stop-btn:hover { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.3); }
</style>
