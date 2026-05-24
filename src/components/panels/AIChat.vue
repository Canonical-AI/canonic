<template>
    <div class="ai-chat">
        <div class="ai-chat-actions">
            <button
                class="icon-btn"
                title="History"
                :class="{ active: showingHistory }"
                @click="toggleHistory"
            >
                <History :size="16" />
            </button>
            <button class="icon-btn" title="New Chat" @click="startNewChat">
                <Sparkles :size="16" />
            </button>
        </div>

        <div v-if="showingHistory" class="chat-history-view">
            <div class="history-list">
                <div
                    v-if="store.aiChatsList.length === 0"
                    class="history-empty"
                >
                    No chat history in this workspace.
                </div>
                <div
                    v-for="chat in store.aiChatsList"
                    :key="chat.id"
                    class="history-item"
                >
                    <button class="history-item-btn" @click="loadChat(chat.id)">
                        <div class="history-title">{{ chat.title }}</div>
                        <div class="history-date">
                            {{ new Date(chat.date).toLocaleString() }}
                        </div>
                    </button>
                    <button
                        class="history-del-btn"
                        @click.stop="store.deleteAiChat(chat.id)"
                    >
                        ×
                    </button>
                </div>
            </div>
        </div>

        <div v-else class="chat-messages" ref="messagesEl">
            <div class="ai-intro" v-if="store.aiChatMessages.length === 0">
                <div class="ai-avatar"><Sparkles :size="20" /></div>
                <p class="ai-name">{{ assistantName }}</p>
                <p>
                    Here to help you think through your document — not write it
                    for you.
                </p>
                <p class="hint">
                    Challenge assumptions, spot gaps, ask clarifying questions.
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
                v-for="msg in store.aiChatMessages"
                :key="msg.id"
                :class="['message', msg.role]"
            >
                <template v-if="msg.role === 'assistant'">
                    <div
                        v-if="msg.toolLogs && msg.toolLogs.length > 0"
                        class="tool-logs"
                    >
                        <div
                            v-for="(log, idx) in msg.toolLogs"
                            :key="idx"
                            class="tool-log-item"
                        >
                            <template v-if="log.type === 'read'">
                                <FileText :size="12" />
                                <span class="log-text"
                                    >Read {{ log.file }}</span
                                >
                            </template>
                            <template v-else-if="log.type === 'tree'">
                                <FileText :size="12" />
                                <span class="log-text"
                                    >Listed workspace ({{ log.count }} entries,
                                    depth {{ log.depth }})</span
                                >
                            </template>
                            <template v-else-if="log.type === 'comment'">
                                <MessageSquare :size="12" />
                                <a href="#" @click.prevent="openComment(log.id)"
                                    >Commented on "{{ log.anchor }}"</a
                                >
                            </template>
                        </div>
                    </div>
                    <div v-if="msg.think" class="message-think-wrapper">
                        <details class="think-block" :open="thinkingExpanded">
                            <summary>Thoughts</summary>
                            <div
                                class="think-content"
                                v-html="renderMarkdown(msg.think)"
                            ></div>
                        </details>
                    </div>

                    <div
                        v-if="msg.content"
                        class="message-content"
                        v-html="renderMarkdown(msg.content)"
                    />
                </template>
                <template v-else-if="msg.role === 'user'">
                    <div
                        class="message-content"
                        v-html="renderMarkdown(msg.content)"
                    />
                </template>
            </div>

            <div v-if="streaming" class="message assistant">
                <div v-if="currentToolLogs.length > 0" class="tool-logs">
                    <div
                        v-for="(log, idx) in currentToolLogs"
                        :key="idx"
                        class="tool-log-item"
                    >
                        <template v-if="log.type === 'read'">
                            <FileText :size="12" /> Read {{ log.file }}
                        </template>
                        <template v-else-if="log.type === 'comment'">
                            <MessageSquare :size="12" />
                            <a href="#" @click.prevent="openComment(log.id)"
                                >Commented on "{{ log.anchor }}"</a
                            >
                        </template>
                    </div>
                </div>
                <template v-if="streamBuffer">
                    <div
                        v-if="parseThinkBlock(streamBuffer).think"
                        class="message-think-wrapper"
                    >
                        <details class="think-block" :open="thinkingExpanded">
                            <summary>
                                <span v-if="!streamBuffer.includes('</think>')"
                                    >Thinking<span class="anim-dots"></span
                                ></span>
                                <span v-else>Thoughts</span>
                            </summary>
                            <div
                                class="think-content"
                                v-html="
                                    renderMarkdown(
                                        parseThinkBlock(streamBuffer).think,
                                    )
                                "
                            ></div>
                        </details>
                    </div>
                    <div
                        v-if="parseThinkBlock(streamBuffer).content"
                        class="message-content"
                        v-html="
                            renderMarkdown(
                                parseThinkBlock(streamBuffer).content,
                            )
                        "
                    ></div>
                </template>
                <div v-else class="message-think-wrapper">
                    <span class="thinking-label">{{
                        currentActivityLabel || "Thinking"
                    }}</span
                    ><span class="anim-dots"></span>
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

            <div
                class="context-circle"
                :title="`~${sessionStats.approxTokens.toLocaleString()} tokens est.`"
            >
                <svg viewBox="0 0 36 36" class="circular-chart">
                    <path
                        class="circle-bg"
                        d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                        class="circle"
                        :stroke-dasharray="`${Math.min(100, (sessionStats.approxTokens / 128000) * 100)}, 100`"
                        d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                </svg>
            </div>

            <span
                v-if="sessionStats.approxTokens > 100000"
                class="usage-warn"
                title="Approaching context limit"
                >⚠ Approaching limit</span
            >
        </div>

        <!-- Workspace index status -->
        <div
            v-if="agentCaps.indexWorkspace && indexedDocCount > 0"
            class="index-bar"
        >
            <span class="index-stat"
                >Indexed {{ indexedDocCount }} doc{{
                    indexedDocCount !== 1 ? "s" : ""
                }}</span
            >
        </div>

        <div class="chat-input-area">
            <div v-if="showSlashMenu" class="slash-menu">
                <div class="slash-menu-title">
                    Select
                    {{
                        slashCommandType === "root"
                            ? "command"
                            : slashCommandType
                    }}
                </div>
                <div class="slash-menu-items">
                    <template v-if="slashCommandType === 'root'">
                        <button
                            v-for="(cmd, i) in filteredRootCommands"
                            :key="cmd.id"
                            :class="[
                                'slash-menu-item',
                                { active: slashSelectedIndex === i },
                            ]"
                            @click="setSlashCommandType(cmd.id)"
                        >
                            {{ cmd.label }}
                        </button>
                    </template>
                    <template v-else-if="slashCommandType === 'model'">
                        <div
                            v-if="filteredModels.length === 0"
                            class="slash-menu-hint"
                        >
                            No models. Add a provider in Settings → AI.
                        </div>
                        <button
                            v-for="(m, i) in filteredModels"
                            :key="m.id"
                            :class="[
                                'slash-menu-item',
                                { active: slashSelectedIndex === i },
                            ]"
                            @click="selectSlashCommand(m.id)"
                        >
                            {{ m.label }}
                        </button>
                    </template>
                    <template v-else-if="slashCommandType === 'effort'">
                        <button
                            v-for="(e, i) in filteredEfforts"
                            :key="e"
                            :class="[
                                'slash-menu-item',
                                { active: slashSelectedIndex === i },
                            ]"
                            @click="selectSlashCommand(e)"
                        >
                            {{ e }}
                        </button>
                    </template>
                    <template v-else-if="slashCommandType === 'tools'">
                        <div class="slash-menu-hint">
                            Use ↑↓ to navigate, Space or Enter to toggle
                        </div>
                        <label
                            :class="[
                                'cap-row',
                                'slash-menu-item',
                                { active: slashSelectedIndex === 0 },
                            ]"
                        >
                            <span class="cap-label">Index workspace</span>
                            <span class="toggle-switch"
                                ><input
                                    type="checkbox"
                                    v-model="agentCaps.indexWorkspace"
                                    @change="saveAgentCaps" /><span
                                    class="toggle-track"
                                ></span
                            ></span>
                        </label>
                        <label
                            :class="[
                                'cap-row',
                                'slash-menu-item',
                                { active: slashSelectedIndex === 1 },
                            ]"
                        >
                            <span class="cap-label">Read docs</span>
                            <span class="toggle-switch"
                                ><input
                                    type="checkbox"
                                    v-model="agentCaps.readDocs"
                                    @change="saveAgentCaps" /><span
                                    class="toggle-track"
                                ></span
                            ></span>
                        </label>
                        <label
                            :class="[
                                'cap-row',
                                'slash-menu-item',
                                { active: slashSelectedIndex === 2 },
                            ]"
                        >
                            <span class="cap-label">List dir tree</span>
                            <span class="toggle-switch"
                                ><input
                                    type="checkbox"
                                    v-model="agentCaps.listTree"
                                    @change="saveAgentCaps" /><span
                                    class="toggle-track"
                                ></span
                            ></span>
                        </label>
                        <label
                            :class="[
                                'cap-row',
                                'slash-menu-item',
                                { active: slashSelectedIndex === 3 },
                            ]"
                        >
                            <span class="cap-label">Web search</span>
                            <span class="toggle-switch"
                                ><input
                                    type="checkbox"
                                    v-model="agentCaps.webSearch"
                                    @change="saveAgentCaps" /><span
                                    class="toggle-track"
                                ></span
                            ></span>
                        </label>
                        <label
                            :class="[
                                'cap-row',
                                'slash-menu-item',
                                { active: slashSelectedIndex === 4 },
                            ]"
                        >
                            <span class="cap-label">Post comments</span>
                            <span class="toggle-switch"
                                ><input
                                    type="checkbox"
                                    v-model="agentCaps.postComments"
                                    @change="saveAgentCaps" /><span
                                    class="toggle-track"
                                ></span
                            ></span>
                        </label>
                        <label
                            :class="[
                                'cap-row',
                                'slash-menu-item',
                                { active: slashSelectedIndex === 5 },
                            ]"
                        >
                            <span class="cap-label">Suggest edits</span>
                            <span class="toggle-switch"
                                ><input
                                    type="checkbox"
                                    v-model="agentCaps.suggestEdits"
                                    @change="saveAgentCaps" /><span
                                    class="toggle-track"
                                ></span
                            ></span>
                        </label>
                        <label
                            :class="[
                                'cap-row',
                                'slash-menu-item',
                                { active: slashSelectedIndex === 6 },
                            ]"
                        >
                            <span class="cap-label">Show thinking</span>
                            <span class="toggle-switch"
                                ><input
                                    type="checkbox"
                                    v-model="showThinking"
                                    @change="toggleShowThinking" /><span
                                    class="toggle-track"
                                ></span
                            ></span>
                        </label>
                    </template>
                </div>
            </div>
            <div class="chat-input-row">
                <textarea
                    ref="userInputEl"
                    v-model="userInput"
                    class="chat-input"
                    placeholder="Ask a question about this document... (Type '/' for commands)"
                    @keydown.enter.prevent="handleEnter"
                    @keydown.up="handleUp"
                    @keydown.down="handleDown"
                    @keydown.space="handleSpace"
                    @keydown="handleInputKeydown"
                    @paste="handlePaste"
                    @input="handleInput"
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
            <div class="chat-input-footer">
                Model:
                {{ store.config?.assistant?.model || "None selected" }}
                &nbsp;·&nbsp; Effort: {{ effortLevel }}
            </div>
        </div>
    </div>
