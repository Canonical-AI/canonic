<template>
    <div
        class="file-tree"
        tabindex="0"
        ref="treeContainer"
        @focus="store.focusTree()"
        @blur="onTreeBlur"
        @keydown="onTreeKeydown"
    >
        <DocNavigation />

        <!-- Quick filter bar (button or Ctrl+F when tree focused) -->
        <div v-if="filterActive" class="filter-bar">
            <Search :size="12" class="filter-icon" />
            <input
                ref="filterInput"
                v-model="filterText"
                class="filter-input"
                placeholder="Filter files..."
                @keydown.esc.stop="clearFilter"
                @keydown.enter.prevent="onFilterEnter"
                @keydown.arrow-down.prevent="onFilterArrowDown"
                @keydown.arrow-up.prevent="onFilterArrowUp"
                @keydown.arrow-right.prevent="onFilterEnter"
                @input="onFilterInput"
            />
        </div>

        <!-- Filter match dropdown -->
        <div v-if="filterActive && store.treeFilterMatches.length > 0" class="filter-matches">
            <button
                v-for="(match, mi) in store.treeFilterMatches"
                :key="match.path"
                class="filter-match-item"
                :class="{ 'filter-match-active': mi === filterHighlightIdx }"
                @mousedown.prevent="selectFilterMatch(match)"
            >
                <span class="filter-match-type">{{ match.type === 'directory' ? '📁' : '📄' }}</span>
                <span class="filter-match-name">{{ match.name }}</span>
                <span class="filter-match-path">{{ match.path }}</span>
            </button>
        </div>
        <div v-else-if="filterActive && filterText && store.treeFilterMatches.length === 0" class="filter-no-matches">
            No matches
        </div>

        <div class="tree-header">
            <span class="section-label">{{ sidebarTitle }}</span>
            <div class="header-actions">
                <button
                    class="add-btn"
                    :class="{ 'add-btn--active': filterActive }"
                    @click="toggleFilter"
                    title="Filter files (Ctrl+F)"
                >
                    <Search :size="14" />
                </button>
                <button
                    class="add-btn"
                    @click="showNewDoc()"
                    title="New document (Ctrl+=)"
                >
                    <FilePlus :size="14" />
                </button>
                <button
                    class="add-btn"
                    @click="creatingFolder = true"
                    title="New folder"
                >
                    <FolderPlus :size="14" />
                </button>
            </div>
        </div>
        <!-- External git repo branch indicator -->
        <div v-if="store.isExternalRepo" class="ext-branch-row" @click="branchOpen = !branchOpen">
            <GitBranch :size="12" />
            <span class="ext-branch-name">{{ store.currentBranch }}</span>
            <ChevronDown :size="12" class="ext-branch-chevron" :class="{ open: branchOpen }" />
        </div>
        <div v-if="store.isExternalRepo && branchOpen" class="ext-branch-list">
            <button
                v-for="branch in store.branches"
                :key="branch"
                class="ext-branch-item"
                :class="{ active: branch === store.currentBranch }"
                @click.stop="selectBranch(branch)"
            >
                <Check v-if="branch === store.currentBranch" :size="11" />
                <span v-else style="width: 11px; display: inline-block;" />
                {{ branch }}
            </button>
        </div>
        <!-- New root folder input -->
        <div v-if="creatingFolder" class="new-folder-row">
            <input
                ref="folderInput"
                v-model="folderName"
                class="folder-input"
                placeholder="folder-name"
                @keydown.enter="confirmNewFolder"
                @keydown.esc="creatingFolder = false"
                @blur="confirmNewFolder"
            />
        </div>
        <div class="tree-body">
            <TreeNode
                v-for="(item, idx) in store.files"
                :key="item.path"
                :item="item"
                :depth="0"
                :is-last="idx === store.files.length - 1"
            />
            <div v-if="store.files.length === 0" class="empty-hint">
                No documents yet. Create one to get started.
            </div>
        </div>
        <TrashBin />
        <AgentPanel />
    </div>
</template>

<script setup>
import { computed, ref, nextTick, inject, watch } from "vue";
import { useAppStore } from "../../store";
import TreeNode from "./TreeNode.vue";
import DocNavigation from "./DocNavigation.vue";
import TrashBin from "./TrashBin.vue";
import AgentPanel from "./AgentPanel.vue";
import { GitBranch, ChevronDown, Check, FilePlus, FolderPlus, Search } from "lucide-vue-next";

const store = useAppStore();
const showNewDoc = inject("showNewDoc");

const creatingFolder = ref(false);
const folderName = ref("");
const folderInput = ref(null);
const branchOpen = ref(false);
const treeContainer = ref(null);
const filterInput = ref(null);
const filterActive = ref(false);
const filterText = ref("");
const filterHighlightIdx = ref(0);
const sidebarTitle = computed(() => store.workspaceName || "Documents");

async function selectBranch(branch) {
  if (branch === store.currentBranch) { branchOpen.value = false; return; }
  await store.switchWorkspaceBranch(branch);
  branchOpen.value = false;
}

watch(creatingFolder, async (val) => {
    if (val) {
        folderName.value = "";
        await nextTick();
        folderInput.value?.focus();
    }
});

async function confirmNewFolder() {
    const name = folderName.value.trim();
    creatingFolder.value = false;
    if (!name) return;
    await store.createDirectory(name);
}

