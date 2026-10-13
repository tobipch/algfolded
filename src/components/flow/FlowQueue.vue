<script setup>
import {computed} from "vue";
import {useFlowStore} from "@/stores/FlowStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {msToClock} from "@/helpers/time_formatter";

// The current case and the four after it: the header, the labels, and the two
// lines of text under them. No scramble, no timer display, no cube — the point
// of flow is that there is nothing on screen but what to execute next.
//
// The list scrolls rather than turning pages: a finished case slides out at the
// top and everything moves up one, so the next case is always already in view
// while the current one is being turned.
const props = defineProps({
  clockMs: {type: Number, default: 0},
  wrongFeedback: {type: Boolean, default: false},
})
defineEmits(['finish'])

const flow = useFlowStore()
const algset = useAlgsetStore()

const label = (key) => algset.caseLabel(key)
const progressPct = computed(() => Math.round(flow.progress * 100))
const clock = computed(() => msToClock(props.clockMs))
</script>

<template>
  <div class="flow-page">
    <div class="flow-head d-flex align-items-center gap-3 flex-wrap mb-2">
      <span class="flow-clock">{{ clock }}</span>
      <button class="btn btn-outline-danger btn-sm ms-auto"
              type="button" tabindex="-1"
              @keydown.space.prevent=""
              @click="$emit('finish')">
        {{ $t('flow.finish') }}
      </button>
    </div>

    <div class="d-flex align-items-center gap-2 mb-3">
      <div class="flow-progress" role="progressbar"
           :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100">
        <div class="flow-progress-bar" :style="{width: progressPct + '%'}"></div>
      </div>
      <span class="text-muted small text-nowrap">
        {{ flow.completedCases }} / {{ flow.totalCases }}
      </span>
    </div>

    <TransitionGroup tag="div" name="flow-scroll" class="flow-cases">
      <div
          v-for="item in flow.visibleCases"
          :key="item.index"
          class="flow-case"
          :class="'is-' + item.state">
        <!-- re-keyed on every wrong flag, so the shake replays -->
        <span :key="item.state === 'wrong' ? flow.wrongFlash : 0" class="flow-case-label">
          {{ label(item.key) }}
        </span>
      </div>
    </TransitionGroup>

    <p class="flow-feedback mt-3 mb-0" :class="{invisible: !wrongFeedback}">
      {{ $t('flow.wrong_execution') }}
    </p>

    <slot/>

    <p class="text-muted small flow-hint mb-0">
      {{ flow.tracked ? $t('flow.hint_cube') : $t('flow.hint_manual') }}
    </p>
  </div>
</template>

<style scoped>
.flow-page {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  text-align: center;
  width: min(900px, 100%);
  margin: 0 auto;
  padding-top: 0.5rem;
}
.flow-head {
  text-align: left;
}
.flow-clock {
  font-variant-numeric: tabular-nums;
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1;
}
.flow-progress {
  height: 4px;
  flex: 1 1 auto;
  background-color: rgba(128, 128, 128, 0.25);
  border-radius: 2px;
  overflow: hidden;
}
.flow-progress-bar {
  height: 100%;
  background-color: var(--bs-primary);
  transition: width 0.2s ease-in-out;
}
.flow-cases {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: clamp(0.4rem, 1.5vh, 1.25rem);
  flex: 1 1 auto;
  min-height: 0;
  /* the current case keeps its place at the top; the run's last cases just
     leave the slots below empty */
  justify-content: flex-start;
  /* full-width rows, text centred: a finished row taken out of the flow for
     its exit keeps exactly its box, so the scroll does not see it move
     sideways */
  align-items: stretch;
  padding-top: clamp(0.5rem, 4vh, 2.5rem);
  /* the finished case leaves through the top edge */
  overflow: hidden;
}
.flow-case {
  font-size: clamp(1.75rem, min(10vw, 9vh), 5rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.1em;
  opacity: 0.35;
  transition: opacity 0.15s ease-in-out, color 0.15s ease-in-out;
}
.flow-case-label {
  display: inline-block;
}
.flow-case.is-current {
  opacity: 1;
}
.flow-case.is-wrong {
  opacity: 1;
  color: var(--bs-danger);
}
.flow-case.is-wrong .flow-case-label {
  animation: flow-case-shake 0.45s ease-in-out;
}
/* The scroll: everything moves up one slot, the finished case leaves at the
   top in green, the newly visible one fades in at the bottom. */
.flow-scroll-move {
  transition: transform 0.2s ease-out;
}
.flow-scroll-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  color: var(--bs-success);
  transition: transform 0.2s ease-out, opacity 0.2s ease-out;
}
.flow-scroll-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
.flow-scroll-enter-active {
  transition: opacity 0.2s ease-out;
}
.flow-scroll-enter-from {
  opacity: 0;
}
@keyframes flow-case-shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-16px); }
  30% { transform: translateX(14px); }
  45% { transform: translateX(-10px); }
  60% { transform: translateX(7px); }
  75% { transform: translateX(-4px); }
}
@media (prefers-reduced-motion: reduce) {
  .flow-case.is-wrong .flow-case-label { animation: none; }
  .flow-scroll-move, .flow-scroll-leave-active, .flow-scroll-enter-active { transition: none; }
}
.flow-feedback {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--bs-danger);
  min-height: 1.6rem;
}
.flow-hint {
  margin-top: auto;
  padding-top: 0.75rem;
}
</style>
