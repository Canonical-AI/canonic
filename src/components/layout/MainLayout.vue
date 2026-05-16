<template>
    <div class="layout" :class="{ 'is-resizing': isResizing }">
        <!-- Titlebar -->
        <div class="titlebar">
            <div class="titlebar-left">
                <img src="/canonical-logo.svg" alt="" class="titlebar-logo" />
                <span class="app-name"
                    >canonic<span class="accent">.ai</span></span
                >
            </div>
            <div class="titlebar-right">
                <!-- Update indicator -->
                <template v-if="updateReady">
                    <button class="update-ready-btn" @click="installUpdate" title="Restart and install update">
                        <ArrowUpCircle :size="14" />
                        <span>{{ updateInfo?.version }} ready — Restart</span>
                    </button>
                </template>
                <template v-else-if="updateDownloading">
                    <span class="update-progress-pill">
                        <span class="update-progress-bar" :style="{ width: downloadProgress + '%' }" />
                        <span class="update-progress-label">Downloading… {{ downloadProgress }}%</span>
                    </span>
                </template>
                <template v-else-if="updateAvailable">
                    <button class="update-available-btn" @click="downloadUpdate" title="Download available update">
                        <ArrowUpCircle :size="14" />
                        <span>Update</span>
                    </button>
                </template>

                <!-- Font toggle -->
                <button
                    class="icon-btn"
                    :title="fontMode === 'serif' ? 'Switch to sans-serif' : 'Switch to serif'"
                    @click="toggleFont"
                >
                    <Type :size="15" />
                </button>

                <!-- Theme picker -->
                <div class="theme-picker-wrap" ref="themePickerRef">
                    <button
                        class="icon-btn"
                        title="Change theme"
                        @click="themeOpen = !themeOpen"
                    >
                        <Palette :size="15" />
                    </button>
                    <div v-if="themeOpen" class="theme-popover">
                        <div class="theme-search-wrap">
                            <input
                                v-model="themeSearch"
                                type="text"
                                placeholder="Filter themes..."
                                class="theme-search-input"
                                @click.stop
                            />
                        </div>
                        <div class="theme-list">
                            <button
                                v-for="t in filteredThemes.slice(0, 10)"
                                :key="t.name"
                                class="theme-chip"
                                :class="{ active: activeTheme === t.name }"
                                @click="setTheme(t.name)"
                            >
                                {{ t.name }}
                            </button>
                            <div v-if="filteredThemes.length > 10" class="theme-more-hint">
                                +{{ filteredThemes.length - 10 }} more...
                            </div>
                        </div>

                        <div class="theme-divider"></div>
                        <div class="theme-controls">
                            <label class="theme-control-item" @click.stop>
                                <span>Line numbers</span>
                                <input
                                    type="checkbox"
                                    v-model="store.showLineNumbers"
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <button
                    class="icon-btn"
                    title="Settings"
                    @click="showSettings = true"
                >
                    <Settings :size="15" />
                </button>
            </div>
        </div>

        <!-- Demo mode banner -->
        <DemoBanner />

        <!-- Main content -->
        <div class="content">
            <!-- Left sidebar -->
            <aside
                class="sidebar"
                :class="{ 'sidebar--collapsed': store.sidebarCollapsed }"
            >
                <div class="sidebar-tabs">
                    <button
                        class="tab sidebar-toggle"
                        :title="
                            store.sidebarCollapsed
                                ? 'Expand sidebar'
                                : 'Collapse sidebar'
                        "
                        @click="store.sidebarCollapsed = !store.sidebarCollapsed"
                    >
                        <PanelLeftClose
                            v-if="!store.sidebarCollapsed"
                            :size="15"
                        />
                        <PanelLeftOpen v-else :size="15" />
                    </button>
                    <button
                        :class="[
                            'tab',
                            store.sidebarTab === 'files' && 'active',
                        ]"
                        @click="handleTabClick('files')"
                        title="Files"
                    >
                        <Files :size="15" />
                    </button>
                    <button
                        :class="[
                            'tab',
                            store.sidebarTab === 'search' && 'active',
                        ]"
                        @click="handleTabClick('search')"
                        title="Search"
                    >
                        <Search :size="15" />
                    </button>
                    <button
                        :class="[
                            'tab',
                            store.sidebarTab === 'peers' && 'active',
                        ]"
                        @click="handleTabClick('peers')"
                        title="Shared with me"
                    >
                        <Users :size="15" />
                    </button>
                </div>

                <template v-if="!store.sidebarCollapsed">
                    <FileTree v-if="store.sidebarTab === 'files'" />
                    <SearchPanel v-else-if="store.sidebarTab === 'search'" />
                    <PeersPanel v-else-if="store.sidebarTab === 'peers'" />
                    <HintsPanel :config="store.config" @navigate="handleHintNavigate" />
                </template>
            </aside>

            <!-- Editor -->
            <main class="editor-area">
                <PeerFileViewer v-if="store.peerFileContent" />
                <Editor v-else-if="store.currentFile" />
                <div v-else class="empty-state">
                    <p>Open a document or create a new one</p>
                    <button class="btn-primary" @click="newDoc">
                        New Document
                    </button>
                </div>
            </main>

            <!-- Right panel -->
            <aside
                v-if="store.currentFile || store.peerFileContent"
                class="right-panel"
                :class="{ 'right-panel--collapsed': store.rightPanelCollapsed }"
                :style="store.rightPanelCollapsed ? {} : { width: rightPanelWidth + 'px', transition: isResizing ? 'none' : undefined }"
            >
                <div v-if="!store.rightPanelCollapsed" class="resize-handle" @mousedown="onResizeStart" />
                <div class="panel-tabs" :class="{ 'panel-tabs--collapsed': store.rightPanelCollapsed }">
                    <!-- Collapse toggle (leftmost when collapsed, topmost when open) -->
                    <button
                        class="tab panel-toggle"
                        :title="store.rightPanelCollapsed ? 'Expand panel' : 'Collapse panel'"
                        @click="store.rightPanelCollapsed = !store.rightPanelCollapsed"
                    >
                        <PanelRightClose v-if="!store.rightPanelCollapsed" :size="15" />
                        <PanelRightOpen v-else :size="15" />
                    </button>
                    <button
                        :class="['tab', store.rightPanelTab === 'comments' && 'active']"
                        @click="handleRightTabClick('comments')"
                        title="Comments"
                    >
                        <MessageSquare :size="15" />
                    </button>
                    <button
                        :class="['tab', store.rightPanelTab === 'ai' && 'active']"
                        @click="handleRightTabClick('ai')"
                        title="AI"
                    >
                        <Sparkles :size="15" />
                    </button>
                    <button
                        :class="['tab', store.rightPanelTab === 'history' && 'active']"
                        @click="handleRightTabClick('history')"
                        title="History"
                    >
                        <History :size="15" />
                    </button>
                    <button
                        :class="['tab', store.rightPanelTab === 'share' && 'active']"
                        @click="handleRightTabClick('share')"
                        title="Share"
                    >
                        <Share2 :size="15" />
                    </button>
                </div>
                <template v-if="!store.rightPanelCollapsed">
                    <CommentsPanel v-if="store.rightPanelTab === 'comments'" />
                    <AIChat v-else-if="store.rightPanelTab === 'ai'" />
                    <HistoryPanel v-else-if="store.rightPanelTab === 'history'" />
                    <SharePanel v-else-if="store.rightPanelTab === 'share'" />
                </template>
            </aside>
        </div>

        <!-- Update prompt -->
        <Transition name="update-prompt">
            <div v-if="showUpdatePrompt" class="update-prompt">
                <ArrowUpCircle :size="15" class="update-prompt-icon" />
                <span class="update-prompt-text">v{{ updateInfo?.version }} available</span>
                <button class="update-prompt-btn update-prompt-btn--primary" @click="handlePromptDownload">Download now</button>
                <button class="update-prompt-btn" @click="showUpdatePrompt = false">Later</button>
            </div>
        </Transition>

        <!-- Modals -->
        <NewDocModal v-if="showNewDoc" @close="showNewDoc = false" />
        <SettingsModal v-if="showSettings" :initial-tab="settingsInitialTab" @close="showSettings = false; settingsInitialTab = 'profile'" />

        <AgentSessionPill />
    </div>
