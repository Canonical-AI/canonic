<template>
    <div class="modal-backdrop" @click.self="$emit('close')">
        <div class="modal">
            <aside class="modal-sidebar">
                <div class="sidebar-header">
                    <span class="app-name">canonic<span class="accent">.ai</span></span>
                    <h3 class="modal-title">Settings</h3>
                </div>
                <nav class="sidebar-tabs">
                    <button
                        v-for="(label, tab) in navItems"
                        :key="tab"
                        :class="['sidebar-tab', activeTab === tab && 'active', tab === 'danger' && 'sidebar-tab--danger']"
                        @click="activeTab = tab"
                    >
                        <component :is="navIcons[tab]" :size="16" />
                        <span>{{ label }}</span>
                    </button>
                    <div class="sidebar-spacer" />
                </nav>
            </aside>

            <main class="modal-main">
                <header class="modal-content-header">
                    <h4 class="tab-title">{{ activeTabLabel }}</h4>
                    <button class="close-btn" @click="$emit('close')" title="Close settings">✕</button>
                </header>

                <div class="tab-scroll-area">
                    <!-- Profile tab -->
                    <div v-if="activeTab === 'profile'" class="tab-content">
                        <div class="field">
                            <label class="field-label">Display name</label>
                            <input v-model="form.displayName" class="field-input" placeholder="Your Name" />
                            <p class="field-hint">Used in git commits and comments.</p>
                        </div>
                        <div class="field">
                            <label class="field-label">Default editor</label>
                            <button
                                class="default-editor-btn"
                                :class="{ 'default-editor-btn--done': isDefaultEditor }"
                                :disabled="isDefaultEditor"
                                @click="toggleDefaultEditor"
                            >
                                {{ isDefaultEditor ? 'Canonic is already default for .md' : 'Set as Default for .md' }}
                            </button>
                        </div>
                        <div class="field">
                            <div class="settings-card" :class="{ active: hintsEnabled }" @click="hintsEnabled = !hintsEnabled">
                                <div class="card-header">
                                    <span class="card-label">Show feature hints</span>
                                    <div class="toggle" :class="{ on: hintsEnabled }"><div class="toggle-thumb"></div></div>
                                </div>
                                <p class="card-desc">Tips shown at the bottom of the sidebar.</p>
                            </div>
                        </div>
                    </div>

                    <!-- AI tab -->
                    <div v-if="activeTab === 'providers'" class="tab-content">
                        <p class="section-heading">Providers</p>
                        <div class="providers-list">
                            <div v-for="(provider, idx) in form.providers" :key="provider.id" class="provider-row">
                                <template v-if="editingProviderId !== provider.id">
                                    <div class="provider-info">
                                        <span class="provider-label">{{ provider.label }}</span>
                                        <span class="provider-url">{{ provider.baseUrl }}</span>
                                        <span class="provider-key-mask">{{ provider.apiKey ? "••••" + provider.apiKey.slice(-4) : "no key" }}</span>
                                    </div>
                                    <div class="provider-actions">
                                        <button class="provider-btn" @click="editingProviderId = provider.id">Edit</button>
                                        <button class="provider-btn danger" @click="deleteProvider(idx)">✕</button>
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
                        </div>
                        <template v-if="addingProvider">
                            <ProviderForm :existing-ids="form.providers.map(p => p.id)" @save="addProvider($event)" @cancel="addingProvider = false" />
                        </template>
                        <button v-else class="add-provider-btn" @click="addingProvider = true">+ Add provider</button>
                        <p class="field-hint" style="margin-top: 8px">⚠ API keys stored as plain text in <code>~/.canonic/config.json</code>.</p>

                        <p class="section-heading">AI Assistant</p>
                        <div class="field">
                            <label class="field-label">Name</label>
                            <input v-model="form.assistant.name" class="field-input" placeholder="Spark" />
                            <p class="field-hint">How the assistant introduces itself.</p>
                        </div>
                        <div class="field">
                            <label class="field-label">Provider</label>
                            <select v-model="form.assistant.providerId" class="field-select">
                                <option value="">— None —</option>
                                <option v-for="p in form.providers" :key="p.id" :value="p.id">{{ p.label }}</option>
                            </select>
                        </div>
                        <div class="field">
                            <label class="field-label">Model</label>
                            <input v-model="form.assistant.model" class="field-input" placeholder="e.g. anthropic/claude-sonnet-4-5" />
                            <p class="field-hint">Any model ID supported by the selected provider.</p>
                        </div>
                        <div class="field">
                            <label class="field-label">Extra instructions</label>
                            <textarea v-model="form.assistant.extraInstructions" class="field-input field-textarea" placeholder="e.g. Focus on B2B SaaS context..." rows="3" />
                            <p class="field-hint">Appended to the base system prompt.</p>
                        </div>

                        <p class="section-heading">Inline Completions</p>
                        <div class="field">
                            <div class="settings-card" :class="{ active: form.completion.enabled }" @click="form.completion.enabled = !form.completion.enabled">
                                <div class="card-header">
                                    <span class="card-label">Enable inline completions</span>
                                    <div class="toggle" :class="{ on: form.completion.enabled }"><div class="toggle-thumb"></div></div>
                                </div>
                                <p class="card-desc">Ghost text suggestions as you type. <kbd class="kbd">Tab</kbd> accept · <kbd class="kbd">Esc</kbd> dismiss.</p>
                            </div>
                        </div>
                        <div class="field">
                            <label class="field-label">Provider</label>
                            <select v-model="form.completion.providerId" class="field-select">
                                <option value="">— None —</option>
                                <option v-for="p in form.providers" :key="p.id" :value="p.id">{{ p.label }}</option>
                            </select>
                        </div>
                        <div class="field">
                            <label class="field-label">Model</label>
                            <input v-model="form.completion.model" class="field-input" placeholder="codestral-latest" />
                        </div>
                    </div>

                    <!-- Hotkeys tab -->
                    <div v-if="activeTab === 'hotkeys'" class="tab-content">
                        <p class="section-heading">Editor Shortcuts</p>
                        <p class="field-hint" style="margin-bottom: 24px">Customize your keyboard shortcuts. Use <code>Mod</code> for Cmd (macOS) or Ctrl (Windows/Linux).</p>
                        <div class="field">
                            <label class="field-label">Select line/block</label>
                            <input v-model="form.hotkeys.selectLine" class="field-input kbd-input" />
                        </div>
                        <div class="field">
                            <label class="field-label">Move block up</label>
                            <input v-model="form.hotkeys.moveUp" class="field-input kbd-input" />
                        </div>
                        <div class="field">
                            <label class="field-label">Move block down</label>
                            <input v-model="form.hotkeys.moveDown" class="field-input kbd-input" />
                        </div>
                    </div>

                    <!-- Sharing tab -->
                    <div v-if="activeTab === 'sharing'" class="tab-content">
                        <div class="field">
                            <label class="field-label">Default share scope</label>
                            <p class="field-hint" style="margin-bottom: 12px">What gets shared when you click "Share document."</p>
                            <div class="scope-options">
                                <label v-for="opt in scopeOptions" :key="opt.value" :class="['scope-option', form.sharingDefaults.scope === opt.value && 'selected']">
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

                        <p class="section-heading">Workspace Sharing</p>
                        <div class="field">
                            <div class="settings-card" :class="{ active: form.autoShareWorkspace }" @click="form.autoShareWorkspace = !form.autoShareWorkspace">
                                <div class="card-header">
                                    <span class="card-label">Auto-share current workspace</span>
                                    <div class="toggle" :class="{ on: form.autoShareWorkspace }"><div class="toggle-thumb"></div></div>
                                </div>
                                <p class="card-desc">Start sharing your active workspace when the app opens.</p>
                            </div>
                            <div v-if="store.workspaceShareInfo" class="sharing-live-status">
                                <div class="status-pulse-group">
                                    <span class="status-dot-pulse"></span>
                                    <span class="status-text-live">Workspace sharing active</span>
                                </div>
                                <div class="sharing-stats-row">
                                    <span class="sharing-stat"><b>{{ store.workspaceShareStats.connected }}</b> live</span>
                                    <span class="sharing-stat"><b>{{ store.workspaceShareStats.reads }}</b> reads</span>
                                </div>
                            </div>
                        </div>

                        <div class="field">
                            <div class="settings-card" :class="{ active: form.autoShareAllWorkspaces }" @click="form.autoShareAllWorkspaces = !form.autoShareAllWorkspaces">
                                <div class="card-header">
                                    <span class="card-label">Auto-share all workspaces</span>
                                    <div class="toggle" :class="{ on: form.autoShareAllWorkspaces }"><div class="toggle-thumb"></div></div>
                                </div>
                                <p class="card-desc">Automatically share your {{ store.recentWorkspaces.length }} recent workspaces on startup.</p>
                            </div>
                            <div v-if="store.sharesByFile['__all_workspaces__']" class="sharing-live-status">
                                <div class="status-pulse-group">
                                    <span class="status-dot-pulse"></span>
                                    <span class="status-text-live">All-workspace sharing active</span>
                                </div>
                                <div class="sharing-stats-row">
                                    <span class="sharing-stat"><b>{{ store.shareStatsByFile['__all_workspaces__']?.connected || 0 }}</b> live</span>
                                    <span class="sharing-stat"><b>{{ store.shareStatsByFile['__all_workspaces__']?.reads || 0 }}</b> reads</span>
                                </div>
                            </div>
                        </div>

                        <div class="field">
                            <label class="field-label">Exclude directories from sharing</label>
                            <p class="field-hint" style="margin-bottom: 12px">These folders will never be visible to peers, even if workspace sharing is on.</p>
                            <div class="excluded-paths-list">
                                <div v-for="(path, idx) in form.sharingExcludedPaths" :key="idx" class="excluded-path-row">
                                    <span class="path-text">{{ path }}</span>
                                    <button class="remove-path-btn" @click="form.sharingExcludedPaths.splice(idx, 1)">✕</button>
                                </div>
                                <div class="add-path-row">
                                    <input 
                                        v-model="newExcludedPath" 
                                        class="field-input" 
                                        placeholder="e.g. Private/ or Finance/" 
                                        @keydown.enter="addExcludedPath"
                                    />
                                    <button class="add-path-btn" @click="addExcludedPath" :disabled="!newExcludedPath.trim()">Add</button>
                                </div>
                            </div>
                        </div>

                        <div class="field">
                            <label class="field-label">Ignored paths</label>
                            <p class="field-hint" style="margin-bottom: 8px">Create a <code>.canonicignore</code> file in a workspace to exclude directories. Same syntax as <code>.gitignore</code>.</p>
                            <div class="code-example">
                                # Example .canonicignore<br />Monitoring/<br />Implementation/technical-spec.md
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
                            <p class="field-hint">New workspaces created here by default.</p>
                        </div>
                        <div v-if="store.workspacePath" class="workspace-info">
                            <p class="info-label">Current workspace</p>
                            <p class="info-path">{{ store.workspacePath }}</p>
                            <button class="switch-btn" @click="switchWorkspace">Switch workspace</button>
                        </div>
                    </div>

                    <!-- Privacy tab -->
                    <div v-if="activeTab === 'privacy'" class="tab-content">
                        <div class="field">
                            <label class="field-label">Usage Logging</label>
                            <p class="field-hint" style="margin-bottom: 12px">Help improve Canonic by sharing anonymous usage data.</p>
                            <div class="settings-card" :class="{ active: form.telemetryEnabled }" @click="form.telemetryEnabled = !form.telemetryEnabled">
                                <div class="telemetry-header">
                                    <span class="card-label">Enable usage logging</span>
                                    <div class="toggle" :class="{ on: form.telemetryEnabled }"><div class="toggle-thumb"></div></div>
                                </div>
                                <p class="card-desc">
                                    We track feature usage (e.g. "AI chat started", "Version saved") to understand how Canonic is being used.
                                    <strong>We never collect your API keys or document content.</strong>
                                </p>
                            </div>
                            <p class="field-hint" style="margin-top: 12px">Logs are stored locally in <code>~/.canonic/usage.log</code>.</p>
                        </div>
                    </div>

                    <!-- Updates tab -->
                    <div v-if="activeTab === 'updates'" class="tab-content">
                        <div class="field">
                            <div class="settings-card" :class="{ active: form.autoUpdate }" @click="form.autoUpdate = !form.autoUpdate">
                                <div class="card-header">
                                    <span class="card-label">Download updates automatically</span>
                                    <div class="toggle" :class="{ on: form.autoUpdate }"><div class="toggle-thumb"></div></div>
                                </div>
                                <p class="card-desc">Canonic downloads updates in the background and notifies you when ready.</p>
                            </div>
                        </div>
                        <div class="field">
                            <button class="btn-secondary" @click="checkUpdates" :disabled="checkingUpdates || store.updateDownloading">
                                {{ checkingUpdates ? "Checking…" : "Check now" }}
                            </button>
                            <span v-if="updateStatus" class="update-status">{{ updateStatus }}</span>
                        </div>
                        <div v-if="store.updateReady" class="field">
                            <button class="btn-primary" @click="store.installUpdate()">Restart to update — v{{ store.updateInfo?.version }}</button>
                        </div>
                        <div v-else-if="store.updateDownloading" class="field">
                            <span class="update-status">Downloading… {{ store.downloadProgress }}%</span>
                        </div>
                        <div v-else-if="store.updateAvailable" class="field">
                            <button class="btn-primary" @click="store.downloadUpdate()">Download v{{ store.updateInfo?.version }}</button>
                        </div>
                        <div class="field" style="margin-top: 32px; opacity: 0.6">
                            <p class="field-hint">Current version: v{{ store.appVersion }}</p>
                        </div>
                    </div>

                    <!-- Reset tab -->
                    <div v-if="activeTab === 'danger'" class="tab-content">
                        <div class="danger-zone-card">
                            <p class="danger-title">Reset configuration</p>
                            <p class="danger-desc">Deletes settings and API keys. Documents are safe. Irreversible.</p>
                            <button class="btn-danger-outline" @click="confirmReset" :disabled="dangerBusy">Delete and reset</button>
                        </div>
                        <div class="danger-zone-card" style="margin-top: 16px; background: none; border-color: var(--border)">
                            <p class="danger-title" style="color: var(--text-primary)">Uninstall script</p>
                            <p class="danger-desc">Run this in your terminal to remove all data:</p>
                            <div class="code-block">
                                <pre>rm -rf ~/.canonic</pre>
                                <button class="btn-icon-sm" @click="copyUninstall" title="Copy script">📋</button>
                            </div>
                        </div>
                    </div>
                </div>

