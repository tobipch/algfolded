<script setup>
import {computed} from "vue";
import {useSessionStore} from "@/stores/SessionStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import SetupAndAlgs from "@/components/timer/SetupAndAlgs.vue";
import CaseNote from "@/components/CaseNote.vue";
import CubePicture from "@/components/timer/CubePicture.vue";
import RepeatSoonButton from "@/components/timer/RepeatSoonButton.vue";

// Untimed practice: shows the case just completed (with its algorithms and
// the "repeat soon" button) where the timed flow shows the result card.
const session = useSessionStore();
const algset = useAlgsetStore();
const last = computed(() => session.lastPracticed)
</script>

<template>
  <div v-if="last" class="card">
    <div class="card-body p-2 p-sm-3">
      <h5 class="mb-0 d-flex align-items-center flex-wrap gap-1">
        <span class="flex-grow-1">
          {{ $t("result_card.last_case") }}
          <span class="fw-bold mx-1">{{ algset.caseLabel(last.key) }}</span>
          <small class="opacity-75" v-if="algset.caseSecondary(last.key)">({{ algset.caseSecondary(last.key) }})</small>
        </span>
        <RepeatSoonButton :caseKey="last.key"/>
      </h5>
      <hr class="my-1 my-sm-3">
      <div class="d-flex align-items-start">
        <div class="flex-grow-1 min-width-0">
          <CaseNote :caseKey="last.key"/>
          <p class="card-text my-0 my-sm-1">
            <SetupAndAlgs :caseKey="last.key" :maxAmount="3"/>
          </p>
        </div>
        <div class="cube-picture-col ms-2">
          <CubePicture :scramble="last.scramble"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cube-picture-col {
  flex-shrink: 0;
  min-width: 120px;
}
</style>