</template>

<script setup>
import { ref, computed, provide, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../../store";
import {
    Settings,
    Files,
    Search,
    Users,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    Type,
    Palette,
    MessageSquare,
    Sparkles,
    History,
    Share2,
    ArrowUpCircle,
} from "lucide-vue-next";
import FileTree from "../sidebar/FileTree.vue";
import SearchPanel from "../sidebar/SearchPanel.vue";
import PeersPanel from "../sidebar/PeersPanel.vue";
import HintsPanel from "../sidebar/HintsPanel.vue";
import { markDefaultEditorActive } from "../../composables/useHints.js";
import Editor from "../editor/Editor.vue";
import PeerFileViewer from "../panels/PeerFileViewer.vue";
import CommentsPanel from "../panels/CommentsPanel.vue";
import AIChat from "../panels/AIChat.vue";
import HistoryPanel from "../panels/HistoryPanel.vue";
import SharePanel from "../panels/SharePanel.vue";
import NewDocModal from "../modals/NewDocModal.vue";
import SettingsModal from "../modals/SettingsModal.vue";
import DemoBanner from "./DemoBanner.vue";
import AgentSessionPill from "./AgentSessionPill.vue";

const store = useAppStore();
const router = useRouter();

// ── Font toggle ──────────────────────────────────────────────────────────────
const FONT_KEY = "canonic:fontMode";
const fontMode = ref(localStorage.getItem(FONT_KEY) || "serif");

function applyFont(mode) {
    if (mode === "sans") {
        document.documentElement.classList.add("font-sans");
    } else {
        document.documentElement.classList.remove("font-sans");
    }
}

function toggleFont() {
    fontMode.value = fontMode.value === "serif" ? "sans" : "serif";
    localStorage.setItem(FONT_KEY, fontMode.value);
    applyFont(fontMode.value);
}

// ── Theme switcher ───────────────────────────────────────────────────────────
const THEME_KEY = "canonic:theme";
const BUILTIN_THEMES = ["hal2001", "auteur", "paper", "mocha", "macchiato", "latte", "dracula", "nord", "solarized", "gruvbox", "tokyo"];

const activeTheme = ref(localStorage.getItem(THEME_KEY) || "hal2001");
const themeOpen = ref(false);
const themePickerRef = ref(null);
const themeSearch = ref("");

// Config-extensible custom themes injected as <style> tags
const customThemeNames = ref([]);

const allThemes = computed(() => {
    const names = [...BUILTIN_THEMES, ...customThemeNames.value];
    return names.map((name) => ({ name }));
});

const filteredThemes = computed(() => {
    if (!themeSearch.value) return allThemes.value;
    const s = themeSearch.value.toLowerCase();
    return allThemes.value.filter(t => t.name.toLowerCase().includes(s));
});

function applyTheme(name) {
    if (!name || name === "hal2001") {
        document.documentElement.removeAttribute("data-theme");
    } else {
        document.documentElement.setAttribute("data-theme", name);
    }
}

function setTheme(name) {
    activeTheme.value = name;
    localStorage.setItem(THEME_KEY, name);
    applyTheme(name);
    themeOpen.value = false;
}

function registerConfigThemes(themes) {
    if (!Array.isArray(themes)) return;
    for (const t of themes) {
        if (!t.name || !t.vars) continue;
        // Skip if already a built-in
        if (BUILTIN_THEMES.includes(t.name)) continue;
        // Inject CSS
        const id = `theme-custom-${t.name}`;
        if (!document.getElementById(id)) {
            const declarations = Object.entries(t.vars)
                .map(([k, v]) => `  ${k}: ${v};`)
                .join("\n");
            const style = document.createElement("style");
            style.id = id;
            style.textContent = `[data-theme="${t.name}"] {\n${declarations}\n}`;
            document.head.appendChild(style);
        }
        if (!customThemeNames.value.includes(t.name)) {
            customThemeNames.value.push(t.name);
        }
    }
}

// Close theme popover on outside click
function onDocClick(e) {
    if (themePickerRef.value && !themePickerRef.value.contains(e.target)) {
        themeOpen.value = false;
    }
}

// Restore workspace on page reload (hash URL preserves /workspace but Pinia store is fresh)
onMounted(async () => {
    // Apply persisted font & theme immediately
    applyFont(fontMode.value);
    applyTheme(activeTheme.value);
    if (store.showLineNumbers) {
        document.documentElement.setAttribute("data-line-numbers", "true");
    }

    // Load version info
    if (window.canonic?.app?.getVersion) {
        store.appVersion = await window.canonic.app.getVersion();
    }

    // Suppress default-editor hint if already set
    if (window.canonic?.app?.isDefaultEditor) {
        const isDefault = await window.canonic.app.isDefaultEditor();
        if (isDefault) markDefaultEditorActive();
    }

    // Load config to register any custom themes
    await store.loadConfig();
    if (store.config?.themes) {
        registerConfigThemes(store.config.themes);
    }

    document.addEventListener("click", onDocClick, true);

    // Listen for menu events
    if (window.canonic?.menu) {
        window.canonic.menu.onOpenSettings(() => {
            showSettings.value = true;
        });

        window.canonic.menu.onNewWorkspace(async (workspacePath) => {
            if (workspacePath) {
                try {
                    await store.openWorkspace(workspacePath, "blank");
                    router.push("/workspace");
                } catch (err) {
                    console.error("Failed to create workspace from menu:", err);
                }
            }
        });

        window.canonic.menu.onOpenWorkspace(async (workspacePath) => {
            if (workspacePath) {
                try {
                    await store.openWorkspace(workspacePath, "blank");
                    router.push("/workspace");
                } catch (err) {
                    console.error("Failed to open workspace from menu:", err);
                }
            }
        });

        window.canonic.menu.onOpenFile(async (path) => {
            if (path) {
                try {
                    await store.openStandaloneFile(path);
                } catch (err) {
                    console.error("Failed to open file from menu:", err);
                }
            }
        });
    }

    if (!store.workspacePath && !store.currentFile) {
        const last = store.recentWorkspaces[0];
        if (last) {
            try {
                await store.openWorkspace(last.path, "blank");
            } catch {
                router.push("/");
            }
        } else {
            router.push("/");
        }
    }
});

onBeforeUnmount(() => {
    document.removeEventListener("click", onDocClick, true);
});

const showNewDoc = ref(false);
const showSettings = ref(false);
const settingsInitialTab = ref('profile');

function handleHintNavigate(target) {
    if (target.startsWith('settings:')) {
        settingsInitialTab.value = target.slice('settings:'.length)
    }
    showSettings.value = true
}
const { updateReady, updateAvailable, updateDownloading, updateInfo, downloadProgress, downloadUpdate, installUpdate } = store;

const showUpdatePrompt = ref(false)
watch(updateAvailable, (val) => {
    if (val && !updateDownloading.value && !updateReady.value) {
        setTimeout(() => { showUpdatePrompt.value = true }, 2000)
    }
})
function handlePromptDownload() {
    showUpdatePrompt.value = false
    downloadUpdate()
}

provide("showNewDoc", () => {
    showNewDoc.value = true;
});

async function newDoc() {
    showNewDoc.value = true;
}

function handleTabClick(tab) {
    if (store.sidebarCollapsed) {
        store.sidebarCollapsed = false;
        store.sidebarTab = tab;
    } else {
        store.sidebarTab = tab;
    }
}

function handleRightTabClick(tab) {
    if (store.rightPanelCollapsed) {
        store.rightPanelCollapsed = false;
        store.rightPanelTab = tab;
    } else {
        store.rightPanelTab = tab;
    }
}

const RIGHT_PANEL_WIDTH_KEY = "canonic:rightPanelWidth";
const rightPanelWidth = ref(
    parseInt(localStorage.getItem(RIGHT_PANEL_WIDTH_KEY) || "280")
);
const isResizing = ref(false);

function onResizeStart(e) {
    e.preventDefault();
    isResizing.value = true;
    const startX = e.clientX;
    const startWidth = rightPanelWidth.value;

    function onMouseMove(e) {
        const delta = startX - e.clientX;
        rightPanelWidth.value = Math.max(200, Math.min(600, startWidth + delta));
    }

    function onMouseUp() {
        isResizing.value = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, rightPanelWidth.value);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
}
</script>

<style scoped>
.layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-container);
    color: var(--text-primary);
}