<footer class="modal-footer">
    <span v-if="isDirty" class="dirty-hint">Settings apply automatically</span>
    <div class="footer-actions">
        <button v-if="isDirty" class="btn-text" @click="revertChanges">Discard changes</button>
        <button class="btn-primary" @click="$emit('close')">Done</button>
    </div>
</footer>
</main>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, toRaw } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../../store";
import { useHints, markDefaultEditorActive } from "../../composables/useHints.js";
import ProviderForm from "./ProviderForm.vue";
import { User, Bot, Keyboard, Share2, FolderTree, Shield, RefreshCw, Trash2 } from "lucide-vue-next";

const props = defineProps({ initialTab: { type: String, default: "profile" } });
const emit = defineEmits(["close"]);
const router = useRouter();
const store = useAppStore();

const buildInfo = `build ${__BUILD_COMMIT__} · ${__BUILD_BRANCH__}`;
const activeTab = ref(props.initialTab);
const { enabled: hintsEnabled } = useHints();

const navItems = { profile: "Profile", providers: "AI", hotkeys: "Hotkeys", sharing: "Sharing", workspace: "Workspace", privacy: "Privacy", updates: "Updates", danger: "Reset" };
const navIcons = { profile: User, providers: Bot, hotkeys: Keyboard, sharing: Share2, workspace: FolderTree, privacy: Shield, updates: RefreshCw, danger: Trash2 };
const activeTabLabel = computed(() => navItems[activeTab.value]);

