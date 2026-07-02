<script setup>
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore";
import {computed} from "vue";
import {inverseScramble} from "@/helpers/scramble_utils";
const props = defineProps(['caseKey', 'maxAmount']);
const algset = useAlgsetStore();
const prefs = usePreferredAlgStore();

const algs = computed(() => algset.byId[props.caseKey]?.algs ?? [])

// The alg the user picked for this case; falls back to the collection's first.
const preferred = computed(() => {
  const p = prefs.store[props.caseKey]
  return p && algs.value.includes(p) ? p : (algs.value[0] ?? null)
})

// Keep the collection order, but make sure the preferred alg stays visible
// even when it sits beyond the maxAmount cutoff.
const suggestedAlgs = computed(() => {
  const list = algs.value.slice(0, props.maxAmount)
  if (preferred.value && !list.includes(preferred.value)) list.push(preferred.value)
  return list
})

const setup = computed(() => preferred.value ? inverseScramble(preferred.value) : '')

// Click an alg to make it "yours"; clicking the current pick clears the choice.
const onAlgClick = (alg) => {
  prefs.setPreferred(props.caseKey, prefs.store[props.caseKey] === alg ? null : alg)
}
</script>

<template>
  <template v-if="algs.length > 0">
    <div>{{ $t("result_card.setup_moves") }}: <strong>{{setup}}</strong></div>
    <div class="mt-2">
      {{ $t("result_card.algorithms_collection") }}:
      <small class="text-muted ms-1">{{ $t("result_card.choose_alg_hint") }}</small>
    </div>
    <div>
      <ul>
        <li
            v-for="alg in suggestedAlgs"
            :key="alg"
            class="alg-item"
            :class="alg === preferred ? 'fw-bold preferred' : ''"
            @click="onAlgClick(alg)"
        >
          <i class="bi me-1" :class="alg === preferred ? 'bi-check-circle-fill text-success' : 'bi-circle opacity-50'"/>
          {{alg}}
        </li>
      </ul>
    </div>
  </template>
  <div v-else class="text-muted fst-italic">{{ $t("select.no_alg") }}</div>

</template>

<style scoped>
ul {
  list-style-type: none;
  padding-left: 0;
}
.alg-item {
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 4px;
}
.alg-item:hover {
  background: var(--bs-secondary-bg, rgba(128, 128, 128, 0.15));
}
</style>
