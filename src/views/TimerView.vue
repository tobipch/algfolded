<script setup>
import Scramble from "@/components/timer/Scramble.vue";
import Timer from "@/components/timer/Timer.vue";
import ResultCard from "@/components/timer/ResultCard.vue";
import LastCaseCard from "@/components/timer/LastCaseCard.vue";
import SummaryCard from "@/components/timer/SummaryCard.vue";
import StatsCard from "@/components/timer/StatsCard.vue";
import AlgHint from "@/components/timer/AlgHint.vue";
import {useI18n} from 'vue-i18n'

const {t} = useI18n()

import {TimerState, useSessionStore} from "@/stores/SessionStore";
import {useRouter} from "vue-router";
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useSettingsStore} from "@/stores/SettingsStore"
import {usePresetsStore, starredName} from "@/stores/PresetStore";
import {useDisplayStore} from "@/stores/DisplayStore";
import {useBluetoothCubeStore} from "@/stores/BluetoothCubeStore";

const router = useRouter();
const sessionStore = useSessionStore()
const settings = useSettingsStore()
const timerNotRunning = computed(() => sessionStore.timerState === TimerState.NOT_RUNNING)
// Untimed practice: step through cases without timing them.
const untimed = computed(() => !settings.store.timedMode)

// The case the "repeat soon" (didn't know) hotkey applies to: the observed
// result, or the case just completed when practising untimed.
const currentResultKey = computed(() => {
    if (untimed.value) return sessionStore.lastPracticed?.key ?? null
    const s = sessionStore.stats()
    return sessionStore.observingResult < s.length ? s[sessionStore.observingResult].key : null
})

const toggleDidntKnow = () => {
    const key = currentResultKey.value
    if (!key) return
    if (key in sessionStore.didntKnowMap) sessionStore.unflagDidntKnow(key)
    else sessionStore.flagDidntKnow(key)
}
const timerWrapClass = computed(() => timerNotRunning.value
        ? "timer_col align-self-start"
        : "w-100")
const rightColumnClass = computed(() => timerNotRunning.value ? "result_col" : "d-none")
const selectStore = useSelectedStore()
const presets = usePresetsStore()
const displayStore = useDisplayStore()
const btStore = useBluetoothCubeStore()

// --- Alg hint ("I forgot the alg") ---
// The case currently being practised (may differ from the observed result).
const currentSolveKey = computed(() => sessionStore.store.currentKey)
const showHint = ref(false)
const toggleHint = () => { showHint.value = !showHint.value }
// L4 cube gesture reveals the alg (bumped by the bluetooth store).
watch(() => btStore.hintSignal, (v) => { if (v) showHint.value = true })
// Auto-hide when we move on to a different case.
watch(currentSolveKey, () => { showHint.value = false })

// Bluetooth cube auto start/stop
watch(() => btStore.phase, (phase, oldPhase) => {
  // Timer starts when scrambling finishes (normal mode) or when the first
  // solving move is made (letter-pair mode). Untimed: nothing to start.
  if ((oldPhase === 'scrambling' || oldPhase === 'awaiting_solve') && phase === 'solving') {
    if (!untimed.value) sessionStore.startTimer()
  }
  if (oldPhase === 'solving' && phase === 'idle') {
    if (untimed.value) {
      sessionStore.advanceCase()
    } else {
      sessionStore.stopTimer()
      sessionStore.timerState = TimerState.NOT_RUNNING
    }
  }
  // Mid-solve reset (gesture or Alt+M): abort the running attempt without
  // recording a time so the case can be retried cleanly.
  if (oldPhase === 'solving' && (phase === 'awaiting_solve' || phase === 'scrambling')) {
    if (sessionStore.timerState === TimerState.RUNNING || sessionStore.timerState === TimerState.READY) {
      sessionStore.timerState = TimerState.NOT_RUNNING
    }
  }
})

// Reset gesture (360° bottom-layer spin): notify the user with a toast.
watch(() => btStore.resetSignal, (val) => {
  if (val) displayStore.showToast(t('timer.case_reset_toast'), 'info')
})

// Start tracking when a new scramble appears and BT cube is connected
watch(() => sessionStore.currentScramble, (scramble) => {
  if (btStore.connected && scramble) {
    btStore.startTracking(scramble)
  }
})

// Also start tracking when BT cube connects while a scramble is already shown
watch(() => btStore.connected, (isConnected) => {
  if (isConnected && sessionStore.currentScramble) {
    btStore.startTracking(sessionStore.currentScramble)
  }
})