let initialState = null;
const isDirty = ref(false);

const form = reactive({
    displayName: "", defaultWorkspacePath: "", telemetryEnabled: false, autoUpdate: true, updateChannel: "stable",
    autoShareWorkspace: false,
    autoShareAllWorkspaces: false,
    sharingExcludedPaths: [],
    sharingDefaults: { scope: "file", accessLevel: "read" },
    providers: [],
    assistant: { providerId: "", model: "", name: "Spark", extraInstructions: "" },
    completion: { enabled: false, providerId: "", model: "codestral-latest", debounceMs: 350, maxTokens: 25, wordBoundaryOnly: true, extraInstructions: "" },
    hotkeys: { selectLine: "Mod-l", moveUp: "Shift-ArrowUp", moveDown: "Shift-ArrowDown" },
});

const newExcludedPath = ref("");
const isDefaultEditor = ref(false);

async function checkDefaultEditor() {
    isDefaultEditor.value = await window.canonic.app.isDefaultEditor();
    if (isDefaultEditor.value) markDefaultEditorActive();
}

async function toggleDefaultEditor() {
    await window.canonic.app.setDefaultEditor(!isDefaultEditor.value);
    await checkDefaultEditor();
}
function addExcludedPath() {
    const p = newExcludedPath.value.trim();
    if (!p) return;
    if (!form.sharingExcludedPaths.includes(p)) {
        form.sharingExcludedPaths.push(p);
    }
    newExcludedPath.value = "";
}

