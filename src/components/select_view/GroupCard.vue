<script setup>

import {useSelectedStore} from "@/stores/SelectedStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {countLeaves} from "@/algsets/tree";
import {computed, onMounted, ref} from "vue";
import SubgroupCard from "@/components/select_view/SubgroupCard.vue";

// `node` is a top-level (group) node of the algset tree.
const props = defineProps(['node'])
const selected = useSelectedStore();
const algset = useAlgsetStore();
const ls = useLetterSchemeStore();

const display = computed(() => algset.active.levels[0].display(props.node.value, {toLetter: s => ls.toLetter(s)}))
const collapseId = computed(() => `grp-${props.node.path.join('-')}`)

const num_cases_selected = computed(() => selected.numSelectedUnder(props.node.path));
const total_cases_in_group = computed(() => countLeaves(props.node))

const onCardClicked = () => {
  const action = num_cases_selected.value === 0 ? selected.addNode : selected.removeNode
  action(props.node.path)
}

const card_bg_class = computed(() => {
  return (num_cases_selected.value === 0) ? "no_cases_selected" :
      (total_cases_in_group.value === num_cases_selected.value)
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
        :data-bs-target="`#${collapseId}`">
      <div>
        <strong class="text-center">
          {{ display.primary }}
        </strong>&nbsp;<span>({{ num_cases_selected }}/{{ total_cases_in_group }})</span>
      </div>
      <i class="bi bi-caret-down opacity-75 caret" :class="isCollapsed ? '' : 'upside_down'"></i>
    </div>
    <div class="clickable m-1 text-center py-2" @click="onCardClicked">
      <span class="fs-2 fw-bold">{{ display.primary }}</span>
    </div>
  </div>
  <div
      class="text-center collapse multi-collapse subgroup-well"
      ref="groupCardRef"
      :id="collapseId">
    <SubgroupCard v-for="child in props.node.children"
              :key="child.value"
              :node="child"
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
