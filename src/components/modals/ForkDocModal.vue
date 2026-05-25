<template>
    <div class="modal-backdrop" @click.self="$emit('close')">
        <div class="modal">
            <h3 class="modal-title">Fork "{{ docName }}"</h3>
            <p class="modal-desc">
                Creates a new branch from the current state so you can explore
                an alternate version without affecting
                <code>{{ store.currentBranch }}</code
                >.
            </p>

            <div class="field">
                <label class="field-label">Branch name</label>
                <input
                    ref="inputEl"
                    v-model="branchName"
                    class="field-input"
                    :placeholder="`${docName}-v2`"
                    @keydown.enter="submit"
                    @keydown.esc="$emit('close')"
                />
                <p v-if="error" class="field-error">{{ error }}</p>
            </div>

            <div class="modal-actions">
                <button class="btn-ghost" @click="$emit('close')">
                    Cancel
                </button>
                <button
                    class="btn-primary"
                    @click="submit"
                    :disabled="!branchName.trim() || loading"
                >
                    {{ loading ? "Forking…" : "Create fork" }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useAppStore } from "../../store";

const emit = defineEmits(["close", "forked"]);
const store = useAppStore();

const inputEl = ref(null);
const loading = ref(false);
const error = ref("");

const docName = computed(
    () => store.currentFile?.split("/").pop().replace(".md", "") || "document",
);

const branchName = ref(`${docName.value}-v2`);

onMounted(() => {
    inputEl.value?.focus();
    inputEl.value?.select();
});

async function submit() {
    const name = branchName.value.trim();
    if (!name) return;
    error.value = "";

    // Basic validation: no spaces, no special chars git dislikes
    if (/[\s~^:?*\[\\]/.test(name)) {
        error.value =
            "Branch name cannot contain spaces or special characters.";
        return;
    }
    if (store.branches.includes(name)) {
        error.value = `Branch "${name}" already exists.`;
        return;
    }

    loading.value = true;
    try {
        const result = await store.forkDocument(name);
        if (result?.success) {
            emit("forked", name);
            emit("close");
        } else {
            error.value = result?.error || "Failed to create fork.";
        }
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

.modal-desc code {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.8em;
    background: var(--bg-hover);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--accent);
}

.field {
    margin-bottom: 20px;
}

.field-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 6px;
}

.field-input {
    width: 100%;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 12px;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: "JetBrains Mono", monospace;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
}

.field-input:focus {
    border-color: var(--accent-muted);
}

.field-error {
    font-size: 0.775rem;
    color: var(--error, #f87171);
    margin-top: 5px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
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
