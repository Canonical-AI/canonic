<template>
    <div class="workspace-screen">
        <!-- First-run setup gates everything -->
        <SetupScreen v-if="showSetup" @done="onSetupDone" />

        <!-- Auto-launching last workspace -->
        <div v-else-if="autoLaunching" class="auto-loading">
            <div class="auto-loading-spinner" />
        </div>

        <!-- Workspace picker -->
        <div v-else class="workspace-card">
            <div class="card-header">
                <div class="logo">
                    <img
                        src="/canonical-logo.svg"
                        alt="canonic"
                        class="logo-img"
                    />
                    <span class="logo-text">canonic</span
                    ><span class="logo-dot">.ai</span>
                </div>
                <button class="settings-link" @click="showSettings = true">
                    Settings
                </button>
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
                        <Folder :size="14" class="folder-icon" />
                        <div class="recent-info">
                            <span class="recent-name">{{ ws.name }}</span>
                            <span class="recent-path">{{ ws.path }}</span>
                        </div>
                        <span class="recent-time">{{
                            formatTime(ws.openedAt)
                        }}</span>
                    </button>
                </div>
            </div>

            <!-- Actions -->
            <div class="section">
                <p class="section-label">
                    {{
                        store.recentWorkspaces.length > 0 ? "Or" : "Get started"
                    }}
                </p>
                <div class="action-btns">
                    <button class="action-btn" @click="showNewWorkspace = true">
                        <FolderPlus :size="15" />
                        New workspace
                    </button>
                    <button class="action-btn" @click="openExisting">
                        <FolderOpen :size="15" />
                        Open folder
                    </button>
                    <button class="action-btn" @click="openStandaloneFile">
                        <FileText :size="15" />
                        Open file
                    </button>
                </div>
            </div>

            <!-- Demo mode -->
            <div class="section demo-section">
                <button
                    class="demo-btn"
                    @click="tryDemo"
                    :disabled="launchingDemo"
                >
                    <Sparkles :size="14" />
                    {{ launchingDemo ? "Setting up demo…" : "Try a demo" }}
                </button>
                <p class="demo-hint">
                    Explore a pre-filled PM workspace with simulated peer
                    comments — no setup needed.
                </p>
            </div>

            <p v-if="error" class="error">{{ error }}</p>
        </div>

        <!-- New workspace modal -->
        <div
            v-if="showNewWorkspace"
            class="modal-backdrop"
            @click.self="showNewWorkspace = false"
        >
            <div class="modal">
                <h3 class="modal-title">New workspace</h3>

                <div class="field">
                    <label class="field-label">Name</label>
                    <input
                        v-model="newName"
                        class="field-input"
                        placeholder="my-product"
                        autofocus
                        @keydown.enter="createWorkspace"
                    />
                </div>

                <div class="field">
                    <label class="field-label">Location</label>
                    <div class="path-input">
                        <input v-model="newPath" class="field-input" />
                        <button class="browse-btn" @click="browsePath">
                            Browse
                        </button>
                    </div>
                </div>

                <div class="field">
                    <label class="field-label">Template</label>
                    <div class="template-grid">
                        <label
                            v-for="tmpl in templates"
                            :key="tmpl.id"
                            :class="[
                                'template-card',
                                selectedTemplate === tmpl.id && 'selected',
                            ]"
                        >
                            <input
                                type="radio"
                                v-model="selectedTemplate"
                                :value="tmpl.id"
                            />
                            <div class="tmpl-icon">{{ tmpl.icon }}</div>
                            <div class="tmpl-info">
                                <span class="tmpl-name">{{ tmpl.name }}</span>
                                <span class="tmpl-desc">{{ tmpl.desc }}</span>
                            </div>
                        </label>
                    </div>

                    <!-- PM Framework preview -->
                    <div
                        v-if="selectedTemplate === 'pm-framework'"
                        class="template-preview"
                    >
                        <p class="preview-label">Creates:</p>
                        <div class="preview-tree">
                            <span
                                v-for="item in pmPreview"
                                :key="item"
                                class="preview-item"
                                >{{ item }}</span
                            >
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="btn-ghost" @click="showNewWorkspace = false">
                        Cancel
                    </button>
                    <button
                        class="btn-primary"
                        @click="createWorkspace"
                        :disabled="!newName.trim() || creating"
                    >
                        {{ creating ? "Creating…" : "Create workspace" }}
                    </button>
                </div>
            </div>
        </div>

        <SettingsModal v-if="showSettings" @close="showSettings = false" />
    </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../../store";
import SetupScreen from "./SetupScreen.vue";
import SettingsModal from "../modals/SettingsModal.vue";
import { Folder, FolderPlus, FolderOpen, Sparkles, FileText } from "lucide-vue-next";

const router = useRouter();
const store = useAppStore();

const showSetup = ref(false);
const showNewWorkspace = ref(false);
const showSettings = ref(false);
const error = ref("");
const creating = ref(false);
const launchingDemo = ref(false);
const autoLaunching = ref(
    !store.workspacePath && store.recentWorkspaces.length > 0,
);

const newName = ref("");
const newPath = ref("");
const selectedTemplate = ref("pm-framework");

const templates = [
    {
        id: "pm-framework",
        icon: "📋",
        name: "PM Framework",
        desc: "Vision, Strategy, Planning, Discovery, Implementation, Monitoring",
    },
    {
        id: "blank",
        icon: "📄",
        name: "Blank",
        desc: "Empty workspace — start fresh",
    },
];

const pmPreview = [
    "Vision/ (2 docs)",
    "Strategy/ (2 docs)",
    "Planning/ (2 docs)",
    "Discovery/ (2 docs)",
    "Implementation/ (2 docs)",
    "Monitoring/ (2 docs)",
];

