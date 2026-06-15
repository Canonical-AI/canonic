<template>
    <!-- Frameless themed window controls for Linux/Windows. Placement (left vs
         right) is decided by the parent from the desktop's button-layout. -->
    <div class="window-controls">
        <button
            class="win-btn"
            title="Minimize"
            aria-label="Minimize"
            @click="minimize"
        >
            <Minus :size="15" />
        </button>
        <button
            class="win-btn"
            title="Maximize"
            aria-label="Maximize"
            @click="toggleMaximize"
        >
            <Square :size="12" />
        </button>
        <button
            class="win-btn win-btn--close"
            title="Close"
            aria-label="Close"
            @click="close"
        >
            <X :size="15" />
        </button>
    </div>
</template>

<script setup>
import { Minus, Square, X } from "lucide-vue-next";
import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();
// .catch swallows the rejection if the command isn't permitted (e.g. running
// outside Tauri / in tests).
const minimize = () => win.minimize().catch(() => {});
const toggleMaximize = () => win.toggleMaximize().catch(() => {});
const close = () => win.close().catch(() => {});
</script>

<style scoped>
.window-controls {
    display: flex;
    align-items: center;
    gap: 2px;
}
.win-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s;
}
.win-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.win-btn--close:hover {
    background: var(--danger, #e5484d);
    color: #fff;
}
</style>
