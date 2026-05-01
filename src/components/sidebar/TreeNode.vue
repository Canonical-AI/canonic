<template>
    <div>
        <div
            :class="[
                'tree-node',
                item.type === 'file' &&
                    store.currentFile === item.path &&
                    'active',
                isDragOver && 'drag-over',
            ]"
            :style="{ paddingLeft: `${12 + depth * 16}px` }"
            draggable="true"
            @click="handleClick"
            @mouseenter="hovered = true"
            @mouseleave="hovered = false"
            @dragstart="handleDragStart"
            @dragover.prevent="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
        >
            <ChevronRight
                v-if="item.type === 'directory'"
                :size="12"
                class="chevron"
                :class="open && 'open'"
            />
            <Folder
                v-if="item.type === 'directory'"
                :size="12"
                class="dir-icon"
            />
            <FileText v-else :size="12" class="file-icon" />

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

            <!-- Hover actions -->
            <div v-if="hovered && !renaming" class="node-actions" @click.stop>
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
            :style="{ paddingLeft: `${12 + (depth + 1) * 16 + 18}px` }"
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

        <!-- New file inline input (for root-level new file in dir) -->
        <div
            v-if="creatingFile"
            class="inline-create"
            :style="{ paddingLeft: `${12 + (depth + 1) * 16 + 18}px` }"
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

        <!-- Children -->
        <template v-if="item.type === 'directory' && open">
            <TreeNode
                v-for="child in item.children"
                :key="child.path"
                :item="child"
                :depth="depth + 1"
            />
        </template>
    </div>
</template>

<script setup>
import { ref, computed, nextTick } from "vue";
import { useAppStore } from "../../store";
import {
    ChevronRight,
    FileText,
    Folder,
    FilePlus,
    FolderPlus,
    Pencil,
    Trash2,
    ArrowRightFromLine,
} from "lucide-vue-next";

const props = defineProps({ item: Object, depth: Number });

const store = useAppStore();
const open = ref(true);
const hovered = ref(false);
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
                // Don't allow moving a directory into itself or its children
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

function handleClick() {
    if (renaming.value) return;
    if (props.item.type === "directory") {
        open.value = !open.value;
    } else {
        store.openFile(props.item.path);
    }
}

function handleDragStart(e) {
    e.dataTransfer.setData("application/canonic-path", props.item.path);
    e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
    if (props.item.type !== "directory") return;

    // Don't allow dropping on itself or descendants
    const draggedPath = e.dataTransfer.types.includes(
        "application/canonic-path",
    );
    if (draggedPath) {
        isDragOver.value = true;
        e.dataTransfer.dropEffect = "move";
    }
}

function handleDragLeave() {
    isDragOver.value = false;
}

async function handleDrop(e) {
    isDragOver.value = false;
    if (props.item.type !== "directory") return;

    const draggedPath = e.dataTransfer.getData("application/canonic-path");
    if (!draggedPath || draggedPath === props.item.path) return;

    // Prevent moving a folder into its own descendant
    if (props.item.path.startsWith(draggedPath + "/")) return;

    await store.moveFile(draggedPath, props.item.path);
}

async function startRename() {
    renameValue.value = props.item.name.replace(/\.md$/, "");
    renaming.value = true;
    hovered.value = false;
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
        // Rename directory: move it
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
    hovered.value = false;
    if (props.item.type === "file") {
        await store.deleteFile(props.item.path);
    } else {
        await store.deleteDirectory(props.item.path);
    }
}

async function doMove(targetDir) {
    showMove.value = false;
    hovered.value = false;
    await store.moveFile(props.item.path, targetDir);
}

async function newFileHere() {
    open.value = true;
    creatingFile.value = true;
    fileName.value = "";
    hovered.value = false;
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
    open.value = true;
    creatingFolder.value = true;
    folderName.value = "";
    hovered.value = false;
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
    gap: 6px;
    padding: 5px 8px 5px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin: 0 4px;
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
.tree-node.drag-over {
    background: var(--bg-active);
    box-shadow: inset 0 0 0 1px var(--accent);
}

.chevron {
    flex-shrink: 0;
    transition: transform 0.15s;
}
.chevron.open {
    transform: rotate(90deg);
}
.file-icon {
    flex-shrink: 0;
    color: var(--text-muted);
}
.dir-icon {
    flex-shrink: 0;
    color: var(--text-muted);
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
