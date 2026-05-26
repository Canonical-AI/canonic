<template>
    <div class="editor-wrapper">
        <div class="editor-topbar">
            <input
                v-if="renamingTitle"
                ref="titleInput"
                v-model="titleValue"
                class="doc-title-input"
                @keydown.enter="confirmTitleRename"
                @keydown.esc="renamingTitle = false"
                @blur="confirmTitleRename"
            />
            <h1
                v-else
                class="doc-title"
                @dblclick="startTitleRename"
                title="Double-click to rename"
            >
                {{ docTitle }}
            </h1>
            <div class="topbar-actions">
                <div class="topbar-divider" />
                <span v-if="store.isDirty" class="unsaved-label">Unsaved</span>
                <button
                    class="action-btn"
                    @click="save"
                    :disabled="!store.isDirty"
                >
                    Save
                </button>
                <div class="topbar-divider" />
                <div
                    v-if="
                        !store.isExternalRepo &&
                        store.currentDocBranch !== 'main'
                    "
                    class="branch-pill"
                >
                    <GitBranch :size="11" />
                    <span>{{ store.currentDocBranch }}</span>
                    <button
                        class="merge-inline-btn"
                        @click="showMergeConfirm = true"
                        title="Merge into main"
                    >
                        Merge → main
                    </button>
                </div>
                <button
                    class="action-btn icon-label"
                    @click="showVersionModal = true"
                    title="Save a named version"
                >
                    <Tag :size="13" />
                    Version
                </button>
                <button
                    v-if="!store.isExternalRepo"
                    class="action-btn icon-label"
                    @click="showForkModal = true"
                    title="Fork to new branch draft"
                >
                    <GitFork :size="13" />
                    {{
                        store.currentDocBranch !== "main" ? "New Draft" : "Fork"
                    }}
                </button>
                <div class="topbar-divider" />
                <button
                    class="action-btn icon-label"
                    @click="splitPane"
                    :disabled="!canSplit"
                    title="Open a document beside this one"
                >
                    <Columns2 :size="13" />
                    Split
                </button>
            </div>
        </div>

        <ForkDocModal v-if="showForkModal" @close="showForkModal = false" />
        <SaveVersionModal
            v-if="showVersionModal"
            @close="showVersionModal = false"
        />

        <!-- Merge confirm overlay -->
        <div
            v-if="showMergeConfirm && !store.isExternalRepo"
            class="merge-confirm-overlay"
            @click.self="showMergeConfirm = false"
        >
            <div class="merge-confirm-box">
                <p class="merge-confirm-title">Merge into main?</p>
                <p class="merge-confirm-body">
                    This will merge
                    <strong>{{ store.currentDocBranch }}</strong> into
                    <strong>main</strong> and delete the branch.
                </p>
                <p v-if="mergeError" class="merge-confirm-error">
                    {{ mergeError }}
                </p>
                <div class="merge-confirm-actions">
                    <button
                        class="merge-confirm-cancel"
                        @click="showMergeConfirm = false"
                    >
                        Cancel
                    </button>
                    <button
                        class="merge-confirm-ok"
                        @click="doMerge"
                        :disabled="isMerging"
                    >
                        {{ isMerging ? "Merging…" : "Merge" }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Back navigation banner -->
        <div v-if="store.navBack" class="nav-back-banner">
            <button class="nav-back-btn" @click="goBack">
                <ArrowLeft :size="13" />
                Back to {{ store.navBack.name }}
            </button>
            <button
                class="nav-back-dismiss"
                @click="store.navBack = null"
                title="Dismiss"
            >
                ✕
            </button>
        </div>

        <InDocFindBar
            :visible="findBarVisible"
            :initial-query="findBarInitialQuery"
            :total-matches="findTotal"
            :current-match="findCurrent"
            @update="onFindUpdate"
            @next="onFindNext"
            @prev="onFindPrev"
            @close="closeFindBar"
        />

        <div class="editor-scroll" ref="editorScrollEl">
            <div
                class="editor-content"
                ref="editorContentEl"
                @mouseup="onMouseUp"
                @click="onEditorClick"
                :style="{ '--editor-font-size': editorFontSize + 'px' }"
            >
                <ProsemirrorAdapterProvider>
                    <MilkdownProvider :key="`${store.currentFile}:${store.editorRevision}`">
                        <MilkdownEditor
                            ref="milkdownEditor"
                            :content="store.currentContent"
                            :comments="store.comments"
                            @update="onContentUpdate"
                        />
                    </MilkdownProvider>
                </ProsemirrorAdapterProvider>

                <!-- Inline comment input -->
                <div
                    v-if="commentInput.visible"
                    class="comment-input-box"
                    :style="{
                        top: selectionPopover.y + 'px',
                        left: selectionPopover.x + 'px',
                    }"
                    @click.stop
                    @mousedown.stop
                >
                    <div class="comment-quoted">
                        <span class="comment-quote-bar" />
                        <span class="comment-quote-text">{{
                            truncateQuote(selectionPopover.text)
                        }}</span>
                    </div>
                    <textarea
                        ref="commentTextareaEl"
                        v-model="commentInput.text"
                        class="comment-textarea"
                        placeholder="Add a comment…"
                        rows="3"
                        @keydown.ctrl.enter="submitComment"
                        @keydown.meta.enter="submitComment"
                        @keydown.esc="cancelComment"
                    />
                    <div class="comment-input-actions">
                        <span class="comment-input-hint">⌘↩ to submit</span>
                        <button
                            class="comment-cancel-btn"
                            @click="cancelComment"
                        >
                            Cancel
                        </button>
                        <button
                            class="comment-submit-btn"
                            @click="submitComment"
                            :disabled="!commentInput.text.trim()"
                        >
                            Comment
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, provide } from "vue";
import { MilkdownProvider } from "@milkdown/vue";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/vue";
import { useAppStore } from "../../store";
import { v4 as uuidv4 } from "uuid";
import { Tag, GitFork, GitBranch, ArrowLeft, Columns2 } from "lucide-vue-next";
import MilkdownEditor from "./MilkdownEditor.vue";
import InDocFindBar from "./InDocFindBar.vue";
import { matchesHotkey } from "../../utils/hotkey.js";
import { storage } from "../../utils/storage.js";
import ForkDocModal from "../modals/ForkDocModal.vue";
import SaveVersionModal from "../modals/SaveVersionModal.vue";

