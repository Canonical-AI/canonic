<template>
    <div
        class="layout"
        :class="{
            'is-resizing': isResizing,
            'layout-compact': store.isCompactLayout,
            'layout-mac': isMac,
        }"
    >
        <!-- Titlebar — Vue chrome on all platforms; macOS traffic lights overlay via hiddenInset + padding-left -->
        <div v-if="!store.isCompactLayout" class="titlebar" data-tauri-drag-region>
            <div class="titlebar-left" data-tauri-drag-region>
                <img src="/canonical-logo.svg" alt="" class="titlebar-logo" />
                <span class="app-name">canonic</span>
                <AppMenu
                    @open-settings="showSettings = true"
                    @reload-config="reloadConfig"
                />
            </div>
            <div class="titlebar-center" data-tauri-drag-region></div>
            <div class="titlebar-right" @mousedown.stop>
                <!-- Update indicator -->
                <template v-if="updateReady">
                    <button
                        class="icon-btn"
                        @click="installUpdate"
                        title="Restart and install update"
                    >
                        <ArrowUpCircle :size="15" />
                    </button>
                </template>
                <template v-else-if="updateDownloading">
                    <div
                        class="icon-btn"
                        :title="'Downloading update ' + downloadProgress + '%'"
                    >
                        <ArrowUpCircle :size="15" style="opacity: 0.5" />
                    </div>
                </template>
                <template v-else-if="updateAvailable">
                    <button
                        class="icon-btn"
                        @click="downloadUpdate"
                        title="Download available update"
                    >
                        <ArrowUpCircle :size="15" />
                    </button>
                </template>

                <!-- Font toggle -->
                <button
                    class="icon-btn"
                    :title="
                        fontMode === 'serif'
                            ? 'Switch to sans-serif'
                            : 'Switch to serif'
                    "
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
                            <div
                                v-if="filteredThemes.length > 10"
                                class="theme-more-hint"
                            >
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
                            <label class="theme-control-item" @click.stop>
                                <span>Stack split panels</span>
                                <input
                                    type="checkbox"
                                    v-model="store.splitStacked"
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Focus mode toggle -->
                <button
                    class="icon-btn"
                    :class="{ active: store.distractionFreeMode }"
                    :title="
                        store.distractionFreeMode
                            ? 'Exit Focus Mode'
                            : 'Enter Focus Mode (Distraction-free)'
                    "
                    @click="toggleDistractionFree"
                >
                    <Eye :size="15" />
                </button>

                <!-- Settings -->
                <button
                    class="icon-btn"
                    title="Settings"
                    @click="showSettings = true"
                >
                    <Settings :size="15" />
                </button>
            </div>
        </div>

        <!-- Compact Thin Header -->
        <div
            v-if="store.isCompactLayout"
            class="mobile-header"
            :class="{ 'mobile-header--mac': isMac }"
            data-tauri-drag-region
        >
            <div class="mobile-header-left" @mousedown.stop>
                <button
                    class="mobile-menu-btn"
                    @click="mobileMenuOpen = !mobileMenuOpen"
                    ref="menuBtnRef"
                    title="Menu"
                >
                    <Menu :size="16" />
                </button>
                <img src="/canonical-logo.svg" alt="" class="mobile-logo" />
                <span class="app-name">canonic</span>
            </div>
            <div class="mobile-header-right" @mousedown.stop>
                <!-- Focus mode toggle button in header to exit Focus Mode if manually entered -->
                <button
                    v-if="store.distractionFreeMode"
                    class="mobile-icon-btn active-focus"
                    title="Exit Focus Mode"
                    @click="store.distractionFreeMode = false"
                >
                    <EyeOff :size="14" />
                </button>
                <button
                    class="mobile-icon-btn"
                    @click="showSettings = true"
                    title="Settings"
                >
                    <Settings :size="14" />
                </button>
            </div>

            <!-- Compact Navigation Menu Popover -->
            <div
                v-if="mobileMenuOpen"
                class="mobile-menu-dropdown"
                ref="mobileMenuDropdownRef"
            >
                <div class="dropdown-section">
                    <button class="dropdown-item" @click="toggleAppMenu">
                        <Menu :size="14" />
                        <span>Menu</span>
                        <ChevronRight
                            :size="14"
                            class="app-menu-chevron"
                            :class="{ open: appMenuExpanded }"
                        />
                    </button>
                    <template v-if="appMenuExpanded">
                        <template
                            v-for="group in appMenuGroups"
                            :key="group.label"
                        >
                            <div class="dropdown-subgroup-label">
                                {{ group.label }}
                            </div>
                            <button
                                v-for="item in group.items"
                                :key="item.label"
                                class="dropdown-item dropdown-item--nested"
                                @click="runAppMenuItem(item)"
                            >
                                <span>{{ item.label }}</span>
                            </button>
                        </template>
                    </template>
                </div>
                <div class="dropdown-divider"></div>
                <div class="dropdown-section">
                    <div class="dropdown-section-title">Navigation</div>
                    <button
                        class="dropdown-item"
                        @click="openMobileTab('left', 'files')"
                    >
                        <Files :size="14" />
                        <span>Files</span>
                    </button>
                    <button class="dropdown-item" @click="openMobileSearch">
                        <Search :size="14" />
                        <span>Find & Replace</span>
                    </button>
                    <button
                        class="dropdown-item"
                        @click="openMobileTab('left', 'peers')"
                    >
                        <Users :size="14" />
                        <span>Shared with me</span>
                    </button>
                </div>
                <div class="dropdown-divider"></div>
                <div class="dropdown-section">
                    <div class="dropdown-section-title">Tools & Panels</div>
                    <button
                        class="dropdown-item"
                        @click="openMobileTab('right', 'comments')"
                    >
                        <MessageSquare :size="14" />
                        <span>Comments</span>
                    </button>
                    <button
                        class="dropdown-item"
                        @click="openMobileTab('right', 'agent')"
                    >
                        <Bot :size="14" />
                        <span>Agent</span>
                    </button>
                    <button
                        class="dropdown-item"
                        @click="openMobileTab('right', 'history')"
                    >
                        <History :size="14" />
                        <span>History</span>
                    </button>
                    <button
                        class="dropdown-item"
                        @click="openMobileTab('right', 'share')"
                    >
                        <Share2 :size="14" />
                        <span>Share</span>
                    </button>
                </div>
                <div class="dropdown-divider"></div>
                <div class="dropdown-section">
                    <button
                        class="dropdown-item"
                        @click="toggleDistractionFree"
                    >
                        <Eye :size="14" v-if="!store.distractionFreeMode" />
                        <EyeOff :size="14" v-else />
                        <span>{{
                            store.distractionFreeMode
                                ? "Exit Focus Mode"
                                : "Focus Mode"
                        }}</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- Demo mode banner -->
        <DemoBanner />

        <!-- Main content -->
        <div class="content">
            <!-- Left sidebar -->
            <aside
                class="sidebar"
                :class="{
                    'sidebar--collapsed': store.sidebarCollapsed,
                    'sidebar--floating': sidebarFloating,
                }"
            >
                <div class="sidebar-tabs">
                    <button
                        class="tab sidebar-toggle"
                        :title="
                            store.sidebarCollapsed
                                ? 'Expand sidebar'
                                : 'Collapse sidebar'
                        "
                        @click="
                            store.sidebarCollapsed = !store.sidebarCollapsed
                        "
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
                        :class="['tab', store.searchViewOpen && 'active']"
                        @click="toggleSearchView"
                        title="Find & Replace"
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
                    <PeersPanel v-else-if="store.sidebarTab === 'peers'" />
                    <HintsPanel
                        :config="store.config"
                        @navigate="handleHintNavigate"
                    />
                </template>
            </aside>

            <!-- Editor -->
            <main class="editor-area">
                <SearchView v-if="store.searchViewOpen" ref="searchViewRef" />
                <PeerFileViewer v-else-if="store.peerFileContent" />
                <template v-else-if="store.currentFile">
                    <EditorTabs
                        v-if="store.tabsEnabled && store.tabsPosition === 'top'"
                    />
                    <div
                        class="split-row"
                        :class="{ 'split-row--stacked': store.splitStacked }"
                    >
                        <div
                            class="split-pane"
                            :class="{
                                'split-pane--active':
                                    store.refPanes.length === 0 ||
                                    store.activePane === 'main',
                                'split-pane--dragover': activeDragOver,
                            }"
                            @focusin="store.setActivePane('main')"
                            @dragover.capture="onActiveDragOver"
                            @dragleave="activeDragOver = false"
                            @drop.capture="onActiveDrop"
                        >
                            <Editor />
                        </div>
                        <template v-if="store.refPanes.length === 2">
                            <div
                                class="split-row split-row--nested"
                                :class="{ 'split-row--stacked': !store.splitStacked }"
                            >
                                <RefDocPane
                                    v-for="(p, i) in store.refPanes"
                                    :key="p + ':' + i"
                                    :file-path="p"
                                    :index="i"
                                />
                            </div>
                        </template>
                        <template v-else>
                            <RefDocPane
                                v-for="(p, i) in store.refPanes"
                                :key="p + ':' + i"
                                :file-path="p"
                                :index="i"
                            />
                        </template>
                    </div>
                    <EditorTabs
                        v-if="store.tabsEnabled && store.tabsPosition !== 'top'"
                    />
                </template>
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
                :class="{
                    'right-panel--collapsed': store.rightPanelCollapsed,
                    'right-panel--floating': panelFloating,
                }"
                :style="
                    store.rightPanelCollapsed
                        ? {}
                        : panelFloating
                          ? {}
                          : {
                                width: rightPanelWidth + 'px',
                                transition: isResizing ? 'none' : undefined,
                            }
                "
            >
                <div
                    v-if="!store.rightPanelCollapsed"
                    class="resize-handle"
                    @mousedown="onResizeStart"
                />
                <div
                    class="panel-tabs"
                    :class="{
                        'panel-tabs--collapsed': store.rightPanelCollapsed,
                    }"
                >
                    <!-- Collapse toggle (leftmost when collapsed, topmost when open) -->
                    <button
                        class="tab panel-toggle"
                        :title="
                            store.rightPanelCollapsed
                                ? 'Expand panel'
                                : 'Collapse panel'
                        "
                        @click="
                            store.rightPanelCollapsed =
                                !store.rightPanelCollapsed
                        "
                    >
                        <PanelRightClose
                            v-if="!store.rightPanelCollapsed"
                            :size="15"
                        />
                        <PanelRightOpen v-else :size="15" />
                    </button>
                    <button
                        :class="[
                            'tab',
                            store.rightPanelTab === 'comments' && 'active',
                        ]"
                        @click="handleRightTabClick('comments')"
                        title="Comments"
                    >
                        <MessageSquare :size="15" />
                    </button>
                    <button
                        :class="[
                            'tab',
                            store.rightPanelTab === 'agent' && 'active',
                        ]"
                        @click="handleRightTabClick('agent')"
                        title="Agent"
                    >
                        <Bot :size="15" />
                    </button>
                    <button
                        :class="[
                            'tab',
                            store.rightPanelTab === 'history' && 'active',
                        ]"
                        @click="handleRightTabClick('history')"
                        title="History"
                    >
                        <History :size="15" />
                    </button>
                    <button
                        :class="[
                            'tab',
                            store.rightPanelTab === 'share' && 'active',
                        ]"
                        @click="handleRightTabClick('share')"
                        title="Share"
                    >
                        <Share2 :size="15" />
                    </button>
                </div>
                <div
                    v-show="!store.rightPanelCollapsed"
                    class="panel-content-wrap"
                >
                    <CommentsPanel v-if="store.rightPanelTab === 'comments'" />
                    <HistoryPanel v-if="store.rightPanelTab === 'history'" />
                    <SharePanel v-if="store.rightPanelTab === 'share'" />
                </div>
                <!-- AgentPanel replaces old AI chat. -->
                <AgentPanel
                    v-show="
                        store.rightPanelTab === 'agent' &&
                        !store.rightPanelCollapsed
                    "
                />
            </aside>
        </div>

        <!-- Update prompt -->
        <Transition name="update-prompt">
            <div v-if="showUpdatePrompt" class="update-prompt">
                <ArrowUpCircle :size="15" class="update-prompt-icon" />
                <span class="update-prompt-text"
                    >v{{ updateInfo?.version }} available</span
                >
                <button
                    class="update-prompt-btn update-prompt-btn--primary"
                    @click="handlePromptDownload"
                >
                    Download now
                </button>
                <button
                    class="update-prompt-btn"
                    @click="showUpdatePrompt = false"
                >
                    Later
                </button>
            </div>
        </Transition>

        <!-- Backdrop overlays for compact modals -->
        <div
            v-if="store.isCompactLayout && !store.sidebarCollapsed"
            class="mobile-backdrop"
            @click="store.sidebarCollapsed = true"
        />
        <div
            v-if="store.isCompactLayout && !store.rightPanelCollapsed"
            class="mobile-backdrop"
            @click="store.rightPanelCollapsed = true"
        />

        <!-- Modals -->
        <NewDocModal v-if="showNewDoc" @close="showNewDoc = false" />
        <SettingsModal
            v-if="showSettings"
            :initial-tab="settingsInitialTab"
            @close="
                showSettings = false;
                settingsInitialTab = 'profile';
            "
        />
        <ConfirmModal />

        <AgentSessionPill />
        <ExternalChangeToast />

        <!-- Organic Grain Overlay -->
        <div class="grain-overlay" />
        <svg style="display: none">
            <filter id="grainy-noise">
                <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.65"
                    numOctaves="3"
                    stitchTiles="stitch"
                />
                <feColorMatrix type="saturate" values="0" />
            </filter>
        </svg>
    </div>