</template>

<script setup>
import {
    ref,
    reactive,
    computed,
    watch,
    onMounted,
    nextTick,
    onUnmounted,
} from "vue";
import { useAppStore } from "../../store";
import { storage } from "../../utils/storage.js";
import { v4 as uuidv4 } from "uuid";
import {
    Sparkles,
    SendHorizonal,
    ChevronDown,
    History,
    MessageSquare,
    FileText,
} from "lucide-vue-next";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

const store = useAppStore();
const assistantName = computed(() => store.config?.assistant?.name || "Spark");
const messagesEl = ref(null);
const userInputEl = ref(null);
const userInput = ref("");
const streaming = ref(false);
const streamBuffer = ref("");
const activityStatus = ref(null);

const showingHistory = ref(false);

function startNewChat() {
    store.newAiChat();
    showingHistory.value = false;
    userInput.value = "";
    userInputEl.value?.focus();
}

function toggleHistory() {
    showingHistory.value = !showingHistory.value;
}

function loadChat(id) {
    store.loadAiChatSession(id);
    showingHistory.value = false;
    scrollToBottom();
}

function parseThinkBlock(text) {
    if (!text) return { think: null, content: "" };
    const thinkStart = text.indexOf("<think>");
    if (thinkStart === -1) {
        return { think: null, content: text };
    }
    const thinkEnd = text.indexOf("</think>");
    if (thinkEnd !== -1) {
        const think = text.slice(thinkStart + 7, thinkEnd).trim();
        const content = text.slice(0, thinkStart) + text.slice(thinkEnd + 8);
        return { think, content: content.trim() };
    } else {
        const think = text.slice(thinkStart + 7).trim();
        const content = text.slice(0, thinkStart).trim();
        return { think, content };
    }
}