const store = useAppStore();
const editorContentEl = ref(null);
const editorScrollEl = ref(null);
const commentTextareaEl = ref(null);
const titleInput = ref(null);
const localContent = ref("");
const editorInitialized = ref(false);

const selectionPopover = ref({ visible: false, x: 0, y: 0, text: "" });
const commentInput = ref({ visible: false, text: "" });

// ── Split panels ─────────────────────────────────────────────────────────────
function nextSplitDoc() {
    return store.flatDocList.find(
        (d) => d.path !== store.currentFile && !store.refPanes.includes(d.path),
    );
}
const canSplit = computed(() => store.refPanes.length < 2 && !!nextSplitDoc());
function splitPane() {
    const doc = nextSplitDoc();
    if (doc) store.addRefPane(doc.path);
}

provide("openCommentFromToolbar", (selectedText, fixedCoords) => {
    const wrapperRect = editorContentEl.value?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
        width: 800,
    };

    let x = fixedCoords.left - wrapperRect.left;
    let y = fixedCoords.top - wrapperRect.top;

    // Position refined logic
    y = Math.max(8, y - 54);
    const boxWidth = 280;
    if (x + boxWidth > wrapperRect.width - 20) {
        x = Math.max(10, wrapperRect.width - boxWidth - 20);
    }

    selectionPopover.value = {
        visible: false,
        x,
        y,
        text: selectedText,
    };
    commentInput.value = { visible: true, text: "" };
    store.commentingActive = true;
    nextTick(() => commentTextareaEl.value?.focus());
});
const showForkModal = ref(false);
const showVersionModal = ref(false);
const showMergeConfirm = ref(false);
const milkdownEditor = ref(null);
const isMerging = ref(false);
const mergeError = ref("");
const renamingTitle = ref(false);
const titleValue = ref("");

const findBarVisible = ref(false);
const findBarInitialQuery = ref("");
const findTotal = ref(0);
const findCurrent = ref(-1);

function refreshFindState() {
    const s = milkdownEditor.value?.findReplaceReadState?.() || {
        total: 0,
        current: -1,
    };
    findTotal.value = s.total;
    findCurrent.value = s.current;
}

function onFindUpdate({ query, opts }) {
    milkdownEditor.value?.findReplaceApply?.(query, opts);
    nextTick(refreshFindState);
}