</template>

<script setup>
import {
    ref,
    computed,
    provide,
    watch,
    onMounted,
    onBeforeUnmount,
    nextTick,
} from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../../store";
import { storeToRefs } from "pinia";
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
    Bot,
    History,
    Share2,
    ArrowUpCircle,
    Menu,
    ChevronRight,
    Eye,
    EyeOff,
} from "lucide-vue-next";
import FileTree from "../sidebar/FileTree.vue";
import PeersPanel from "../sidebar/PeersPanel.vue";
import SearchView from "../panels/SearchView.vue";
import HintsPanel from "../sidebar/HintsPanel.vue";
import { markDefaultEditorActive } from "../../composables/useHints.js";
import { storage } from "../../utils/storage.js";
import Editor from "../editor/Editor.vue";
import EditorTabs from "../editor/EditorTabs.vue";
import RefDocPane from "../editor/RefDocPane.vue";
import PeerFileViewer from "../panels/PeerFileViewer.vue";
import CommentsPanel from "../panels/CommentsPanel.vue";
import AgentPanel from "../panels/AgentPanel.vue";
import HistoryPanel from "../panels/HistoryPanel.vue";
import SharePanel from "../panels/SharePanel.vue";
import NewDocModal from "../modals/NewDocModal.vue";
import SettingsModal from "../modals/SettingsModal.vue";
import ConfirmModal from "../modals/ConfirmModal.vue";
import AppMenu from "./AppMenu.vue";
import DemoBanner from "./DemoBanner.vue";
import AgentSessionPill from "./AgentSessionPill.vue";
import ExternalChangeToast from "./ExternalChangeToast.vue";
import { matchesHotkey } from "../../utils/hotkey.js";
import { useAppMenu } from "../../composables/useAppMenu.js";

