<script setup>
import SetupAndAlgs from "@/components/timer/SetupAndAlgs.vue";
import CaseNote from "@/components/CaseNote.vue";
import CubePicture from "@/components/timer/CubePicture.vue";
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore";
import {useCustomAlgsStore} from "@/stores/CustomAlgsStore";
import {useSessionStore} from "@/stores/SessionStore";
import {computed, ref} from "vue";
import {inverseScramble, algToMoveString} from "@/helpers/scramble_utils";

const props = defineProps(['caseKey']);
const prefs = usePreferredAlgStore();
const custom = useCustomAlgsStore();
const session = useSessionStore();

// The case as it appears on the cube: apply the inverse of the user's
// (preferred, or first) alg to a solved cube.
const algs = computed(() => custom.mergedAlgs(props.caseKey))
const preferred = computed(() => {
  const p = prefs.store[props.caseKey]
  return p && algs.value.includes(p) ? p : (algs.value[0] ?? null)
})
const setup = computed(() => preferred.value ? inverseScramble(algToMoveString(preferred.value)) : '')

// Practice stats from the spaced-repetition data: EMA of recent times + count.
const srs = computed(() => session.srsData[props.caseKey])
const avgTime = computed(() => srs.value?.a != null ? srs.value.a.toFixed(1) + 's' : null)
const solveCount = computed(() => srs.value?.n ?? 0)

// Play an alg from the list on the case picture (commutator notation
// expanded to plain moves for the player).
const cubeRef = ref(null)
const onPlay = (alg) => cubeRef.value?.playAlg(algToMoveString(alg))
</script>

<template>
  <div class="d-flex flex-wrap align-items-start gap-3">
    <div v-if="setup" class="cube-col flex-shrink-0 mx-auto">
      <CubePicture ref="cubeRef" :scramble="setup"/>
    </div>
    <div class="flex-grow-1 info-col">
      <div v-if="solveCount > 0" class="d-flex gap-2 mb-3" :title="$t('select.avg_time_title')">
        <div class="stat-tile">
          <div class="stat-value">{{ avgTime }}</div>
          <div class="stat-label">{{ $t("select.avg_time") }}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-value">{{ solveCount }}</div>
          <div class="stat-label">{{ $t("select.solves") }}</div>
        </div>
      </div>
      <div v-else class="mb-3 opacity-50 fst-italic">
        <i class="bi bi-stopwatch"></i> {{ $t("select.not_solved_yet") }}
      </div>
      <CaseNote :caseKey="props.caseKey"/>
      <SetupAndAlgs :caseKey="props.caseKey" :maxAmount="8" :playable="!!setup" @play="onPlay"/>
    </div>
  </div>
</template>

<style scoped>
.info-col {
  min-width: 0;
  flex-basis: 300px;
}

.stat-tile {
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  padding: 0.35rem 1rem;
  text-align: center;
  background-color: rgba(var(--bs-primary-rgb), 0.05);
}

:root[data-mode="dark"] .stat-tile {
  background-color: rgba(var(--bs-primary-rgb), 0.12);
}

.stat-value {
  font-weight: 700;
  font-size: 1.15rem;
  line-height: 1.2;
}

.stat-label {
  font-size: 0.7rem;
  opacity: 0.65;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