watch(form, (newVal) => {
    if (!initialState) return;
    isDirty.value = JSON.stringify(newVal) !== JSON.stringify(initialState);
    store.saveConfig(toRaw(newVal));
}, { deep: true });

function revertChanges() {
    if (!initialState) return;
    Object.assign(form, JSON.parse(JSON.stringify(initialState)));
    isDirty.value = false;
}

function addProvider(p) { form.providers.push(p); addingProvider.value = false; }
function updateProvider(idx, p) { form.providers.splice(idx, 1, p); editingProviderId.value = null; }
function deleteProvider(idx) { form.providers.splice(idx, 1); }

const editingProviderId = ref(null);
const addingProvider = ref(false);
const dangerBusy = ref(false);
const checkingUpdates = ref(false);
const updateStatus = ref("");
const wsShareLoading = ref(false);
const wsShareError = ref("");
const wsShareCopied = ref(false);

const scopeOptions = [
    { value: "none", label: "Nothing", desc: "Sharing disabled by default" },
    { value: "file", label: "Current file", desc: "Share only the open document" },
    { value: "directory", label: "Directory", desc: "Share all docs in the same folder" },
    { value: "workspace", label: "Whole workspace", desc: "Share all documents in the workspace" },
];

onMounted(async () => {
    checkDefaultEditor();
    const cfg = store.config || (await store.loadConfig());
    if (cfg) {
        const loaded = {
            displayName: cfg.displayName || "",
            defaultWorkspacePath: cfg.defaultWorkspacePath || "",
            telemetryEnabled: !!cfg.telemetryEnabled,
            autoUpdate: cfg.autoUpdate !== false,
            updateChannel: cfg.updateChannel || "stable",
            autoShareWorkspace: !!cfg.autoShareWorkspace,
            autoShareAllWorkspaces: !!cfg.autoShareAllWorkspaces,
            sharingExcludedPaths: JSON.parse(JSON.stringify(cfg.sharingExcludedPaths || [])),
            sharingDefaults: { ...form.sharingDefaults, ...(cfg.sharingDefaults || {}) },
            providers: JSON.parse(JSON.stringify(cfg.providers || [])),
            assistant: { ...form.assistant, ...(cfg.assistant || {}) },
            completion: { ...form.completion, ...(cfg.completion || {}) },
            hotkeys: { ...form.hotkeys, ...(cfg.hotkeys || {}) },
        };
        Object.assign(form, loaded);
        initialState = JSON.parse(JSON.stringify(loaded));
    }
});

