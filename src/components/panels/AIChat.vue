<template>
    <div class="ai-chat">
        <div class="chat-messages" ref="messagesEl">
            <div class="ai-intro" v-if="messages.length === 0">
                <div class="ai-avatar"><Sparkles :size="20" /></div>
                <p>
                    I'm here to help you think through your document — not write
                    it for you.
                </p>
                <p class="hint">
                    I can challenge your assumptions, spot gaps, ask clarifying
                    questions, or research facts.
                </p>
                <div class="suggestion-chips">
                    <button
                        v-for="s in suggestions"
                        :key="s"
                        class="chip"
                        @click="sendSuggestion(s)"
                    >
                        {{ s }}
                    </button>
                </div>
            </div>

            <div
                v-for="msg in messages"
                :key="msg.id"
                :class="['message', msg.role]"
            >
                <div
                    class="message-content"
                    v-html="renderMarkdown(msg.content)"
                />
            </div>

            <div v-if="streaming" class="message assistant">
                <div class="message-content streaming">
                    {{ streamBuffer }}<span class="cursor">▌</span>
                </div>
            </div>
        </div>

        <!-- Usage stats -->
        <div v-if="sessionStats.messages > 0" class="usage-bar">
            <span class="usage-stat"
                >{{ sessionStats.messages }} msg{{
                    sessionStats.messages !== 1 ? "s" : ""
                }}</span
            >
            <span class="usage-sep">·</span>
            <span class="usage-stat"
                >~{{ sessionStats.approxTokens.toLocaleString() }} tokens
                est.</span
            >
            <span
                v-if="sessionStats.approxTokens > 80000"
                class="usage-warn"
                title="Approaching context limit"
                >⚠ Approaching limit</span
            >
        </div>

        <div class="chat-input-area">
            <textarea
                v-model="userInput"
                class="chat-input"
                placeholder="Ask a question about this document..."
                @keydown.enter.prevent="handleEnter"
                rows="2"
            />
            <button
                class="send-btn"
                @click="sendMessage"
                :disabled="!userInput.trim() || streaming"
                title="Send"
            >
                <SendHorizonal :size="14" />
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, nextTick, onUnmounted } from "vue";
import { useAppStore } from "../../store";
import { v4 as uuidv4 } from "uuid";
import { Sparkles, SendHorizonal } from "lucide-vue-next";

const store = useAppStore();
const messagesEl = ref(null);
const userInput = ref("");
const messages = ref([]);
const streaming = ref(false);
const streamBuffer = ref("");

const sessionStats = ref({ messages: 0, approxTokens: 0 });

const getApiKey = () => store.config?.apiKey;
const getModel = () => store.config?.model || "anthropic/claude-sonnet-4-5";
const getBaseUrl = () =>
    store.config?.baseUrl || "https://openrouter.ai/api/v1";

const suggestions = [
    "What's missing from this document?",
    "What assumptions am I making?",
    "Who would disagree with this?",
    "What are the risks here?",
];

const SYSTEM_PROMPT = `You are a thinking partner for product managers writing internal documents. Your role is to help them think more clearly — NOT to write content for them.

Your behaviors:
- Ask clarifying questions that expose gaps or unstated assumptions
- Challenge claims that need more evidence or reasoning
- Surface risks or edge cases the author may not have considered
- Keep responses concise and conversational — this is a thinking dialogue, not an essay

Your constraints:
- Never write paragraphs that could replace sections of the document
- Never suggest "here's what you could write" — instead ask "what do you mean by X?"
- If asked to write something, redirect: "I can help you think through it — what's the core thing you're trying to say?"`;

function renderMarkdown(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, "<code>$1</code>")
        .replace(/\n/g, "<br>");
}

function handleEnter(e) {
    if (e.shiftKey) return;
    sendMessage();
}

function sendSuggestion(text) {
    userInput.value = text;
    sendMessage();
}

async function sendMessage() {
    const content = userInput.value.trim();
    if (!content || streaming.value) return;

    if (import.meta.env.DEV) console.log("[AIChat] Sending message:", content);

    messages.value.push({ id: uuidv4(), role: "user", content });
    userInput.value = "";
    scrollToBottom();

    const apiKey = getApiKey();
    if (!apiKey) {
        if (import.meta.env.DEV) console.warn("[AIChat] No API key found");
        messages.value.push({
            id: uuidv4(),
            role: "assistant",
            content:
                "No API key configured. Open Settings → AI to add your API key.",
        });
        return;
    }

    streaming.value = true;
    streamBuffer.value = "";
    store.logEvent("ai:chat_sent", { model: getModel() });

    // Clean up any previous listeners before adding new ones
    window.canonic.ai.removeListeners();

    window.canonic.ai.onChunk((text) => {
        streamBuffer.value += text;
        scrollToBottom();
    });

    window.canonic.ai.onDone(() => {
        if (import.meta.env.DEV) console.log("[AIChat] Stream complete");
        const response = streamBuffer.value;
        messages.value.push({
            id: uuidv4(),
            role: "assistant",
            content: response,
        });
        // Rough token estimate: 4 chars ≈ 1 token
        sessionStats.value.approxTokens += Math.ceil(
            (content.length + response.length) / 4,
        );
        sessionStats.value.messages++;
        streamBuffer.value = "";
        streaming.value = false;
        window.canonic.ai.removeListeners();
        scrollToBottom();
    });

    window.canonic.ai.onError((msg) => {
        if (import.meta.env.DEV) console.error("[AIChat] Stream error:", msg);
        messages.value.push({
            id: uuidv4(),
            role: "assistant",
            content: `Error: ${msg}`,
        });
        streaming.value = false;
        window.canonic.ai.removeListeners();
        scrollToBottom();
    });

    const contextMessages = messages.value.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
    }));

    const docContext = store.currentContent
        ? `\n\n<document>\n${store.currentContent.slice(0, 4000)}\n</document>`
        : "";

    if (import.meta.env.DEV) {
        console.log("[AIChat] Request params:", {
            model: getModel(),
            baseUrl: getBaseUrl(),
            messageCount: contextMessages.length,
            hasKey: !!apiKey,
        });
    }

    window.canonic.ai.chat({
        messages: contextMessages,
        system: SYSTEM_PROMPT + docContext,
        model: getModel(),
        apiKey,
        baseUrl: getBaseUrl(),
    });
}

async function scrollToBottom() {
    await nextTick();
    if (messagesEl.value) {
        messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
}

onUnmounted(() => {
    window.canonic.ai.removeListeners();
});
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
    display: flex;
    justify-content: center;
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
    transition:
        background 0.15s,
        color 0.15s;
}

.chip:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

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

.streaming {
    color: var(--text-primary);
}

.cursor {
    animation: blink 1s step-end infinite;
    color: var(--accent);
}

@keyframes blink {
    50% {
        opacity: 0;
    }
}

.usage-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--bg-base);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}

.usage-stat {
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

.usage-sep {
    font-size: 0.6875rem;
    color: var(--border);
}

.usage-warn {
    font-size: 0.6875rem;
    color: #f59e0b;
    margin-left: 2px;
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
    font-family: inherit;
    resize: none;
    outline: none;
    line-height: 1.5;
    transition: border-color 0.15s;
}

.chat-input:focus {
    border-color: var(--accent-muted);
}
.chat-input::placeholder {
    color: var(--text-muted);
}

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

.send-btn:hover:not(:disabled) {
    opacity: 0.85;
}
.send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
</style>