.layout.is-resizing,
.layout.is-resizing * {
    user-select: none;
    cursor: col-resize !important;
}

.titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 44px;
    background: var(--bg-titlebar);
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
    flex-shrink: 0;
    padding-left: 80px; /* room for macOS traffic lights */
}

.titlebar-logo {
    width: 28px;
    height: 14px;
    object-fit: contain;
    margin-right: 4px;
    flex-shrink: 0;
}

.app-name {
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: -0.01em;
}

.accent {
    color: var(--accent);
}

.titlebar-right {
    display: flex;
    gap: 4px;
    -webkit-app-region: no-drag;
}

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s;
}

.icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.content {
    display: flex;
    flex: 1;
    overflow: hidden;
}

.sidebar {
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    overflow: hidden;
    transition: width 0.2s ease;
}

.sidebar--collapsed {
    width: 40px;
}

.sidebar-tabs {
    display: flex;
    padding: 8px;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
}

.sidebar--collapsed .sidebar-tabs {
    flex-direction: column;
    padding: 4px;
    gap: 2px;
}

.sidebar-toggle {
    margin-right: auto;
}

.sidebar--collapsed .sidebar-toggle {
    margin-right: 0;
}

.tab {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s;
}

.tab.active {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.tab:hover:not(.active) {
    color: var(--text-secondary);
}

.editor-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-editor);
}

.empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--text-muted);
}

.btn-primary {
    background: var(--accent);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
}

.btn-primary:hover {
    opacity: 0.85;
}

.right-panel {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    background: var(--bg-sidebar);
    overflow: hidden;
    transition: width 0.2s ease;
    position: relative;
}

.resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    z-index: 10;
    transition: background 0.15s;
}

.resize-handle:hover {
    background: var(--accent-muted);
}

.right-panel--collapsed {
    width: 40px;
}

.panel-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
}

.panel-tabs--collapsed {
    flex-direction: column;
    border-bottom: none;
    border-right: none;
    height: 100%;
}

.panel-tabs .tab {
    flex: 0 0 auto;
    border-radius: 0;
    padding: 9px 12px;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
}

.panel-tabs--collapsed .tab {
    flex: 0 0 auto;
    padding: 10px 0;
}

.panel-tabs .tab.active {
    background: transparent;
    color: var(--text-primary);
    border-bottom: 2px solid var(--accent);
}

.panel-tabs--collapsed .tab.active {
    border-bottom: none;
    border-left: 2px solid var(--accent);
}

.panel-toggle {
    margin-right: auto;
}

.panel-tabs--collapsed .panel-toggle {
    margin-right: 0;
    order: -1;
}

/* ── Titlebar update indicator ── */
.update-prompt {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    z-index: 9999;
    font-size: 0.8125rem;
    color: var(--text);
}
.update-prompt-icon { color: var(--accent); flex-shrink: 0; }
.update-prompt-text { font-weight: 500; white-space: nowrap; }
.update-prompt-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
}
.update-prompt-btn:hover { background: var(--bg-hover); }
.update-prompt-btn--primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
}
.update-prompt-btn--primary:hover { opacity: 0.88; background: var(--accent); }
.update-prompt-enter-active, .update-prompt-leave-active { transition: opacity 0.2s, transform 0.2s; }
.update-prompt-enter-from, .update-prompt-leave-to { opacity: 0; transform: translateY(8px); }