const store = useAppStore();
const router = useRouter();
const searchViewRef = ref(null);

// Drag a doc from the file tree onto the active editor pane to open it there.
// Capture phase so we intercept before the ProseMirror editor's own drop handler.
const hasType = (types, type) => types && (types.includes ? types.includes(type) : types.contains(type));
const activeDragOver = ref(false);
function onActiveDragOver(e) {
    if (store.isCompactLayout) return;
    if (!hasType(e.dataTransfer.types, "application/canonic-path")) return;
    e.preventDefault();
    e.stopPropagation();
    activeDragOver.value = true;
    e.dataTransfer.dropEffect = "move";
}
function onActiveDrop(e) {
    if (store.isCompactLayout) return;
    if (!hasType(e.dataTransfer.types, "application/canonic-path")) return;
    e.preventDefault();
    e.stopPropagation();
    activeDragOver.value = false;
    const path = e.dataTransfer.getData("application/canonic-path");
    if (path && path.endsWith(".md")) store.openFile(path);
}

function toggleSearchView() {
    store.searchViewOpen = !store.searchViewOpen;
    if (store.searchViewOpen) {
        nextTick(() => searchViewRef.value?.focusInput?.());
    }
}

// ── Font toggle ──────────────────────────────────────────────────────────────
const FONT_KEY = "canonic:fontMode";
const fontMode = ref(storage.getItem(FONT_KEY) || "serif");

