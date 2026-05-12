<template>
  <div class="block-handle-inner" draggable="true">
    <GripVertical :size="14" />
  </div>
</template>

<script setup>
import { GripVertical } from 'lucide-vue-next'
</script>

<style scoped>
.block-handle-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 24px;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: grab;
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.block-handle-inner:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
