<script setup>
import SetupAndAlgs from "@/components/timer/SetupAndAlgs.vue";
import CaseNote from "@/components/CaseNote.vue";
import {useAlgsetStore} from "@/stores/AlgsetStore";

const props = defineProps(['caseKey']);
const algset = useAlgsetStore();
</script>

<template>
  <hr class="mt-0">
  <div class="row mx-1">
    <div class="col col-auto leftCol">
      <div class="fs-7 fst-italic">{{ props.caseKey }}</div>
      <span class="fs-4 fw-bold">{{ algset.caseLabel(props.caseKey) }}</span>
    </div>
    <div class="col text-start">
      <CaseNote :caseKey="props.caseKey"/>
      <SetupAndAlgs :caseKey="props.caseKey" :maxAmount="8"/>
    </div>
  </div>
</template>

<style scoped>
.leftCol {
  border-right: 1px solid var(--bs-secondary);
}
</style>
