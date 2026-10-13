<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {useI18n} from "vue-i18n";
import FlowQueue from "@/components/flow/FlowQueue.vue";
import FlowSummary from "@/components/flow/FlowSummary.vue";
import AlgHint from "@/components/timer/AlgHint.vue";
import {useFlowStore} from "@/stores/FlowStore";
import {useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useBluetoothCubeStore} from "@/stores/BluetoothCubeStore";
import {useDisplayStore} from "@/stores/DisplayStore";
import {useCustomAlgsStore} from "@/stores/CustomAlgsStore";
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore";
import {splitCombined} from "@/helpers/cancellation";

// Flow mode. One case after another, the next four already in view, back to
// back, nothing else on screen.
//
// Detection is the letter-pair mechanism the timer already uses: the virtual
// cube is set to the case's scrambled state and the case is done the moment
// the user's moves bring it back to solved. Because that tracks relative moves
// only, the physical cube can be in any state and nothing has to be
// re-scrambled between cases — which is exactly what makes back to back
// possible.
const {t} = useI18n()
const router = useRouter()
const flow = useFlowStore()
const session = useSessionStore()
const settings = useSettingsStore()
const selected = useSelectedStore()
const algset = useAlgsetStore()
const bt = useBluetoothCubeStore()
const display = useDisplayStore()
const customAlgs = useCustomAlgsStore()
const prefs = usePreferredAlgStore()

const showHint = ref(false)
const wrongFeedback = ref(false)
const clockMs = ref(0)
let ticker = null
// Two cases are being booked in one go; the cube is armed once, afterwards.
let bookingTwo = false

const currentKey = computed(() => flow.currentCase?.key ?? null)

const beginRun = () => {
  if (selected.totalCasesSelected() === 0 || !algset.loaded) {
    router.replace('select')
    return
  }
  showHint.value = false
  wrongFeedback.value = false
  flow.start({cases: settings.store.flowCases, tracked: bt.connected})
}

// --- arming ---------------------------------------------------------------

// Every arm (a new case, or a retry against the cube as it is now) re-inits
// the virtual cube from the case's scramble. The case after it goes along, so
// a cancellation from this case into the next one is recognised.
//
// Sync flush: the cube has to be armed in the same task that puts the case on
// screen. Waiting for the next tick leaves a window in which the user has
// already seen the case and started turning, and those first moves are dropped
// on the floor — which reads as the app being slow to catch up.
const armCube = () => {
  const item = flow.currentCase
  if (bt.connected && item?.scramble) bt.startTracking(item.scramble, flow.nextCase?.scramble ?? null)
}
watch(() => flow.armSeq, () => {
  showHint.value = false
  wrongFeedback.value = false
  if (!bookingTwo) armCube()
}, {flush: 'sync'})

// The cube arriving mid-run does not change how the run is scored (that was
// fixed at start), but the current case can still be armed against it.
watch(() => bt.connected, (isConnected) => {
  if (isConnected && flow.active && !flow.finished) armCube()
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
  wrongFeedback.value = false
  if (bt.lastSolveCombined) { finishTwo(); return }
  // Read the move count before recording: recording consumes the moves for
  // algorithm detection.
  const moves = (bt.lastSolveMoves || []).length
  flow.completeCurrent(moves)
}

// One solve finished this case and the next: the moves between them
// cancelled. Split them where this case's algorithm left off; this case is
// timed up to its last move, the next one from the move after that.
const finishTwo = () => {
  const now = Date.now()
  const moves = bt.lastSolveMoves || []
  const times = bt.lastSolveTimes || []
  const key = flow.currentCase?.key
  const merged = key ? customAlgs.mergedAlgs(key) : []
  const preferred = key ? prefs.resolvePreferred(key, merged) : null
  const algs = preferred ? [preferred, ...merged.filter(a => a !== preferred)] : merged
  const split = bt.lastSolveStart
      ? splitCombined(bt.lastSolveStart, moves, algs)
      : {k: moves.length, movesA: null, movesB: null}
  const endA = times[split.k - 1] ?? now
  const firstMoveB = times[split.k] ?? now

  bookingTwo = true
  try {
    // Each recording consumes the moves it is handed for algorithm detection.
    bt.lastSolveMoves = split.movesA
    flow.completeCurrent(split.k, endA)
    if (flow.active && !flow.finished) {
      bt.lastSolveMoves = split.movesB
      flow.completeCurrent(moves.length - split.k, now, firstMoveB)
    }
  } finally {
    bookingTwo = false
  }
  if (flow.active && !flow.finished) armCube()
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
  // On the summary, Enter is "again" — the whole point of flow is repetition,
  // and reaching for the mouse between runs breaks it.
  if (e.key === "Enter" && flow.finished) {
    e.preventDefault()
    if (!e.repeat) beginRun()
    return
  }
  if (e.key !== " " || flow.finished) return
  e.preventDefault()
  if (e.repeat) return
  // Without a cube nothing about a case can be measured, so space is the
  // only control: it moves on to the next case.
  if (!flow.tracked) flow.advanceManually()
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
  if (ticker) clearInterval(ticker)
  bt.forceLetterPair = false
  if (bt.connected) bt.resetTracking()
  flow.reset()
})
</script>

<template>
  <div class="flow-view d-flex flex-column flex-grow-1">
    <FlowSummary v-if="flow.finished" @again="beginRun"/>
    <FlowQueue
        v-else
        :clockMs="clockMs"
        :wrongFeedback="wrongFeedback"
        @finish="flow.finish()">
      <AlgHint v-if="showHint && currentKey" :caseKey="currentKey"/>
    </FlowQueue>
  </div>
</template>

<style scoped>
.flow-view {
  min-height: 0;
}
</style>
