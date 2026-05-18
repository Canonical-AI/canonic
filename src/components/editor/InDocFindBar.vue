<template>
  <div class="find-bar" v-if="visible">
    <input
      ref="inputEl"
      v-model="query"
      class="find-input"
      placeholder="Find in document"
      @keydown.enter.prevent="onEnter"
      @keydown.esc.prevent="close"
    />
    <span class="find-count" :class="{ 'find-count--zero': totalMatches === 0 }">
      {{ countLabel }}
    </span>
    <button
      class="find-toggle"
      :class="{ active: opts.case }"
      @click="toggleOpt('case')"
      title="Match Case"
    >Aa</button>
    <button
      class="find-toggle"
      :class="{ active: opts.word }"
      @click="toggleOpt('word')"
      title="Match Whole Word"
    >ab|</button>
    <button
      class="find-toggle"
      :class="{ active: opts.regex }"
      @click="toggleOpt('regex')"
      title="Use Regular Expression"
    >.*</button>
    <button class="find-nav" @click="prev" title="Previous (Shift+Enter)">↑</button>
    <button class="find-nav" @click="next" title="Next (Enter)">↓</button>
    <button class="find-close" @click="close" title="Close (Esc)">✕</button>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  visible: Boolean,
  initialQuery: { type: String, default: '' },
  totalMatches: { type: Number, default: 0 },
  currentMatch: { type: Number, default: -1 },
})

const emit = defineEmits(['update', 'next', 'prev', 'close'])

const inputEl = ref(null)
const query = ref(props.initialQuery)
const opts = ref({ case: false, word: false, regex: false })

const countLabel = ref('0 of 0')

function recomputeLabel() {
  countLabel.value = props.totalMatches === 0
    ? '0 of 0'
    : `${props.currentMatch + 1} of ${props.totalMatches}`
}

watch(() => [props.totalMatches, props.currentMatch], recomputeLabel)
watch(() => props.visible, async (v) => {
  if (v) {
    query.value = props.initialQuery || query.value
    await nextTick()
    inputEl.value?.focus()
    inputEl.value?.select()
    if (query.value) emit('update', { query: query.value, opts: opts.value })
  }
})

watch(query, (q) => emit('update', { query: q, opts: opts.value }))

function toggleOpt(key) {
  opts.value = { ...opts.value, [key]: !opts.value[key] }
  emit('update', { query: query.value, opts: opts.value })
}

function onEnter(e) {
  if (e.shiftKey) emit('prev')
  else emit('next')
}

function next() { emit('next') }
function prev() { emit('prev') }
function close() { emit('close') }
</script>

<style scoped>
.find-bar {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-elevated, #2a2a2a);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  font-size: 0.8125rem;
}

.find-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  min-width: 200px;
  padding: 4px 6px;
  font-size: 0.85rem;
}

.find-input::placeholder { color: var(--text-muted); }

.find-count {
  color: var(--text-muted);
  font-size: 0.75rem;
  min-width: 60px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.find-count--zero { color: var(--text-muted); opacity: 0.6; }

.find-toggle, .find-nav, .find-close {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.72rem;
  min-width: 24px;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}

.find-toggle:hover, .find-nav:hover, .find-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.find-toggle.active {
  background: var(--accent-muted, rgba(100, 149, 237, 0.2));
  color: var(--accent, #6495ed);
  border-color: var(--accent-muted, rgba(100, 149, 237, 0.4));
}

.find-nav, .find-close {
  font-size: 0.85rem;
}
</style>