const showThinking = ref(true);
const thinkingExpanded = ref(false);
const effortLevel = ref("Medium");
const showSlashMenu = ref(false);
const slashCommandType = ref(null);

const pastedMultilineContents = new Map();

function handlePaste(e) {
    const text = e.clipboardData.getData("text");
    if (text && text.trim().includes("\n")) {
        e.preventDefault();
        const lines = text.split("\n").length;
        const id = uuidv4().slice(0, 8);
        const marker = `[${lines} lines pasted #${id}]`;
        pastedMultilineContents.set(marker, text);

        const el = userInputEl.value;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        userInput.value =
            userInput.value.slice(0, start) +
            marker +
            userInput.value.slice(end);

        nextTick(() => {
            el.selectionStart = el.selectionEnd = start + marker.length;
        });
    }
}

function handleInputKeydown(e) {
    if (e.key === "Backspace") {
        const el = userInputEl.value;
        const start = el.selectionStart;
        if (start === el.selectionEnd) {
            const textBefore = userInput.value.slice(0, start);
            const match = textBefore.match(/\[\d+ lines pasted #[a-f0-9]+\]$/);
            if (match) {
                e.preventDefault();
                const marker = match[0];
                userInput.value =
                    textBefore.slice(0, -marker.length) +
                    userInput.value.slice(start);
                pastedMultilineContents.delete(marker);
                nextTick(() => {
                    el.selectionStart = el.selectionEnd = start - marker.length;
                });
            }
        }
    }
}

const availableModels = ref([]);

let modelsFetchedForProviders = null;
async function fetchProviderModels() {
    const cfg = store.config;
    if (!cfg || !cfg.providers || !cfg.providers.length) return;

    const providersKey = JSON.stringify(cfg.providers.map((p) => p.id));
    if (modelsFetchedForProviders === providersKey) return;

    try {
        const allModels = [];
        for (const provider of cfg.providers) {
            if (!provider.baseUrl) continue;
            try {
                const res = await fetch(`${provider.baseUrl}/models`, {
                    headers: provider.apiKey
                        ? { Authorization: `Bearer ${provider.apiKey}` }
                        : {},
                });
                if (!res.ok) continue;
                const data = await res.json();
                if (data && Array.isArray(data.data)) {
                    const pModels = data.data.map((m) => ({
                        id: m.id,
                        label: `${m.id} (${provider.label || provider.id})`,
                        providerId: provider.id,
                    }));
                    allModels.push(...pModels);
                }
            } catch (e) {
                if (import.meta.env.DEV)
                    console.warn(
                        `[AIChat] Failed to fetch models for provider ${provider.id}`,
                        e,
                    );
            }
        }
        if (allModels.length > 0) {
            const uniqueModels = Array.from(
                new Map(allModels.map((m) => [m.id, m])).values(),
            );
            availableModels.value = uniqueModels;
            modelsFetchedForProviders = providersKey;

            const currentModel = store.config?.assistant?.model;
            if (
                currentModel &&
                !uniqueModels.some((m) => m.id === currentModel)
            ) {
                if (import.meta.env.DEV)
                    console.warn(
                        "[AIChat] Stored model not in providers, clearing:",
                        currentModel,
                    );
                if (!store.config.assistant) store.config.assistant = {};
                store.config.assistant.model = "";
                store.config.assistant.providerId = "";
                store.saveConfig(JSON.parse(JSON.stringify(store.config)));
            }
        } else {
            availableModels.value = [];
        }
    } catch (e) {
        if (import.meta.env.DEV)
            console.warn("[AIChat] Failed to fetch provider models", e);
    }
}

watch(
    () => store.config?.providers,
    () => {
        modelsFetchedForProviders = null;
        fetchProviderModels();
    },
    { deep: true },
);

onMounted(async () => {
    hydrateFromConfig();
    await migrateLocalStoragePrefs();
    fetchProviderModels();
    window.addEventListener("keydown", handleGlobalKeydown);
});

watch(
    () => store.config?.assistant,
    (val) => {
        if (val) hydrateFromConfig();
    },
    { deep: false },
);

const cancelLoop = ref(false);

function handleGlobalKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        toggleThinking();
    }
    if (e.key === "Escape" && streaming.value) {
        e.preventDefault();
        cancelLoop.value = true;
        window.canonic.ai.cancel();
    }
}

