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
                    Profile
                </button>
                <button
                    :class="['tab', activeTab === 'providers' && 'active']"
                    @click="activeTab = 'providers'"
                >
                    AI
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
                    :class="['tab', activeTab === 'updates' && 'active']"
                    @click="activeTab = 'updates'"
                >
                    Updates
                </button>
                <button
                    :class="['tab', activeTab === 'danger' && 'active']"
                    @click="activeTab = 'danger'"
                >
                    Reset
                </button>
            </div>

            <!-- Profile tab -->
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
                    <div
                        class="telemetry-card"
                        :class="{ active: hintsEnabled }"
                        @click="hintsEnabled = !hintsEnabled"
                    >
                        <div class="telemetry-header">
                            <span class="telemetry-label">Show feature hints</span>
                            <div class="toggle" :class="{ on: hintsEnabled }">
                                <div class="toggle-thumb"></div>
                            </div>
                        </div>
                        <p class="telemetry-desc">Tips shown at the bottom of the sidebar.</p>
                    </div>
                </div>
            </div>

            <!-- AI tab: Providers + Assistant + Completions -->
            <div v-if="activeTab === 'providers'" class="tab-content">

                <!-- Providers section -->
                <p class="section-heading">Providers</p>
                <div class="providers-list">
                    <div
                        v-for="(provider, idx) in form.providers"
                        :key="provider.id"
                        class="provider-row"
                    >
                        <template v-if="editingProviderId !== provider.id">
                            <div class="provider-info">
                                <span class="provider-label">{{ provider.label }}</span>
                                <span class="provider-url">{{ provider.baseUrl }}</span>
                                <span class="provider-key-mask">{{ provider.apiKey ? '••••' + provider.apiKey.slice(-4) : 'no key' }}</span>
                            </div>
                            <div class="provider-actions">
                                <button class="provider-btn" @click="editingProviderId = provider.id" type="button">Edit</button>
                                <button class="provider-btn danger" @click="deleteProvider(idx)" type="button">✕</button>
                            </div>
                        </template>
                        <template v-else>
                            <ProviderForm
                                :initial="provider"
                                :existing-ids="form.providers.map(p => p.id).filter(id => id !== provider.id)"
                                @save="updateProvider(idx, $event)"
                                @cancel="editingProviderId = null"
                            />
                        </template>
                    </div>

                    <div v-if="form.providers.length === 0" class="providers-empty">
                        No providers configured. Add one below.
                    </div>
                </div>

                <template v-if="addingProvider">
                    <ProviderForm
                        :existing-ids="form.providers.map(p => p.id)"
                        @save="addProvider($event)"
                        @cancel="addingProvider = false"
                    />
                </template>
                <button
                    v-else
                    class="add-provider-btn"
                    @click="addingProvider = true"
                    type="button"
                >
                    + Add provider
                </button>
                <p class="field-hint" style="margin-top: 8px">
                    ⚠ API keys stored as plain text in <code>~/.canonic/config.json</code>.
                </p>

                <!-- Assistant section -->
                <p class="section-heading" style="margin-top: 24px">AI Assistant</p>
                <div class="field">
                    <label class="field-label">Name</label>
                    <input
                        v-model="form.assistant.name"
                        class="field-input"
                        placeholder="Spark"
                    />
                    <p class="field-hint">How the assistant introduces itself.</p>
                </div>
                <div class="field">
                    <label class="field-label">Provider</label>
                    <select v-model="form.assistant.providerId" class="field-select">
                        <option value="">— None —</option>
                        <option v-for="p in form.providers" :key="p.id" :value="p.id">
                            {{ p.label }}
                        </option>
                    </select>
                </div>
                <div class="field">
                    <label class="field-label">Model</label>
                    <input
                        v-model="form.assistant.model"
                        class="field-input"
                        placeholder="e.g. anthropic/claude-sonnet-4-5"
                    />
                    <p class="field-hint">Any model ID supported by the selected provider.</p>
                </div>
                <div class="field">
                    <label class="field-label">Extra instructions</label>
                    <textarea
                        v-model="form.assistant.extraInstructions"
                        class="field-input field-textarea"
                        placeholder="e.g. Focus on B2B SaaS context. Always ask about the target user before diving in."
                        rows="3"
                    />
                    <p class="field-hint">Appended to the base system prompt. Use to tune tone, domain, or focus.</p>
                </div>

                <!-- Completions section -->
                <p class="section-heading" style="margin-top: 24px">Inline Completions</p>
                <div class="field">
                    <div
                        class="telemetry-card"
                        :class="{ active: form.completion.enabled && form.completion.providerId }"
                        @click="form.completion.enabled = !form.completion.enabled"
                    >
                        <div class="telemetry-header">
                            <span class="telemetry-label">Enable inline completions</span>
                            <div class="toggle" :class="{ on: form.completion.enabled && form.completion.providerId }">
                                <div class="toggle-thumb"></div>
                            </div>
                        </div>
                        <p class="telemetry-desc">
                            Ghost text suggestions as you type.
                            <kbd class="kbd">Tab</kbd> accept · <kbd class="kbd">Esc</kbd> dismiss · <kbd class="kbd">⌘→</kbd> one word.
                        </p>
                    </div>
                </div>
                <div class="field">
                    <label class="field-label">Provider</label>
                    <select v-model="form.completion.providerId" class="field-select">
                        <option value="">— None —</option>
                        <option v-for="p in form.providers" :key="p.id" :value="p.id">
                            {{ p.label }}
                        </option>
                    </select>
                    <p class="field-hint">Codestral (free, fast FIM model) works best.</p>
                </div>
                <div class="field">
                    <label class="field-label">Model</label>
                    <input v-model="form.completion.model" class="field-input" placeholder="codestral-latest" />
                    <p class="field-hint">For local providers try <code>qwen2.5-coder:1.5b</code>.</p>
                </div>
                <div class="field">
                    <label class="field-label">Trigger delay</label>
                    <select v-model.number="form.completion.debounceMs" class="field-select">
                        <option :value="150">Fast (150 ms)</option>
                        <option :value="350">Normal (350 ms)</option>
                        <option :value="600">Slow (600 ms)</option>
                        <option :value="1000">Very slow (1 s)</option>
                    </select>
                </div>
                <div class="field">
                    <label class="field-label">Max suggestion length (tokens)</label>
                    <input
                        v-model.number="form.completion.maxTokens"
                        type="number"
                        min="5"
                        max="200"
                        class="field-input"
                        style="width: 120px"
                    />
                    <p class="field-hint">Lower = shorter suggestions, fewer API credits. Default 25.</p>
                </div>
                <div class="field">
                    <div
                        class="telemetry-card"
                        :class="{ active: form.completion.wordBoundaryOnly }"
                        @click="form.completion.wordBoundaryOnly = !form.completion.wordBoundaryOnly"
                    >
                        <div class="telemetry-header">
                            <span class="telemetry-label">Word boundary trigger only</span>
                            <div class="toggle" :class="{ on: form.completion.wordBoundaryOnly }">
                                <div class="toggle-thumb"></div>
                            </div>
                        </div>
                        <p class="telemetry-desc">Only suggest after a space or punctuation, not mid-word.</p>
                    </div>
                </div>
                <div class="field">
                    <label class="field-label">Extra instructions</label>
                    <textarea
                        v-model="form.completion.extraInstructions"
                        class="field-input field-textarea"
                        placeholder="e.g. Prefer active voice. Match the document's formal tone."
                        rows="3"
                    />
                    <p class="field-hint">Hints appended to the completion system prompt.</p>
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

            <!-- Updates tab -->
            <div v-if="activeTab === 'updates'" class="tab-content">
                <div class="field">
                    <label class="field-label">Automatic updates</label>
                    <div
                        class="telemetry-card"
                        :class="{ active: form.autoUpdate }"
                        @click="form.autoUpdate = !form.autoUpdate"
                    >
                        <div class="telemetry-header">
                            <span class="telemetry-label">Download updates automatically</span>
                            <div class="toggle" :class="{ on: form.autoUpdate }">
                                <div class="toggle-thumb"></div>
                            </div>
                        </div>
                        <p class="telemetry-desc">
                            When a new version is available, Canonic downloads it in the
                            background and shows a notification when it's ready to install.
                            Turn this off to download updates manually.
                        </p>
                    </div>
                </div>

                <div class="field">
                    <label class="field-label">Update channel</label>
                    <div
                        class="telemetry-card"
                        :class="{ active: form.updateChannel === 'experimental' }"
                        @click="form.updateChannel = form.updateChannel === 'experimental' ? 'stable' : 'experimental'"
                    >
                        <div class="telemetry-header">
                            <span class="telemetry-label">Experimental builds</span>
                            <div class="toggle" :class="{ on: form.updateChannel === 'experimental' }">
                                <div class="toggle-thumb"></div>
                            </div>
                        </div>
                        <p class="telemetry-desc">
                            Opt into pre-release builds with the latest features. These may
                            be less stable. <strong>Requires restart to take effect.</strong>
                        </p>
                    </div>
                </div>

                <div class="field" style="padding-top: 16px; border-top: 1px solid var(--border);">
                    <label class="field-label">Check for updates</label>
                    <div class="update-check">
                        <button
                            class="btn-ghost"
                            @click="checkUpdates"
                            :disabled="checkingUpdates"
                        >
                            {{ checkingUpdates ? "Checking…" : "Check now" }}
                        </button>
                        <span v-if="updateStatus" class="update-status">{{ updateStatus }}</span>
                    </div>
                    <p class="field-hint" style="margin-top: 8px">
                        Canonic also checks automatically on launch and every 4 hours.
                    </p>
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
                <p class="build-info">{{ buildInfo }}</p>
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
import { useHints } from "../../composables/useHints.js";
import ProviderForm from "./ProviderForm.vue";

