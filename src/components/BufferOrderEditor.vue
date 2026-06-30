<script setup>
import {useSettingsStore} from "@/stores/SettingsStore";

const settings = useSettingsStore();

const move = (i, dir) => {
  const arr = [...settings.store.bufferOrder];
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  settings.store.bufferOrder = arr; // reassign so the algset re-partitions
};
</script>

<template>
  <ol class="list-group" style="max-width: 360px">
    <li
        v-for="(buf, i) in settings.store.bufferOrder" :key="buf"
        class="list-group-item d-flex align-items-center justify-content-between py-1">
      <span><span class="text-muted me-2">{{ i + 1 }}.</span><span class="fw-bold">{{ buf }}</span></span>
      <span class="btn-group btn-group-sm">
        <button class="btn btn-outline-secondary py-0" :disabled="i === 0"
                tabindex="-1" @keydown.space.prevent="" @click="move(i, -1)">
          <i class="bi bi-chevron-up"></i>
        </button>
        <button class="btn btn-outline-secondary py-0" :disabled="i === settings.store.bufferOrder.length - 1"
                tabindex="-1" @keydown.space.prevent="" @click="move(i, 1)">
          <i class="bi bi-chevron-down"></i>
        </button>
      </span>
    </li>
  </ol>
</template>

<style scoped>
</style>
