<script setup>
import {ref} from "vue";
import {useSettingsStore} from "@/stores/SettingsStore";

const settings = useSettingsStore();

const move = (i, dir) => {
  const arr = [...settings.store.bufferOrder];
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  settings.store.bufferOrder = arr; // reassign so the algset re-partitions
};

// Index currently being dragged, and the index it would drop before/onto.
const dragIndex = ref(-1);
const overIndex = ref(-1);

const onDragStart = (i, e) => {
  dragIndex.value = i;
  e.dataTransfer.effectAllowed = "move";
  // Firefox requires some data to be set for the drag to start.
  e.dataTransfer.setData("text/plain", String(i));
};

const onDragOver = (i) => {
  if (dragIndex.value === -1) return;
  overIndex.value = i;
};

const onDrop = (i) => {
  const from = dragIndex.value;
  if (from === -1 || from === i) return reset();
  const arr = [...settings.store.bufferOrder];
  const [moved] = arr.splice(from, 1);
  arr.splice(i, 0, moved);
  settings.store.bufferOrder = arr; // reassign so the algset re-partitions
  reset();
};

const reset = () => {
  dragIndex.value = -1;
  overIndex.value = -1;
};
</script>

<template>
  <ol class="list-group" style="max-width: 360px">
    <li
        v-for="(buf, i) in settings.store.bufferOrder" :key="buf"
        class="list-group-item d-flex align-items-center justify-content-between py-1 buffer-item"
        :class="{ dragging: dragIndex === i, 'drop-target': overIndex === i && dragIndex !== i }"
        draggable="true"
        @dragstart="onDragStart(i, $event)"
        @dragover.prevent="onDragOver(i)"
        @drop.prevent="onDrop(i)"
        @dragend="reset">
      <span class="d-flex align-items-center">
        <i class="bi bi-grip-vertical text-muted me-2 drag-handle" :title="$t('settings.buffer_order_drag')"></i>
        <span class="text-muted me-2">{{ i + 1 }}.</span><span class="fw-bold">{{ buf }}</span>
      </span>
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
.buffer-item {
  cursor: grab;
}
.buffer-item.dragging {
  opacity: 0.5;
}
.buffer-item.drop-target {
  border-top: 2px solid var(--bs-primary);
}
.drag-handle {
  cursor: grab;
}
</style>
