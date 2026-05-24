<template>
    <div class="modal-backdrop" @click.self="$emit('close')">
        <div class="modal">
            <h3 class="modal-title">Save version of "{{ docName }}"</h3>
            <p class="modal-desc">
                Creates a named snapshot pointing to the latest commit. You can
                restore this exact state at any time from the History panel.
            </p>

            <div v-if="!hasCommit" class="no-commit-warning">
                No commits yet for this document. Save a checkpoint first using
                the commit button.
            </div>

            <template v-else>
                <div class="current-commit">
                    <span class="label">Snapshotting commit</span>
                    <code class="oid">{{ latestOid }}</code>
                    <span class="commit-msg">{{ latestMessage }}</span>
                </div>

                <div class="field">
                    <label class="field-label">Version name</label>
                    <input
                        ref="nameEl"
                        v-model="versionName"
                        class="field-input"
                        placeholder="v1.0, draft-for-review, approved…"
                        @keydown.enter="submit"
                        @keydown.esc="$emit('close')"
                    />
                </div>

                <div class="field">
                    <label class="field-label"
                        >Note <span class="optional">(optional)</span></label
                    >
                    <input
                        v-model="versionNote"
                        class="field-input"
                        placeholder="What's significant about this version?"
                        @keydown.enter="submit"
                        @keydown.esc="$emit('close')"
                    />
                </div>

                <p v-if="error" class="field-error">{{ error }}</p>
            </template>

            <div class="modal-actions">
                <button class="btn-ghost" @click="$emit('close')">
                    Cancel
                </button>
                <button
                    v-if="hasCommit"
                    class="btn-primary"
                    @click="submit"
                    :disabled="!versionName.trim() || loading"
                >
                    {{ loading ? "Saving…" : "Save version" }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useAppStore } from "../../store";

const emit = defineEmits(["close", "saved"]);
const store = useAppStore();

const nameEl = ref(null);
const loading = ref(false);
const error = ref("");
const versionName = ref("");
const versionNote = ref("");

const docName = computed(
    () => store.currentFile?.split("/").pop().replace(".md", "") || "document",
);

const hasCommit = computed(() => store.commitLog.length > 0);
const latestOid = computed(() => store.commitLog[0]?.oid?.slice(0, 7) || "");
const latestMessage = computed(() => store.commitLog[0]?.message?.trim() || "");

// Suggest a name based on existing versions
onMounted(() => {
    const existing = store.docVersions.length;
    versionName.value = existing === 0 ? "v1.0" : `v${existing + 1}.0`;
    nameEl.value?.focus();
    nameEl.value?.select();
});

async function submit() {
    const name = versionName.value.trim();
    if (!name) return;
    error.value = "";

    if (store.docVersions.some((v) => v.name === name)) {
        error.value = `Version "${name}" already exists — it will be overwritten.`;
    }

    loading.value = true;
    try {
        await store.saveDocVersion(name, versionNote.value.trim());
        emit("saved", name);
        emit("close");
    } catch (err) {
        error.value = err.message;
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped>
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 24px;
}

.modal {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
    width: 100%;
    max-width: 420px;
}

.modal-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
}

.modal-desc {
    font-size: 0.8375rem;
    color: var(--text-muted);
    line-height: 1.55;
    margin-bottom: 20px;
}

.no-commit-warning {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    padding: 12px;
    font-size: 0.8375rem;
    color: #f59e0b;
    margin-bottom: 20px;
}

.current-commit {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 18px;
    flex-wrap: wrap;
}

.label {
    font-size: 0.75rem;
    color: var(--text-muted);
}

.oid {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.75rem;
    color: var(--accent);
    background: var(--bg-hover);
    padding: 1px 5px;
    border-radius: 3px;
}

.commit-msg {
    font-size: 0.8rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
}

.field {
    margin-bottom: 14px;
}

.field-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 6px;
}

.optional {
    font-weight: 400;
    color: var(--text-muted);
}

.field-input {
    width: 100%;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 12px;
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
}

.field-input:focus {
    border-color: var(--accent-muted);
}
.field-input::placeholder {
    color: var(--text-muted);
}

.field-error {
    font-size: 0.775rem;
    color: #f59e0b;
    margin-top: 6px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
}

.btn-ghost {
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
}

.btn-ghost:hover {
    background: var(--bg-hover);
}

.btn-primary {
    padding: 8px 20px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
}

.btn-primary:hover:not(:disabled) {
    opacity: 0.85;
}
.btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
</style>