async function browsePath() {
    const chosen = await window.canonic.workspace.openDirectoryDialog();
    if (chosen) form.defaultWorkspacePath = chosen;
}

function switchWorkspace() { emit("close"); router.push("/"); }

async function checkUpdates() {
    checkingUpdates.value = true;
    try {
        const result = await window.canonic.update.check();
        updateStatus.value = result?.updateInfo ? `New version: ${result.updateInfo.version}` : "You are on the latest version.";
    } catch { updateStatus.value = "Error checking for updates."; }
    finally { checkingUpdates.value = false; }
}

async function startWsShare() {
    wsShareLoading.value = true;
    const result = await store.startWorkspaceShare();
    if (!result?.success) wsShareError.value = result?.error || "Failed to start";
    wsShareLoading.value = false;
}

async function stopWsShare() { await store.stopWorkspaceShare(); }
async function copyWsLink() {
    await navigator.clipboard.writeText(store.workspaceShareInfo.localUrl);
    wsShareCopied.value = true;
    setTimeout(() => { wsShareCopied.value = false; }, 2000);
}
function openWsInBrowser() { if (store.workspaceShareInfo?.localUrl) window.canonic.share.openLink(store.workspaceShareInfo.localUrl); }
async function copyUninstall() { await navigator.clipboard.writeText("rm -rf ~/.canonic"); }
async function confirmReset() {
    if (!confirm("Delete all settings? This is irreversible.")) return;
    dangerBusy.value = true;
    const result = await window.canonic.cleanup.resetConfig();
    if (result.success) router.push("/");
    dangerBusy.value = false;
}
</script>