function toggleThinking() {
    thinkingExpanded.value = !thinkingExpanded.value;
    persistAssistantPrefs();
}

const effortLevels = ["Low", "Medium", "High"];

const slashSelectedIndex = ref(0);

const rootCommands = [
    { id: "model", label: "/model (Select Model)" },
    { id: "effort", label: "/effort (Set Effort Level)" },
    { id: "tools", label: "/tools (Agent Tools)" },
];

const filteredRootCommands = computed(() => {
    const query = userInput.value.trim().toLowerCase();
    if (!query || query === "/") return rootCommands;
    return rootCommands.filter(
        (c) =>
            ("/" + c.id).startsWith(query) ||
            c.label.toLowerCase().includes(query),
    );
});

const filteredModels = computed(() => {
    const query = userInput.value
        .replace(/^\/model\s*/i, "")
        .trim()
        .toLowerCase();
    if (!query) return availableModels.value;
    return availableModels.value.filter(
        (m) =>
            m.label.toLowerCase().includes(query) ||
            m.id.toLowerCase().includes(query),
    );
});

const filteredEfforts = computed(() => {
    const query = userInput.value
        .replace(/^\/effort\s*/i, "")
        .trim()
        .toLowerCase();
    if (!query) return effortLevels;
    return effortLevels.filter((e) => e.toLowerCase().includes(query));
});

function toggleShowThinking() {
    persistAssistantPrefs();
}

function handleInput() {
    slashSelectedIndex.value = 0;
    const text = userInput.value;
    if (text.startsWith("/") && !text.includes(" ")) {
        showSlashMenu.value = true;
        slashCommandType.value = "root";
    } else if (text.startsWith("/model ")) {
        showSlashMenu.value = true;
        slashCommandType.value = "model";
    } else if (text.startsWith("/effort ")) {
        showSlashMenu.value = true;
        slashCommandType.value = "effort";
    } else if (text.startsWith("/tools ")) {
        showSlashMenu.value = true;
        slashCommandType.value = "tools";
    } else {
        showSlashMenu.value = false;
        slashCommandType.value = null;
    }
}

function getSlashMenuLength() {
    if (slashCommandType.value === "root")
        return filteredRootCommands.value.length;
    if (slashCommandType.value === "model") return filteredModels.value.length;
    if (slashCommandType.value === "effort")
        return filteredEfforts.value.length;
    if (slashCommandType.value === "tools") return 7;
    return 0;
}

function handleUp(e) {
    if (!showSlashMenu.value) return;
    e.preventDefault();
    slashSelectedIndex.value =
        (slashSelectedIndex.value - 1 + getSlashMenuLength()) %
        getSlashMenuLength();
}

function handleDown(e) {
    if (!showSlashMenu.value) return;
    e.preventDefault();
    slashSelectedIndex.value =
        (slashSelectedIndex.value + 1) % getSlashMenuLength();
}

function handleSpace(e) {
    if (showSlashMenu.value && slashCommandType.value === "tools") {
        e.preventDefault();
        const tools = [
            "indexWorkspace",
            "readDocs",
            "listTree",
            "webSearch",
            "postComments",
            "suggestEdits",
        ];
        if (slashSelectedIndex.value === 6) {
            showThinking.value = !showThinking.value;
            toggleShowThinking();
            store.logEvent("ai:setting_changed", {
                setting: "showThinking",
                value: showThinking.value,
                source: "slash_command",
            });
        } else {
            const tool = tools[slashSelectedIndex.value];
            agentCaps[tool] = !agentCaps[tool];
            saveAgentCaps();
            store.logEvent("ai:setting_changed", {
                setting: tool,
                value: agentCaps[tool],
                source: "slash_command",
            });
        }
    }
}

function executeSlashSelection() {
    if (slashCommandType.value === "root") {
        const cmd = filteredRootCommands.value[slashSelectedIndex.value]?.id;
        if (cmd) setSlashCommandType(cmd);
    } else if (slashCommandType.value === "model") {
        const selected = filteredModels.value[slashSelectedIndex.value]?.id;
        if (selected) {
            selectSlashCommand(selected);
            store.logEvent("ai:setting_changed", {
                setting: "model",
                value: selected,
                source: "slash_command",
            });
        }
    } else if (slashCommandType.value === "effort") {
        const selected = filteredEfforts.value[slashSelectedIndex.value];
        if (selected) {
            selectSlashCommand(selected);
            store.logEvent("ai:setting_changed", {
                setting: "effort",
                value: selected,
                source: "slash_command",
            });
        }
    } else if (slashCommandType.value === "tools") {
        showSlashMenu.value = false;
        slashCommandType.value = null;
        userInput.value = "";
        userInputEl.value?.focus();
    }
}

function setSlashCommandType(type) {
    slashCommandType.value = type;
    userInput.value = "/" + type + " ";
    userInputEl.value?.focus();
}

function selectSlashCommand(value) {
    if (slashCommandType.value === "model") {
        if (store.config) {
            if (!store.config.assistant) store.config.assistant = {};
            store.config.assistant.model = value;

            const selectedModelObj = availableModels.value.find(
                (m) => m.id === value,
            );
            if (selectedModelObj && selectedModelObj.providerId) {
                store.config.assistant.providerId = selectedModelObj.providerId;
            }

            store.saveConfig(JSON.parse(JSON.stringify(store.config)));
        }
    } else if (slashCommandType.value === "effort") {
        effortLevel.value = value;
        persistAssistantPrefs();
    }
    showSlashMenu.value = false;
    slashCommandType.value = null;
    userInput.value = "";
    userInputEl.value?.focus();
}