const props = defineProps({ initialTab: { type: String, default: "profile" } });
const emit = defineEmits(["close"]);
const router = useRouter();
const store = useAppStore();

const buildInfo = `build ${__BUILD_COMMIT__} · ${__BUILD_BRANCH__} · ${__BUILD_DATE__}`

const activeTab = ref(props.initialTab);
const { enabled: hintsEnabled } = useHints();

// Provider management state
const editingProviderId = ref(null);
const addingProvider = ref(false);
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
    defaultWorkspacePath: "",
    telemetryEnabled: false,
    autoUpdate: true,
    updateChannel: "stable",
    sharingDefaults: { scope: "file", accessLevel: "read" },
    providers: [],
    assistant: { providerId: "", model: "", name: "Spark", extraInstructions: "" },
    completion: { enabled: false, providerId: "", model: "codestral-latest", debounceMs: 350, maxTokens: 25, wordBoundaryOnly: true, extraInstructions: "" },
});

// Provider management
function slugify(str) {
    return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
}

function addProvider(provider) {
    form.providers.push(provider);
    addingProvider.value = false;
}

function updateProvider(idx, provider) {
    form.providers.splice(idx, 1, provider);
    editingProviderId.value = null;
}

function deleteProvider(idx) {
    const id = form.providers[idx].id;
    form.providers.splice(idx, 1);
    if (form.assistant.providerId === id) form.assistant.providerId = "";
    if (form.completion.providerId === id) form.completion.providerId = "";
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
        form.defaultWorkspacePath = cfg.defaultWorkspacePath || "";
        form.telemetryEnabled = !!cfg.telemetryEnabled;
        form.autoUpdate = cfg.autoUpdate !== false;
        form.updateChannel = cfg.updateChannel || "stable";
        form.sharingDefaults = JSON.parse(
            JSON.stringify({
                ...form.sharingDefaults,
                ...(cfg.sharingDefaults || {}),
            }),
        );
        form.providers = JSON.parse(JSON.stringify(cfg.providers || []));
        form.assistant = JSON.parse(
            JSON.stringify({ ...form.assistant, ...(cfg.assistant || {}) }),
        );
        form.completion = JSON.parse(
            JSON.stringify({ ...form.completion, ...(cfg.completion || {}) }),
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
    width: 680px;
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
    flex-wrap: wrap;
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

.build-info {
    font-size: 0.6875rem;
    color: var(--text-muted);
    opacity: 0.5;
    margin-right: auto;
    font-family: monospace;
    user-select: text;
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

.kbd {
    display: inline-block;
    padding: 1px 5px;
    border: 1px solid var(--border-mid);
    border-radius: 3px;
    font-size: 0.7rem;
    font-family: "JetBrains Mono", monospace;
    background: var(--bg-hover);
    color: var(--text-secondary);
}

/* Providers tab */
.providers-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
}

.providers-empty {
    font-size: 0.8125rem;
    color: var(--text-muted);
    padding: 12px 0;
    text-align: center;
}

.provider-row {
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.provider-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
}

.provider-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
}

.provider-url {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: "JetBrains Mono", monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

.provider-key-mask {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: "JetBrains Mono", monospace;
    white-space: nowrap;
}

.provider-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
}

.provider-btn {
    padding: 3px 10px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.775rem;
    cursor: pointer;
    transition: background 0.12s;
}
.provider-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.provider-btn.danger { color: var(--error); border-color: rgba(231,76,60,0.3); }
.provider-btn.danger:hover { background: rgba(231,76,60,0.1); }

.add-provider-btn {
    padding: 7px 14px;
    border-radius: 7px;
    border: 1px dashed var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    width: 100%;
    transition: background 0.12s, color 0.12s;
}
.add-provider-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.link-btn {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: inherit;
    padding: 0;
    text-decoration: underline;
}

.section-heading {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0 0 10px;
}

.field-textarea {
    resize: vertical;
    min-height: 72px;
    font-family: inherit;
    line-height: 1.5;
}
</style>