<style scoped>
/* ── Variables & Resets ── */
:where(.modal, .modal-sidebar, .modal-main) {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
}

.modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 500; }

.modal {
    background: var(--bg-surface); border: 1px solid var(--border-mid); border-radius: 10px; width: 820px; height: 580px; max-width: 95vw; max-height: 85vh; display: flex; overflow: hidden; box-shadow: 0 16px 32px rgba(0,0,0,0.4);
}

/* ── Sidebar ── */
.modal-sidebar {
    width: 200px; background: var(--bg-surface); border-right: 1px solid var(--border-mid); display: flex; flex-direction: column; flex-shrink: 0;
}

.sidebar-header { padding: 20px 16px; border-bottom: 1px solid var(--border-mid); }

.app-name { display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; color: var(--text-muted); }
.app-name .accent { color: var(--accent); }

.modal-title { font-size: 1.125rem; font-weight: 600; color: var(--text-primary); }

.sidebar-tabs { flex: 1; padding: 8px 6px; display: flex; flex-direction: column; gap: 1px; overflow-y: auto; }

.sidebar-tab {
    display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: none; background: transparent; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 500; cursor: pointer; border-radius: 6px; transition: all 0.15s; text-align: left; width: 100%;
}
.sidebar-tab:hover:not(.active) { background: var(--bg-hover); color: var(--text-primary); }
.sidebar-tab.active { background: var(--accent-muted); color: var(--accent-light); }

.sidebar-tab--danger { margin-top: auto; color: var(--error); opacity: 0.7; }
.sidebar-tab--danger:hover { background: rgba(231, 76, 60, 0.08) !important; opacity: 1; }

.sidebar-spacer { flex: 1; }

/* ── Main Content ── */
.modal-main { flex: 1; display: flex; flex-direction: column; background: var(--bg-surface); min-width: 0; }

.modal-content-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-mid); flex-shrink: 0; }

.tab-title { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); }

.close-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.25rem; padding: 4px; line-height: 1; }
.close-btn:hover { color: var(--text-primary); }

.tab-scroll-area { flex: 1; overflow-y: auto; padding: 24px; }

.tab-content { max-width: 560px; }

/* ── Fields & Inputs ── */
.field { margin-bottom: 24px; }

.field-label { display: block; font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; letter-spacing: 0.02em; }

.field-input, .field-select, .field-textarea { 
    width: 100%; background: var(--bg-base); border: 1px solid var(--border-mid); border-radius: 8px; padding: 10px 14px; color: var(--text-primary); font-size: 0.9375rem; font-family: inherit; outline: none; transition: all 0.15s; box-sizing: border-box;
}
.field-input:focus, .field-select:focus, .field-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-muted); }

.field-textarea { resize: vertical; min-height: 80px; line-height: 1.5; }

.field-hint { font-size: 0.8125rem; color: var(--text-muted); margin-top: 8px; line-height: 1.5; }

.section-heading { font-size: 0.8125rem; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--text-secondary); margin: 20px 0 10px; border-bottom: 1px solid var(--border-mid); padding-bottom: 6px; }
.section-heading:first-child { margin-top: 0; }

/* ── Settings Cards ── */
.settings-card { padding: 16px 20px; background: var(--bg-base); border: 1px solid var(--border-mid); border-radius: 12px; cursor: pointer; transition: all 0.15s; }
.settings-card:hover { border-color: var(--accent-muted); }
.settings-card.active { border-color: var(--accent); background: var(--bg-active); }

