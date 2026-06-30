<script setup>

import {useSelectedStore} from "@/stores/SelectedStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {countLeaves} from "@/algsets/tree";
import {computed, onMounted, ref} from "vue";
import CaseCard from "@/components/select_view/CaseCard.vue";

// `node` is a subgroup node of the algset tree; its children are the cases.
const props = defineProps(['node'])
const selected = useSelectedStore();
const algset = useAlgsetStore();
const ls = useLetterSchemeStore();

const display = computed(() => algset.active.levels[1].display(props.node.value, {toLetter: s => ls.toLetter(s)}))

const num_cases_selected = computed(() => selected.numSelectedUnder(props.node.path));
const total_cases_in_subgroup = computed(() => countLeaves(props.node))

const onCardClicked = () => {
  const action = num_cases_selected.value === 0 ? selected.addNode : selected.removeNode
  action(props.node.path)
}

const card_bg_class = computed(() => {
  return (num_cases_selected.value === 0) ? "no_cases_selected" :
      (total_cases_in_subgroup.value === num_cases_selected.value)
          ? "all_cases_selected"
          : "some_cases_selected";
})

const collapseId = computed(() => `sub-${props.node.path.join('-')}`)

const subgroupCardRef = ref(null)
const isCollapsed = ref(true)
onMounted(() => {
  // guard against bubbled events from nested (case) collapses
  subgroupCardRef.value.addEventListener('show.bs.collapse', e => { if (e.target === subgroupCardRef.value) isCollapsed.value = false });
  subgroupCardRef.value.addEventListener('hide.bs.collapse', e => { if (e.target === subgroupCardRef.value) isCollapsed.value = true });
})
</script>

<template>
  <div class="border rounded-1 subgroup-card" :class="card_bg_class">
    <div
        class="header p-1 clickable border-bottom d-flex justify-content-between align-items-center"
        data-bs-toggle="collapse"
        :data-bs-target="`#${collapseId}`">
      <div>
        <strong class="text-center">
          {{ display.primary }}
        </strong>
        <small class="opacity-75 ms-1" v-if="display.secondary">{{ display.secondary }}</small>
        <span>
          ({{num_cases_selected}}/{{total_cases_in_subgroup}})
        </span>
      </div>
      <i class="bi bi-caret-down opacity-75 caret" :class="isCollapsed ? '' : 'upside_down'"></i>
    </div>
    <div class="clickable m-1 text-center py-2" @click="onCardClicked">
      <span class="fs-4 fw-bold">{{ display.primary }}</span>
    </div>
  </div>
  <div
      class="collapse multi-collapse case-well"
      ref="subgroupCardRef"
      :id="collapseId">
    <div class="row gx-0">
      <div v-for="leaf in props.node.children" :key="leaf.caseId" class="case-col">
        <CaseCard :node="leaf"/>
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

/* Separate consecutive subgroups from each other */
.subgroup-card {
  margin-top: 0.4rem;
}

/* Tinted header bar for the subgroup level (lighter than the group's,
   only when no cases are selected so it never fights the selection colours) */
.no_cases_selected > .header {
  background-color: rgba(var(--bs-primary-rgb), 0.05);
}

/* Indented "well" holding the cases, with a lighter left rail than the group's */
.case-well {
  margin: 0.4rem 0 0.15rem 0.4rem;
  padding: 0.1rem 0.25rem 0.25rem 0.5rem;
  border-left: 3px solid rgba(var(--bs-primary-rgb), 0.2);
  border-radius: 0 0.375rem 0.375rem 0;
  background-color: rgba(var(--bs-primary-rgb), 0.03);
}

/* dark mode: stronger tints so the levels stand out against the dark surfaces */
:root[data-mode="dark"] .no_cases_selected > .header {
  background-color: rgba(var(--bs-primary-rgb), 0.13);
}
:root[data-mode="dark"] .case-well {
  background-color: rgba(var(--bs-primary-rgb), 0.06);
}

/* 4 cases per row on wide screens, 2 per row below 1280px */
.case-col {
  flex: 0 0 auto;
  width: 25%;
}

@media (max-width: 1279px) {
  .case-col {
    width: 50%;
  }
}
</style>
