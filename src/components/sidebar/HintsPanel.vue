<template>
    <Transition name="hints">
        <div v-if="current" class="hints-panel">
            <div class="hints-header">
                <span class="hints-title">{{ current.title }}</span>
                <div class="hints-header-right">
                    <span v-if="total > 1" class="hints-counter">{{ currentIndex + 1 }}/{{ total }}</span>
                    <button class="hints-dismiss" @click="dismiss()" title="Dismiss hints">
                        <X :size="12" />
                    </button>
                    <div class="hints-caret-wrap" ref="caretWrap">
                        <button class="hints-caret" @click="popoverOpen = !popoverOpen" title="More options">
                            <ChevronDown :size="12" />
                        </button>
                        <div v-if="popoverOpen" class="hints-popover">
                            <button class="hints-popover-btn" @click="disableAll">Disable hints</button>
                        </div>
                    </div>
                </div>
            </div>
            <p class="hints-body">{{ current.body }}</p>
            <div class="hints-footer">
                <button v-if="current.action" class="hints-action" @click="emit('navigate', current.action.target)">
                    {{ current.action.label }}
                </button>
                <div class="hints-nav" v-if="total > 1">
                    <button class="hints-nav-btn" :disabled="!hasPrev" @click="prev" title="Previous hint">
                        <ChevronLeft :size="11" />
                    </button>
                    <button class="hints-nav-btn" :disabled="!hasNext" @click="next" title="Next hint">
                        <ChevronRight :size="11" />
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { ref, toRef, onMounted, onBeforeUnmount } from 'vue'
import { X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-vue-next'
import { useHints } from '../../composables/useHints.js'

const props = defineProps({ config: Object })
const emit = defineEmits(['navigate'])

const { current, total, hasNext, hasPrev, next, prev, dismiss, disableAll, currentIndex } = useHints(toRef(props, 'config'))

const popoverOpen = ref(false)
const caretWrap = ref(null)

function onClickOutside(e) {
    if (caretWrap.value && !caretWrap.value.contains(e.target)) {
        popoverOpen.value = false
    }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))
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

.hints-header-right {
    display: flex;
    align-items: center;
    gap: 4px;
}

.hints-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.hints-counter {
    font-size: 10px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

.hints-dismiss,
.hints-caret {
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

.hints-dismiss:hover,
.hints-caret:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
}

.hints-caret-wrap {
    position: relative;
}

.hints-popover {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-mid);
    border-radius: 6px;
    padding: 4px;
    z-index: 100;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.hints-popover-btn {
    display: block;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 4px;
    text-align: left;
    transition: background 0.1s;
}

.hints-popover-btn:hover {
    background: var(--bg-hover);
}

.hints-body {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: 8px;
}

.hints-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
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

.hints-nav {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
}

.hints-nav-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px 4px;
    display: flex;
    align-items: center;
    border-radius: 3px;
    transition: color 0.15s, background 0.15s;
}

.hints-nav-btn:hover:not(:disabled) {
    color: var(--text-secondary);
    background: var(--bg-hover);
}

.hints-nav-btn:disabled {
    opacity: 0.3;
    cursor: default;
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
