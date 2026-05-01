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

        <!-- Workspace index status -->
        <div v-if="agentCaps.indexWorkspace && indexedDocCount > 0" class="index-bar">
            <span class="index-stat">Indexed {{ indexedDocCount }} doc{{ indexedDocCount !== 1 ? 's' : '' }}</span>
        </div>

        <!-- Agent tools panel -->
        <div class="agent-tools-panel">
            <button class="agent-tools-header" @click="toggleAgentCapsOpen" :aria-expanded="agentCapsOpen">
                <span class="agent-tools-label">Agent tools</span>
                <ChevronDown :size="13" :class="['agent-tools-chevron', { open: agentCapsOpen }]" />
            </button>
            <div v-if="agentCapsOpen" class="agent-tools-body">
                <label class="cap-row">
                    <span class="cap-label">Index workspace</span>
                    <span class="cap-desc">Pre-load all workspace docs into context</span>
                    <span class="toggle-switch"><input type="checkbox" v-model="agentCaps.indexWorkspace" @change="saveAgentCaps" /><span class="toggle-track"></span></span>
                </label>
                <label class="cap-row">
                    <span class="cap-label">Read docs on demand</span>
                    <span class="cap-desc">Agent can request specific files mid-conversation</span>
                    <span class="toggle-switch"><input type="checkbox" v-model="agentCaps.readDocs" @change="saveAgentCaps" /><span class="toggle-track"></span></span>
                </label>
                <label class="cap-row">
                    <span class="cap-label">Web search</span>
                    <span class="cap-desc">Agent can search the web</span>
                    <span class="toggle-switch"><input type="checkbox" v-model="agentCaps.webSearch" @change="saveAgentCaps" /><span class="toggle-track"></span></span>
                </label>
                <label class="cap-row">
                    <span class="cap-label">Post comments</span>
                    <span class="cap-desc">Agent can add inline comments to the document</span>
                    <span class="toggle-switch"><input type="checkbox" v-model="agentCaps.postComments" @change="saveAgentCaps" /><span class="toggle-track"></span></span>
                </label>
                <label class="cap-row">
                    <span class="cap-label">Suggest edits</span>
                    <span class="cap-desc">Agent can propose inline text changes</span>
                    <span class="toggle-switch"><input type="checkbox" v-model="agentCaps.suggestEdits" @change="saveAgentCaps" /><span class="toggle-track"></span></span>
                </label>
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
import { ref, reactive, nextTick, onUnmounted } from "vue";
import { useAppStore } from "../../store";
import { v4 as uuidv4 } from "uuid";
import { Sparkles, SendHorizonal, ChevronDown } from "lucide-vue-next";

const store = useAppStore();
const messagesEl = ref(null);
const userInput = ref("");
const messages = ref([]);
const streaming = ref(false);
const streamBuffer = ref("");

const sessionStats = ref({ messages: 0, approxTokens: 0 });
const indexedDocCount = ref(0);

// ── Agent capabilities ────────────────────────────────────────────────────────
const CAPS_KEY = "canonic:agentCaps";
const CAPS_OPEN_KEY = "canonic:agentCapsOpen";
const DEFAULT_CAPS = { indexWorkspace: true, readDocs: false, webSearch: false, postComments: false, suggestEdits: false };

function loadAgentCaps() {
    try { const s = localStorage.getItem(CAPS_KEY); if (s) return { ...DEFAULT_CAPS, ...JSON.parse(s) }; } catch {}
    return { ...DEFAULT_CAPS };
}

const agentCaps = reactive(loadAgentCaps());
const agentCapsOpen = ref((() => { try { const s = localStorage.getItem(CAPS_OPEN_KEY); return s ? JSON.parse(s) : false; } catch { return false; } })());

function saveAgentCaps() { localStorage.setItem(CAPS_KEY, JSON.stringify({ ...agentCaps })); }
function toggleAgentCapsOpen() { agentCapsOpen.value = !agentCapsOpen.value; localStorage.setItem(CAPS_OPEN_KEY, JSON.stringify(agentCapsOpen.value)); }
// ─────────────────────────────────────────────────────────────────────────────

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
- If asked to write something, redirect: "I can help you think through it — what's the core thing you're trying to say?"

To leave an inline comment on a specific passage, include this anywhere in your response:
<canonic:comment anchor="exact quoted text from the document">Your comment text here</canonic:comment>
You can include multiple comment tags. They will be posted to the document's comment panel.`;

const COMMENT_TAG_RE = /<canonic:comment\s+anchor="([^"]*)">([\s\S]*?)<\/canonic:comment>/g;

function getAgentCaps() {
    try {
        return JSON.parse(localStorage.getItem("canonic:agentCaps") || "{}");
    } catch {
        return {};
    }
}