.card-header, .telemetry-header { display: flex; justify-content: space-between; align-items: center; }
.card-label { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); }
.card-desc { font-size: 0.875rem; color: var(--text-muted); margin-top: 8px; line-height: 1.5; }

/* ── Default Editor Button ── */
.default-editor-btn { display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s; border: 1px solid var(--accent); background: var(--accent); color: #fff; }
.default-editor-btn:hover:not(:disabled) { opacity: 0.88; }
.default-editor-btn--done { background: var(--bg-base); border-color: var(--border-mid); color: var(--text-muted); cursor: default; }

/* ── UI Elements ── */
.toggle { width: 36px; height: 20px; background: var(--border-mid); border-radius: 10px; position: relative; transition: background 0.2s; flex-shrink: 0; }
.toggle.on { background: var(--accent); }
.toggle-thumb { width: 16px; height: 16px; background: white; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; }
.toggle.on .toggle-thumb { transform: translateX(16px); }

.kbd { display: inline-block; padding: 1px 5px; border: 1px solid var(--border-mid); border-radius: 4px; font-size: 0.75rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: var(--bg-hover); color: var(--text-secondary); }

.code-example { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.8125rem; color: var(--text-muted); background: var(--bg-base); border: 1px solid var(--border-mid); border-radius: 8px; padding: 16px; line-height: 1.6; }

/* ── Footer ── */
.modal-footer { padding: 12px 24px; border-top: 1px solid var(--border-mid); display: flex; align-items: center; justify-content: space-between; background: var(--bg-surface); flex-shrink: 0; }

.dirty-hint { font-size: 0.8125rem; color: var(--text-muted); font-style: italic; }

.footer-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }

/* ── Buttons ── */
.btn-primary { padding: 10px 24px; border-radius: 8px; border: none; background: var(--accent); color: white; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
.btn-primary:hover { opacity: 0.9; }

.btn-secondary { padding: 9px 18px; border-radius: 8px; border: 1px solid var(--border-mid); background: transparent; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.btn-secondary:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-mid); }

.btn-ghost { border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.875rem; padding: 8px 12px; }
.btn-ghost:hover { color: var(--text-primary); }

.btn-text { background: none; border: none; color: var(--text-muted); font-size: 0.875rem; cursor: pointer; text-decoration: none; padding: 9px 14px; border-radius: 8px; }
.btn-text:hover { color: var(--text-primary); background: var(--bg-hover); }