// Re-arm tracking when letter-pair mode is toggled mid-session so it takes
// effect on the current case instead of only the next one.
watch(() => settings.store.letterPairMode, () => {
  if (btStore.connected && sessionStore.currentScramble
      && sessionStore.timerState === TimerState.NOT_RUNNING) {
    btStore.startTracking(sessionStore.currentScramble)
  }
})

// global key events listener
const onGlobalKeyDown = event => {
  const confirmClearSession = () => {
    if (confirm(t("stats_card.are_you_sure_to_clean"))) {
      sessionStore.clearSession()
    }
  }
  const deleteSingleResult = () => {
    if (sessionStore.stats().length > sessionStore.observingResult
        && confirm(t("result_card.are_you_sure_to_delete"))) {
      sessionStore.deleteResult(sessionStore.observingResult)
    }
  }

  // Alt+H reveals the current case's alg. Handled before the running-timer
  // guard below so it never stops the timer (non-interruptive help).
  if (event.key.toLowerCase() === "h" && event.altKey) {
    if (currentSolveKey.value) toggleHint()
    event.preventDefault()
    return
  }

  // Untimed practice: the spacebar just moves on to the next case.
  if (untimed.value && event.key === " ") {
    event.preventDefault()
    if (event.repeat) return
    if (sessionStore.currentScramble) sessionStore.advanceCase()
    return
  }

  // Self-paced letter-pair mode (letter-pair display, no smart cube connected):
  // the spacebar drives the flow. First press starts timing the current case;
  // every further press records its time and immediately starts the next one.
  const selfPacedLetterpair = settings.store.letterPairMode && !btStore.connected
  if (selfPacedLetterpair && event.key === " ") {
    event.preventDefault()
    if (event.repeat) return
    if (sessionStore.timerState === TimerState.RUNNING) {
      sessionStore.stopTimer()   // record current case + advance to the next
      sessionStore.startTimer()  // and immediately start timing that next case
    } else if (sessionStore.timerState === TimerState.NOT_RUNNING && sessionStore.store.currentKey) {
      sessionStore.startTimer()  // first press: start timing the first case
    }
    return
  }

  if (sessionStore.timerState === TimerState.RUNNING) {
    event.preventDefault()
    sessionStore.stopTimer()
    return
  } else if (sessionStore.timerState !== TimerState.NOT_RUNNING) {
    return // don't allow actions like "delete time", "list times" etc. when timer's running
  }
  // preventDefault() is done at the end
  if (event.key === "ArrowLeft") {
    sessionStore.observingResult = Math.max(0, sessionStore.observingResult - 1)
  } else if (event.key === "ArrowRight") {
    sessionStore.observingResult = Math.min(sessionStore.stats().length - 1, sessionStore.observingResult + 1)
  } else if (event.key === "Home") {
    sessionStore.observingResult = 0
  } else if (event.key === "End") {
    sessionStore.observingResult = sessionStore.stats().length - 1
  } else if (event.key === " ") {
    if (sessionStore.timerState === TimerState.NOT_RUNNING && sessionStore.currentScramble) {
      sessionStore.getTimerReady(settings.store.timerStartDelayMs)
    }
  } else if (event.key === "Delete") {
    if (event.shiftKey) {
      confirmClearSession();
    } else { // no shift key -  delete single result
      deleteSingleResult()
    }
  } else if (event.key === "t" && event.altKey) {
    router.push('select')
  } else if (event.key === "r" && event.altKey) {
    sessionStore.startRecap()
  } else if (event.key === "d" && event.altKey) {
    confirmClearSession();
  } else if (event.key === "z" && (event.altKey || event.ctrlKey)) {
    deleteSingleResult()
  } else if (event.key === "s" && event.altKey && sessionStore.observingResult < sessionStore.stats().length) {
    selectStore.toggleSelected(sessionStore.stats()[sessionStore.observingResult])
  } else if (event.key === "a" && event.altKey && sessionStore.observingResult < sessionStore.stats().length) {
    presets.toggleAddRemove(starredName, sessionStore.stats()[sessionStore.observingResult].key)
  } else if (event.key === "f" && event.altKey) {
    toggleDidntKnow()
  } else {
    return // do NOT prevent default
  }
  event.preventDefault()
}
const onGlobalKeyUp = (event) => {
  if (sessionStore.timerState === TimerState.STOPPING) {
    sessionStore.timerState = TimerState.NOT_RUNNING
  } else if (event.key === " ") {
    if (sessionStore.timerState === TimerState.READY) {
      sessionStore.startTimer()
    } else if (sessionStore.timerState === TimerState.AWAITING_READY) {
      sessionStore.timerState = TimerState.NOT_RUNNING // reset
    }
  } else {
    return
  }
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeyDown);
  window.addEventListener('keyup', onGlobalKeyUp);
  document.addEventListener('touchstart', onPageTouchStart);
  document.addEventListener('touchend', onPageTouchEnd);
  sessionStore.timerState = TimerState.NOT_RUNNING
  sessionStore.observingResult = Math.max(sessionStore.stats().length - 1, 0)
  // Start BT tracking if cube was already connected before navigating here
  if (btStore.connected && sessionStore.currentScramble) {
    btStore.startTracking(sessionStore.currentScramble)
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeyDown);
  window.removeEventListener('keyup', onGlobalKeyUp);
  document.removeEventListener('touchstart', onPageTouchStart);
  document.removeEventListener('touchend', onPageTouchEnd);
  sessionStore.timerState = TimerState.NOT_RUNNING
});