function parseAndPostComments(responseText) {
    const caps = getAgentCaps();
    const canPost = caps.postComments === true;

    let cleaned = responseText;
    const matches = [...responseText.matchAll(COMMENT_TAG_RE)];

    for (const match of matches) {
        const anchor = match[1];
        const body = match[2].trim();

        if (canPost && store.currentFile) {
            store.addComment({
                id: uuidv4(),
                anchor: { quotedText: anchor },
                text: body,
                author: "Claude",
                isAgent: true,
                resolved: false,
                createdAt: new Date().toISOString(),
            });
            if (import.meta.env.DEV) console.log("[AIChat] Agent comment posted:", { anchor, body });
        }

        const indicator = canPost && store.currentFile ? "\n↳ comment posted" : "";
        cleaned = cleaned.replace(match[0], indicator);
    }

    return cleaned.trim();
}

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

const MAX_WORKSPACE_CHARS = 80000;

async function buildWorkspaceBlock() {
    if (!agentCaps.indexWorkspace) return "";
    const workspacePath = store.workspacePath;
    if (!workspacePath) return "";

    let allFiles;
    try {
        allFiles = await window.canonic.files.list(workspacePath);
    } catch (e) {
        if (import.meta.env.DEV) console.warn("[AIChat] Could not list workspace files:", e);
        return "";
    }

    const mdFiles = (allFiles || []).filter((f) => {
        const name = typeof f === "string" ? f : f.path || f.name || "";
        return name.endsWith(".md");
    });

    indexedDocCount.value = mdFiles.length;
    if (mdFiles.length === 0) return "";

    let parts = [];
    let totalChars = 0;
    let truncated = false;

    for (const f of mdFiles) {
        const filePath = typeof f === "string" ? f : f.path || f.name || "";
        if (!filePath) continue;

        let content = "";
        try {
            content = await window.canonic.files.read(workspacePath, filePath);
        } catch (e) {
            if (import.meta.env.DEV) console.warn("[AIChat] Could not read file:", filePath, e);
            continue;
        }

        const entry = `<document path="${filePath}">\n${content}\n</document>`;
        if (totalChars + entry.length > MAX_WORKSPACE_CHARS) {
            truncated = true;
            break;
        }
        parts.push(entry);
        totalChars += entry.length;
    }

    if (parts.length === 0) return "";

    const truncatedNote = truncated
        ? "\n<!-- Workspace context truncated at 80,000 characters. Some documents were omitted. -->"
        : "";

    return `\n\n<workspace>\n${parts.join("\n")}\n</workspace>${truncatedNote}`;
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
        const rawResponse = streamBuffer.value;
        const response = parseAndPostComments(rawResponse);
        messages.value.push({
            id: uuidv4(),
            role: "assistant",
            content: response,
        });
        // Rough token estimate: 4 chars ≈ 1 token (use raw response for accuracy)
        sessionStats.value.approxTokens += Math.ceil(
            (content.length + rawResponse.length) / 4,
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

    const workspaceBlock = await buildWorkspaceBlock();

    if (import.meta.env.DEV) {
        console.log("[AIChat] Request params:", {
            model: getModel(),
            baseUrl: getBaseUrl(),
            messageCount: contextMessages.length,
            hasKey: !!apiKey,
            indexedDocs: indexedDocCount.value,
        });
    }

    window.canonic.ai.chat({
        messages: contextMessages,
        system: SYSTEM_PROMPT + workspaceBlock + docContext,
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

.index-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px;
    background: var(--bg-base);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}

.index-stat {
    font-size: 0.6875rem;
    color: var(--text-muted);
    opacity: 0.7;
}

/* Agent tools panel */
.agent-tools-panel {
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-base);
}

.agent-tools-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-family: inherit;
    text-align: left;
    transition: color 0.15s;
}

.agent-tools-header:hover { color: var(--text-secondary); }

.agent-tools-label {
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    font-size: 0.625rem;
}

.agent-tools-chevron {
    transition: transform 0.2s ease;
    opacity: 0.6;
    flex-shrink: 0;
}
.agent-tools-chevron.open { transform: rotate(180deg); }

.agent-tools-body {
    padding: 4px 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.cap-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    gap: 1px 8px;
    cursor: pointer;
    padding: 3px 0;
}

.cap-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    grid-column: 1;
    grid-row: 1;
    font-weight: 500;
}

.cap-desc {
    font-size: 0.6375rem;
    color: var(--text-muted);
    grid-column: 1;
    grid-row: 2;
    line-height: 1.4;
}

/* CSS-only pill toggle */
.toggle-switch {
    grid-column: 2;
    grid-row: 1 / 3;
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
}
.toggle-switch input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; }
.toggle-track {
    display: block;
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: var(--border);
    position: relative;
    transition: background 0.2s ease;
    cursor: pointer;
}
.toggle-track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.toggle-switch input[type="checkbox"]:checked + .toggle-track { background: var(--accent); }
.toggle-switch input[type="checkbox"]:checked + .toggle-track::after { transform: translateX(12px); }

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
