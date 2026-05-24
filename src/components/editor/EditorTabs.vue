<template>
    <div
        v-if="store.tabsEnabled && store.openTabs.length > 0"
        class="editor-tabs"
        :class="{
            'editor-tabs--top': store.tabsPosition === 'top',
            'editor-tabs--bottom': store.tabsPosition !== 'top',
        }"
        role="tablist"
    >
        <button
            v-for="path in store.openTabs"
            :key="path"
            class="editor-tab"
            :class="{ 'editor-tab--active': path === store.currentFile }"
            :title="path"
            role="tab"
            :aria-selected="path === store.currentFile"
            @click="select(path)"
            @auxclick.middle.prevent="close(path)"
        >
            <span class="editor-tab__label">{{ basename(path) }}</span>
            <span
                class="editor-tab__close"
                title="Close tab"
                @click.stop="close(path)"
            >
                <X :size="12" />
            </span>
        </button>
    </div>
</template>

<script setup>
import { X } from "lucide-vue-next";
import { useAppStore } from "../../store";

const store = useAppStore();

function basename(path) {
    const last = path.split("/").pop() || path;
    return last.replace(/\.md$/i, "");
}

function select(path) {
    if (path !== store.currentFile) store.openFile(path);
}

function close(path) {
    store.closeTab(path);
}
</script>

<style scoped>
.editor-tabs {
    display: flex;
    align-items: stretch;
    gap: 2px;
    padding: 0 6px;
    background: var(--bg-sidebar);
    overflow-x: auto;
    overflow-y: hidden;
    flex-shrink: 0;
    min-height: 30px;
}

.editor-tabs--top {
    border-bottom: 1px solid var(--border);
}

.editor-tabs--bottom {
    border-top: 1px solid var(--border);
}

.editor-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    max-width: 220px;
    height: 30px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.78rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;
}

.editor-tab:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
}

.editor-tab--active {
    color: var(--text-primary);
    background: var(--bg-editor);
}

.editor-tab__label {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
}

.editor-tab__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    color: var(--text-muted);
    opacity: 0.6;
}

.editor-tab__close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    opacity: 1;
}
</style>
