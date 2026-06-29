<script setup>

import {useSelectedStore} from "@/stores/SelectedStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {computed, onMounted, ref} from "vue";
import CaseCard from "@/components/select_view/CaseCard.vue";

const props = defineProps(['group', 'subgroup'])
const {group, subgroup}  = props;
const selected = useSelectedStore();
const ls = useLetterSchemeStore();

const subgroupLetter = computed(() => ls.toLetter(subgroup))

const num_cases_selected = computed(() => selected.numCasesInSubgroupSelected(group, subgroup));
const total_cases_in_subgroup = selected.allCaseKeysArray.filter(key => key.startsWith(`${group} ${subgroup}`)).length

const caseNames = selected.allCaseKeysArray
    .filter(key => key.startsWith(`${group} ${subgroup}`))
    .map(key => key.split(' ')[2])

const onCardClicked = () => {
  const action = num_cases_selected.value === 0 ? selected.addSubgroup : selected.removeSubgroup
  action(group, subgroup)
}

const card_bg_class = computed(() => {
  return (num_cases_selected.value === 0) ? "no_cases_selected" :
      (total_cases_in_subgroup === num_cases_selected.value)
          ? "all_cases_selected"
          : "some_cases_selected";
})

const collapseId = `collapsed-cases-${group}-${subgroup}`

const subgroupCardRef = ref(null)
const isCollapsed = ref(true)
onMounted(() => {
  subgroupCardRef.value.addEventListener('show.bs.collapse', () => isCollapsed.value = false);
  subgroupCardRef.value.addEventListener('hide.bs.collapse', () => isCollapsed.value = true);
})
</script>

<template>
  <div class="border rounded-1" :class="card_bg_class">
    <div
        class="header p-1 clickable border-bottom d-flex justify-content-between align-items-center"
        data-bs-toggle="collapse"
        :data-bs-target="`#${collapseId}`">
      <div>
        <strong class="text-center">
          {{ subgroupLetter }}
        </strong>
        <small class="opacity-75 ms-1">{{ subgroup }}</small>
        <span>
          ({{num_cases_selected}}/{{total_cases_in_subgroup}})
        </span>
      </div>
      <i class="bi bi-caret-down opacity-75 caret" :class="isCollapsed ? '' : 'upside_down'"></i>
    </div>
    <div class="clickable m-1 text-center py-2" @click="onCardClicked">
      <span class="fs-4 fw-bold">{{ subgroupLetter }}</span>
    </div>
  </div>
  <div
      class="collapse multi-collapse"
      ref="subgroupCardRef"
      :id="collapseId">
    <div class="row gx-0">
      <div v-for="caseName in caseNames" :key="caseName" class="case-col">
        <CaseCard :caseKey="`${group} ${subgroup} ${caseName}`"/>
      </div>
    </div>
  </div>
</template>

<style scoped>
.caret {
  transition: transform 0.2s
}

.upside_down {
  transform: rotate(180deg);
}

/* 4 cases per row on wide screens, 2 per row below 1024px */
.case-col {
  flex: 0 0 auto;
  width: 25%;
}

@media (max-width: 1023px) {
  .case-col {
    width: 50%;
  }
}
</style>