const AI_ACTIVITY_LABELS = {
    thinking: "Thinking",
    web_search: "Searching the web",
    browsing: "Browsing",
    reading_file: "Reading file",
};

const currentActivityLabel = computed(() => {
    const a = activityStatus.value;
    if (!a) return "Thinking";
    return a.label || AI_ACTIVITY_LABELS[a.type] || "Thinking";
});

const sessionStats = ref({ messages: 0, approxTokens: 0 });
const indexedDocCount = ref(0);

// ── Agent capabilities ────────────────────────────────────────────────────────
const DEFAULT_CAPS = {
    indexWorkspace: true,
    readDocs: true,
    listTree: true,
    webSearch: true,
    postComments: true,
    suggestEdits: true,
};
const agentCaps = reactive({ ...DEFAULT_CAPS });

async function persistAssistantPrefs() {
    if (!store.config) return;
    const nextAssistant = {
        ...(store.config.assistant || {}),
        effortLevel: effortLevel.value,
        showThinking: showThinking.value,
        thinkingExpanded: thinkingExpanded.value,
        caps: { ...agentCaps },
    };
    const nextConfig = JSON.parse(
        JSON.stringify({ ...store.config, assistant: nextAssistant }),
    );
    await store.saveConfig(nextConfig);
}

function saveAgentCaps() {
    persistAssistantPrefs();
}

function hydrateFromConfig() {
    const a = store.config?.assistant;
    if (!a) return;
    if (a.effortLevel) effortLevel.value = a.effortLevel;
    if (typeof a.showThinking === "boolean")
        showThinking.value = a.showThinking;
    if (typeof a.thinkingExpanded === "boolean")
        thinkingExpanded.value = a.thinkingExpanded;
    if (a.caps) Object.assign(agentCaps, a.caps);
}

async function migrateLocalStoragePrefs() {
    if (!store.config) return;
    const a = { ...(store.config.assistant || {}) };
    let changed = false;
    const oldEffort = storage.getItem("canonic:effortLevel");
    const oldShow = storage.getItem("canonic:showThinking");
    const oldExpand = storage.getItem("canonic:thinkingExpanded");
    const oldCaps = storage.getItem("canonic:agentCaps");
    if (oldEffort && !a.effortLevel) {
        a.effortLevel = oldEffort;
        changed = true;
    }
    if (oldShow !== null && typeof a.showThinking !== "boolean") {
        a.showThinking = oldShow !== "false";
        changed = true;
    }
    if (oldExpand !== null && typeof a.thinkingExpanded !== "boolean") {
        a.thinkingExpanded = oldExpand === "true";
        changed = true;
    }
    if (oldCaps && !a.caps) {
        try {
            a.caps = { ...DEFAULT_CAPS, ...JSON.parse(oldCaps) };
            changed = true;
        } catch {}
    }
    if (changed) {
        const nextConfig = JSON.parse(
            JSON.stringify({ ...store.config, assistant: a }),
        );
        await store.saveConfig(nextConfig);
    }
    storage.setItem("canonic:effortLevel", "");
    storage.setItem("canonic:showThinking", "");
    storage.setItem("canonic:thinkingExpanded", "");
    storage.setItem("canonic:agentCaps", "");
}
// ─────────────────────────────────────────────────────────────────────────────

function resolveAssistant() {
    const cfg = store.config;
    if (!cfg)
        return {
            apiKey: "",
            baseUrl: "",
            model: "",
            name: "Spark",
            extraInstructions: "",
        };
    const provider = cfg.providers?.find(
        (p) => p.id === cfg.assistant?.providerId,
    );
    return {
        apiKey: provider?.apiKey || "",
        baseUrl: provider?.baseUrl || "",
        model: cfg.assistant?.model || "anthropic/claude-sonnet-4-5",
        name: cfg.assistant?.name || "Spark",
        extraInstructions: cfg.assistant?.extraInstructions || "",
    };
}

const suggestions = [
    "What's missing from this document?",
    "What assumptions am I making?",
    "Who would disagree with this?",
    "What are the risks here?",
];

function buildSystemPrompt(name, extraInstructions) {
    const toolHints = [];
    if (agentCaps.readDocs)
        toolHints.push(
            "Use the `read_file` tool to fetch any workspace doc from the index when you need it.",
        );
    if (agentCaps.listTree)
        toolHints.push(
            "Use the `list_workspace` tool to discover the directory structure (dirs + files, 3 levels deep by default). Helpful before reading files when you do not know the layout.",
        );
    if (agentCaps.postComments)
        toolHints.push(
            "Use the `post_comment` tool to leave an inline comment anchored to an exact quoted passage from the current document. `anchor` must match the visible plain text verbatim (do not include markdown symbols like # or **). Choose a unique, specific passage.",
        );

    let instructions = `You are ${name}, a sharp, seasoned technical mentor reviewing the user's document. Your job: brainstorm, challenge assumptions, spot gaps, and ask clarifying questions. Never write the document for them.

Voice: conversational and human-like, but extremely brief. Never exceed 3-4 sentences. Talk like a real person, not an assistant. No generic filler. Avoid heavy markdown.

Only use the \`post_comment\` tool if the user specifically asks for a review, critique, or feedback on a passage, or if you spot a critical issue that requires a specific highlight. Do not leave comments on irrelevant prompts or when a chat response is sufficient.

The full current document is provided in <current_document>. A workspace file index (paths only) may be provided in <workspace_index>.

${toolHints.length ? "Tools available:\n" + toolHints.map((t) => "- " + t).join("\n") : ""}

CRITICAL: Quote the exact anchor text verbatim from the current document's visible text (plain text, no markdown syntax). You may post multiple comments in one turn by calling the tool multiple times.

Effort level: ${effortLevel.value}. Low/Medium = 1-3 sentences. High = Max 4 sentences. Always prioritize brevity.`;

    return extraInstructions?.trim()
        ? `${instructions}\n\nAdditional user instructions:\n${extraInstructions.trim()}`
        : instructions;
}

