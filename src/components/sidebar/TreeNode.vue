<template>
    <div>
        <div
            :class="[
                'tree-node',
                item.type === 'file' &&
                    store.currentFile === item.path &&
                    'active',
                isDragOver && 'drag-over',
                item.type === 'directory' && isEmpty && 'empty',
                item.type === 'directory' && 'tree-node--dir',
                isFocused && 'focused',
            ]"
            :style="{ paddingLeft: `${4 + depth * 14}px` }"
            :draggable="!store.isCompactLayout"
            role="treeitem"
            :aria-label="`${item.type === 'directory' ? 'Folder' : 'File'}: ${item.name}`"
            :aria-expanded="item.type === 'directory' ? item._open : undefined"
            :aria-selected="isFocused"
            @click="handleClick"
            @mouseenter="onMouseEnter"
            @mouseleave="onMouseLeave"
            @dragstart="handleDragStart"
            @dragover.prevent="handleDragOver"
            @dragleave="handleDragLeave"
            @dragend="handleDragEnd"
            @drop="handleDrop"
        >
            <!-- ASCII tree lines for children -->
            <span v-if="depth > 0" class="tree-lines" v-text="treeLines" />

            <!-- Chevron / expand indicator (ASCII) -->
            <span
                v-if="item.type === 'directory'"
                class="chevron-ascii"
                v-text="item._open ? '▼' : '▶'"
            />

            <!-- Icon (folder) -->
            <Folder
                v-if="item.type === 'directory' && !item._open"
                :size="13"
                class="dir-icon"
            />
            <FolderOpen
                v-else-if="item.type === 'directory' && item._open"
                :size="13"
                class="dir-icon dir-icon--open"
            />

            <!-- Inline rename input -->
            <input
                v-if="renaming"
                ref="renameInput"
                v-model="renameValue"
                class="rename-input"
                @keydown.enter.stop="confirmRename"
                @keydown.esc.stop="cancelRename"
                @blur="confirmRename"
                @click.stop
            />
            <span v-else class="node-name">{{ item.name }}</span>

            <span
                v-if="item.type === 'file' && isDirty && !renaming"
                class="dirty-dot"
            />

            <!-- Dwell actions (appear after 600ms hover) -->
            <div v-if="showActions && !renaming" class="node-actions" @click.stop>
                <button
                    v-if="item.type === 'directory'"
                    class="node-btn"
                    title="New file here"
                    @click.stop="newFileHere"
                >
                    <FilePlus :size="11" />
                </button>
                <button
                    v-if="item.type === 'directory'"
                    class="node-btn"
                    title="New folder here"
                    @click.stop="newFolderHere"
                >
                    <FolderPlus :size="11" />
                </button>
                <button
                    class="node-btn"
                    title="Rename"
                    @click.stop="startRename"
                >
                    <Pencil :size="11" />
                </button>
                <button
                    class="node-btn"
                    title="Move to folder"
                    @click.stop="showMove = !showMove"
                >
                    <ArrowRightFromLine :size="11" />
                </button>
                <button
                    class="node-btn node-btn-danger"
                    :title="
                        item.type === 'directory' ? 'Delete folder' : 'Delete'
                    "
                    @click.stop="confirmDelete"
                >
                    <Trash2 :size="11" />
                </button>
            </div>
        </div>

        <!-- Move-to dropdown -->
        <div v-if="showMove" class="move-dropdown" @click.stop>
            <div class="move-label">Move to folder</div>
            <button class="move-opt" @click="doMove('')">
                (workspace root)
            </button>
            <button
                v-for="dir in availableDirs"
                :key="dir.path"
                class="move-opt"
                :class="dir.path === currentDir && 'move-opt-current'"
                @click="doMove(dir.path)"
            >
                {{ dir.path }}
            </button>
        </div>

        <!-- New folder inline input -->
        <div
            v-if="creatingFolder"
            class="inline-create"
            :style="{ paddingLeft: `${4 + (depth + 1) * 14 + 18}px` }"
        >
            <input
                ref="folderInput"
                v-model="folderName"
                class="rename-input"
                placeholder="folder-name"
                @keydown.enter.stop="confirmNewFolder"
                @keydown.esc.stop="creatingFolder = false"
                @blur="confirmNewFolder"
                @click.stop
            />
        </div>

        <!-- New file inline input -->
        <div
            v-if="creatingFile"
            class="inline-create"
            :style="{ paddingLeft: `${4 + (depth + 1) * 14 + 18}px` }"
        >
            <input
                ref="fileInput"
                v-model="fileName"
                class="rename-input"
                placeholder="document-name"
                @keydown.enter.stop="confirmNewFile"
                @keydown.esc.stop="creatingFile = false"
                @blur="confirmNewFile"
                @click.stop
            />
        </div>

        <!-- Children (only when directory is open) -->
        <template v-if="item.type === 'directory' && item._open">
            <TreeNode
                v-for="(child, ci) in item.children"
                :key="child.path"
                :item="child"
                :depth="depth + 1"
                :is-last="ci === item.children.length - 1"
            />
        </template>
    </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onBeforeUnmount } from "vue";
