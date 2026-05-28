<template>
  <div :class="['chat-message', role]">
    <div v-if="type === 'context-injection'" class="context-injection">{{ content }}</div>

    <details v-else-if="type === 'tool-call'" class="tool-call">
      <summary class="tool-summary">
        <Wrench :size="11" /> <span>{{ toolName }} {{ toolSummary }}</span>
      </summary>
      <pre class="tool-body">{{ content }}</pre>
    </details>

    <div v-else-if="type === 'error'" class="error-message">{{ content }}</div>

    <div v-else-if="role === 'user'" class="user-bubble">
      <div class="message-content" v-html="renderMarkdown(content)" />
    </div>

    <div v-else-if="role === 'agent'" class="agent-bubble">
      <div class="message-content" v-html="renderMarkdown(content)" />
    </div>
  </div>
</template>

<script setup>
import { Wrench } from 'lucide-vue-next'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

defineProps({
  role: { type: String, default: 'agent' },
  content: { type: String, default: '' },
  type: { type: String, default: 'agent' },
  toolName: { type: String, default: '' },
  toolSummary: { type: String, default: '' },
  timestamp: { type: Number, default: 0 }
})

function renderMarkdown(text) {
  if (!text) return ''
  try { return marked.parse(String(text)) } catch { return String(text) }
}
</script>

<style scoped>
.chat-message { margin-bottom: 8px; animation: fadeIn 0.15s ease; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.context-injection {
  font-size: 0.7rem; color: var(--text-muted); font-style: italic;
  padding: 2px 0 4px 4px; border-left: 2px solid var(--border);
  user-select: none;
}

.tool-call { margin: 4px 0; }

.tool-summary {
  display: flex; align-items: center; gap: 5px;
  font-size: 0.72rem; color: var(--text-muted); cursor: pointer;
  padding: 3px 0; transition: color 0.1s;
}
.tool-summary:hover { color: var(--text-secondary); }

.tool-body {
  margin: 4px 0 4px 16px; padding: 6px 8px;
  background: var(--bg-base); border: 1px solid var(--border);
  border-radius: 4px; font-size: 0.7rem; color: var(--text-muted);
  white-space: pre-wrap; word-break: break-all;
  max-height: 200px; overflow-y: auto;
}

.error-message {
  font-size: 0.78rem; color: #e05555;
  padding: 6px 8px; background: rgba(224, 85, 85, 0.08);
  border-radius: 4px;
}

.user-bubble { display: flex; justify-content: flex-end; }

.user-bubble .message-content {
  max-width: 85%; padding: 7px 12px;
  background: var(--accent); color: #fff;
  border-radius: 12px 12px 2px 12px;
  font-size: 0.82rem; line-height: 1.4;
}

.user-bubble .message-content :deep(p) { margin: 0; }
.user-bubble .message-content :deep(pre) {
  background: rgba(0,0,0,0.15); padding: 6px; border-radius: 4px; font-size: 0.72rem;
}
.user-bubble .message-content :deep(code) { font-size: 0.72rem; }

.agent-bubble .message-content {
  padding: 4px 0; font-size: 0.82rem; line-height: 1.45; color: var(--text-primary);
}

.agent-bubble .message-content :deep(p) { margin: 0 0 8px; }
.agent-bubble .message-content :deep(pre) {
  background: var(--bg-base); border: 1px solid var(--border);
  border-radius: 4px; padding: 8px; font-size: 0.75rem; overflow-x: auto;
}
.agent-bubble .message-content :deep(code) { font-size: 0.75rem; }
.agent-bubble .message-content :deep(ul), .agent-bubble .message-content :deep(ol) { padding-left: 20px; margin: 4px 0 8px; }
</style>