function applyFont(mode) {
    if (mode === "sans") {
        document.documentElement.classList.add("font-sans");
    } else {
        document.documentElement.classList.remove("font-sans");
    }
}

function toggleFont() {
    fontMode.value = fontMode.value === "serif" ? "sans" : "serif";
    storage.setItem(FONT_KEY, fontMode.value);
    applyFont(fontMode.value);
}

// ── Theme switcher ───────────────────────────────────────────────────────────
const isMac = ref(
    typeof navigator !== "undefined" &&
        /Mac|iPhone|iPad/.test(navigator.platform || ""),
);
const THEME_KEY = "canonic:theme";

// TODO: this needs to be all configable not hard coded
const BUILTIN_THEMES = [
    "hal2001",
    "auteur",
    "paper",
    "mocha",
    "macchiato",
    "latte",
    "dracula",
    "nord",
    "solarized",
    "gruvbox",
    "tokyo",
];

const activeTheme = ref(storage.getItem(THEME_KEY) || "hal2001");
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
    return allThemes.value.filter((t) => t.name.toLowerCase().includes(s));
});

function applyTheme(name) {
    if (!name || name === "hal2001") {
        document.documentElement.removeAttribute("data-theme");
    } else {
        document.documentElement.setAttribute("data-theme", name);
    }
    // Pin the native macOS window appearance (vibrancy/titlebar/menus) to the
    // active theme's scheme rather than the OS system appearance. Every theme
    // path (setTheme, applyConfigTheme, startup) funnels through here. The light
    // built-in themes are paper and latte; everything else (incl. hal2001) is dark.
    const scheme = name === "paper" || name === "latte" ? "light" : "dark";
    window.canonic?.app?.setWindowTheme?.(scheme);
}

