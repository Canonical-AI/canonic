<template>
    <div class="layout">
        <!-- Titlebar -->
        <div class="titlebar">
            <div class="titlebar-left">
                <img src="/canonical-logo.svg" alt="" class="titlebar-logo" />
                <span class="app-name"
                    >canonic<span class="accent">.ai</span></span
                >
            </div>
            <div class="titlebar-right">
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
                        <button
                            v-for="t in allThemes"
                            :key="t.name"
                            class="theme-chip"
                            :class="{ active: activeTheme === t.name }"
                            @click="setTheme(t.name)"
                        >
                            {{ t.name }}
                        </button>
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
                        v-if="store.isDemoMode || store.demoPeers.length"
                    >
                        <Users :size="15" />
                    </button>
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
                </div>

                <template v-if="!store.sidebarCollapsed">
                    <FileTree v-if="store.sidebarTab === 'files'" />
                    <SearchPanel v-else-if="store.sidebarTab === 'search'" />
                    <PeersPanel v-else-if="store.sidebarTab === 'peers'" />
                </template>
            </aside>

            <!-- Editor -->
            <main class="editor-area">
                <Editor v-if="store.currentFile" />
                <div v-else class="empty-state">
                    <p>Open a document or create a new one</p>
                    <button class="btn-primary" @click="newDoc">
                        New Document
                    </button>
                </div>
            </main>

            <!-- Right panel -->
            <aside
                v-if="store.currentFile"
                class="right-panel"
                :class="{ 'right-panel--collapsed': store.rightPanelCollapsed }"
            >
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
                        <span v-if="!store.rightPanelCollapsed" class="tab-label">Comments</span>
                    </button>
                    <button
                        :class="['tab', store.rightPanelTab === 'ai' && 'active']"
                        @click="handleRightTabClick('ai')"
                        title="AI"
                    >
                        <Sparkles :size="15" />
                        <span v-if="!store.rightPanelCollapsed" class="tab-label">AI</span>
                    </button>
                    <button
                        :class="['tab', store.rightPanelTab === 'history' && 'active']"
                        @click="handleRightTabClick('history')"
                        title="History"
                    >
                        <History :size="15" />
                        <span v-if="!store.rightPanelCollapsed" class="tab-label">History</span>
                    </button>
                    <button
                        :class="['tab', store.rightPanelTab === 'share' && 'active']"
                        @click="handleRightTabClick('share')"
                        title="Share"
                    >
                        <Share2 :size="15" />
                        <span v-if="!store.rightPanelCollapsed" class="tab-label">Share</span>
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

        <!-- Update banner -->
        <div
            v-if="updateAvailable || updateDownloading || updateReady"
            class="update-banner"
        >
            <template v-if="updateReady">
                <span>A new version of Canonic is ready.</span>
                <button class="update-btn" @click="installUpdate">
                    Restart & Update
                </button>
                <button class="update-dismiss" @click="clearUpdate">
                    Later
                </button>
            </template>
            <template v-else-if="updateDownloading">
                <span>Downloading update... {{ downloadProgress }}%</span>
                <div class="progress-bar-bg">
                    <div
                        class="progress-bar-fill"
                        :style="{ width: downloadProgress + '%' }"
                    ></div>
                </div>
            </template>
            <template v-else-if="updateAvailable">
                <span>New version available ({{ updateInfo?.version }}).</span>
                <button class="update-btn" @click="downloadUpdate">
                    Download
                </button>
                <button class="update-dismiss" @click="clearUpdate">
                    Later
                </button>
            </template>
        </div>

        <!-- Modals -->
        <NewDocModal v-if="showNewDoc" @close="showNewDoc = false" />
        <SettingsModal v-if="showSettings" @close="showSettings = false" />
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
} from "lucide-vue-next";
import FileTree from "../sidebar/FileTree.vue";
import SearchPanel from "../sidebar/SearchPanel.vue";
import PeersPanel from "../sidebar/PeersPanel.vue";
import Editor from "../editor/Editor.vue";
import CommentsPanel from "../panels/CommentsPanel.vue";
import AIChat from "../panels/AIChat.vue";
import HistoryPanel from "../panels/HistoryPanel.vue";
import SharePanel from "../panels/SharePanel.vue";
import NewDocModal from "../modals/NewDocModal.vue";
import SettingsModal from "../modals/SettingsModal.vue";
import DemoBanner from "./DemoBanner.vue";

