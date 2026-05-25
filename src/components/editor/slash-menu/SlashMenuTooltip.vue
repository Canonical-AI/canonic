<template>
    <Teleport to="body">
        <div
            v-if="visible"
            class="slash-tooltip"
            :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
        >
            <div class="slash-tooltip-search">
                <input
                    ref="searchInput"
                    v-model="query"
                    class="slash-tooltip-input"
                    placeholder="Command..."
                    @keydown.enter.prevent="selectActive"
                    @keydown.escape="close"
                    @keydown.arrow-down.prevent="moveDown"
                    @keydown.arrow-up.prevent="moveUp"
                    @keydown.arrow-right.prevent="handleRight"
                    @keydown.arrow-left.prevent="handleLeft"
                />
            </div>
            <div class="slash-tooltip-list">
                <div
                    v-for="(item, i) in filtered"
                    :key="item.id"
                    class="slash-tooltip-item"
                    :class="{
                        active: i === activeIndex,
                        'has-submenu': item.submenu,
                    }"
                    @mousedown.prevent="select(item)"
                >
                    <component
                        :is="item.icon"
                        v-if="item.icon"
                        :size="14"
                        class="slash-item-icon"
                    />
                    <span v-else class="slash-item-icon-placeholder">/</span>
                    <span class="slash-item-label">{{ item.label }}</span>
                    <ChevronRight
                        v-if="item.submenu"
                        :size="14"
                        class="slash-submenu-indicator"
                    />
                </div>
                <div v-if="filtered.length === 0" class="slash-no-results">
                    No matches found
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, watch } from "vue";
import {
    Table,
    ChevronRight,
    Type,
    List,
    ListOrdered,
    Quote,
    Image,
    Code,
    Activity,
    Heading1,
    Heading2,
    Heading3,
    Minus,
} from "lucide-vue-next";

const visible = ref(false);
const query = ref("");
const pos = ref({ top: 0, left: 0 });
const activeIndex = ref(0);
const searchInput = ref(null);
const currentMenu = ref("main");

let onActionCallback = null;
let onCloseCallback = null;

const MENU_DATA = {
    main: [{ id: "insert", label: "Insert", icon: Type, submenu: "insert" }],
    insert: [
        { id: "text", label: "Text & Headings", icon: Type, submenu: "text" },
        { id: "lists", label: "Lists", icon: List, submenu: "lists" },
        { id: "table", label: "Table", icon: Table, action: "insert-table" },
        { id: "code", label: "Code Block", icon: Code, action: "insert-code" },
        {
            id: "mermaid",
            label: "Mermaid Diagram",
            icon: Activity,
            action: "insert-mermaid",
        },
        { id: "hr", label: "Divider", icon: Minus, action: "insert-hr" },
    ],
    text: [
        { id: "h1", label: "Heading 1", icon: Heading1, action: "h1" },
        { id: "h2", label: "Heading 2", icon: Heading2, action: "h2" },
        { id: "h3", label: "Heading 3", icon: Heading3, action: "h3" },
        { id: "blockquote", label: "Quote", icon: Quote, action: "blockquote" },
    ],
    lists: [
        {
            id: "bullet",
            label: "Bullet List",
            icon: List,
            action: "bullet-list",
        },
        {
            id: "ordered",
            label: "Numbered List",
            icon: ListOrdered,
            action: "ordered-list",
        },
        { id: "task", label: "Task List", icon: List, action: "task-list" },
    ],
};

const currentItems = computed(() => MENU_DATA[currentMenu.value] || []);

const filtered = computed(() => {
    const q = query.value.toLowerCase();
    return currentItems.value.filter((item) =>
        item.label.toLowerCase().includes(q),
    );
});

watch(filtered, () => {
    activeIndex.value = 0;
});

function open(anchorPos, onAction, onClose) {
    pos.value = anchorPos;
    onActionCallback = onAction;
    onCloseCallback = onClose;
    query.value = "";
    activeIndex.value = 0;
    currentMenu.value = "main";
    visible.value = true;
    nextTick(() => searchInput.value?.focus());
}

function close() {
    visible.value = false;
    onCloseCallback?.();
    onActionCallback = null;
    onCloseCallback = null;
}

function select(item) {
    if (item.submenu) {
        currentMenu.value = item.submenu;
        query.value = "";
        activeIndex.value = 0;
        return;
    }

    if (item.action) {
        const cb = onActionCallback;
        onActionCallback = null;
        onCloseCallback = null;
        visible.value = false;
        cb?.(item.action);
    }
}

function selectActive() {
    if (filtered.value.length > 0) {
        select(filtered.value[activeIndex.value]);
    }
}

function moveDown() {
    if (activeIndex.value < filtered.value.length - 1) activeIndex.value++;
}

function moveUp() {
    if (activeIndex.value > 0) activeIndex.value--;
}

function handleRight() {
    const item = filtered.value[activeIndex.value];
    if (item?.submenu) select(item);
}

function handleLeft() {
    if (currentMenu.value !== "main") {
        currentMenu.value = "main";
        query.value = "";
        activeIndex.value = 0;
    }
}

defineExpose({ open, close, visible });
</script>

<style scoped>
.slash-tooltip {
    position: fixed;
    z-index: 1000;
    background: var(--bg-secondary, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    width: 220px;
    overflow: hidden;
}

.slash-tooltip-search {
    padding: 8px;
    border-bottom: 1px solid var(--border);
}

.slash-tooltip-input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-family: inherit;
    box-sizing: border-box;
}

.slash-tooltip-list {
    max-height: 280px;
    overflow-y: auto;
    padding: 4px 0;
}

.slash-tooltip-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    cursor: pointer;
}

.slash-tooltip-item:hover,
.slash-tooltip-item.active {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.slash-item-icon {
    opacity: 0.7;
    color: var(--accent);
}
.slash-item-icon-placeholder {
    width: 14px;
    text-align: center;
    opacity: 0.5;
}
.slash-item-label {
    flex: 1;
}
.slash-submenu-indicator {
    opacity: 0.3;
}

.slash-no-results {
    padding: 12px;
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-muted);
}
</style>