// ── Filter ──
function toggleFilter() {
    filterActive.value = !filterActive.value;
    if (filterActive.value) {
        filterText.value = "";
        store.setTreeFilter("");
        filterHighlightIdx.value = 0;
        nextTick(() => filterInput.value?.focus());
    } else {
        store.setTreeFilter("");
        treeContainer.value?.focus();
    }
}

function onFilterInput() {
    store.setTreeFilter(filterText.value);
    filterHighlightIdx.value = 0;
}

function onFilterEnter() {
    const matches = store.treeFilterMatches;
    if (matches.length > 0 && filterHighlightIdx.value < matches.length) {
        selectFilterMatch(matches[filterHighlightIdx.value]);
    }
}

function onFilterArrowDown() {
    const max = store.treeFilterMatches.length;
    if (max > 0) {
        filterHighlightIdx.value = (filterHighlightIdx.value + 1) % max;
    }
}

function onFilterArrowUp() {
    const max = store.treeFilterMatches.length;
    if (max > 0) {
        filterHighlightIdx.value = (filterHighlightIdx.value - 1 + max) % max;
    }
}

function selectFilterMatch(match) {
    filterActive.value = false;
    store.setTreeFilter("");
    filterText.value = "";
    if (match.type === 'file') {
        store.openFile(match.path);
    } else {
        store.navigateToPath(match.path);
        nextTick(() => treeContainer.value?.focus());
    }
}

function clearFilter() {
    filterText.value = "";
    filterActive.value = false;
    store.setTreeFilter("");
    treeContainer.value?.focus();
}

// ── Keyboard navigation ──
function onTreeKeydown(e) {
    // Ctrl+F — toggle filter (only when tree has focus)
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        if (!filterActive.value) {
            toggleFilter();
        }
        return;
    }

    // Ctrl+= or Ctrl++ — new doc
    if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        showNewDoc();
        return;
    }

    // Ctrl+D — trash focused item
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        store.trashFocused();
        return;
    }

    // Ctrl+Z — undo last trash
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        store.undoLastTrash();
        return;
    }

    // Ctrl+M — move focused item
    if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        e.preventDefault();
        store.moveFocused();
        return;
    }

    // Arrow keys (only when filter is closed)
    if (filterActive.value) return;

    switch (e.key) {
        case "ArrowUp":
            e.preventDefault();
            store.navigateTree("up");
            break;
        case "ArrowDown":
            e.preventDefault();
            store.navigateTree("down");
            break;
        case "ArrowLeft":
            e.preventDefault();
            store.leftOnTree();
            break;
        case "ArrowRight":
            e.preventDefault();
            store.rightOnTree();
            break;
        case "Enter":
            e.preventDefault();
            store.openFocused();
            break;
        case "Escape":
            if (store.treeFilter) {
                clearFilter();
            }
            break;
    }
}

function onTreeBlur(e) {
    // Don't blur if focus moved to a child element within the tree
    if (treeContainer.value && treeContainer.value.contains(e.relatedTarget)) {
        return;
    }
    store.blurTree();
}

// Watch for tree focus changes to scroll focused item into view
watch(() => store.treeFocusIndex, () => {
    if (!store.treeFocused || !treeContainer.value) return;
    nextTick(() => {
        const focusedEl = treeContainer.value.querySelector('.tree-node.focused');
        if (focusedEl) {
            focusedEl.scrollIntoView({ block: 'nearest' });
        }
    });
});
</script>

<style scoped>
.file-tree {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    outline: none;
}

.file-tree:focus {
    outline: none;
}

/* ── Filter bar ── */
.filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-base);
}

.filter-icon {
    flex-shrink: 0;
    color: var(--text-muted);
}

.filter-input {
    flex: 1;
    background: transparent;
    border: none;
    padding: 2px 0;
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
}

/* ── Filter match dropdown ── */
.filter-matches {
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
}

.filter-match-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
}

.filter-match-item:hover,
.filter-match-active {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.filter-match-type {
    flex-shrink: 0;
    font-size: 0.75rem;
}

.filter-match-name {
    font-weight: 500;
}

.filter-match-path {
    margin-left: auto;
    font-size: 0.7rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 50%;
}

.filter-no-matches {
    padding: 6px 12px;
    font-size: 0.75rem;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
}

.tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
}

.header-actions {
    display: flex;
    gap: 2px;
}

.new-folder-row {
    padding: 4px 8px;
}

.folder-input {
    width: 100%;
    background: var(--bg-base);
    border: 1px solid var(--accent-muted);
    border-radius: 4px;
    padding: 3px 8px;
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
}

.section-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
}

.add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s;
}

.add-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.add-btn--active {
    background: var(--bg-active);
    color: var(--accent);
}

.tree-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
}

.empty-hint {
    padding: 12px;
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.5;
}

.ext-branch-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    font-size: 0.775rem;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    user-select: none;
    transition: background 0.1s;
}

.ext-branch-row:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.ext-branch-name {
    flex: 1;
    font-weight: 500;
}

.ext-branch-chevron {
    transition: transform 0.15s;
}

.ext-branch-chevron.open {
    transform: rotate(180deg);
}

.ext-branch-list {
    border-bottom: 1px solid var(--border);
    background: var(--bg-base);
}

.ext-branch-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.775rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
}

.ext-branch-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.ext-branch-item.active { color: var(--text-primary); font-weight: 500; }
</style>