function openComment(id) {
    store.rightPanelTab = "comments";
    // Slight delay to ensure panel is open before scrolling
    setTimeout(() => {
        const el = document.getElementById(`comment-${id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
}

function renderMarkdown(text) {
    if (!text) return "";
    try {
        return marked.parse(String(text));
    } catch {
        return String(text);
    }
}

function handleEnter(e) {
    if (e.shiftKey) return;
    if (showSlashMenu.value) {
        executeSlashSelection();
        return;
    }
    sendMessage();
}

function sendSuggestion(text) {
    userInput.value = text;
    sendMessage();
}

const currentToolLogs = ref([]);

async function buildWorkspaceBlock() {
    if (!agentCaps.indexWorkspace) return "";
    const workspacePath = store.workspacePath;
    if (!workspacePath) return "";

    let allFiles;
    try {
        allFiles = await window.canonic.files.list(workspacePath);
    } catch (e) {
        if (import.meta.env.DEV)
            console.warn("[AIChat] Could not list workspace files:", e);
        return "";
    }

    const mdFiles = (allFiles || [])
        .map((f) => (typeof f === "string" ? f : f.path || f.name || ""))
        .filter((p) => p && p.endsWith(".md"));

    indexedDocCount.value = mdFiles.length;
    if (mdFiles.length === 0) return "";

    const listing = mdFiles.map((p) => `- ${p}`).join("\n");
    return `\n\n<workspace_index>\nThese .md files are available in the workspace. Use the read_file tool to fetch any you need.\n${listing}\n</workspace_index>`;
}

let cachedSystemContent = "";

async function sendMessage() {
    let content = userInput.value.trim();
    if (!content || streaming.value) return;

    // Replace multiline paste markers with actual content
    for (const [marker, fullText] of pastedMultilineContents.entries()) {
        content = content.replace(marker, fullText);
    }
    // Clear the map after sending
    pastedMultilineContents.clear();

    if (content.startsWith("/") && !content.includes(" ")) {
        const cmd = filteredRootCommands.value[slashSelectedIndex.value]?.id;
        if (cmd) {
            showSlashMenu.value = true;
            slashCommandType.value = cmd;
            userInput.value = `/${cmd} `;
            return;
        }
    }

    if (import.meta.env.DEV) console.log("[AIChat] Sending message:", content);

    store.aiChatMessages.push({ id: uuidv4(), role: "user", content });
    store.saveCurrentAiChat();
    userInput.value = "";
    showSlashMenu.value = false;
    showingHistory.value = false;
    scrollToBottom();

    const { apiKey, baseUrl, model, name, extraInstructions } =
        resolveAssistant();
    if (!apiKey) {
        if (import.meta.env.DEV) console.warn("[AIChat] No API key found");
        store.aiChatMessages.push({
            id: uuidv4(),
            role: "assistant",
            content:
                "No API key configured. Open Settings → Providers to add a provider.",
        });
        store.saveCurrentAiChat();
        return;
    }

    const docContext = store.currentContent
        ? `\n\n<current_document path="${store.currentFile || "untitled"}" format="markdown">\n${store.currentContent}\n</current_document>\n\n<current_document_plaintext>\n${store.currentContent.replace(/[#*`_~]/g, "")}\n</current_document_plaintext>`
        : "";
    cachedSystemContent =
        buildSystemPrompt(name, extraInstructions) +
        (await buildWorkspaceBlock()) +
        docContext;

    cancelLoop.value = false;
    await performChatRequest(apiKey, baseUrl, model);
}

let activeToolCalls = {};

async function performChatRequest(apiKey, baseUrl, model) {
    if (cancelLoop.value) {
        cancelLoop.value = false;
        streaming.value = false;
        return;
    }

    streaming.value = true;
    streamBuffer.value = "";
    activeToolCalls = {};
    window.canonic.ai.removeListeners();

    window.canonic.ai.onToolCallDelta((deltas) => {
        for (const delta of deltas) {
            if (!activeToolCalls[delta.index]) {
                activeToolCalls[delta.index] = {
                    id: delta.id,
                    type: delta.type || "function",
                    function: {
                        name: delta.function?.name || "",
                        arguments: "",
                    },
                };
            }
            if (delta.function && delta.function.arguments) {
                activeToolCalls[delta.index].function.arguments +=
                    delta.function.arguments;
            }
        }
    });

    window.canonic.ai.onChunk((text) => {
        streamBuffer.value += text;
        scrollToBottom();
    });

    window.canonic.ai.onDone(async () => {
        const rawResponse = streamBuffer.value;
        const { think, content } = parseThinkBlock(rawResponse);
        const toolCallsArray = Object.values(activeToolCalls);

        const finalContent = content || "";
        const isEmpty =
            !finalContent &&
            !think &&
            toolCallsArray.length === 0 &&
            currentToolLogs.value.length === 0;

        if (!isEmpty) {
            store.aiChatMessages.push({
                id: uuidv4(),
                role: "assistant",
                content: finalContent,
                think: think,
                tool_calls:
                    toolCallsArray.length > 0 ? toolCallsArray : undefined,
                toolLogs: [...currentToolLogs.value],
            });
        }
        currentToolLogs.value = [];
        store.saveCurrentAiChat();
        scrollToBottom();

        sessionStats.value.approxTokens += Math.ceil(
            (content.length + rawResponse.length) / 4,
        );
        sessionStats.value.messages++;
        streamBuffer.value = "";

        if (toolCallsArray.length > 0 && !cancelLoop.value) {
            for (const tc of toolCallsArray) {
                if (tc.function.name === "read_file") {
                    try {
                        const args = JSON.parse(tc.function.arguments);
                        const fileContent = await window.canonic.files.read(
                            store.workspacePath,
                            args.path,
                        );
                        store.aiChatMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            name: tc.function.name,
                            content: fileContent,
                        });
                        currentToolLogs.value.push({
                            type: "read",
                            file: args.path,
                        });
                    } catch (e) {
                        store.aiChatMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            name: tc.function.name,
                            content: "Error: " + e.message,
                        });
                    }
                } else if (tc.function.name === "list_workspace") {
                    try {
                        const args = tc.function.arguments
                            ? JSON.parse(tc.function.arguments)
                            : {};
                        const result = await window.canonic.files.tree(
                            store.workspacePath,
                            { maxDepth: args.maxDepth || 3 },
                        );
                        const lines = (result.entries || []).map((e) =>
                            e.type === "dir" ? `${e.path}/` : e.path,
                        );
                        const body =
                            lines.join("\n") +
                            (result.truncated
                                ? "\n<!-- truncated: entries cap reached -->"
                                : "");
                        store.aiChatMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            name: tc.function.name,
                            content: body,
                        });
                        currentToolLogs.value.push({
                            type: "tree",
                            count: lines.length,
                            depth: result.maxDepth,
                        });
                    } catch (e) {
                        store.aiChatMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            name: tc.function.name,
                            content: "Error: " + e.message,
                        });
                    }
                } else if (tc.function.name === "post_comment") {
                    try {
                        const args = JSON.parse(tc.function.arguments);
                        const commentId = uuidv4();
                        await store.addComment({
                            id: commentId,
                            anchor: { quotedText: args.anchor },
                            text: args.body,
                            author: assistantName.value,
                            isAgent: true,
                            agentName: assistantName.value,
                            resolved: false,
                            createdAt: new Date().toISOString(),
                        });
                        store.aiChatMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            name: tc.function.name,
                            content: "Comment posted.",
                        });
                        currentToolLogs.value.push({
                            type: "comment",
                            id: commentId,
                            anchor: args.anchor,
                        });
                    } catch (e) {
                        if (import.meta.env.DEV)
                            console.error("[AIChat] post_comment failed:", e);
                        store.aiChatMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            name: tc.function.name,
                            content: "Error: " + e.message,
                        });
                    }
                }
            }
            if (!cancelLoop.value)
                await performChatRequest(apiKey, baseUrl, model);
        } else {
            streaming.value = false;
            window.canonic.ai.removeListeners();
        }
    });

    window.canonic.ai.onError((msg) => {
        store.aiChatMessages.push({
            id: uuidv4(),
            role: "assistant",
            content: `Error: ${msg}`,
        });
        store.saveCurrentAiChat();
        streaming.value = false;
        window.canonic.ai.removeListeners();
        scrollToBottom();
    });

    const contextMessages = store.aiChatMessages.slice(-20).map((m) => {
        const out = { role: m.role, content: m.content || "" };
        if (m.tool_calls) out.tool_calls = m.tool_calls;
        if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
        if (m.name) out.name = m.name;
        if (m.think) out.reasoning_content = m.think;
        return out;
    });

    const CANONIC_TOOLS = [];
    if (agentCaps.readDocs) {
        CANONIC_TOOLS.push({
            type: "function",
            function: {
                name: "read_file",
                description: "Read a workspace file",
                parameters: {
                    type: "object",
                    properties: { path: { type: "string" } },
                    required: ["path"],
                },
            },
        });
    }
    if (agentCaps.listTree) {
        CANONIC_TOOLS.push({
            type: "function",
            function: {
                name: "list_workspace",
                description:
                    "List directories and files in the workspace, up to maxDepth levels deep (default 3, max 5). Returns relative paths only — does not read file content. Use this to discover structure, then use read_file on specific files.",
                parameters: {
                    type: "object",
                    properties: {
                        maxDepth: {
                            type: "integer",
                            description: "1-5, default 3",
                        },
                    },
                },
            },
        });
    }
    if (agentCaps.postComments) {
        CANONIC_TOOLS.push({
            type: "function",
            function: {
                name: "post_comment",
                description:
                    "Leave an inline comment on a specific document passage",
                parameters: {
                    type: "object",
                    properties: {
                        anchor: { type: "string", description: "Exact text" },
                        body: { type: "string", description: "Comment" },
                    },
                    required: ["anchor", "body"],
                },
            },
        });
    }

    const ipcPayload = JSON.parse(
        JSON.stringify({
            messages: contextMessages,
            system: cachedSystemContent,
            model,
            apiKey,
            baseUrl,
            tools: CANONIC_TOOLS.length > 0 ? CANONIC_TOOLS : undefined,
        }),
    );
    window.canonic.ai.chat(ipcPayload).catch((err) => {
        if (import.meta.env.DEV) console.error("IPC invoke error:", err);
        store.aiChatMessages.push({
            id: uuidv4(),
            role: "assistant",
            content: `Error: ${err.message}`,
        });
        streaming.value = false;
        scrollToBottom();
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
    window.removeEventListener("keydown", handleGlobalKeydown);
});
</script>

