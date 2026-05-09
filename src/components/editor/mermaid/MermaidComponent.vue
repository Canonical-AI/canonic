<template>
  <div
    class="mermaid-card"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <div class="mermaid-body">
      <div v-if="tab === 'preview'" class="mermaid-preview">
        <div v-if="renderError" class="mermaid-error">
          <span class="mermaid-error-label">Diagram error:</span> {{ renderError }}
        </div>
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
    <div v-if="hovering && !editorReadonly" class="mermaid-tabs">
      <button
        class="mermaid-tab"
        :class="{ active: tab === 'preview' }"
        @click="tab = 'preview'"
      >Preview</button>
      <button
        class="mermaid-tab"
        :class="{ active: tab === 'editor' }"
        @click="tab = 'editor'"
      >Edit</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted, inject } from 'vue'
import { useNodeViewContext } from '@prosemirror-adapter/vue'
import mermaid from 'mermaid'

const { node, setAttrs } = useNodeViewContext()

const tab = ref('preview')
const hovering = ref(false)
const renderedSvg = ref('')
const renderError = ref('')
let renderTimer = null
let currentRenderId = ''

const source = ref(node.value?.attrs?.value || '')

const sourceRows = computed(() => Math.max(4, source.value.split('\n').length + 1))

function initMermaid(dark) {
  const vars = dark ? {
    background:            '#0C0E12',
    mainBkg:               '#161A21',
    nodeBkg:               '#161A21',
    primaryColor:          '#1e2d3d',
    primaryTextColor:      '#D6CFCB',
    primaryBorderColor:    '#4A7A9B',
    lineColor:             '#4A7A9B',
    secondaryColor:        '#282F3B',
    tertiaryColor:         '#1a222c',
    edgeLabelBackground:   '#161A21',
    clusterBkg:            '#1e2730',
    titleColor:            '#D6CFCB',
    textColor:             '#D6CFCB',
    labelColor:            '#D6CFCB',
    nodeTextColor:         '#D6CFCB',
    // gantt-specific
    sectionBkgColor:       '#161A21',
    altSectionBkgColor:    '#1e2730',
    gridColor:             '#2a3545',
    taskBkgColor:          '#4A7A9B',
    taskBorderColor:       '#6A97B5',
    taskTextColor:         '#E8E2DE',
    taskTextLightColor:    '#E8E2DE',
    taskTextOutsideColor:  '#A899AD',
    taskTextClickableColor:'#D6CFCB',
    activeTaskBkgColor:    '#6A97B5',
    activeTaskBorderColor: '#8ab5d0',
    doneTaskBkgColor:      '#3a4e62',
    doneTaskBorderColor:   '#5a7a90',
    critBkgColor:          'rgba(224,82,82,0.25)',
    critBorderColor:       '#e05252',
    todayLineColor:        '#f59e0b',
  } : {
    background:            '#F6F4F7',
    primaryColor:          '#dce8f0',
    primaryTextColor:      '#2A1F2E',
    primaryBorderColor:    '#5B7FA5',
    lineColor:             '#5B7FA5',
    textColor:             '#2A1F2E',
    titleColor:            '#2A1F2E',
    taskBkgColor:          '#5B7FA5',
    taskTextColor:         '#ffffff',
    taskTextLightColor:    '#2A1F2E',
    taskTextOutsideColor:  '#4A3A4E',
    activeTaskBkgColor:    '#7A9BBF',
    doneTaskBkgColor:      '#E6E1E8',
    todayLineColor:        '#f59e0b',
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: vars,
    fontFamily: 'inherit',
    maxTextSize: 100000,
  })
}

const isDark = inject('isDark', ref(false))
const editorReadonly = inject('editorReadonly', ref(false))

onMounted(() => {
  initMermaid(isDark.value)
  renderDiagram()
})

onUnmounted(() => {
  clearTimeout(renderTimer)
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

watch(() => node.value?.attrs?.value, (val) => {
  if (val !== source.value) source.value = val || ''
})

async function renderDiagram() {
  if (!source.value.trim()) return
  // Use a unique ID per render call so multiple diagrams on the same page never collide
  const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  currentRenderId = id
  try {
    const { svg } = await mermaid.render(id, source.value)
    if (currentRenderId !== id) return
    renderedSvg.value = svg
    renderError.value = ''
  } catch (e) {
    if (currentRenderId !== id) return
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
  background: var(--bg-surface);
}

.mermaid-body { padding: 16px; }

.mermaid-preview { min-height: 40px; }

.mermaid-svg :deep(svg) {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  overflow: visible !important;
  display: block;
  background: transparent !important;
}

/* Global text fallback — catches any text element mermaid doesn't explicitly theme */
.mermaid-svg :deep(text) {
  fill: var(--text-primary) !important;
  opacity: 1 !important;
}

/* Hide outside overflow labels — they double-up with the inside label */
.mermaid-svg :deep(.taskTextOutsideRight),
.mermaid-svg :deep(.taskTextOutsideLeft),
.mermaid-svg :deep(.taskTextOutside0),
.mermaid-svg :deep(.taskTextOutside1) {
  display: none !important;
}

/* Task text inside bars — always primary color, full opacity */
.mermaid-svg :deep(.taskText),
.mermaid-svg :deep(.taskText0),
.mermaid-svg :deep(.taskText1) {
  fill: var(--text-primary) !important;
  opacity: 1 !important;
}

/* Section row backgrounds and their labels */
.mermaid-svg :deep(.section0),
.mermaid-svg :deep(.section1) {
  fill: transparent !important;
  opacity: 1 !important;
}

.mermaid-svg :deep(.sectionTitle),
.mermaid-svg :deep(.sectionTitle0),
.mermaid-svg :deep(.sectionTitle1) {
  fill: var(--text-secondary) !important;
}

/* Diagram title */
.mermaid-svg :deep(.titleText) {
  fill: var(--text-primary) !important;
}

/* Axis / date tick labels */
.mermaid-svg :deep(.tick text),
.mermaid-svg :deep(.tick line) {
  fill: var(--text-secondary) !important;
  stroke: var(--border) !important;
}

/* Grid lines */
.mermaid-svg :deep(.grid .tick line),
.mermaid-svg :deep(.grid path) {
  stroke: var(--border) !important;
  opacity: 0.5;
}

/* Today marker line */
.mermaid-svg :deep(.today) {
  stroke: #f59e0b !important;
  stroke-width: 2px;
}

.mermaid-error {
  color: #e05252;
  font-size: 0.8125rem;
  font-family: 'JetBrains Mono', monospace;
  padding: 10px 12px;
  background: rgba(224, 82, 82, 0.1);
  border: 1px solid rgba(224, 82, 82, 0.3);
  border-radius: 6px;
  line-height: 1.5;
}

.mermaid-error-label {
  font-weight: 600;
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
