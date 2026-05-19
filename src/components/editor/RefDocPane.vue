<template>
    <div
        class="ref-pane"
        :class="{
            'ref-pane--dragover': dragOver,
            'ref-pane--stacked': store.splitStacked,
        }"
        @click="activate"
        @dragover.capture="onDragOver"
        @dragleave="dragOver = false"
        @drop.capture="onDrop"
    >
        <div class="ref-topbar" @click.stop>
            <DocSwitcher :current-path="filePath" @select="onSwitch" />
            <span class="ref-badge" title="Read-only reference — click pane to edit">
                <Eye :size="11" />
                Reference
            </span>
            <button
                class="ref-close"
                title="Close pane"
                @click="store.removeRefPane(index)"
            >
                <X :size="13" />
            </button>
        </div>

        <div class="ref-body">
            <div v-if="error" class="ref-message">{{ error }}</div>
            <div v-else-if="!loaded" class="ref-message">Loading…</div>
            <div v-else class="ref-content">
                <ProsemirrorAdapterProvider>
                    <MilkdownProvider :key="filePath">
                        <MilkdownEditor
                            :content="content"
                            :comments="[]"
                            :readonly="true"
                            @update="() => {}"
                        />
                    </MilkdownProvider>
                </ProsemirrorAdapterProvider>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { MilkdownProvider } from "@milkdown/vue";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/vue";
import { Eye, X } from "lucide-vue-next";
import { useAppStore } from "../../store";
import MilkdownEditor from "./MilkdownEditor.vue";
import DocSwitcher from "./DocSwitcher.vue";

const props = defineProps({
    filePath: { type: String, required: true },
    index: { type: Number, required: true },
});

const store = useAppStore();
const content = ref("");
const loaded = ref(false);
const error = ref("");
const dragOver = ref(false);

// Load content fresh before mounting Milkdown so the editor receives final text.
watch(
    () => props.filePath,
    async (path) => {
        loaded.value = false;
        error.value = "";
        content.value = "";
        try {
            const text = await window.canonic.files.read(
                store.workspacePath,
                path,
            );
            content.value = text || "";
            loaded.value = true;
        } catch (err) {
            error.value = "Could not load document";
            console.error("[RefDocPane] read failed:", err);
        }
    },
    { immediate: true },
);

function activate() {
    store.activateRefPane(props.index);
}

function onSwitch(path) {
    store.setRefPaneFile(props.index, path);
}

// Capture phase so we intercept before the read-only ProseMirror view.
function onDragOver(e) {
    if (!e.dataTransfer.types.includes("application/canonic-path")) return;
    e.preventDefault();
    e.stopPropagation();
    dragOver.value = true;
    e.dataTransfer.dropEffect = "move";
}

function onDrop(e) {
    if (!e.dataTransfer.types.includes("application/canonic-path")) return;
    e.preventDefault();
    e.stopPropagation();
    dragOver.value = false;
    const path = e.dataTransfer.getData("application/canonic-path");
    if (path && path.endsWith(".md")) {
        store.setRefPaneFile(props.index, path);
    }
}
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

.ref-topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.ref-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6875rem;
    color: var(--text-muted);
    margin-left: auto;
}

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
    cursor: pointer;
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
