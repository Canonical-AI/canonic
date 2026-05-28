<template>
  <div class="flavor-pills">
    <button class="pill" :class="{ active: modelValue === 'reviewer' }" @click="$emit('update:modelValue', 'reviewer')" title="Review mode — agent reads docs and writes comments">
      <Eye :size="12" /> Reviewer
    </button>
    <button class="pill" :class="{ active: modelValue === 'implementer' }" @click="$emit('update:modelValue', 'implementer')" title="Implement mode — agent reads docs and writes code">
      <Terminal :size="12" /> Implementer
    </button>
  </div>
</template>

<script setup>
import { Eye, Terminal } from 'lucide-vue-next'
defineProps({ modelValue: { type: String, default: 'reviewer' } })
defineEmits(['update:modelValue'])
</script>

<style scoped>
.flavor-pills { display: flex; gap: 4px; }

.pill {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.15s;
}
.pill:hover { color: var(--text-primary); border-color: var(--text-secondary); }
.pill.active {
  background: var(--accent-muted);
  color: var(--accent-light);
  border-color: var(--accent);
}
</style>
