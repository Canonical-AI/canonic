<template>
  <span
    class="wiki-link-chip"
    :class="chipClass"
    :title="chipTitle"
    @click="handleClick"
    @mousedown.prevent
  >
    <span class="chip-icon">@</span>
    <span class="chip-name">{{ node.attrs.name }}</span>
    <span v-if="node.attrs.anchor" class="chip-anchor">{{ node.attrs.anchor }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useNodeViewContext } from '@prosemirror-adapter/vue'
import { useAppStore } from '../../../store'

const { node } = useNodeViewContext()
const store = useAppStore()

const resolvedPath = computed(() => store.fileIndex[node.value.attrs.name] ?? null)

const chipClass = computed(() => resolvedPath.value ? 'chip-resolved' : 'chip-new')

const chipTitle = computed(() =>
  resolvedPath.value
    ? `Open ${resolvedPath.value}`
    : `Create "${node.value.attrs.name}"`
)

async function handleClick() {
  if (resolvedPath.value) {
    await store.openFile(resolvedPath.value)
    return
  }
  await createDoc()
}

async function createDoc() {
  const name = node.value.attrs.name
  await store.createFile(name)

  const hasLlm = !!store.config?.aiProvider
  if (hasLlm) {
    await generateContent(name)
  }
}

async function generateContent(name) {
  try {
    const parentContent = store.currentContent || ''
    const prompt = `You are helping create a new document. The user is writing a document and referenced a new document titled "${name}". Based on the context below from the parent document, write a short, useful starter template for the new document. Output only the document content in markdown, no commentary.\n\nParent document context:\n${parentContent.slice(0, 2000)}`

    const chunks = []
    window.canonic.ai.onChunk((text) => chunks.push(text))
    window.canonic.ai.onDone(async () => {
      window.canonic.ai.removeListeners()
      const content = chunks.join('')
      await store.saveFile(content)
    })
    window.canonic.ai.onError(() => window.canonic.ai.removeListeners())

    await window.canonic.ai.chat({
      messages: [{ role: 'user', content: prompt }],
      provider: store.config.aiProvider,
      model: store.config.aiModel,
    })
  } catch {
    // fall back to empty doc silently
  }
}
</script>

<style scoped>
.wiki-link-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 7px 1px 5px;
  border-radius: 12px;
  font-size: 0.8125em;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  transition: opacity 0.1s;
  vertical-align: middle;
  line-height: 1.6;
}

.wiki-link-chip:hover { opacity: 0.8; }

.chip-resolved {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
  border-color: rgba(59, 130, 246, 0.3);
}

.chip-new {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
  border-color: rgba(34, 197, 94, 0.3);
}

.chip-icon { font-style: normal; opacity: 0.7; }

.chip-anchor {
  font-size: 0.85em;
  opacity: 0.6;
  margin-left: 1px;
}
</style>