const store = useAppStore();
const router = useRouter();

// ── Font toggle ──────────────────────────────────────────────────────────────
const FONT_KEY = "canonic:fontMode";
const fontMode = ref(localStorage.getItem(FONT_KEY) || "sans");

function applyFont(mode) {
    if (mode === "serif") {
        document.documentElement.classList.add("font-serif");
    } else {
        document.documentElement.classList.remove("font-serif");
    }
}

function toggleFont() {
    fontMode.value = fontMode.value === "serif" ? "sans" : "serif";
    localStorage.setItem(FONT_KEY, fontMode.value);
    applyFont(fontMode.value);
}

// ── Theme switcher ───────────────────────────────────────────────────────────
const THEME_KEY = "canonic:theme";
const BUILTIN_THEMES = ["hal2001", "auteur", "paper"];

const activeTheme = ref(localStorage.getItem(THEME_KEY) || "hal2001");
const themeOpen = ref(false);
const themePickerRef = ref(null);

// Config-extensible custom themes injected as <style> tags
const customThemeNames = ref([]);

const allThemes = computed(() => {
    const names = [...BUILTIN_THEMES, ...customThemeNames.value];
    return names.map((name) => ({ name }));
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

    // Load config to register any custom themes
    await store.loadConfig();
    if (store.config?.themes) {
        registerConfigThemes(store.config.themes);
    }

    document.addEventListener("click", onDocClick, true);

    if (!store.workspacePath) {
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
const updateReady = ref(false);
const updateAvailable = ref(false);
const updateDownloading = ref(false);
const updateInfo = ref(null);
const downloadProgress = ref(0);

provide("showNewDoc", () => {
    showNewDoc.value = true;
});

if (window.canonic?.update) {
    window.canonic.update.onAvailable?.((info) => {
        updateInfo.value = info;
        updateAvailable.value = true;
    });
    window.canonic.update.onProgress?.((progress) => {
        updateDownloading.value = true;
        updateAvailable.value = false;
        downloadProgress.value = Math.round(progress.percent);
    });
    window.canonic.update.onDownloaded?.(() => {
        updateReady.value = true;
        updateDownloading.value = false;
        updateAvailable.value = false;
    });
    window.canonic.update.onError?.((err) => {
        console.error("Update error:", err);
        clearUpdate();
    });
}

function downloadUpdate() {
    updateAvailable.value = false;
    updateDownloading.value = true;
    window.canonic?.update.download();
}

function installUpdate() {
    window.canonic?.update.install();
}

function clearUpdate() {
    updateAvailable.value = false;
    updateDownloading.value = false;
    updateReady.value = false;
}

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
</script>

<style scoped>
.layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-base);
    color: var(--text-primary);
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

.branch-selector {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 16px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8125rem;
    color: var(--text-muted);
    -webkit-app-region: no-drag;
    position: relative;
    transition: background 0.15s;
}

.branch-selector:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
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
    margin-left: auto;
}

.sidebar--collapsed .sidebar-toggle {
    margin-left: 0;
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
    flex: 1;
    border-radius: 0;
    padding: 9px 0;
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
    margin-left: auto;
}

.panel-tabs--collapsed .panel-toggle {
    margin-left: 0;
    order: -1;
}

.menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
}

.update-banner {
    position: fixed;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg-surface);
    border: 1px solid var(--accent);
    border-radius: 10px;
    font-size: 0.875rem;
    color: var(--text-primary);
    z-index: 500;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.update-btn {
    padding: 6px 14px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
}

.update-btn:hover {
    opacity: 0.85;
}

.update-dismiss {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0;
}

.update-dismiss:hover {
    color: var(--text-secondary);
}

.progress-bar-bg {
    width: 100px;
    height: 4px;
    background: var(--bg-hover);
    border-radius: 2px;
    overflow: hidden;
    margin-left: 8px;
}

.progress-bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
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
    gap: 3px;
    z-index: 300;
    min-width: 110px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
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