function onFindNext() {
    const idx = milkdownEditor.value?.findReplaceMove?.(1);
    if (idx != null) findCurrent.value = idx;
}

function onFindPrev() {
    const idx = milkdownEditor.value?.findReplaceMove?.(-1);
    if (idx != null) findCurrent.value = idx;
}

function openFindBar() {
    const sel = milkdownEditor.value?.getSelectedText?.() || "";
    if (sel) findBarInitialQuery.value = sel;
    findBarVisible.value = true;
}

function closeFindBar() {
    findBarVisible.value = false;
    findBarInitialQuery.value = "";
    findTotal.value = 0;
    findCurrent.value = -1;
    milkdownEditor.value?.findReplaceReset?.();
    milkdownEditor.value?.focusEditor?.();
}

const docTitle = computed(() => {
    if (!store.currentFile) return "";
    return store.currentFile.split(/[\\/]/).pop().replace(".md", "");
});

async function startTitleRename() {
    titleValue.value = docTitle.value;
    renamingTitle.value = true;
    await nextTick();
    titleInput.value?.focus();
    titleInput.value?.select();
}

async function confirmTitleRename() {
    const newName = titleValue.value.trim();
    renamingTitle.value = false;
    if (!newName || newName === docTitle.value) return;
    await store.renameFile(store.currentFile, newName);
}

// Keep localContent in sync when store changes (file switch)
watch(
    () => store.currentContent,
    (val) => {
        localContent.value = val || "";
    },
    { immediate: true },
);

// Clear active comment when switching files so stale IDs don't linger.
// Also reset the init-update guard so the new editor's first serialization doesn't mark dirty.
watch(
    () => store.currentFile,
    () => {
        store.setActiveComment(null);
        editorInitialized.value = false;
    },
);

// Editor → Sidebar: clicking a comment highlight activates it.
function onEditorClick(e) {
    const span = e.target.closest("[data-comment-id]");
    if (span) {
        store.setActiveComment(span.dataset.commentId);
        store.rightPanelTab = "comments";
        store.rightPanelCollapsed = false;
    }
}

// Sidebar → Editor: when activeCommentId changes, scroll to the highlight and flash it.
watch(
    () => store.activeCommentId,
    async (id) => {
        if (!id || !editorContentEl.value) return;
        await nextTick();
        const el = editorContentEl.value.querySelector(
            `[data-comment-id="${id}"]`,
        );
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("active-highlight");
        setTimeout(() => el.classList.remove("active-highlight"), 1200);
    },
);

function onContentUpdate(markdown) {
    localContent.value = markdown;
    if (!editorInitialized.value) {
        // First emission is the editor's init serialization (remark may normalize whitespace,
        // escape sequences, etc.) — accept it as the new baseline without marking dirty.
        editorInitialized.value = true;
        store.currentContent = markdown;
        return;
    }

    if (markdown !== store.currentContent) {
        // Only mark dirty if the editor has focus (user typing) or if the change
        // is significant (more than just whitespace/normalization).
        if (store.isDirty) {
            store.currentContent = markdown;
        } else if (
            editorHasFocus() ||
            markdown.trim() !== store.currentContent.trim()
        ) {
            store.currentContent = markdown;
            store.isDirty = true;
        } else {
            // Silently sync background normalization (whitespace, etc) without marking dirty
            store.currentContent = markdown;
        }
    }
}

async function save() {
    await store.saveFile(localContent.value);
}

// Auto-save every 30s when dirty
let autoSaveTimer = null;
watch(
    () => store.isDirty,
    (dirty) => {
        if (dirty) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => save(), 30000);
        }
    },
);

function onMouseUp() {
    if (commentInput.value.visible) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        selectionPopover.value.visible = false;
        return;
    }
    // Track selection for comment input position; the floating toolbar handles the button UI
    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const wrapperRect = editorContentEl.value.getBoundingClientRect();
    selectionPopover.value = {
        visible: false,
        x: Math.max(0, rect.left - wrapperRect.left),
        y: rect.top - wrapperRect.top - 44,
        text: selectedText,
    };
}

function truncateQuote(text, len = 80) {
    return text.length > len ? text.slice(0, len) + "…" : text;
}

function cancelComment() {
    commentInput.value = { visible: false, text: "" };
    selectionPopover.value = { visible: false, x: 0, y: 0, text: "" };
    store.commentingActive = false;
    milkdownEditor.value?.focusEditor();
}

