<script setup>

import {useSelectedStore} from "@/stores/SelectedStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {computed, ref} from "vue";
import CaseInfoModal from "@/components/select_view/CaseInfoModal.vue";

// `node` is a leaf node of the algset tree; node.caseId is the case key.
const props = defineProps(['node']);
const key = computed(() => props.node.caseId)
const selected = useSelectedStore();
const algset = useAlgsetStore();
const ls = useLetterSchemeStore();

const caseLevel = computed(() => algset.active.levels[algset.active.levels.length - 1])
const display = computed(() => caseLevel.value.display(props.node.value, {toLetter: s => ls.toLetter(s)}))

const is_selected = computed(() => selected.isCaseSelected(key.value));

const onCardClicked = () => {
  const action = is_selected.value ? selected.removeCase : selected.addCase
  action(key.value);
}

const cardBgClass = computed(() => {
  return is_selected.value ? "all_cases_selected" : "no_cases_selected";
})

const infoShown = ref(false)
</script>

<template>
  <div class="border rounded-1" :class="cardBgClass">
    <div class="header p-1 border-bottom d-flex justify-content-between align-items-center">
      <small class="opacity-75">{{ display.secondary }}</small>
      <i class="bi bi-info-circle opacity-75 clickable" @click="infoShown=true"></i>
    </div>
    <div class="m-1 text-center clickable py-2" @click="onCardClicked">
      <span class="fs-5 fw-bold">{{ display.primary }}</span>
    </div>
  </div>
  <CaseInfoModal v-if="infoShown" :caseKey="key" :closeCallback="() => infoShown=false"/>
</template>

<style scoped>
.header {
  cursor: default;
}
</style>
