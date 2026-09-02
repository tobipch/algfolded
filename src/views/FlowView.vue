<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {useI18n} from "vue-i18n";
import FlowPage from "@/components/flow/FlowPage.vue";
import FlowSummary from "@/components/flow/FlowSummary.vue";
import AlgHint from "@/components/timer/AlgHint.vue";
import {useFlowStore, PAGE_ADVANCE_MS} from "@/stores/FlowStore";
import {useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useBluetoothCubeStore} from "@/stores/BluetoothCubeStore";
import {useDisplayStore} from "@/stores/DisplayStore";

// Flow mode. Five cases at a time, back to back, nothing else on screen.
//
// Detection is the letter-pair mechanism the timer already uses: the virtual
// cube is set to the case's scrambled state and the case is done the moment
// the user's moves bring it back to solved. Because that tracks relative moves
// only, the physical cube can be in any state and nothing has to be
// re-scrambled between cases — which is exactly what makes a page possible.
const {t} = useI18n()
const router = useRouter()
const flow = useFlowStore()
const session = useSessionStore()
const settings = useSettingsStore()
const selected = useSelectedStore()
const algset = useAlgsetStore()
const bt = useBluetoothCubeStore()
const display = useDisplayStore()

const showHint = ref(false)
const wrongFeedback = ref(false)
const clockMs = ref(0)
let ticker = null
let advanceTimer = null

const currentKey = computed(() => flow.currentCase?.key ?? null)

const beginRun = () => {
  if (selected.totalCasesSelected() === 0 || !algset.loaded) {
    router.replace('select')
    return
  }
  showHint.value = false
  wrongFeedback.value = false
  flow.start({pages: settings.store.flowPages, tracked: bt.connected})
}

// --- arming ---------------------------------------------------------------

// Every arm (a new case, or a retry against the cube as it is now) re-inits
// the virtual cube from the case's scramble.
//
// Sync flush: the cube has to be armed in the same task that puts the case on
// screen. Waiting for the next tick leaves a window in which the user has
// already seen the case and started turning, and those first moves are dropped
// on the floor — which reads as the app being slow to catch up.
watch(() => flow.armSeq, () => {
  showHint.value = false
  wrongFeedback.value = false
  const item = flow.currentCase
  if (bt.connected && item?.scramble) bt.startTracking(item.scramble)
}, {flush: 'sync'})

// The cube arriving mid-run does not change how the run is scored (that was
// fixed at start), but the current case can still be armed against it.
watch(() => bt.connected, (isConnected) => {
  if (isConnected && flow.active && !flow.finished && flow.currentCase?.scramble) {
    bt.startTracking(flow.currentCase.scramble)
  }
})

// --- cube events ----------------------------------------------------------

// Sync flush: onMove can drive the phase through 'solving' and on to 'idle'
// inside one event when a single move already completes the case. A batched
// watcher would only ever see the final value and lose the first move.
watch(() => bt.phase, (phase, oldPhase) => {
  if (!flow.active || flow.finished || !flow.tracked) return

  if (oldPhase === 'awaiting_solve' && (phase === 'solving' || phase === 'idle')) {
    flow.noteMove()
  }
  if (oldPhase === 'solving' && phase === 'idle') {
    finishCase()
    return
  }
  // Back at the case's start position: the attempt was undone rather than
  // finished, so it is booked as recovery and the case is re-armed.
  if (oldPhase === 'solving' && phase === 'awaiting_solve') {
    flow.retryCurrent()
  }
}, {flush: 'sync'})

const finishCase = () => {
  // Read the move count before recording: recording consumes the moves for
  // algorithm detection.
  const moves = (bt.lastSolveMoves || []).length
  const pageDone = flow.completeCurrent(moves)
  wrongFeedback.value = false
  if (!pageDone) return
  // Hold the fifth case green for a moment, then swap the whole page.
  clearTimeout(advanceTimer)
  advanceTimer = setTimeout(() => {
    advanceTimer = null
    flow.nextPage()
  }, PAGE_ADVANCE_MS)
}

// D4 / U4: start this case over against the cube as it is now.
watch(() => bt.resetSignal, (v) => {
  if (!v || !flow.active || flow.finished || !flow.tracked) return
  flow.retryCurrent()
  display.showToast(t('flow.case_reset_toast'), 'info')
})

// The cube stopped in a state this case cannot reach: a wrong execution.
watch(() => bt.tooFarFromSolved, (far) => {
  if (!far || !flow.active || flow.finished || !flow.tracked) return
  flow.noteWrong()
  wrongFeedback.value = true
})

// L4: reveal the current case's algorithm.
watch(() => bt.hintSignal, (v) => { if (v) showHint.value = true })

// --- keyboard -------------------------------------------------------------

const onKeyDown = (e) => {
  if (e.key === "Escape") {
    e.preventDefault()
    if (!flow.finished) flow.finish()
    return
  }
  if (e.key.toLowerCase() === "h" && e.altKey) {
    e.preventDefault()
    if (currentKey.value) showHint.value = !showHint.value
    return
  }
  if (e.key !== " " || flow.finished) return
  e.preventDefault()
  if (e.repeat) return
  // Without a cube nothing inside a page can be measured, so space is the
  // only control: it turns the page.
  if (!flow.tracked) flow.advancePageManually()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  // Flow always arms cases the letter-pair way, whatever the global setting.
  bt.forceLetterPair = true
  beginRun()
  ticker = setInterval(() => { clockMs.value = flow.elapsedMs() }, 100)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  clearTimeout(advanceTimer)
  if (ticker) clearInterval(ticker)
  bt.forceLetterPair = false
  if (bt.connected) bt.resetTracking()
  flow.reset()
})
</script>

<template>
  <div class="flow-view d-flex flex-column flex-grow-1">
    <FlowSummary v-if="flow.finished" @again="beginRun"/>
    <FlowPage
        v-else
        :clockMs="clockMs"
        :wrongFeedback="wrongFeedback"
        @finish="flow.finish()">
      <AlgHint v-if="showHint && currentKey" :caseKey="currentKey"/>
    </FlowPage>
  </div>
</template>

<style scoped>
.flow-view {
  min-height: 0;
}
</style>
