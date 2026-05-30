<template>
    <section v-if="store.currentFile" class="doc-nav">
        <button class="doc-nav-header" @click="collapsed = !collapsed">
            <ChevronRight :size="13" class="doc-nav-chevron" :class="{ open: !collapsed }" />
            <span class="section-label">On This Page</span>
        </button>

        <div v-show="!collapsed" class="doc-nav-body">
            <button
                v-for="heading in headings"
                :key="`${heading.line}:${heading.text}`"
                class="doc-nav-item"
                :style="{ '--heading-depth': heading.level - 1 }"
                @click="scrollToHeading(heading)"
            >
                {{ heading.text }}
            </button>
            <div v-if="headings.length === 0" class="doc-nav-empty">
                No headings in this doc.
            </div>
        </div>
    </section>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { ChevronRight } from "lucide-vue-next";
import { useAppStore } from "../../store";
import { storage } from "../../utils/storage.js";

const store = useAppStore();
const COLLAPSED_KEY = "canonic:docNavCollapsed";
const collapsed = ref(storage.getItem(COLLAPSED_KEY) === "true");

watch(collapsed, (val) => {
    storage.setItem(COLLAPSED_KEY, String(val));
});

const headings = computed(() => {
    const items = [];
    const lines = (store.currentContent || "").split(/\r?\n/);
    let inFence = false;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;

        const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (!match) continue;

        const text = match[2].trim();
        if (!text) continue;
        items.push({ level: match[1].length, text, line: i });
    }

    return items;
});

function normalizeHeading(text) {
    return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function scrollToHeading(heading) {
    const scroller = document.querySelector(".editor-scroll");
    if (!scroller) return;

    const target = normalizeHeading(heading.text);
    const candidates = scroller.querySelectorAll("h1, h2, h3, h4, h5, h6");
    for (const el of candidates) {
        if (normalizeHeading(el.textContent || "") === target) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
    }

    scroller.scrollTo({ top: 0, behavior: "smooth" });
}
</script>

<style scoped>
.doc-nav {
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.doc-nav-header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    text-align: left;
}

.doc-nav-header:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.doc-nav-chevron {
    flex-shrink: 0;
    transition: transform 0.15s;
}

.doc-nav-chevron.open {
    transform: rotate(90deg);
}

.section-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.doc-nav-body {
    max-height: 28vh;
    overflow-y: auto;
    padding: 2px 0 7px;
}

.doc-nav-item {
    display: block;
    width: 100%;
    padding: 4px 12px 4px calc(12px + var(--heading-depth) * 10px);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    line-height: 1.35;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.doc-nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.doc-nav-empty {
    padding: 6px 12px 9px;
    color: var(--text-muted);
    font-size: 0.8125rem;
    line-height: 1.4;
}
</style>
