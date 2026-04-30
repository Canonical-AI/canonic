<template>
  <div class="ai-chat">
    <div class="chat-messages" ref="messagesEl">
      <div class="ai-intro" v-if="messages.length === 0">
        <div class="ai-avatar">✦</div>
        <p>I'm here to help you think through your document — not write it for you.</p>
        <p class="hint">I can challenge your assumptions, spot gaps, ask clarifying questions, or research facts.</p>
        <div class="suggestion-chips">
          <button v-for="s in suggestions" :key="s" class="chip" @click="sendSuggestion(s)">{{ s }}</button>
        </div>
      </div>

      <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
        <div class="message-content" v-html="renderMarkdown(msg.content)" />
      </div>

      <div v-if="streaming" class="message assistant">
        <div class="message-content streaming">{{ streamBuffer }}<span class="cursor">▌</span></div>
      </div>
    </div>

    <div class="chat-input-area">
      <textarea
        v-model="userInput"
        class="chat-input"
        placeholder="Ask a question about this document..."
        @keydown.enter.prevent="handleEnter"
        rows="2"
      />
      <button class="send-btn" @click="sendMessage" :disabled="!userInput.trim() || streaming">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.75.75V11.44l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 011.06-1.06L7.25 11.44V.75a.75.75 0 011.5 0z" transform="rotate(180, 8, 8)"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useAppStore } from '../store'
import { v4 as uuidv4 } from 'uuid'

const store = useAppStore()
const messagesEl = ref(null)
const userInput = ref('')
const messages = ref([])
const streaming = ref(false)
const streamBuffer = ref('')

const getApiKey = () => store.config?.apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY
const getModel = () => store.config?.model || 'claude-sonnet-4-6'

const suggestions = [
  "What's missing from this document?",
  "What assumptions am I making?",
  "Who would disagree with this?",
  "What are the risks here?"
]

const SYSTEM_PROMPT = `You are a thinking partner for product managers writing internal documents. Your role is to help them think more clearly — NOT to write content for them.

Your behaviors:
- Ask clarifying questions that expose gaps or unstated assumptions
- Challenge claims that need more evidence or reasoning
- Surface risks or edge cases the author may not have considered
- Research specific facts when asked (using web search if available)
- Keep responses concise and conversational — this is a thinking dialogue, not an essay

Your constraints:
- Never write paragraphs that could replace sections of the document
- Never suggest "here's what you could write" — instead ask "what do you mean by X?"
- If asked to write something, redirect: "I can help you think through it — what's the core thing you're trying to say?"

The current document content will be provided as context.`

function renderMarkdown(text) {
  // Simple markdown render — bold, italic, code
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

function handleEnter(e) {
  if (e.shiftKey) return
  sendMessage()
}

function sendSuggestion(text) {
  userInput.value = text
  sendMessage()
}

async function sendMessage() {
  const content = userInput.value.trim()
  if (!content || streaming.value) return

  messages.value.push({ id: uuidv4(), role: 'user', content })
  userInput.value = ''
  scrollToBottom()

  const apiKey = getApiKey()
  if (!apiKey) {
    messages.value.push({
      id: uuidv4(),
      role: 'assistant',
      content: 'No API key configured. Open Settings (gear icon) to add your Anthropic API key.'
    })
    return
  }

  streaming.value = true
  streamBuffer.value = ''

  try {
    const contextMessages = messages.value.slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }))

    const docContext = store.currentContent
      ? `\n\n<document>\n${store.currentContent.slice(0, 4000)}\n</document>`
      : ''

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 1024,
        system: SYSTEM_PROMPT + docContext,
        messages: contextMessages,
        stream: true
      })
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            streamBuffer.value += parsed.delta.text
            scrollToBottom()
          }
        } catch {}
      }
    }

    messages.value.push({ id: uuidv4(), role: 'assistant', content: streamBuffer.value })
    streamBuffer.value = ''
  } catch (err) {
    messages.value.push({
      id: uuidv4(),
      role: 'assistant',
      content: `Error: ${err.message}`
    })
  } finally {
    streaming.value = false
    scrollToBottom()
  }
}

async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}
</script>

<style scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-intro {
  text-align: center;
  padding: 20px 8px;
  color: var(--text-muted);
  font-size: 0.8375rem;
  line-height: 1.6;
}

.ai-avatar {
  font-size: 1.5rem;
  margin-bottom: 12px;
  color: var(--accent);
}

.hint {
  font-size: 0.775rem;
  margin-top: 8px;
  opacity: 0.8;
}

.suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 16px;
}

.chip {
  padding: 5px 10px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.chip:hover { background: var(--bg-hover); color: var(--text-primary); }

.message {
  max-width: 100%;
  word-break: break-word;
}

.message.user .message-content {
  background: var(--accent);
  color: white;
  padding: 8px 12px;
  border-radius: 12px 12px 4px 12px;
  font-size: 0.8375rem;
  margin-left: 20px;
}

.message.assistant .message-content {
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 8px 12px;
  border-radius: 12px 12px 12px 4px;
  font-size: 0.8375rem;
  line-height: 1.6;
  border: 1px solid var(--border);
}

.streaming { color: var(--text-primary); }

.cursor {
  animation: blink 1s step-end infinite;
  color: var(--accent);
}

@keyframes blink {
  50% { opacity: 0; }
}

.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: 0.8375rem;
  font-family: 'Inter', sans-serif;
  resize: none;
  outline: none;
  line-height: 1.5;
  transition: border-color 0.15s;
}

.chat-input:focus { border-color: var(--accent-muted); }
.chat-input::placeholder { color: var(--text-muted); }

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  align-self: flex-end;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: white;
  cursor: pointer;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) { opacity: 0.85; }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