<style scoped>
.ai-chat {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    position: relative;
}

.ai-chat-actions {
    position: absolute;
    top: 8px;
    right: 12px;
    display: flex;
    gap: 6px;
    z-index: 10;
}

.icon-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s;
    padding: 0;
}

.icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.icon-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
}

.chat-history-view {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    padding-top: 56px;
    mask-image: linear-gradient(
        to bottom,
        transparent 0%,
        black 56px,
        black 100%
    );
    -webkit-mask-image: linear-gradient(
        to bottom,
        transparent 0%,
        black 56px,
        black 100%
    );
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.history-empty {
    text-align: center;
    color: var(--text-muted);
    padding: 20px;
    font-size: 0.8375rem;
}

.history-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: background 0.15s;
}

.history-item:hover {
    background: var(--bg-hover);
}

.history-item-btn {
    flex: 1;
    text-align: left;
    padding: 10px 12px;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.history-title {
    font-size: 0.8375rem;
    font-weight: 500;
    color: var(--text-primary);
}

.history-date {
    font-size: 0.7rem;
    color: var(--text-muted);
}

.history-del-btn {
    padding: 10px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 1.1rem;
}

.history-del-btn:hover {
    color: #ef4444;
}

.message-think-wrapper {
    margin-bottom: 8px;
    margin-left: 20px;
}

.think-block {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
}

.tool-logs {
    margin-bottom: 2px;
    margin-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.tool-log-item {
    font-size: 0.75rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

.tool-log-item > * {
    flex-shrink: 0;
}

.tool-log-item a,
.tool-log-item .log-text {
    color: var(--accent);
    text-decoration: none;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex-shrink: 1;
}

.tool-log-item a:hover {
    text-decoration: underline;
}

.think-content {
    margin-top: 8px;
    padding-left: 8px;
    border-left: 2px solid var(--border);
    line-height: 1.5;
}

.anim-dots::after {
    content: ".";
    animation: dots 1.5s steps(3, end) infinite;
}

@keyframes dots {
    0% {
        content: ".";
    }
    33% {
        content: "..";
    }
    66% {
        content: "...";
    }
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    padding-top: 56px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    mask-image: linear-gradient(
        to bottom,
        transparent 0%,
        black 56px,
        black 100%
    );
    -webkit-mask-image: linear-gradient(
        to bottom,
        transparent 0%,
        black 56px,
        black 100%
    );
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
    margin-bottom: 8px;
    color: var(--accent);
}

.ai-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
    text-align: center;
    margin-bottom: 6px;
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

.message-content :deep(p) {
    margin: 0 0 8px 0;
}
.message-content :deep(p:last-child) {
    margin-bottom: 0;
}
.message-content :deep(ul),
.message-content :deep(ol) {
    margin: 4px 0 8px 0;
    padding-left: 20px;
}
.message-content :deep(li) {
    margin: 2px 0;
}
.message-content :deep(li > p) {
    margin: 0;
}
.message-content :deep(h1),
.message-content :deep(h2),
.message-content :deep(h3),
.message-content :deep(h4) {
    margin: 10px 0 4px 0;
    font-size: 0.95rem;
    font-weight: 600;
}
.message-content :deep(code) {
    background: var(--bg-base);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.8em;
}
.message-content :deep(pre) {
    background: var(--bg-base);
    padding: 8px 10px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 6px 0;
    font-size: 0.78rem;
    border: 1px solid var(--border);
}
.message-content :deep(pre code) {
    background: none;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
}
.message-content :deep(blockquote) {
    margin: 6px 0;
    padding-left: 10px;
    border-left: 2px solid var(--border);
    color: var(--text-muted);
}
.message-content :deep(a) {
    color: var(--accent);
    text-decoration: underline;
}
.message-content :deep(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 10px 0;
}

.thinking-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-right: 4px;
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
.toggle-switch input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
}
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
.toggle-switch input[type="checkbox"]:checked + .toggle-track {
    background: var(--accent);
}
.toggle-switch input[type="checkbox"]:checked + .toggle-track::after {
    transform: translateX(12px);
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

/* Context Circle */
.context-circle {
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
}
.circular-chart {
    display: block;
    width: 100%;
    height: 100%;
}
.circle-bg {
    fill: none;
    stroke: var(--border);
    stroke-width: 3.8;
}
.circle {
    fill: none;
    stroke: var(--accent);
    stroke-width: 3.8;
    stroke-linecap: round;
    transition: stroke-dasharray 0.3s ease;
}

/* Slash Menu & Input Footer */
.chat-input-area {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}
.chat-input-row {
    display: flex;
    gap: 8px;
    width: 100%;
}
.chat-input-footer {
    font-size: 0.65rem;
    color: var(--text-muted);
    text-align: right;
    padding-right: 4px;
}
.slash-menu {
    position: absolute;
    bottom: 100%;
    left: 10px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px;
    min-width: 180px;
    max-height: 250px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    margin-bottom: 5px;
}
.slash-menu-title {
    font-size: 0.7rem;
    color: var(--text-muted);
    padding: 4px 6px;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 2px;
}
.slash-menu-hint {
    font-size: 0.65rem;
    color: var(--text-muted);
    padding: 2px 6px 6px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--border);
}
.slash-menu-items {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.slash-menu-item {
    background: transparent;
    border: none;
    text-align: left;
    padding: 6px 8px;
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.8rem;
    cursor: pointer;
}
.slash-menu-item:hover,
.slash-menu-item.active {
    background: var(--bg-hover);
}

/* Think Block */
.think-block {
    margin-bottom: 8px;
    border-left: 2px solid var(--border);
    padding-left: 8px;
    color: var(--text-muted);
    font-size: 0.75rem;
}
.think-block summary {
    cursor: pointer;
    font-weight: 500;
    margin-bottom: 4px;
    user-select: none;
}
.think-block summary:hover {
    color: var(--text-secondary);
}
.think-content {
    padding-top: 4px;
    line-height: 1.5;
    opacity: 0.85;
}
</style>
