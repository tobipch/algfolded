<script setup>

import {useSelectedStore} from "@/stores/SelectedStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {computed, onMounted, ref} from "vue";
import ZbllCard from "@/components/select_view/ZbllCard.vue";

const props = defineProps(['oll', 'coll'])
const {oll, coll}  = props;
const selected = useSelectedStore();
const ls = useLetterSchemeStore();

const collLetter = computed(() => ls.toLetter(coll))

const num_cases_selected = computed(() => selected.numZbllsInCollSelected(oll, coll));
const total_zblls_in_coll = selected.allZbllKeysArray.filter(key => key.startsWith(`${oll} ${coll}`)).length

const zbllNames = selected.allZbllKeysArray
    .filter(key => key.startsWith(`${oll} ${coll}`))
    .map(key => key.split(' ')[2])

const onCardClicked = () => {
  const action = num_cases_selected.value === 0 ? selected.addColl : selected.removeColl
  action(oll, coll)
}

const card_bg_class = computed(() => {
  return (num_cases_selected.value === 0) ? "no_cases_selected" :
      (total_zblls_in_coll === num_cases_selected.value)
          ? "all_cases_selected"
          : "some_cases_selected";
})

const collapseId = `collapsed-zblls-${oll}-${coll}`

const collCardRef = ref(null)
const isCollapsed = ref(true)
onMounted(() => {
  collCardRef.value.addEventListener('show.bs.collapse', () => isCollapsed.value = false);
  collCardRef.value.addEventListener('hide.bs.collapse', () => isCollapsed.value = true);
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
          {{ collLetter }}
        </strong>
        <small class="opacity-75 ms-1">{{ coll }}</small>
        <span>
          ({{num_cases_selected}}/{{total_zblls_in_coll}})
        </span>
      </div>
      <i class="bi bi-caret-down opacity-75 caret" :class="isCollapsed ? '' : 'upside_down'"></i>
    </div>
    <div class="clickable m-1 text-center py-2" @click="onCardClicked">
      <span class="fs-4 fw-bold">{{ collLetter }}</span>
    </div>
  </div>
  <div
      class="collapse multi-collapse"
      ref="collCardRef"
      :id="collapseId">
    <div class="row gx-0">
      <div v-for="zbll in zbllNames" :key="zbll" class="col-3">
        <ZbllCard :zbllKey="`${oll} ${coll} ${zbll}`"/>
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
</style>
