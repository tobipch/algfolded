<script setup>
import {TimerState, useSessionStore} from "@/stores/SessionStore";
import {computed, ref, watchEffect} from "vue";
import {msToHumanReadable} from "@/helpers/time_formatter";
import {useSettingsStore} from "@/stores/SettingsStore";
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const sessionStore = useSessionStore()
const currentTime = ref(Date.now())
const settings = useSettingsStore()

// Untimed practice: no clock — show how many cases were done instead.
const untimed = computed(() => !settings.store.timedMode)

watchEffect(() => {
  if (sessionStore.timerState === TimerState.RUNNING) {
    const interval = setInterval(() => {
      currentTime.value = Date.now()
    }, 10)

    return () => {
      clearInterval(interval)
    }
  }
})

const timerLabel = computed(() => {
  if (sessionStore.timerState === TimerState.READY
      || sessionStore.timerState === TimerState.AWAITING_READY) {
    return msToHumanReadable(0, settings.store.timerPrecision, true)
  }
  if (sessionStore.timerState === TimerState.NOT_RUNNING || sessionStore.timerState === TimerState.STOPPING) {
    const n = sessionStore.stats().length
    const ms = n === 0 ? 0 : sessionStore.stats()[n-1]["ms"]
    return msToHumanReadable(ms, settings.store.timerPrecision, true)
  }
  // running
  if (settings.store.timerUpdate === "off") {
    return "⏱️"
  }
  const showMs = (settings.store.timerUpdate === "on")
  return msToHumanReadable(currentTime.value - sessionStore.timerStarted, settings.store.timerPrecision, showMs)
})

const classByState = computed(() => {
  switch (sessionStore.timerState) {
    case TimerState.NOT_RUNNING:
      return "not_running"
    case TimerState.AWAITING_READY:
      return "awaiting_ready"
    case TimerState.READY:
      return "ready"
    case TimerState.RUNNING:
      return "running"
    case TimerState.STOPPING:
      return "stopping"
  }
})

</script>

<template>
  <div v-if="untimed" class="text-center noselect p-4">
    <div class="untimed-count" :style="{ fontFamily : settings.store.timerFont + ', monospace' }">
      <i class="bi bi-stopwatch untimed-icon"></i>
      {{ $t("timer.untimed_label", sessionStore.untimedCount) }}
    </div>
    <div class="text-muted small mt-2">{{ $t("timer.untimed_hint") }}</div>
  </div>
  <h3 v-else
      :style="{ fontSize: settings.store.timerFontSize + 'px', fontFamily : settings.store.timerFont + ', monospace' }"
      class="timer text-center noselect d-block p-4" :class="classByState">
    {{timerLabel}}
  </h3>
</template>

<style scoped>

.timer {
  font-weight: 700;
  /*font-family: 'Roboto Mono', monospace;*/
  transition: color 0.1s;
}

.not_running {
  color: var(--bs-body-color)
}
.running {
  color: var(--bs-body-color)
}
.awaiting_ready {
  color: var(--bs-warning)
}
.ready {
  color: var(--bs-success)
}
.stopping {
  color: var(--bs-danger)
}
.untimed-count {
  font-weight: 700;
  font-size: 1.6rem;
}
.untimed-icon {
  opacity: 0.5;
  margin-right: 0.25rem;
}
</style>