function submitComment() {
    const text = commentInput.value.text.trim();
    if (!text) return;

    store.addComment({
        id: uuidv4(),
        author: store.config?.displayName || "You",
        type: "selection",
        anchor: { quotedText: selectionPopover.value.text },
        text,
        resolved: false,
        createdAt: new Date().toISOString(),
    });

    cancelComment();
}

async function goBack() {
    const back = store.navBack;
    store.navBack = null;
    if (!back) return;
    await store.openFile(back.path);
    await nextTick();
    if (editorScrollEl.value && back.scrollTop != null) {
        editorScrollEl.value.scrollTop = back.scrollTop;
    }
}

async function doMerge() {
    isMerging.value = true;
    mergeError.value = "";
    try {
        const result = await store.mergeBranch(store.currentDocBranch, "");
        if (result?.success) {
            showMergeConfirm.value = false;
        } else {
            mergeError.value = result?.conflict
                ? "Merge conflict — resolve manually."
                : result?.error || "Merge failed.";
        }
    } finally {
        isMerging.value = false;
    }
}

const EDITOR_FONT_KEY = "canonic:editorFontSize";
const DEFAULT_FONT_SIZE = 15;
const editorFontSize = ref(
    parseInt(storage.getItem(EDITOR_FONT_KEY) || DEFAULT_FONT_SIZE),
);

function editorHasFocus() {
    return editorContentEl.value?.contains(document.activeElement);
}

function openCommentInput() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim())
        return;

    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const wrapperRect = editorContentEl.value.getBoundingClientRect();

    // Calculate position relative to editor-content (which is position:relative)
    let x = rect.left - wrapperRect.left;
    let y = rect.top - wrapperRect.top;

    // Shift up to clear the selection, but don't go above the top padding
    y = Math.max(8, y - 54);

    // Keep within horizontal bounds
    const boxWidth = 280;
    const contentWidth = wrapperRect.width;
    if (x + boxWidth > contentWidth - 20) {
        x = Math.max(10, contentWidth - boxWidth - 20);
    }

    selectionPopover.value = {
        visible: false,
        x,
        y,
        text: selectedText,
    };
    commentInput.value = { visible: true, text: "" };
    store.commentingActive = true;
    nextTick(() => commentTextareaEl.value?.focus());
}

onMounted(() => {
    document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            if (store.isDirty) save();
        }

        const hk = store.findHotkeys;
        if (matchesHotkey(e, hk.findInDoc)) {
            e.preventDefault();
            openFindBar();
            return;
        }
        if (findBarVisible.value && matchesHotkey(e, hk.findNext)) {
            e.preventDefault();
            onFindNext();
            return;
        }
        if (findBarVisible.value && matchesHotkey(e, hk.findPrev)) {
            e.preventDefault();
            onFindPrev();
            return;
        }

        // Comment hotkey: Cmd+Alt+M or Ctrl+Alt+M
        if (
            (e.metaKey || e.ctrlKey) &&
            e.altKey &&
            e.key.toLowerCase() === "m"
        ) {
            e.preventDefault();
            openCommentInput();
        }

        if ((e.metaKey || e.ctrlKey) && editorHasFocus()) {
            if (e.key === "=" || e.key === "+") {
                e.preventDefault();
                editorFontSize.value = Math.min(editorFontSize.value + 1, 28);
                storage.setItem(EDITOR_FONT_KEY, String(editorFontSize.value));
            } else if (e.key === "-") {
                e.preventDefault();
                editorFontSize.value = Math.max(editorFontSize.value - 1, 11);
                storage.setItem(EDITOR_FONT_KEY, String(editorFontSize.value));
            } else if (e.key === "0") {
                e.preventDefault();
                editorFontSize.value = DEFAULT_FONT_SIZE;
                storage.setItem(EDITOR_FONT_KEY, String(editorFontSize.value));
            }
        }
    });
});
</script>

<style scoped>
.editor-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    position: relative;
}

.editor-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 48px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.doc-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
    cursor: text;
}

.doc-title-input {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.01em;
    background: var(--bg-hover);
    border: 1px solid var(--accent-muted);
    border-radius: 4px;
    padding: 1px 8px;
    outline: none;
    font-family: inherit;
    min-width: 120px;
}

.topbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.unsaved-label {
    font-size: 0.75rem;
    color: var(--text-muted);
}

.action-btn {
    padding: 5px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s;
}