import { useAppStore } from "../../store";
import {
    FilePlus,
    FolderPlus,
    Pencil,
    Trash2,
    ArrowRightFromLine,
    Folder,
    FolderOpen,
} from "lucide-vue-next";

const props = defineProps({
    item: Object,
    depth: Number,
    isLast: { type: Boolean, default: false },
});

const store = useAppStore();

function hasMarkdownFiles(item) {
    if (item.type === 'file') return true;
    if (!item.children?.length) return false;
    return item.children.some(child => hasMarkdownFiles(child));
}

const isEmpty = computed(() =>
    props.item.type === 'directory' && !hasMarkdownFiles(props.item)
);

// Initialize _open on directories (collapsed by default)
if (props.item.type === 'directory' && props.item._open === undefined) {
    props.item._open = false;
}

const hovered = ref(false);
const showActions = ref(false);
const dwellTimer = ref(null);
const renaming = ref(false);
const renameValue = ref("");
const renameInput = ref(null);
const showMove = ref(false);
const creatingFolder = ref(false);
const folderName = ref("");
const folderInput = ref(null);
const creatingFile = ref(false);
const fileName = ref("");
const fileInput = ref(null);
const isDragOver = ref(false);

// Compute whether this node is keyboard-focused
const isFocused = computed(() => {
    if (!store.treeFocused) return false;
    const list = store.flatVisibleTree;
    const idx = store.treeFocusIndex;
    if (idx < 0 || idx >= list.length) return false;
    return list[idx].path === props.item.path;
});

// ASCII tree lines - just the connector, no continuation prefix.
// Depth is shown via paddingLeft; isLast controls ├── vs └──.
const treeLines = computed(() => {
    if (props.depth === 0) return '';
    return props.isLast ? '└── ' : '├── ';
});

// Watch for focus changes to scroll into view
watch(isFocused, (val) => {
    // Scroll into view handled by FileTree container
});

// Watch for move command from keyboard (Ctrl+M)
watch(() => store.treeShowMoveFor, (val) => {
    if (val === props.item.path) {
        showMove.value = true;
        store.treeShowMoveFor = null;
    }
});

const isDirty = computed(
    () =>
        (store.currentFile === props.item.path && store.isDirty) ||
        store.unsavedBuffer[props.item.path] !== undefined,
);

const currentDir = computed(() => {
    if (props.item.type !== "file") {
        const parts = props.item.path.split("/");
        return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    }
    const parts = props.item.path.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
});

const availableDirs = computed(() => {
    const dirs = [];
    const walk = (items) => {
        for (const it of items) {
            if (it.type === "directory") {
                if (
                    props.item.type === "directory" &&
                    (it.path === props.item.path ||
                        it.path.startsWith(props.item.path + "/"))
                ) {
                    continue;
                }
                dirs.push(it);
                if (it.children) walk(it.children);
            }
        }
    };
    walk(store.files);
    return dirs;
});

// ── Dwell timer for actions ──
function onMouseEnter() {
    hovered.value = true;
    dwellTimer.value = setTimeout(() => {
        showActions.value = true;
    }, 600);
}

function onMouseLeave() {
    hovered.value = false;
    showActions.value = false;
    if (dwellTimer.value) {
        clearTimeout(dwellTimer.value);
        dwellTimer.value = null;
    }
}

onBeforeUnmount(() => {
    if (dwellTimer.value) {
        clearTimeout(dwellTimer.value);
    }
});

function handleClick() {
    if (renaming.value) return;
    if (props.item.type === "directory") {
        store.setTreeDirOpen(props.item.path, !props.item._open);
    } else {
        store.openFile(props.item.path);
    }
}

function handleDragStart(e) {
    if (store.isCompactLayout) return;
    store.draggedPath = props.item.path;
    e.dataTransfer.setData("application/canonic-path", props.item.path);
    e.dataTransfer.effectAllowed = "move";
}

function handleDragEnd() {
    store.draggedPath = null;
}

function handleDragOver(e) {
    if (store.isCompactLayout) return;
    if (props.item.type !== "directory") return;
    const hasDraggedPath = store.draggedPath || e.dataTransfer.types.includes(
        "application/canonic-path",
    );
    if (hasDraggedPath) {
        // Prevent moving a folder into itself or its own descendant
        const targetPath = props.item.path;
        const sourcePath = store.draggedPath;
        if (sourcePath && (targetPath === sourcePath || targetPath.startsWith(sourcePath + "/"))) {
            return;
        }
        isDragOver.value = true;
        e.dataTransfer.dropEffect = "move";
    }
}

function handleDragLeave() {
    if (store.isCompactLayout) return;
    isDragOver.value = false;
}