onMounted(() => {
    if (window.canonic?.menu?.onOpenFile) {
        window.canonic.menu.onOpenFile(async (path) => {
            if (path) {
                const success = await store.openStandaloneFile(path);
                if (success) router.push("/workspace");
            }
        });
    }
});

// Check if first-run setup needed
async function checkSetup() {
    const exists = await window.canonic.config.exists();
    showSetup.value = !exists;
    if (showSetup.value) {
        autoLaunching.value = false;
        return;
    }
    await store.loadConfig();
    await store.logEvent("app:start");

    // The main process owns the recent-workspace history; pull the fresh list
    // before deciding whether to reopen the last one (the localStorage cache
    // can be stale or empty on a file:// origin).
    await store.loadRecents();
    const last = store.recentWorkspaces[0];
    autoLaunching.value = !store.workspacePath && !!last;
    if (autoLaunching.value) {
        try {
            await store.openWorkspace(last.path, "blank");
            router.push("/workspace");
        } catch (err) {
            error.value = `Could not reopen "${last.name}": ${err.message}`;
        } finally {
            autoLaunching.value = false;
        }
    }
}
checkSetup();

// Update path when name changes
watch(newName, async (val) => {
    const base =
        store.config?.defaultWorkspacePath ||
        (await window.canonic.workspace.getDefault());
    newPath.value = `${base}/${val}`;
});

async function onSetupDone() {
    showSetup.value = false;
    await store.loadConfig();
    await store.logEvent("app:start");
}

async function openExisting() {
    const chosen = await window.canonic.workspace.openDialog();
    if (!chosen) return;
    await launch(chosen, "blank");
}

async function openStandaloneFile() {
    const chosen = await window.canonic.files.openDialog();
    if (!chosen) return;
    const success = await store.openStandaloneFile(chosen);
    if (success) {
        router.push("/workspace");
    }
}

async function openRecent(path) {
    await launch(path, "blank");
}

async function browsePath() {
    const chosen = await window.canonic.workspace.openDirectoryDialog();
    if (chosen) newPath.value = chosen;
}

async function createWorkspace() {
    if (!newName.value.trim() || creating.value) return;
    creating.value = true;
    try {
        await launch(newPath.value, selectedTemplate.value);
        showNewWorkspace.value = false;
    } finally {
        creating.value = false;
    }
}

async function tryDemo() {
    launchingDemo.value = true;
    error.value = "";
    try {
        await store.enableDemoMode();
        router.push("/workspace");
    } catch (err) {
        error.value = err.message;
    } finally {
        launchingDemo.value = false;
    }
}

async function launch(path, template) {
    error.value = "";
    try {
        await store.openWorkspace(path, template);
        router.push("/workspace");
    } catch (err) {
        error.value = err.message;
    }
}

function formatTime(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
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

.auto-loading {
    display: flex;
    align-items: center;
    justify-content: center;
}

.auto-loading-spinner {
    width: 22px;
    height: 22px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: auto-spin 0.8s linear infinite;
}

@keyframes auto-spin {
    to { transform: rotate(360deg); }
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
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.02em;
}

.logo-img {
    width: 40px;
    height: 20px;
    object-fit: contain;
}

.logo-text {
    color: var(--text-primary);
}
.logo-dot {
    color: var(--accent);
}

.settings-link {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 4px 0;
}

.settings-link:hover {
    color: var(--text-primary);
}

.section {
    margin-bottom: 28px;
}

.section-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 10px;
}

.recent-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

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
    transition:
        background 0.15s,
        border-color 0.15s;
    width: 100%;
}

.recent-item:hover {
    background: var(--bg-hover);
    border-color: var(--accent-muted);
}

.folder-icon {
    color: var(--accent);
    flex-shrink: 0;
}

.recent-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
}
.recent-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
}
.recent-path {
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.recent-time {
    font-size: 0.75rem;
    color: var(--text-muted);
    flex-shrink: 0;
}

.action-btns {
    display: flex;
    gap: 10px;
}

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
    transition:
        background 0.15s,
        color 0.15s;
}

.action-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.error {
    color: var(--error);
    font-size: 0.8125rem;
    margin-top: 12px;
    text-align: center;
}

.demo-section {
    border-top: 1px solid var(--border);
    padding-top: 20px;
}

.demo-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: 1px dashed var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    transition:
        border-color 0.15s,
        color 0.15s,
        background 0.15s;
}

.demo-btn:hover:not(:disabled) {
    border-color: var(--accent-muted);
    color: var(--text-primary);
    background: var(--bg-hover);
}

.demo-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.demo-hint {
    margin-top: 8px;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.4;
}

/* Modal */
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
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

.field {
    margin-bottom: 18px;
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
}

.field-input:focus {
    border-color: var(--accent-muted);
}

.path-input {
    display: flex;
    gap: 8px;
}
.path-input .field-input {
    flex: 1;
}

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

.browse-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.template-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.template-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition:
        border-color 0.15s,
        background 0.15s;
}

.template-card input {
    display: none;
}
.template-card.selected {
    border-color: var(--accent);
    background: var(--bg-active);
}
.template-card:hover:not(.selected) {
    background: var(--bg-hover);
}

.tmpl-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
}
.tmpl-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.tmpl-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
}
.tmpl-desc {
    font-size: 0.775rem;
    color: var(--text-muted);
}

.template-preview {
    margin-top: 10px;
    padding: 10px 12px;
    background: var(--bg-base);
    border-radius: 8px;
    border: 1px solid var(--border);
}

.preview-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 6px;
}

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
    font-family: "JetBrains Mono", monospace;
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
</style>
