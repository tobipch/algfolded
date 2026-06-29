<script setup>
import GroupCard from "@/components/select_view/GroupCard.vue";
import {useSelectedStore} from "@/stores/SelectedStore";

const select = useSelectedStore()

const groups = select.allCaseKeysArray
    .map(key => key.split(' ')[0])
    .filter((group, i, arr) => arr.indexOf(group) === i);

</script>

<template>
  <div class="group-grid">
    <div v-for="group in groups" :key="group" class="group-grid-item">
      <GroupCard :group="group"/>
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

/* 2 columns below 600px */
@media (max-width: 599px) {
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
