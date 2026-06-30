<script setup>
import GroupCard from "@/components/select_view/GroupCard.vue";
import {useAlgsetStore} from "@/stores/AlgsetStore";

// Render the first hierarchy level from the active algset's tree.
const algset = useAlgsetStore()
</script>

<template>
  <div v-if="!algset.loaded" class="text-center text-muted py-4">
    <span class="spinner-border spinner-border-sm me-2" role="status"></span>{{ $t("select.loading") }}
  </div>
  <div v-else class="group-grid">
    <div v-for="node in algset.tree" :key="node.value" class="group-grid-item">
      <GroupCard :node="node"/>
    </div>
  </div>
</template>

<style scoped>
.group-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.group-grid-item {
  flex: 1 0 0%;
  min-width: 0;
}

/* 2 columns below 768px */
@media (max-width: 767px) {
  .group-grid-item {
    flex: 0 0 calc(50% - 6px);
  }
}

/* 1 column below 380px */
@media (max-width: 379px) {
  .group-grid-item {
    flex: 0 0 100%;
  }
}
</style>
