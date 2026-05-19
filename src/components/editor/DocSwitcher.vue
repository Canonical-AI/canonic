<template>
    <div class="doc-switcher" ref="rootEl">
        <button
            class="switcher-btn"
            :title="currentPath || placeholder"
            @click.stop="toggle"
        >
            <FileText :size="12" />
            <span class="switcher-label">{{ buttonLabel }}</span>
            <ChevronDown :size="12" class="switcher-caret" />
        </button>

        <div v-if="open" class="switcher-popover" @click.stop>
            <input
                ref="searchEl"
                v-model="query"
                type="text"
                class="switcher-search"
                placeholder="Search documents…"
                @keydown.esc="close"
                @keydown.enter="pickFirst"
                @keydown.down.prevent="moveHighlight(1)"
                @keydown.up.prevent="moveHighlight(-1)"
            />
            <div class="switcher-list">
                <button
                    v-for="(doc, i) in filtered"
                    :key="doc.path"
                    class="switcher-item"
                    :class="{
                        active: doc.path === currentPath,
                        highlight: i === highlight,
                    }"
                    @click="select(doc.path)"
                    @mouseenter="highlight = i"
                >
                    <span class="switcher-item-name">{{ docName(doc) }}</span>
                    <span class="switcher-item-path">{{ doc.path }}</span>
                </button>
                <div v-if="!filtered.length" class="switcher-empty">
                    No documents match
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from "vue";
import { FileText, ChevronDown } from "lucide-vue-next";
import { useAppStore } from "../../store";

const props = defineProps({
    currentPath: { type: String, default: null },
    placeholder: { type: String, default: "Pick a document" },
});
const emit = defineEmits(["select"]);

const store = useAppStore();
const open = ref(false);
const query = ref("");
const highlight = ref(0);
const rootEl = ref(null);
const searchEl = ref(null);

function docName(doc) {
    return (doc.name || doc.path.split("/").pop()).replace(/\.md$/, "");
}

const buttonLabel = computed(() => {
    if (!props.currentPath) return props.placeholder;
    return props.currentPath.split("/").pop().replace(/\.md$/, "");
});

const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    const list = store.flatDocList;
    if (!q) return list.slice(0, 50);
    return list
        .filter(
            (d) =>
                d.path.toLowerCase().includes(q) ||
                (d.name || "").toLowerCase().includes(q),
        )
        .slice(0, 50);
});

function toggle() {
    open.value ? close() : openMenu();
}

async function openMenu() {
    open.value = true;
    query.value = "";
    highlight.value = 0;
    document.addEventListener("click", onDocClick, true);
    await nextTick();
    searchEl.value?.focus();
}

function close() {
    open.value = false;
    document.removeEventListener("click", onDocClick, true);
}

function onDocClick(e) {
    if (rootEl.value && !rootEl.value.contains(e.target)) close();
}

function select(path) {
    emit("select", path);
    close();
}

function pickFirst() {
    const doc = filtered.value[highlight.value] || filtered.value[0];
    if (doc) select(doc.path);
}

function moveHighlight(delta) {
    const n = filtered.value.length;
    if (!n) return;
    highlight.value = (highlight.value + delta + n) % n;
}

onBeforeUnmount(() => {
    document.removeEventListener("click", onDocClick, true);
});
</script>

<style scoped>
.doc-switcher {
    position: relative;
    display: inline-flex;
}

.switcher-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 200px;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
}

.switcher-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.switcher-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.switcher-caret {
    flex-shrink: 0;
    color: var(--text-muted);
}

.switcher-popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 400;
    width: 280px;
    background: var(--bg-surface);
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.switcher-search {
    width: 100%;
    background: var(--bg-body);
    border: 1px solid var(--border-mid);
    border-radius: 5px;
    color: var(--text-primary);
    font-size: 0.8125rem;
    padding: 6px 8px;
    outline: none;
}

.switcher-search:focus {
    border-color: var(--accent-muted);
}

.switcher-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 280px;
    overflow-y: auto;
}

.switcher-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: left;
    padding: 5px 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
}

.switcher-item.highlight {
    background: var(--bg-hover);
}

.switcher-item.active {
    background: var(--accent-muted);
}

.switcher-item-name {
    font-size: 0.8125rem;
    color: var(--text-primary);
}

.switcher-item-path {
    font-size: 0.6875rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.switcher-empty {
    padding: 10px 8px;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
}
</style>