/* ── Sharing ── */
.scope-options { display: flex; flex-direction: column; gap: 6px; }
.scope-option { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--border-mid); border-radius: 8px; cursor: pointer; transition: all 0.15s; }
.scope-option input { display: none; }
.scope-option.selected { border-color: var(--accent); background: var(--bg-active); box-shadow: 0 0 0 1px var(--accent); }
.scope-option:hover:not(.selected) { border-color: var(--accent-muted); background: var(--bg-hover); }
.scope-content { display: flex; flex-direction: column; gap: 2px; }
.scope-name { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
.scope-desc { font-size: 0.775rem; color: var(--text-muted); line-height: 1.3; }

/* ── Excluded Paths ── */
.excluded-paths-list { display: flex; flex-direction: column; gap: 8px; background: var(--bg-base); border: 1px solid var(--border-mid); border-radius: 12px; padding: 12px; }
.excluded-path-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-surface); border: 1px solid var(--border-mid); border-radius: 6px; }
.path-text { font-size: 0.8125rem; color: var(--text-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.remove-path-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; }
.remove-path-btn:hover { background: rgba(231, 76, 60, 0.1); color: var(--error); }
.add-path-row { display: flex; gap: 8px; margin-top: 4px; }
.add-path-btn { padding: 6px 14px; border-radius: 6px; border: none; background: var(--accent); color: white; font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
.add-path-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Live Sharing Status ── */
.sharing-live-status { margin-top: 12px; padding: 12px; background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 8px; display: flex; flex-direction: column; gap: 8px; }
.status-pulse-group { display: flex; align-items: center; gap: 8px; }
.status-dot-pulse { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 rgba(34, 197, 94, 0.4); animation: pulse-green 2s infinite; }
.status-text-live { font-size: 0.75rem; font-weight: 600; color: #22c55e; text-transform: uppercase; letter-spacing: 0.02em; }
.sharing-stats-row { display: flex; gap: 16px; }
.sharing-stat { font-size: 0.8125rem; color: var(--text-secondary); }
.sharing-stat b { color: var(--text-primary); }

@keyframes pulse-green {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

/* ── Providers ── */
.providers-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.provider-row { background: var(--bg-base); border: 1px solid var(--border-mid); border-radius: 10px; padding: 16px; display: flex; align-items: center; justify-content: space-between; }
.provider-info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.provider-label { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); }
.provider-url { font-size: 0.8125rem; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-key-mask { font-size: 0.75rem; color: var(--text-muted); opacity: 0.6; }
.provider-actions { display: flex; gap: 8px; margin-left: 16px; }
.provider-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border-mid); background: var(--bg-surface); color: var(--text-secondary); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 0.12s; }
.provider-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.provider-btn.danger { color: var(--error); }
.provider-btn.danger:hover { background: rgba(231, 76, 60, 0.08); border-color: rgba(231, 76, 60, 0.3); }

.add-provider-btn { padding: 12px; border-radius: 10px; border: 2px dashed var(--border-mid); background: transparent; color: var(--text-secondary); font-size: 0.875rem; font-weight: 600; cursor: pointer; width: 100%; transition: all 0.15s; }
.add-provider-btn:hover { border-color: var(--accent-muted); background: var(--bg-hover); color: var(--text-primary); }

/* ── Workspace ── */
.path-input { display: flex; gap: 10px; }
.browse-btn { padding: 0 18px; border-radius: 8px; border: 1px solid var(--border-mid); background: var(--bg-base); color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.browse-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.workspace-info { padding: 20px; background: var(--bg-base); border: 1px solid var(--border-mid); border-radius: 12px; margin-top: 16px; }
.info-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 6px; }
.info-path { font-size: 0.875rem; color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin-bottom: 16px; word-break: break-all; }
.switch-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border-mid); background: var(--bg-surface); color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; }

.ws-share-section { margin-top: 32px; padding-top: 32px; border-top: 1px solid var(--border); }
.ws-share-active { display: flex; flex-direction: column; gap: 16px; }
.ws-stat-bar { display: flex; align-items: center; justify-content: space-between; }
.ws-status-live { display: flex; align-items: center; gap: 8px; font-size: 0.875rem; font-weight: 600; color: var(--success); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.9); } }
.ws-pills { display: flex; gap: 8px; }
.ws-pill { font-size: 0.75rem; font-weight: 500; padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border-mid); color: var(--text-muted); }

.ws-link-row { display: flex; align-items: center; gap: 10px; background: var(--bg-base); border: 1px solid var(--border-mid); border-radius: 10px; padding: 10px 16px; }
.ws-link-text { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.8125rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-copy-btn { flex-shrink: 0; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border-mid); background: var(--bg-surface); color: var(--text-muted); font-size: 0.75rem; font-weight: 600; cursor: pointer; }
.ws-copy-btn.copied { color: var(--success); border-color: var(--success); }
.ws-actions { display: flex; gap: 10px; }

/* ── Danger & Technical ── */
.danger-zone-card { border: 1px solid rgba(231,76,60,0.3); border-radius: 12px; padding: 24px; background: rgba(231, 76, 60, 0.02); }
.danger-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.danger-desc { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; }
.btn-danger-outline { padding: 10px 24px; border-radius: 8px; border: 1px solid var(--error); background: transparent; color: var(--error); font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.btn-danger-outline:hover { background: var(--error); color: white; }

.code-block { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--bg-base); border: 1px solid var(--border-mid); border-radius: 10px; padding: 12px 16px; }
.code-block pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.875rem; color: var(--text-secondary); margin: 0; }

.kbd-input { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600; color: var(--accent-light); letter-spacing: 0.05em; }

.update-status { font-size: 0.875rem; color: var(--text-muted); margin-left: 16px; }

.btn-icon-sm { width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--border-mid); background: var(--bg-surface); color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
.btn-icon-sm:hover { color: var(--text-primary); background: var(--bg-hover); }
</style>
