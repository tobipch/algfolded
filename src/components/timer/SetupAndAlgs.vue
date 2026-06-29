<script setup>
import ltct_map from "@/assets/ltct_map.json"
import {computed} from "vue";
import {inverseScramble} from "@/helpers/scramble_utils";
const props = defineProps(['caseKey', 'maxAmount']);

const algs = computed(() => ltct_map[props.caseKey].algs)
const suggestedAlgs = computed(() => algs.value.slice(0, props.maxAmount))
const setup = computed(() => algs.value.length > 0 ? inverseScramble(algs.value[0]) : '')

</script>

<template>
  <template v-if="algs.length > 0">
    <div>{{ $t("result_card.setup_moves") }}: <strong>{{setup}}</strong></div>
    <div class="mt-2">{{ $t("result_card.algorithms_collection") }}:</div>
    <div>
      <ul>
        <li
            v-for="(alg, i) in suggestedAlgs"
            :key="alg"
            :class="i === 0 ? 'fw-bold' : ''"
        >
          {{alg}}
        </li>
      </ul>
    </div>
  </template>
  <div v-else class="text-muted">No algorithm available</div>

</template>

<style scoped>
ul {
  list-style-type: none;
  padding-left: 0;
}
ul li::before {
  content: "·";
  margin-right: 4px;
}
</style>