<template>
    <div class="file-tree">
        <div class="tree-header">
            <span class="section-label">Documents</span>
            <div class="header-actions">
                <button
                    class="add-btn"
                    @click="showNewDoc()"
                    title="New document"
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
        <div
            class="tree-body"
            :class="isDragOver && 'drag-over'"
            @dragover.prevent="handleDragOver"
            @dragleave="isDragOver = false"
            @drop="handleDrop"
        >
            <TreeNode
                v-for="item in store.files"
                :key="item.path"
                :item="item"
                :depth="0"
            />
            <div v-if="store.files.length === 0" class="empty-hint">
                No documents yet. Create one to get started.
            </div>
        </div>
        <TrashBin />
    </div>
</template>

<script setup>
import { ref, nextTick, inject, watch } from "vue";
import { useAppStore } from "../../store";
import TreeNode from "./TreeNode.vue";
import TrashBin from "./TrashBin.vue";
import { GitBranch, ChevronDown, Check, FilePlus, FolderPlus } from "lucide-vue-next";

const store = useAppStore();
const showNewDoc = inject("showNewDoc");

const creatingFolder = ref(false);
const folderName = ref("");
const folderInput = ref(null);
const isDragOver = ref(false);
const branchOpen = ref(false);

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

function handleDragOver(e) {
    if (e.dataTransfer.types.includes("application/canonic-path")) {
        isDragOver.value = true;
        e.dataTransfer.dropEffect = "move";
    }
}

async function handleDrop(e) {
    isDragOver.value = false;
    const draggedPath = e.dataTransfer.getData("application/canonic-path");
    if (!draggedPath) return;

    // Only move if it's not already at the root
    if (draggedPath.includes("/")) {
        await store.moveFile(draggedPath, "");
    }
}

async function confirmNewFolder() {
    const name = folderName.value.trim();
    creatingFolder.value = false;
    if (!name) return;
    await store.createDirectory(name);
}
</script>

<style scoped>
.file-tree {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
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

.tree-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
    transition:
        background 0.15s,
        box-shadow 0.15s;
}

.tree-body.drag-over {
    background: var(--bg-hover);
    box-shadow: inset 0 0 0 1px var(--accent-muted);
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