.update-ready-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    animation: update-pulse 2s ease-in-out infinite;
    white-space: nowrap;
    -webkit-app-region: no-drag;
}

.update-ready-btn:hover {
    opacity: 0.88;
}

@keyframes update-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(74, 122, 155, 0.5); }
    50%       { box-shadow: 0 0 0 5px rgba(74, 122, 155, 0); }
}

.update-available-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--accent-muted);
    background: transparent;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
    -webkit-app-region: no-drag;
}

.update-available-btn:hover {
    background: var(--accent-muted);
}

.update-progress-pill {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-hover);
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    min-width: 60px;
    white-space: nowrap;
}

.update-progress-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--accent-muted);
    transition: width 0.3s ease;
    z-index: 0;
}

.update-progress-label {
    position: relative;
    z-index: 1;
}

/* Theme picker */
.theme-picker-wrap {
    position: relative;
}

.theme-popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    z-index: 300;
    min-width: 140px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.theme-search-wrap {
    padding: 4px;
    margin-bottom: 4px;
}

.theme-search-input {
    width: 100%;
    background: var(--bg-body);
    border: 1px solid var(--border-mid);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.75rem;
    padding: 4px 8px;
    outline: none;
}

.theme-search-input:focus {
    border-color: var(--accent-muted);
}

.theme-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 250px;
    overflow-y: auto;
}

.theme-more-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    padding: 4px 12px;
    font-style: italic;
}

.theme-divider {
    height: 1px;
    background: var(--border-light);
    margin: 6px 4px;
}

.theme-controls {
    padding: 4px;
}

.theme-control-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 8px;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: 4px;
}

.theme-control-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.theme-chip {
    padding: 6px 12px;
    border-radius: 5px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s, color 0.12s;
    white-space: nowrap;
}

.theme-chip:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.theme-chip.active {
    background: var(--accent-muted);
    color: var(--accent-light);
    font-weight: 600;
}
</style>
