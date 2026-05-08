<template>
  <div
    class="mermaid-card"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <div class="mermaid-body">
      <div v-if="tab === 'preview'" class="mermaid-preview">
        <div v-if="renderError" class="mermaid-error">{{ renderError }}</div>
        <div v-else v-html="renderedSvg" class="mermaid-svg" />
      </div>
      <div v-else class="mermaid-editor-tab">
        <textarea
          v-model="source"
          class="mermaid-textarea"
          spellcheck="false"
          :rows="sourceRows"
        />
        <div class="mermaid-editor-footer">
          <span class="mermaid-hint">Mermaid diagram</span>
          <button class="mermaid-btn" @click="tab = 'preview'">Update</button>
        </div>
      </div>
    </div>
    <div v-if="hovering" class="mermaid-tabs">
      <button
        class="mermaid-tab"
        :class="{ active: tab === 'preview' }"
        @click="tab = 'preview'"
      >Preview</button>
      <button
        class="mermaid-tab"
        :class="{ active: tab === 'editor' }"
        @click="tab = 'editor'"
      >Editor</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, inject } from 'vue'
import { useNodeViewContext } from '@prosemirror-adapter/vue'
import mermaid from 'mermaid'

const { node, setAttrs } = useNodeViewContext()

const tab = ref('preview')
const hovering = ref(false)
const renderedSvg = ref('')
const renderError = ref('')
let renderTimer = null
let renderCounter = 0

const source = ref(node.value.attrs.value || '')

const sourceRows = computed(() => Math.max(4, source.value.split('\n').length + 1))

function initMermaid(dark) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: dark ? 'dark' : 'default',
    fontFamily: 'inherit',
    maxTextSize: 100000,
  })
}

const isDark = inject('isDark', ref(false))

onMounted(() => {
  initMermaid(isDark.value)
  renderDiagram()
})

watch(isDark, (dark) => {
  initMermaid(dark)
  renderDiagram()
})

watch(source, () => {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    renderDiagram()
    setAttrs({ value: source.value })
  }, 300)
})

watch(() => node.value.attrs.value, (val) => {
  if (val !== source.value) source.value = val || ''
})

async function renderDiagram() {
  const id = `mermaid-${++renderCounter}`
  try {
    const { svg } = await mermaid.render(id, source.value)
    renderedSvg.value = svg
    renderError.value = ''
  } catch (e) {
    renderError.value = e.message || 'Invalid diagram syntax'
    renderedSvg.value = ''
  }
}
</script>

<style scoped>
.mermaid-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin: 8px 0;
  background: var(--bg-secondary);
}

.mermaid-body { padding: 16px; }

.mermaid-preview { min-height: 40px; }

.mermaid-svg :deep(svg) {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  overflow: visible !important;
  display: block;
}

.mermaid-error {
  color: var(--text-error, #e05252);
  font-size: 0.8125rem;
  font-family: 'JetBrains Mono', monospace;
  padding: 8px;
  background: rgba(224, 82, 82, 0.08);
  border-radius: 4px;
}

.mermaid-textarea {
  width: 100%;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8125rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  resize: vertical;
  outline: none;
  line-height: 1.5;
  box-sizing: border-box;
}

.mermaid-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.mermaid-hint { font-size: 0.75rem; color: var(--text-muted); }

.mermaid-btn {
  padding: 3px 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
}

.mermaid-btn:hover { background: var(--bg-hover); }

.mermaid-tabs {
  display: flex;
  border-top: 1px solid var(--border);
}

.mermaid-tab {
  flex: 1;
  padding: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.1s;
}

.mermaid-tab:hover { background: var(--bg-hover); }
.mermaid-tab.active { color: var(--text-primary); background: var(--bg-hover); }
</style>
