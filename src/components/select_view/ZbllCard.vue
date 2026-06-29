<script setup>

import {useSelectedStore} from "@/stores/SelectedStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {computed, ref} from "vue";
import ZbllCaseInfoModal from "@/components/select_view/ZbllCaseInfoModal.vue";

const props = defineProps(['zbllKey']);
const key = props.zbllKey
const selected = useSelectedStore();
const ls = useLetterSchemeStore();

const twist = key.split(' ')[2]
const twistLetter = computed(() => ls.toLetter(twist))

const is_selected = computed(() => selected.isZbllSelected(key));

const onCardClicked = () => {
  const action = is_selected.value ? selected.removeZbll : selected.addZbll
  action(key);
}

const cardBgClass = computed(() => {
  return is_selected.value ? "all_cases_selected" : "no_cases_selected";
})

const infoShown = ref(false)
</script>

<template>
  <div class="border rounded-1" :class="cardBgClass">
    <div class="header p-1 border-bottom d-flex justify-content-between align-items-center">
      <small class="opacity-75">{{ twist }}</small>
      <i class="bi bi-info-circle opacity-75 clickable" @click="infoShown=true"></i>
    </div>
    <div class="m-1 text-center clickable py-2" @click="onCardClicked">
      <span class="fs-5 fw-bold">{{ twistLetter }}</span>
    </div>
  </div>
  <ZbllCaseInfoModal v-if="infoShown" :zbllKey="key" :closeCallback="() => infoShown=false"/>
</template>

<style scoped>
.header {
  cursor: default;
}
</style>
