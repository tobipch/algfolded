<script setup>

import {useSelectedStore} from "@/stores/SelectedStore";
import {computed, onMounted, ref} from "vue";
import SubgroupCard from "@/components/select_view/SubgroupCard.vue";

const props = defineProps(['group'])
const {group} = props;
const selected = useSelectedStore();
const num_cases_selected = computed(() => selected.numCasesInGroupSelected(group));

const total_cases_in_group = selected.allCaseKeysArray.filter(key => key.startsWith(group)).length
const onCardClicked = () => {
  const action = num_cases_selected.value === 0 ? selected.addGroup : selected.removeGroup
  action(group)
}

const subgroups = selected.allCaseKeysArray
    .filter(key => key.startsWith(group))
    .map(key => key.split(' ')[1])
    .filter((item, index, self) => self.indexOf(item) === index);

const card_bg_class = computed(() => {
  return (num_cases_selected.value === 0) ? "no_cases_selected" :
      (total_cases_in_group === num_cases_selected.value)
          ? "all_cases_selected"
          : "some_cases_selected";
})

const groupCardRef = ref(null)
const isCollapsed = ref(true)
onMounted(() => {
  // guard against bubbled events from nested (subgroup/case) collapses
  groupCardRef.value.addEventListener('show.bs.collapse', e => { if (e.target === groupCardRef.value) isCollapsed.value = false });
  groupCardRef.value.addEventListener('hide.bs.collapse', e => { if (e.target === groupCardRef.value) isCollapsed.value = true });
})

</script>

<template>
  <div class="border rounded-1" :class="card_bg_class">
    <div
        class="header p-1 clickable border-bottom d-flex justify-content-between align-items-center"
        data-bs-toggle="collapse"
        :data-bs-target="`#collapsed-subgroups-${group}`">
      <div>
        <strong class="text-center">
          {{ props.group }}
        </strong>&nbsp;<span>({{ num_cases_selected }}/{{ total_cases_in_group }})</span>
      </div>
      <i class="bi bi-caret-down opacity-75 caret" :class="isCollapsed ? '' : 'upside_down'"></i>
    </div>
    <div class="clickable m-1 text-center py-2" @click="onCardClicked">
      <span class="fs-2 fw-bold">{{ group }}</span>
    </div>
  </div>
  <div
      class="text-center collapse multi-collapse subgroup-well"
      ref="groupCardRef"
      :id="`collapsed-subgroups-${group}`">
    <SubgroupCard v-for="subgroup in subgroups"
              :key="group+subgroup"
              :group="group"
              :subgroup="subgroup"
    />
  </div>
</template>

<style scoped>
.caret {
  transition: transform 0.2s
}

.upside_down {
  transform: rotate(180deg);
}

/* Tinted header bar for the group level (only when no cases are selected,
   so it never fights the yellow/green selection colours) */
.no_cases_selected > .header {
  background-color: rgba(var(--bs-primary-rgb), 0.08);
}

/* Indented "well" holding the subgroups, with a soft primary left rail */
.subgroup-well {
  margin: 0.5rem 0 0.25rem;
  padding: 0.1rem 0.3rem 0.35rem 0.6rem;
  border-left: 3px solid rgba(var(--bs-primary-rgb), 0.35);
  border-radius: 0 0.375rem 0.375rem 0;
  background-color: rgba(var(--bs-primary-rgb), 0.04);
}

/* dark mode: stronger tints so the levels stand out against the dark surfaces */
:root[data-mode="dark"] .no_cases_selected > .header {
  background-color: rgba(var(--bs-primary-rgb), 0.20);
}
:root[data-mode="dark"] .subgroup-well {
  background-color: rgba(var(--bs-primary-rgb), 0.08);
}
</style>