async function handleDrop(e) {
    if (store.isCompactLayout) return;
    isDragOver.value = false;
    if (props.item.type !== "directory") return;

    const draggedPath = store.draggedPath || e.dataTransfer.getData("application/canonic-path");
    store.draggedPath = null;
    
    if (!draggedPath || draggedPath === props.item.path) return;

    // Prevent moving a folder into its own descendant
    if (props.item.path.startsWith(draggedPath + "/")) return;

    await store.moveFile(draggedPath, props.item.path);
}

async function startRename() {
    renameValue.value = props.item.name.replace(/\.md$/, "");
    renaming.value = true;
    showActions.value = false;
    await nextTick();
    renameInput.value?.focus();
    renameInput.value?.select();
}

function cancelRename() {
    renaming.value = false;
}

async function confirmRename() {
    const newName = renameValue.value.trim();
    renaming.value = false;
    if (!newName || newName === props.item.name.replace(/\.md$/, "")) return;
    if (props.item.type === "file") {
        await store.renameFile(props.item.path, newName);
    } else {
        const parentDir = props.item.path.includes("/")
            ? props.item.path.split("/").slice(0, -1).join("/")
            : "";
        const newPath = parentDir ? `${parentDir}/${newName}` : newName;
        await window.canonic.files.move(
            store.workspacePath,
            props.item.path,
            newPath,
        );
        await store.refreshFiles();
    }
}

async function confirmDelete() {
    showActions.value = false;
    if (props.item.type === "file") {
        await store.deleteFile(props.item.path);
    } else {
        await store.deleteDirectory(props.item.path);
    }
}

async function doMove(targetDir) {
    showMove.value = false;
    showActions.value = false;
    await store.moveFile(props.item.path, targetDir);
}

async function newFileHere() {
    store.setTreeDirOpen(props.item.path, true);
    creatingFile.value = true;
    fileName.value = "";
    showActions.value = false;
    await nextTick();
    fileInput.value?.focus();
}

async function confirmNewFile() {
    const name = fileName.value.trim();
    creatingFile.value = false;
    if (!name) return;
    const filePath = `${props.item.path}/${name}.md`;
    await window.canonic.files.write(
        store.workspacePath,
        filePath,
        `# ${name}\n\n`,
    );
    await store.refreshFiles();
    await store.openFile(filePath);
}

async function newFolderHere() {
    store.setTreeDirOpen(props.item.path, true);
    creatingFolder.value = true;
    folderName.value = "";
    showActions.value = false;
    await nextTick();
    folderInput.value?.focus();
}

async function confirmNewFolder() {
    const name = folderName.value.trim();
    creatingFolder.value = false;
    if (!name) return;
    await store.createDirectory(`${props.item.path}/${name}`);
}
</script>

<style scoped>
.tree-node {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 6px 3px 4px;
    cursor: pointer;
    border-radius: 3px;
    margin: 0 2px;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: background 0.1s;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
}

.tree-node:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.tree-node.active {
    background: var(--bg-active);
    color: var(--text-primary);
}
.tree-node.focused {
    background: var(--bg-active);
    outline: 1px solid var(--accent-muted);
    outline-offset: -1px;
}
.tree-node.drag-over {
    background: var(--bg-active);
    box-shadow: inset 0 0 0 1px var(--accent);
}
.tree-node.tree-node--dir {
    color: var(--secondary);
}

.tree-node.tree-node--dir:hover {
    color: var(--secondary);
}
.tree-node.empty:hover {
    opacity: 0.65;
}

.tree-lines {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 0.6875rem;
    letter-spacing: 0;
    white-space: pre;
    opacity: 0.4;
}

.chevron-ascii {
    flex-shrink: 0;
    font-size: 0.5625rem;
    width: 10px;
    text-align: center;
    color: var(--text-muted);
}

.dir-icon {
    flex-shrink: 0;
    color: var(--secondary);
}

.dir-icon--open {
    color: var(--secondary);
    opacity: 0.85;
}

.node-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
}

.dirty-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
}

.rename-input {
    flex: 1;
    background: var(--bg-base);
    border: 1px solid var(--accent-muted);
    border-radius: 4px;
    padding: 1px 6px;
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-family: inherit;
    outline: none;
    min-width: 0;
}

.node-actions {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
    margin-left: auto;
}

.node-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
        background 0.1s,
        color 0.1s;
}

.node-btn:hover {
    background: var(--bg-active);
    color: var(--text-primary);
}
.node-btn-danger:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
}

.move-dropdown {
    margin: 2px 4px 4px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px;
    font-size: 0.775rem;
}

.move-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 2px 6px 4px;
}

.move-opt {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px 8px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.775rem;
    cursor: pointer;
}

.move-opt:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.move-opt-current {
    opacity: 0.4;
    cursor: default;
}

.inline-create {
    padding: 3px 4px;
}
</style>