const onTimerTouchStart = event => {
  if (untimed.value) {
    if (sessionStore.currentScramble) sessionStore.advanceCase()
    event.preventDefault()
    return
  }
  if (sessionStore.timerState === TimerState.RUNNING) {
    sessionStore.stopTimer()
  } else if (sessionStore.timerState === TimerState.NOT_RUNNING && sessionStore.currentScramble) {
    sessionStore.getTimerReady(settings.store.timerStartDelayMs)
  }
  event.preventDefault()
}

const onTimerTouchEnd = event => {
  if (untimed.value) {
    event.preventDefault()
    return
  }
  if (sessionStore.timerState === TimerState.STOPPING) {
    sessionStore.timerState = TimerState.NOT_RUNNING
  } else if (sessionStore.timerState === TimerState.READY) {
    sessionStore.startTimer()
  } else if (sessionStore.timerState === TimerState.AWAITING_READY) {
    sessionStore.timerState = TimerState.NOT_RUNNING // reset
  }
  event.preventDefault()
}

// Stop timer from anywhere on screen
const onPageTouchStart = event => {
  if (sessionStore.timerState === TimerState.RUNNING) {
    sessionStore.stopTimer()
    event.preventDefault()
  }
}
const onPageTouchEnd = event => {
  if (sessionStore.timerState === TimerState.STOPPING) {
    sessionStore.timerState = TimerState.NOT_RUNNING
    event.preventDefault()
  }
}

</script>

<template>
  <div>
    <Scramble/>

    <div class="d-flex flex-wrap">
      <div
          class="d-flex flex-column timer_wrap"
          :class="timerWrapClass">
        <div
            class="d-flex align-items-center justify-content-center timer_touch_area position-relative"
            @touchstart="onTimerTouchStart"
            @touchend="onTimerTouchEnd"
        >
          <button
              v-if="currentSolveKey"
              class="btn btn-sm hint-btn"
              :class="{ active: showHint }"
              tabindex="-1"
              :title="$t('timer.hint_tooltip')"
              @click.stop="toggleHint"
              @mousedown.stop=""
              @touchstart.stop.prevent="toggleHint"
              @keydown.space.prevent="">
            <i class="bi bi-lightbulb"></i>
            {{ $t("timer.hint") }}
          </button>
          <Timer/>
        </div>
        <AlgHint v-if="showHint && currentSolveKey" :caseKey="currentSolveKey"/>
        <div v-if="displayStore.showStatistics" class="d-sm-none d-block">
          <SummaryCard v-if="sessionStore.stats().length > 0"/>
          <div class="mt-2">
            <StatsCard/>
          </div>
        </div>
      </div>

      <div :class="rightColumnClass">
        <div class="my-2" v-if="untimed">
          <LastCaseCard/>
        </div>
        <div class="my-2" v-else>
          <ResultCard v-if="sessionStore.stats().length > sessionStore.observingResult"/>
        </div>
        <div class="my-2" v-if="sessionStore.stats().length > 0">
          <SummaryCard/>
        </div>
        <div class="my-2 d-sm-block d-none">
          <StatsCard/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timer_wrap {
  transition: width 0.1s ease-in-out;
}
.timer_touch_area {
  padding: 80px 0;
}
.timer_col {
  flex: 0 0 40%;
}
.result_col {
  flex: 1 1 0%;
  min-width: 0;
}
@media (min-width: 992px) {
  .timer_col {
    flex: 0 0 66.67%;
  }
  .result_col {
    flex: 0 0 33.33%;
  }
}
@media (max-width: 767.98px) {
  .timer_col {
    flex: 0 0 100%;
  }
  .result_col {
    flex: 0 0 100%;
  }
  .timer_touch_area {
    padding: 70px 0;
  }
}
.hint-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  color: var(--bs-secondary);
  border-color: var(--bs-secondary);
  opacity: 0.7;
}
.hint-btn:hover,
.hint-btn.active {
  color: var(--bs-warning);
  border-color: var(--bs-warning);
  background: transparent;
  opacity: 1;
}
</style>