.action-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.icon-label {
    display: flex;
    align-items: center;
    gap: 5px;
}

.topbar-divider {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 4px;
}

.branch-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 7px;
    border-radius: 20px;
    border: 1px solid var(--accent-muted);
    background: rgba(74, 122, 155, 0.08);
    color: var(--accent);
    font-size: 0.775rem;
    font-family: "JetBrains Mono", monospace;
}

.merge-inline-btn {
    margin-left: 4px;
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid var(--accent-muted);
    background: transparent;
    color: var(--accent);
    font-size: 0.72rem;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
    white-space: nowrap;
}

.merge-inline-btn:hover {
    background: rgba(74, 122, 155, 0.15);
}

.merge-confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}

.merge-confirm-box {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    width: 360px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.merge-confirm-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
}

.merge-confirm-body {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
}

.merge-confirm-error {
    font-size: 0.8rem;
    color: var(--error);
    margin: 0;
}

.merge-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
}

.merge-confirm-cancel {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
}

.merge-confirm-cancel:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.merge-confirm-ok {
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
}

.merge-confirm-ok:hover:not(:disabled) {
    opacity: 0.85;
}
.merge-confirm-ok:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.editor-scroll {
    flex: 1;
    overflow-y: auto;
}

.editor-content {
    padding: 32px 48px 32px 48px;
    position: relative;
    min-height: 100%;
}

.comment-input-box {
    position: absolute;
    z-index: 101;
    width: 280px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.comment-quoted {
    display: flex;
    align-items: flex-start;
    gap: 7px;
}

.comment-quote-bar {
    width: 3px;
    min-height: 16px;
    background: var(--accent);
    border-radius: 2px;
    flex-shrink: 0;
    margin-top: 2px;
}

.comment-quote-text {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
    line-height: 1.4;
    word-break: break-word;
}

.comment-textarea {
    width: 100%;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 9px;
    color: var(--text-primary);
    font-size: 0.8375rem;
    font-family: inherit;
    resize: none;
    outline: none;
    line-height: 1.5;
    box-sizing: border-box;
    transition: border-color 0.15s;
}

.comment-textarea:focus {
    border-color: var(--accent-muted);
}
.comment-textarea::placeholder {
    color: var(--text-muted);
}

.comment-input-actions {
    display: flex;
    align-items: center;
    gap: 6px;
}

.comment-input-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-right: auto;
}

.comment-cancel-btn {
    padding: 4px 10px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
    cursor: pointer;
}

.comment-cancel-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.comment-submit-btn {
    padding: 4px 12px;
    border-radius: 5px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
}

.comment-submit-btn:hover:not(:disabled) {
    opacity: 0.85;
}
.comment-submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.nav-back-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px 6px 48px;
    background: rgba(74, 122, 155, 0.1);
    border-bottom: 1px solid var(--accent-muted);
    flex-shrink: 0;
}

.nav-back-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 5px;
    border: 1px solid var(--accent-muted);
    background: transparent;
    color: var(--accent);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: background 0.15s;
}

.nav-back-btn:hover {
    background: rgba(74, 122, 155, 0.15);
}

.nav-back-dismiss {
    margin-left: auto;
    padding: 2px 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    border-radius: 4px;
}

.nav-back-dismiss:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}
</style>

<!-- Global: style the Milkdown / ProseMirror editor to match HAL2001 theme -->
<style>
.milkdown {
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
}

.milkdown .ProseMirror {
    outline: none;
    font-family: inherit;
    font-size: var(--editor-font-size, 15px);
    line-height: 1.8;
    color: var(--text-primary);
    caret-color: var(--accent);
    min-height: 60vh;
}

.milkdown .ProseMirror h1 {
    font-size: 1.85em;
    font-weight: 700;
    color: var(--text-primary);
    margin: 1.5em 0 0.5em;
    letter-spacing: -0.02em;
    line-height: 1.2;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.3em;
}

.milkdown .ProseMirror h2 {
    font-size: 1.45em;
    font-weight: 600;
    color: var(--text-primary);
    margin: 1.4em 0 0.4em;
    letter-spacing: -0.01em;
    line-height: 1.3;
}

.milkdown .ProseMirror h3 {
    font-size: 1.2em;
    font-weight: 600;
    color: var(--text-primary);
    margin: 1.2em 0 0.3em;
}

