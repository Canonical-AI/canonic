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
            <template v-for="(group, gi) in groups" :key="group.label">
                <div v-if="gi > 0" class="menu-divider"></div>
                <div class="menu-group-label">{{ group.label }}</div>
                <button
                    v-for="item in group.items"
                    :key="item.label"
                    class="menu-item"
                    @click="run(item.run)"
                >
                    {{ item.label }}
                </button>
            </template>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { Menu } from "lucide-vue-next";
import { useAppMenu } from "../../composables/useAppMenu.js";

const emit = defineEmits(["open-settings", "reload-config"]);

const open = ref(false);
const rootRef = ref(null);

const { groups, refreshDefault } = useAppMenu({
    onOpenSettings: () => emit("open-settings"),
    onReloadConfig: () => emit("reload-config"),
});

// Close the dropdown after an action runs.
async function run(fn) {
    open.value = false;
    try {
        await fn();
    } catch (err) {
        console.error("[AppMenu] action failed:", err);
    }
}

function onDocClick(e) {
    if (open.value && rootRef.value && !rootRef.value.contains(e.target)) {
        open.value = false;
    }
}

onMounted(() => {
    document.addEventListener("click", onDocClick, true);
    refreshDefault();
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
