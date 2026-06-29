<script setup>
import {computed} from "vue";
import SetupAndAlgs from "@/components/timer/SetupAndAlgs.vue";
import CaseNote from "@/components/CaseNote.vue";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {parseLtctKey} from "@/helpers/helpers";

const props = defineProps(['caseKey']);
const ls = useLetterSchemeStore();
const parsed = computed(() => parseLtctKey(props.caseKey, ls.toLetter));
</script>

<template>
  <hr class="mt-0">
  <div class="row mx-1">
    <div class="col col-auto leftCol">
      <div class="fs-7 fst-italic">{{ props.caseKey }}</div>
      <span class="fs-4 fw-bold">{{ parsed.letters }}</span>
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
