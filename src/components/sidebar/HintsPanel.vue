<template>
    <Transition name="hints">
        <div v-if="current" class="hints-panel">
            <div class="hints-header">
                <span class="hints-title">{{ current.title }}</span>
                <button class="hints-dismiss" @click="dismiss(current.id)" title="Dismiss">
                    <X :size="12" />
                </button>
            </div>
            <p class="hints-body">{{ current.body }}</p>
            <button v-if="current.action" class="hints-action" @click="emit('navigate', current.action.target)">
                {{ current.action.label }}
            </button>
        </div>
    </Transition>
</template>

<script setup>
import { toRef } from 'vue'
import { X } from 'lucide-vue-next'
import { useHints } from '../../composables/useHints.js'

const props = defineProps({ config: Object })
const emit = defineEmits(['navigate'])

const { current, dismiss } = useHints(toRef(props, 'config'))
</script>

<style scoped>
.hints-panel {
    margin: 8px;
    padding: 10px 12px;
    background: var(--bg-active);
    border: 1px solid var(--border);
    border-radius: 6px;
    flex-shrink: 0;
}

.hints-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
}

.hints-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.hints-dismiss {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px;
    display: flex;
    align-items: center;
    border-radius: 3px;
    transition: color 0.15s, background 0.15s;
}

.hints-dismiss:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
}

.hints-body {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: 8px;
}

.hints-action {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-primary);
    background: var(--bg-hover);
    border: 1px solid var(--border-mid);
    border-radius: 4px;
    padding: 3px 10px;
    cursor: pointer;
    transition: background 0.15s;
}

.hints-action:hover {
    background: var(--bg-surface);
}

.hints-enter-active,
.hints-leave-active {
    transition: opacity 0.2s, transform 0.2s;
}

.hints-enter-from,
.hints-leave-to {
    opacity: 0;
    transform: translateY(4px);
}
</style>