async function setTheme(name) {
    activeTheme.value = name;
    storage.setItem(THEME_KEY, name);
    applyTheme(name);
    themeOpen.value = false;

    // Save choice to backend config so it doesn't get lost when Settings modal opens
    const currentConfig = store.config || {};
    const newConfig = {
        ...currentConfig,
        theme: {
            ...currentConfig.theme,
            auto: false,
            name: name,
        },
    };
    await store.saveConfig(newConfig);
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

function getSystemScheme() {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function applyConfigTheme() {
    const cfg = store.config;
    if (!cfg?.theme) return;
    if (cfg.theme.auto) {
        const scheme = getSystemScheme();
        const themeName = scheme === "dark" ? cfg.theme.dark : cfg.theme.light;
        if (themeName) {
            activeTheme.value = themeName;
            storage.setItem(THEME_KEY, themeName);
            applyTheme(themeName);
        }
    } else if (cfg.theme.name) {
        activeTheme.value = cfg.theme.name;
        storage.setItem(THEME_KEY, cfg.theme.name);
        applyTheme(cfg.theme.name);
    }
}

// Watch system color scheme changes
let systemSchemeQuery = null;
function watchSystemScheme() {
    if (typeof window === "undefined") return;
    if (systemSchemeQuery)
        systemSchemeQuery.removeEventListener("change", applyConfigTheme);
    systemSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemSchemeQuery.addEventListener("change", applyConfigTheme);
}

// Re-apply theme when config changes (e.g. user updates theme settings)
watch(
    () => store.config?.theme,
    () => {
        applyConfigTheme();
    },
    { deep: true },
);

// Close theme popover on outside click
function onDocClick(e) {
    if (themePickerRef.value && !themePickerRef.value.contains(e.target)) {
        themeOpen.value = false;
    }
    if (
        mobileMenuDropdownRef.value &&
        !mobileMenuDropdownRef.value.contains(e.target) &&
        menuBtnRef.value &&
        !menuBtnRef.value.contains(e.target)
    ) {
        mobileMenuOpen.value = false;
    }
}

function handleGlobalMouseUp() {
    if (!store.config?.clipboard?.copyOnSelect) return;
    const selection = window.getSelection();
    const text = selection.toString();
    if (text && text.length > 0) {
        navigator.clipboard.writeText(text);
    }
}

async function handleGlobalMouseDown(e) {
    // Middle click is button 1
    const isMiddleClick = e.button === 1;
    // Ctrl-click is primary button + ctrlKey
    const isCtrlClick = e.button === 0 && e.ctrlKey;

    const middleEnabled = store.config?.clipboard?.middleClickPaste;
    const ctrlEnabled = store.config?.clipboard?.ctrlClickPaste;

    if ((isMiddleClick && middleEnabled) || (isCtrlClick && ctrlEnabled)) {
        const target = e.target;
        const isInput =
            target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        const isEditable =
            target.isContentEditable ||
            target.closest('[contenteditable="true"]');

        if (isInput || isEditable) {
            e.preventDefault();
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    if (isInput) {
                        const start = target.selectionStart;
                        const end = target.selectionEnd;
                        const val = target.value;
                        target.value =
                            val.slice(0, start) + text + val.slice(end);
                        target.selectionStart = target.selectionEnd =
                            start + text.length;
                        target.dispatchEvent(
                            new Event("input", { bubbles: true }),
                        );
                    } else {
                        // For ProseMirror or other contentEditable areas
                        document.execCommand("insertText", false, text);
                    }
                }
            } catch (err) {
                console.warn(
                    "[MainLayout] Failed to read from clipboard:",
                    err,
                );
            }
        }
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

    // Start watching system color scheme for auto-theme switching
    watchSystemScheme();
    applyConfigTheme();

    document.addEventListener("click", onDocClick, true);
    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mousedown", handleGlobalMouseDown);

    // Listen for menu events
    if (window.canonic?.menu) {
        window.canonic.menu.onOpenSettings(() => {
            showSettings.value = true;
        });

        window.canonic.menu.onChangeTheme((theme) => {
            if (theme) setTheme(theme);
        });

        window.canonic.menu.onChangeFont((font) => {
            if (font) {
                fontMode.value = font;
                storage.setItem(FONT_KEY, fontMode.value);
                applyFont(fontMode.value);
            }
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

        if (window.canonic.menu.onReloadConfig) {
            window.canonic.menu.onReloadConfig(reloadConfig);
        }
    }

    if (!store.workspacePath && !store.currentFile) {
        // The main process owns the recent list; refresh it before auto-opening.
        await store.loadRecents();
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

// Reload config from disk and re-apply themes/appearance. Shared by the native
// macOS menu (menu:reload-config) and the in-app hamburger (AppMenu).
async function reloadConfig() {
    try {
        await store.loadConfig();
        if (store.config?.themes) {
            registerConfigThemes(store.config.themes);
        }
        applyAutoTheme();
    } catch (err) {
        console.error("Failed to reload config:", err);
    }
}

function onGlobalKeydown(e) {
    const hk = store.findHotkeys;

    // Ctrl+T — focus the file tree
    if ((e.ctrlKey || e.metaKey) && e.key === "t" && !e.shiftKey) {
        // Don't steal focus from inputs/editors
        const tag = document.activeElement?.tagName;
        const isInput = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable;
        if (!isInput) {
            e.preventDefault();
            store.focusTree();
            nextTick(() => {
                const tree = document.querySelector(".file-tree");
                if (tree) tree.focus();
            });
            return;
        }
    }

    if (matchesHotkey(e, hk.findInWorkspace)) {
        e.preventDefault();
        store.searchViewOpen = true;
        nextTick(() => searchViewRef.value?.focusInput?.());
        return;
    }
    if (store.searchViewOpen && e.key === "Escape") {
        store.searchViewOpen = false;
    }
}

onMounted(() => {
    document.addEventListener("keydown", onGlobalKeydown);
});

onBeforeUnmount(() => {
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("mouseup", handleGlobalMouseUp);
    document.removeEventListener("mousedown", handleGlobalMouseDown);
    document.removeEventListener("keydown", onGlobalKeydown);
});

const showNewDoc = ref(false);
const showSettings = ref(false);
const settingsInitialTab = ref("profile");

function handleHintNavigate(target) {
    if (target.startsWith("settings:")) {
        settingsInitialTab.value = target.slice("settings:".length);
    }
    showSettings.value = true;
}
const {
    updateReady,
    updateAvailable,
    updateDownloading,
    updateInfo,
    downloadProgress,
} = storeToRefs(store);
const { downloadUpdate, installUpdate } = store;

const showUpdatePrompt = ref(false);
watch(updateAvailable, (val) => {
    if (val && !updateDownloading.value && !updateReady.value) {
        setTimeout(() => {
            showUpdatePrompt.value = true;
        }, 2000);
    }
});
function handlePromptDownload() {
    showUpdatePrompt.value = false;
    downloadUpdate();
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

const panelFloating = computed(
    () => store.isCompactLayout && !store.rightPanelCollapsed,
);

const sidebarFloating = computed(
    () => store.isCompactLayout && !store.sidebarCollapsed,
);

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
    parseInt(storage.getItem(RIGHT_PANEL_WIDTH_KEY) || "360"),
);
const isResizing = ref(false);

function onResizeStart(e) {
    e.preventDefault();
    isResizing.value = true;
    const startX = e.clientX;
    const startWidth = rightPanelWidth.value;

    function onMouseMove(e) {
        const delta = startX - e.clientX;
        rightPanelWidth.value = Math.max(
            200,
            Math.min(600, startWidth + delta),
        );
    }

    function onMouseUp() {
        isResizing.value = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        storage.setItem(RIGHT_PANEL_WIDTH_KEY, String(rightPanelWidth.value));
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
}
const mobileMenuOpen = ref(false);
const menuBtnRef = ref(null);
const mobileMenuDropdownRef = ref(null);

// App menu (File/Edit/Config) shared with the desktop hamburger; in compact
// layout it's surfaced as an expandable "Menu" tree inside the mobile menu.
const { groups: appMenuGroups, refreshDefault: refreshAppMenuDefault } =
    useAppMenu({
        onOpenSettings: () => {
            mobileMenuOpen.value = false;
            showSettings.value = true;
        },
        onReloadConfig: reloadConfig,
    });
const appMenuExpanded = ref(false);
function toggleAppMenu() {
    appMenuExpanded.value = !appMenuExpanded.value;
    if (appMenuExpanded.value) refreshAppMenuDefault();
}
async function runAppMenuItem(item) {
    mobileMenuOpen.value = false;
    appMenuExpanded.value = false;
    try {
        await item.run();
    } catch (err) {
        if (import.meta.env.DEV) console.error("[AppMenu] action failed:", err);
    }
}

function openMobileTab(side, tab) {
    mobileMenuOpen.value = false;
    if (side === "left") {
        store.sidebarTab = tab;
        store.sidebarCollapsed = false;
        store.rightPanelCollapsed = true;
    } else {
        store.rightPanelTab = tab;
        store.rightPanelCollapsed = false;
        store.sidebarCollapsed = true;
    }
}

function openMobileSearch() {
    mobileMenuOpen.value = false;
    store.sidebarCollapsed = true;
    store.rightPanelCollapsed = true;
    toggleSearchView();
}

function toggleDistractionFree() {
    mobileMenuOpen.value = false;
    store.distractionFreeMode = !store.distractionFreeMode;
    if (store.distractionFreeMode) {
        store.sidebarCollapsed = true;
        store.rightPanelCollapsed = true;
    }
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
    user-select: none;
    flex-shrink: 0;
}

.layout-mac .titlebar {
    padding-left: 80px; /* room for macOS traffic lights */
}

.titlebar-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.titlebar-logo {
    width: 28px;
    height: 14px;
    object-fit: contain;
    margin-right: 4px;
    flex-shrink: 0;
    pointer-events: none;
}

.app-name {
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    pointer-events: none;
}

.accent {
    color: var(--accent);
}

.titlebar-right {
    display: flex;
    gap: 4px;
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

/* Split panels — primary editor + reference panes side by side */
.split-row {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.split-row--stacked {
    flex-direction: column;
}

/* Bento-box: when 3 panes are open the 2 ref panes nest in the opposite
   direction — row-nested inside a stacked layout, column-nested inside
   a side-by-side layout. */
.split-row--nested {
    flex: 1;
    min-height: 0;
}

/* Outer border on the nested container (edge between primary + ref area). */
.split-row--stacked > .split-row--nested {
    border-top: 1px solid var(--border);
}
.split-row:not(.split-row--stacked) > .split-row--nested {
    border-left: 1px solid var(--border);
}

/* Nested ref panes strip inherited outer-edge borders; the container handles it. */
.split-row--nested :deep(.ref-pane) {
    border-top: none;
    border-left: none;
}
/* Row-nested (stacked outer): side-by-side ref panes → divider between them. */
.split-row--nested:not(.split-row--stacked) :deep(.ref-pane + .ref-pane) {
    border-left: 1px solid var(--border);
}
/* Column-nested (side-by-side outer): stacked ref panes → divider between them. */
.split-row--nested.split-row--stacked :deep(.ref-pane + .ref-pane) {
    border-top: 1px solid var(--border);
}

.split-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
}

/* Active-pane highlight (only meaningful while reference panes are open). */
.split-row:has(.ref-pane) .split-pane--active {
    box-shadow: inset 2px 0 0 var(--accent);
}
.split-row--stacked:has(.ref-pane) .split-pane--active {
    box-shadow: inset 0 2px 0 var(--accent);
}

.split-pane--dragover {
    box-shadow: inset 0 0 0 2px var(--accent) !important;
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

.panel-content-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
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
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    z-index: 9999;
    font-size: 0.8125rem;
    color: var(--text);
}
.update-prompt-icon {
    color: var(--accent);
    flex-shrink: 0;
}
.update-prompt-text {
    font-weight: 500;
    white-space: nowrap;
}
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
.update-prompt-btn:hover {
    background: var(--bg-hover);
}
.update-prompt-btn--primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
}
.update-prompt-btn--primary:hover {
    opacity: 0.88;
    background: var(--accent);
}
.update-prompt-enter-active,
.update-prompt-leave-active {
    transition:
        opacity 0.2s,
        transform 0.2s;
}
.update-prompt-enter-from,
.update-prompt-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

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
}

.update-ready-btn:hover {
    opacity: 0.88;
}

@keyframes update-pulse {
    0%,
    100% {
        box-shadow: 0 0 0 0 rgba(74, 122, 155, 0.5);
    }
    50% {
        box-shadow: 0 0 0 5px rgba(74, 122, 155, 0);
    }
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

.theme-divider {
    height: 1px;
    background: var(--border-light);
    margin: 6px 4px;
}

.theme-popover.sidebar-theme-popover {
    top: auto;
    right: auto;
    bottom: 0;
    left: 100%;
    margin-left: 8px;
    margin-bottom: 8px;
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
    max-height: 180px;
    overflow-y: auto;
}

.theme-more-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    padding: 4px 12px;
    font-style: italic;
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
    transition:
        background 0.12s,
        color 0.12s;
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

/* ── Compact & Focus Mode Styles ── */
.layout-compact .titlebar {
    display: none !important;
}

.mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    height: 36px;
    background: var(--bg-titlebar);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 100;
    position: relative;
}

.mobile-header--mac {
    padding-left: 80px;
}

.mobile-menu-btn,
.mobile-icon-btn,
.mobile-menu-dropdown {
}

.mobile-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
}

.mobile-menu-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.mobile-logo {
    width: 20px;
    height: 10px;
    object-fit: contain;
}

.mobile-header-right {
    display: flex;
    gap: 4px;
}

.mobile-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
}

.mobile-icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.mobile-icon-btn.active-focus {
    color: var(--accent);
    background: var(--accent-muted);
}

/* Menu dropdown */
.mobile-menu-dropdown {
    position: absolute;
    top: 36px;
    left: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    z-index: 1001;
    min-width: 185px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.dropdown-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.dropdown-section-title {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 4px 8px;
    font-weight: 600;
}

.dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 5px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    text-align: left;
    transition:
        background 0.12s,
        color 0.12s;
    width: 100%;
}

.dropdown-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.dropdown-divider {
    height: 1px;
    background: var(--border-light);
    margin: 6px 4px;
}

.app-menu-chevron {
    margin-left: auto;
    flex-shrink: 0;
    transition: transform 0.15s;
}
.app-menu-chevron.open {
    transform: rotate(90deg);
}

.dropdown-subgroup-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 6px 8px 2px 14px;
    font-weight: 600;
}

.dropdown-item--nested {
    padding-left: 22px;
    font-size: 0.78rem;
}

/* Overrides for sidebar and right panel in compact mode */
.layout-compact .sidebar {
    position: fixed !important;
    top: 36px !important;
    left: 0 !important;
    bottom: 0 !important;
    z-index: 1000 !important;
    width: 260px !important;
    height: calc(100vh - 36px) !important;
    box-shadow: 4px 0 12px rgba(0, 0, 0, 0.25) !important;
    border-right: 1px solid var(--border) !important;
    background: var(--bg-sidebar) !important;
}

.layout-compact .sidebar--collapsed {
    display: none !important;
}

.layout-compact .right-panel {
    position: fixed !important;
    top: 36px !important;
    right: 0 !important;
    bottom: 0 !important;
    z-index: 1000 !important;
    width: 300px !important;
    height: calc(100vh - 36px) !important;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.25) !important;
    border-left: 1px solid var(--border) !important;
    background: var(--bg-sidebar) !important;
}

.layout-compact .right-panel--collapsed {
    display: none !important;
}

/* Compact mode: left sidebar as centered floating modal */
.layout-compact .sidebar.sidebar--floating,
.sidebar.sidebar--floating {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    right: auto !important;
    bottom: auto !important;
    transform: translate(-50%, -50%) !important;
    width: min(92vw, 520px) !important;
    height: min(82vh, 680px) !important;
    max-height: 82vh !important;
    border-radius: 12px;
    border: 1px solid var(--border) !important;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    z-index: 1001 !important;
    overflow: hidden;
}

/* Compact mode: right panel as centered floating modal (all tabs) */
.layout-compact .right-panel.right-panel--floating,
.right-panel.right-panel--floating {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    right: auto !important;
    bottom: auto !important;
    transform: translate(-50%, -50%) !important;
    width: min(92vw, 520px) !important;
    height: min(82vh, 680px) !important;
    max-height: 82vh !important;
    border-radius: 12px;
    border: 1px solid var(--border) !important;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    z-index: 1001 !important;
    overflow: hidden;
}

.layout-compact .resize-handle {
    display: none !important;
}

/* Backdrop */
.mobile-backdrop {
    position: fixed;
    top: 36px;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 999;
}
</style>
