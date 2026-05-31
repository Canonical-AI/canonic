<template>
    <div class="app-menu" ref="rootRef">
        <button
            class="icon-btn app-menu-trigger"
            title="Menu"
            @click="open = !open"
        >
            <Menu :size="15" />
        </button>

        <div v-if="open" class="app-menu-dropdown">
            <div class="menu-group-label">File</div>
            <button class="menu-item" @click="run(newWorkspace)">
                New workspace…
            </button>
            <button class="menu-item" @click="run(openWorkspace)">
                Open workspace…
            </button>
            <button class="menu-item" @click="run(openFile)">Open file…</button>

            <div class="menu-divider"></div>
            <div class="menu-group-label">Edit</div>
            <button class="menu-item" @click="run(() => edit('undo'))">
                Undo
            </button>
            <button class="menu-item" @click="run(() => edit('redo'))">
                Redo
            </button>
            <button class="menu-item" @click="run(() => edit('cut'))">Cut</button>
            <button class="menu-item" @click="run(() => edit('copy'))">
                Copy
            </button>
            <button class="menu-item" @click="run(() => edit('paste'))">
                Paste
            </button>
            <button class="menu-item" @click="run(() => edit('selectAll'))">
                Select all
            </button>

            <div class="menu-divider"></div>
            <div class="menu-group-label">Config</div>
            <button class="menu-item" @click="run(() => emit('open-settings'))">
                Settings
            </button>
            <button class="menu-item" @click="run(setDefault)">
                {{ isDefault ? "Default editor ✓" : "Set as default editor" }}
            </button>
            <button class="menu-item" @click="run(openConfig)">
                Open config file
            </button>
            <button class="menu-item" @click="run(() => emit('reload-config'))">
                Reload config
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "../../store";
import { Menu } from "lucide-vue-next";

const emit = defineEmits(["open-settings", "reload-config"]);
const store = useAppStore();
const router = useRouter();

const open = ref(false);
const rootRef = ref(null);
const isDefault = ref(false);

// Close the dropdown after an action runs.
async function run(fn) {
    open.value = false;
    try {
        await fn();
    } catch (err) {
        console.error("[AppMenu] action failed:", err);
    }
}

function newWorkspace() {
    // The guided new-workspace flow (name + template) lives on the Get Started
    // screen; route there rather than duplicating it.
    router.push("/");
}

async function openWorkspace() {
    const chosen = await window.canonic.workspace.openDialog();
    if (!chosen) return;
    await store.openWorkspace(chosen, "blank");
    router.push("/workspace");
}

async function openFile() {
    const chosen = await window.canonic.files.openDialog();
    if (!chosen) return;
    const ok = await store.openStandaloneFile(chosen);
    if (ok) router.push("/workspace");
}

function edit(action) {
    return window.canonic.app.editAction(action);
}

async function setDefault() {
    await window.canonic.app.setDefaultEditor(true);
    isDefault.value = await window.canonic.app.isDefaultEditor();
}

function openConfig() {
    return window.canonic.app.openConfig();
}

function onDocClick(e) {
    if (open.value && rootRef.value && !rootRef.value.contains(e.target)) {
        open.value = false;
    }
}

onMounted(async () => {
    document.addEventListener("click", onDocClick, true);
    try {
        isDefault.value = await window.canonic.app.isDefaultEditor();
    } catch {}
});
onBeforeUnmount(() => {
    document.removeEventListener("click", onDocClick, true);
});
</script>

<style scoped>
.app-menu {
    position: relative;
    display: inline-flex;
    -webkit-app-region: no-drag;
}

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
        background 0.12s,
        color 0.12s;
}
.icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.app-menu-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 220px;
    background: var(--bg-surface);
    border: 1px solid var(--border-mid, var(--border));
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    z-index: 10000;
}

.menu-group-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 6px 10px 4px;
}

.menu-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 7px 10px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-family: inherit;
    border-radius: 6px;
    cursor: pointer;
    transition:
        background 0.1s,
        color 0.1s;
}
.menu-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.menu-divider {
    height: 1px;
    background: var(--border-mid, var(--border));
    margin: 6px 4px;
}
</style>
