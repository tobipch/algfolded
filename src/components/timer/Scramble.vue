<script setup>

import {useSessionStore} from "@/stores/SessionStore";
import {useBluetoothCubeStore} from "@/stores/BluetoothCubeStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {computed} from "vue";
import {useSettingsStore} from "@/stores/SettingsStore";
import {moveFace, moveAmount, amountToMove} from "@/helpers/scramble_utils";
import {parseLtctKey} from "@/helpers/helpers";
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const session = useSessionStore()
const settings = useSettingsStore()
const bt = useBluetoothCubeStore()
const ls = useLetterSchemeStore()
const scramble = computed(() => session.currentScramble ?? t("timer.no_scramble"))

// Letter-pair mode hides the scramble and shows the case's letter pair instead,
// so the user knows which LTCT to execute without ever scrambling physically.
const letterPairMode = computed(() => settings.store.letterPairMode)
const letterPair = computed(() => {
  const key = session.store.currentKey
  return key ? parseLtctKey(key, ls.toLetter).letters : ''
})

// Preview of the next and next-next cases, to keep the solving flow going.
const upcomingPairs = computed(() =>
    (session.store.upcoming || []).slice(0, 2).map(u => parseLtctKey(u.key, ls.toLetter).letters)
)

// Hint shown in letter-pair mode when the cube looks far from solved (likely a
// wrong alg): tells the user to spin the bottom layer 360° to reset the case.
const showResetHint = computed(() =>
    letterPairMode.value && bt.connected && !bt.paused && bt.tooFarFromSolved)

// The green move-by-move overlay only applies to the physical scramble flow.
// In letter-pair mode there is nothing to scramble, so it is suppressed.
const isTracking = computed(() => bt.connected && bt.phase !== 'idle' && !letterPairMode.value)

// Simplify a list of {text, type} by merging adjacent same-face moves
function simplifyMoves(items) {
  const result = []
  for (const item of items) {
    if (result.length > 0) {
      const prev = result[result.length - 1]
      if (prev.type === item.type && moveFace(prev.text) === moveFace(item.text)) {
        const total = moveAmount(prev.text) + moveAmount(item.text)
        const merged = amountToMove(moveFace(prev.text), total)
        if (merged) {
          // Keep the more "urgent" type: correction > current > remaining
          prev.text = merged
          if (item.type === 'correction') prev.type = 'correction'
        } else {
          result.pop() // moves cancel out
        }
        continue
      }
    }
    result.push({...item})
  }
  return result
}

// Build the display sequence with simplification
const displayMoves = computed(() => {
  if (!isTracking.value) return []

  const items = []

  const isBackwardPending = bt.pendingFaceTurn?.direction === 'backward'

  // Completed moves (green), but last one is orange if backward pending
  for (let i = 0; i < bt.position; i++) {
    const type = (isBackwardPending && i === bt.position - 1) ? 'pending' : 'done'
    items.push({ text: bt.scrambleMoves[i], type })
  }

  // Correction moves (red) + current scramble move + remaining — simplify these together
  const pending = []
  for (let i = bt.correctionMoves.length - 1; i >= 0; i--) {
    pending.push({ text: bt.correctionMoves[i], type: 'correction' })
  }
  for (let i = bt.position; i < bt.scrambleMoves.length; i++) {
    const type = i === bt.position
        ? (bt.pendingFaceTurn && !isBackwardPending ? 'pending' : 'current')
        : 'remaining'
    pending.push({ text: bt.scrambleMoves[i], type })
  }

  const simplified = simplifyMoves(pending)
  items.push(...simplified)

  return items
})
</script>

<template>
  <h3 class="border-bottom scramble-bar">
    <span class="opacity-50 d-none d-sm-inline-block">
      {{ (letterPairMode ? $t("timer.letterpair") : $t("timer.scramble")) + '&nbsp;' }}
    </span>
    <span :style="{ fontSize: settings.store.scrambleFontSize + 'px' }">
      <template v-if="letterPairMode">
        <span class="fw-bold">{{ letterPair }}</span>
        <span v-if="upcomingPairs[0]" class="lp-next">{{ upcomingPairs[0] }}</span>
        <span v-if="upcomingPairs[1]" class="lp-next-next">{{ upcomingPairs[1] }}</span>
      </template>
      <template v-else-if="isTracking">
        <span v-for="(m, i) in displayMoves" :key="i"
              class="bt-move"
              :class="{
                'text-success': m.type === 'done',
                'text-danger fw-bold': m.type === 'correction',
                'text-warning fw-bold': m.type === 'pending',
                'fw-bold': m.type === 'current',
              }">{{ m.text }}</span>
      </template>
      <template v-else>{{ scramble }}</template>
    </span>
  </h3>
  <div v-if="showResetHint" class="reset-hint text-warning small mt-1">
    <i class="bi bi-arrow-repeat"></i> {{ $t("timer.reset_hint") }}
  </div>
</template>

<style scoped>
.scramble-bar {
  padding: 10px 0;
  margin: 0;
}
.bt-move {
  margin-right: 0.35em;
}
/* Upcoming-case preview: next is smaller and a bit faded; next-next is the
   same size but fainter still. */
.lp-next,
.lp-next-next {
  font-size: 0.5em;
  font-weight: 700;
  margin-left: 0.6em;
  vertical-align: middle;
}
.lp-next {
  opacity: 0.55;
}
.lp-next-next {
  opacity: 0.3;
}
</style>