.milkdown .ProseMirror h4,
.milkdown .ProseMirror h5,
.milkdown .ProseMirror h6 {
    font-size: 1.05em;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 1em 0 0.25em;
}

.milkdown .ProseMirror p {
    margin: 0;
    color: var(--text-primary);
}

.editor-paragraph-spacing .milkdown .ProseMirror p {
    margin: 0 0 1em;
}

.milkdown .ProseMirror strong {
    font-weight: 600;
    color: var(--text-primary);
}

.milkdown .ProseMirror em {
    color: var(--text-secondary);
    font-style: italic;
}

.milkdown .ProseMirror code {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.85em;
    background: var(--bg-hover);
    color: var(--secondary);
    padding: 2px 5px;
    border-radius: 4px;
    border: 1px solid var(--border);
}

.milkdown .ProseMirror pre {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 0;
}

.editor-paragraph-spacing .milkdown .ProseMirror pre {
    margin: 1em 0;
}

.milkdown .ProseMirror pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.9em;
    color: var(--text-primary);
}

.milkdown .ProseMirror ul,
.milkdown .ProseMirror ol {
    padding-left: 1.75em;
    margin: 0;
}

.editor-paragraph-spacing .milkdown .ProseMirror ul,
.editor-paragraph-spacing .milkdown .ProseMirror ol {
    margin: 0.5em 0 1em;
}

.milkdown .ProseMirror li {
    margin: 0.25em 0;
    color: var(--text-primary);
}

.milkdown .ProseMirror li p {
    margin: 0;
}

.milkdown .ProseMirror blockquote {
    border-left: 3px solid var(--accent-muted);
    padding-left: 1em;
    margin: 0;
    color: var(--text-secondary);
    font-style: italic;
}

.editor-paragraph-spacing .milkdown .ProseMirror blockquote {
    margin: 1em 0;
}

.milkdown .ProseMirror hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 2em 0;
}

.milkdown .ProseMirror a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
}

/* Tables */
.milkdown .ProseMirror table {
    border-collapse: collapse;
    /* Auto layout sizes columns by content, full table width so the table
       spans the editor and columns proportionally absorb remaining space. */
    table-layout: auto;
    width: 100%;
    margin: 16px 0;
    font-size: 0.9em;
}

.milkdown .ProseMirror th,
.milkdown .ProseMirror td {
    /* Drop prosemirror-tables' fixed-layout min-width — let cells shrink
       to fit the widest content in their column, not a hard floor. */
    min-width: 0 !important;
}

.milkdown .ProseMirror th,
.milkdown .ProseMirror td {
    border: 1px solid var(--border-mid);
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
}

.milkdown .ProseMirror th {
    background: var(--bg-active);
    color: var(--text-primary);
    font-weight: 600;
}

.milkdown .ProseMirror tr:nth-child(even) td {
    background: var(--bg-hover);
}

/* Comment highlights */
.comment-highlight {
    background: rgba(251, 191, 36, 0.18);
    border-bottom: 2px solid rgba(251, 191, 36, 0.7);
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.15s;
}

.comment-highlight:hover {
    background: rgba(251, 191, 36, 0.35);
}

.comment-highlight.active-highlight {
    background: rgba(251, 191, 36, 0.6) !important;
    outline: 2px solid rgba(251, 191, 36, 0.8);
    border-radius: 3px;
    transition: none;
}

.demo-highlight {
    background: rgba(139, 92, 246, 0.15);
    border-bottom: 2px solid rgba(139, 92, 246, 0.6);
}

.demo-highlight:hover {
    background: rgba(139, 92, 246, 0.28);
}

/* Find & replace match highlights */
.find-match {
    background: rgba(250, 204, 21, 0.28);
    border-radius: 2px;
}

.find-match-current {
    background: rgba(250, 204, 21, 0.65);
    outline: 1px solid rgba(250, 204, 21, 0.95);
    border-radius: 2px;
}

.agent-highlight {
    background: rgba(74, 222, 128, 0.15);
    border-bottom: 2px solid rgba(74, 222, 128, 0.6);
}

.agent-highlight:hover {
    background: rgba(74, 222, 128, 0.28);
}

/* Placeholder */
.milkdown .ProseMirror.ProseMirror-empty::before {
    content: "Start writing…";
    color: var(--text-muted);
    pointer-events: none;
    position: absolute;
}

/* Selection */
.milkdown .ProseMirror ::selection {
    background: rgba(74, 122, 155, 0.3);
}
</style>
