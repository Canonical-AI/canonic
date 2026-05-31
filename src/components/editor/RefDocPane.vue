<template>
    <div
        ref="rootRef"
        class="ref-pane"
        :class="{
            'ref-pane--dragover': dragOver,
            'ref-pane--stacked': store.splitStacked,
            'ref-pane--active': isActive,
        }"
        @focusin="store.setActivePane(filePath)"
        @dragover.capture="onDragOver"
        @dragleave="dragOver = false"
        @drop.capture="onDrop"
    >
        <div class="ref-topbar">
            <DocSwitcher :current-path="filePath" @select="onSwitch" />
            <span class="ref-save-state" :class="saveStateClass">{{ saveStateLabel }}</span>
            <button
                class="ref-close"
                title="Close pane"
                @click="close"
            >
                <X :size="13" />
            </button>
        </div>

        <div class="ref-body">
            <div v-if="error" class="ref-message">{{ error }}</div>
            <div v-else-if="!loaded" class="ref-message">Loading…</div>
            <div v-else class="ref-content">
                <ProsemirrorAdapterProvider>
                    <MilkdownProvider :key="`${filePath}:${reloadKey}`">
                        <MilkdownEditor
                            :content="content"
                            :comments="[]"
                            :readonly="false"
                            @update="onUpdate"
                        />
                    </MilkdownProvider>
                </ProsemirrorAdapterProvider>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { MilkdownProvider } from "@milkdown/vue";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/vue";
import { X } from "lucide-vue-next";
import { useAppStore } from "../../store";
import MilkdownEditor from "./MilkdownEditor.vue";
import DocSwitcher from "./DocSwitcher.vue";

const props = defineProps({
    filePath: { type: String, required: true },
    index: { type: Number, required: true },
});

const store = useAppStore();
const rootRef = ref(null);
const content = ref("");
// editBaseline: last serialized markdown we accepted — used to detect real edits.
// diskBaseline: what we believe is on disk — used to detect *external* changes so a
// pane ignores the file-watcher event triggered by its own save.
const editBaseline = ref("");
const diskBaseline = ref("");
const loaded = ref(false);
const error = ref("");
const dragOver = ref(false);

const dirty = ref(false);
const saving = ref(false);
const reloadKey = ref(0);
let saveTimer = null;

const isActive = computed(() => store.activePane === props.filePath);

const saveStateLabel = computed(() => {
    if (saving.value) return "Saving…";
    if (dirty.value) return "Edited";
    return "Saved";
});
const saveStateClass = computed(() => ({
    "is-saving": saving.value,
    "is-dirty": dirty.value && !saving.value,
}));

// Load content fresh before mounting Milkdown so the editor receives final text.
async function load(path) {
    loaded.value = false;
    error.value = "";
    content.value = "";
    dirty.value = false;
    try {
        const text = await window.canonic.files.read(store.workspacePath, path);
        content.value = text || "";
        editBaseline.value = text || "";
        diskBaseline.value = text || "";
        loaded.value = true;
    } catch (err) {
        error.value = "Could not load document";
        console.error("[RefDocPane] read failed:", err);
    }
}

watch(() => props.filePath, (path) => load(path), { immediate: true });

// External change (e.g. an agent edited this doc): reload from disk when the pane
// has no unsaved edits, otherwise leave the user's work untouched.
watch(
    () => store.externalReloadAt,
    async () => {
        if (dirty.value || saving.value) return;
        const text = await window.canonic.files
            .read(store.workspacePath, props.filePath)
            .catch(() => null);
        // Only react to genuinely external writes — diskBaseline already reflects
        // our own saves, so this skips the watcher event our autosave just caused.
        if (text != null && text !== diskBaseline.value) {
            content.value = text;
            editBaseline.value = text;
            diskBaseline.value = text;
            reloadKey.value += 1; // remount editor with fresh content
        }
    },
);

// Milkdown emits serialized markdown on every doc change. We only treat it as a
// real edit when it diverges from the last loaded/saved text AND the editor has
// focus — that filters out background normalization passes (which would otherwise
// rewrite a doc the user merely opened beside their work).
function onUpdate(markdown) {
    content.value = markdown;
    if (markdown === editBaseline.value) {
        dirty.value = false;
        return;
    }
    const focused = rootRef.value?.contains(document.activeElement);
    if (focused) {
        dirty.value = true;
        scheduleSave();
    }
}

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
}

async function flush() {
    clearTimeout(saveTimer);
    if (!dirty.value || saving.value) return;
    const snapshot = content.value;
    saving.value = true;
    try {
        const saved = await store.savePaneFile(props.filePath, snapshot);
        editBaseline.value = snapshot;
        diskBaseline.value = saved ?? snapshot; // normalized text now on disk
        if (content.value === snapshot) dirty.value = false;
    } catch (err) {
        console.error("[RefDocPane] save failed:", err);
    } finally {
        saving.value = false;
    }
}

async function onSwitch(path) {
    await flush();
    store.setRefPaneFile(props.index, path);
}

async function close() {
    await flush();
    store.removeRefPane(props.index);
}

// Capture phase so we intercept before the ProseMirror view.
function onDragOver(e) {
    if (!e.dataTransfer.types.includes("application/canonic-path")) return;
    e.preventDefault();
    e.stopPropagation();
    dragOver.value = true;
    e.dataTransfer.dropEffect = "move";
}

async function onDrop(e) {
    if (!e.dataTransfer.types.includes("application/canonic-path")) return;
    e.preventDefault();
    e.stopPropagation();
    dragOver.value = false;
    const path = e.dataTransfer.getData("application/canonic-path");
    if (path && path.endsWith(".md")) {
        await flush();
        store.setRefPaneFile(props.index, path);
    }
}

onBeforeUnmount(flush);
</script>

<style scoped>
.ref-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-left: 1px solid var(--border);
    background: var(--bg-editor);
}

.ref-pane--stacked {
    border-left: none;
    border-top: 1px solid var(--border);
}

.ref-pane--dragover {
    box-shadow: inset 0 0 0 2px var(--accent);
}

.ref-pane--active {
    box-shadow: inset 2px 0 0 var(--accent);
}
.ref-pane--active.ref-pane--stacked {
    box-shadow: inset 0 2px 0 var(--accent);
}

.ref-topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.ref-save-state {
    margin-left: auto;
    font-size: 0.6875rem;
    color: var(--text-muted);
    white-space: nowrap;
}
.ref-save-state.is-dirty { color: var(--accent); }
.ref-save-state.is-saving { color: var(--text-muted); font-style: italic; }

.ref-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
}

.ref-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.ref-body {
    flex: 1;
    overflow-y: auto;
}

.ref-content {
    padding: 24px 32px;
}

.ref-message {
    padding: 32px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8125rem;
}
</style>
