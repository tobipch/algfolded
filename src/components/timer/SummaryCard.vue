<script setup>
import {computed, ref, onMounted, onUnmounted} from "vue";
import {useSessionStore} from "@/stores/SessionStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {usePresetsStore} from "@/stores/PresetStore";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useLetterSchemeStore} from "@/stores/LetterSchemeStore";
import {useRouter} from "vue-router";
import {useI18n} from 'vue-i18n'
import {msToHumanReadable} from "@/helpers/time_formatter";
import {parseLtctKey} from "@/helpers/helpers";

const {t} = useI18n()
const router = useRouter()
const sessionStore = useSessionStore()
const settings = useSettingsStore()
const presets = usePresetsStore()
const selected = useSelectedStore()
const ls = useLetterSchemeStore()

const isOpen = ref(false)
const p = computed(() => settings.store.timerPrecision)

const times = computed(() => sessionStore.stats().map(s => s.ms))
const solveCount = computed(() => times.value.length)
const totalSolvingTimeMs = computed(() => times.value.reduce((s, t) => s + t, 0))
const uniqueCases = computed(() => {
  const sel = new Set(sessionStore.store.keys)
  return new Set(sessionStore.stats().filter(s => sel.has(s.key)).map(s => s.key)).size
})
const totalSelected = computed(() => sessionStore.store.keys.length)

const meanTime = computed(() => solveCount.value > 0 ? totalSolvingTimeMs.value / solveCount.value : 0)

// Wall-clock total time (ticks every second)
const now = ref(Date.now())
let ticker = null
onMounted(() => { ticker = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { if (ticker) clearInterval(ticker) })
const totalWallTimeMs = computed(() => {
  if (!sessionStore.sessionStartedAt) return 0
  return now.value - sessionStore.sessionStartedAt
})

const caseAverages = computed(() => {
  const map = {}
  for (const s of sessionStore.stats()) {
    if (!map[s.key]) map[s.key] = {total: 0, count: 0}
    map[s.key].total += s.ms
    map[s.key].count++
  }
  return Object.entries(map)
      .map(([key, {total, count}]) => ({key, avg: total / count}))
      .sort((a, b) => b.avg - a.avg)
})

const slowestForDisplay = computed(() => {
  const n = Math.max(1, Math.ceil(caseAverages.value.length * 0.1))
  return caseAverages.value.slice(0, Math.min(n, 10))
})

const slowestForPreset = computed(() => {
  const n = Math.max(10, Math.ceil(caseAverages.value.length * 0.1))
  return caseAverages.value.slice(0, n).map(c => c.key)
})

const sparklinePoints = computed(() => {
  if (times.value.length < 2) return ''
  const maxT = Math.max(...times.value)
  const minT = Math.min(...times.value)
  const range = maxT - minT || 1
  const w = 200
  const h = 50
  return times.value.map((t, i) => {
    const x = (i / (times.value.length - 1)) * w
    const y = h - ((t - minT) / range) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')
})

// Sparkline hover tooltip
const sparklineRef = ref(null)
const hoverInfo = ref(null)

const onSparklineMove = (e) => {
  const svg = sparklineRef.value
  if (!svg || times.value.length < 2) return
  const rect = svg.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const idx = Math.round(x * (times.value.length - 1))
  const clampedIdx = Math.max(0, Math.min(idx, times.value.length - 1))
  const stat = sessionStore.stats()[clampedIdx]
  if (!stat) return
  hoverInfo.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    label: caseLetters(stat.key),
    time: msToHumanReadable(stat.ms, p.value)
  }
}

const onSparklineLeave = () => { hoverInfo.value = null }

const caseLetters = (key) => parseLtctKey(key, ls.toLetter).letters

const practiceSlowCases = () => {
  const keys = slowestForPreset.value
  presets.setPreset("Slow cases", keys)
  selected.applyFromPreset(new Set(keys))
  router.push('select')
}
</script>

<template>
  <div class="card">
    <div class="card-body p-2 p-sm-3">
      <h5 class="mb-0 clickable d-flex align-items-center" @click="isOpen = !isOpen">
        <span class="flex-grow-1">{{ $t("summary.title") }}</span>
        <i class="bi" :class="isOpen ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
      </h5>
      <div v-show="isOpen">
        <hr class="my-1 my-sm-2">
        <div class="row small">
          <div class="col-6 mb-1">
            <span class="text-muted">{{ $t("summary.solves") }}:</span> {{ solveCount }}
          </div>
          <div class="col-6 mb-1">
            <span class="text-muted">{{ $t("summary.cases_covered") }}:</span> {{ uniqueCases }} / {{ totalSelected }}
          </div>
          <div class="col-6 mb-1">
            <span class="text-muted">{{ $t("summary.total_solving_time") }}:</span> {{ msToHumanReadable(totalSolvingTimeMs, 0, false) }}
          </div>
          <div class="col-6 mb-1">
            <span class="text-muted">{{ $t("summary.total_time") }}:</span> {{ msToHumanReadable(totalWallTimeMs, 0, false) }}
          </div>
          <div class="col-6 mb-1">
            <span class="text-muted">{{ $t("summary.mean") }}:</span> {{ msToHumanReadable(meanTime, p) }}
          </div>
        </div>

        <div v-if="times.length >= 2" class="sparkline-wrapper">
          <svg ref="sparklineRef" class="sparkline" viewBox="0 0 200 50" preserveAspectRatio="none"
               @mousemove="onSparklineMove" @mouseleave="onSparklineLeave">
            <polyline :points="sparklinePoints" fill="none" stroke="var(--bs-info)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
          </svg>
          <div v-if="hoverInfo" class="sparkline-tooltip"
               :style="{ left: hoverInfo.x + 'px', top: (hoverInfo.y - 30) + 'px' }">
            {{ hoverInfo.label }} {{ hoverInfo.time }}
          </div>
        </div>

        <div v-if="slowestForDisplay.length > 0" class="mt-2">
          <small class="text-muted fw-bold">{{ $t("summary.slowest_cases") }}</small>
          <div v-for="c in slowestForDisplay" :key="c.key" class="d-flex justify-content-between small">
            <span>{{ caseLetters(c.key) }} <small class="text-muted">({{ c.key }})</small></span>
            <span>{{ msToHumanReadable(c.avg, p) }}</span>
          </div>
          <button
              class="btn btn-sm btn-outline-primary mt-2 w-100"
              tabindex="-1" @keydown.space.prevent=""
              @click="practiceSlowCases">
            {{ $t("summary.practice_slow") }} ({{ slowestForPreset.length }})
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sparkline-wrapper {
  position: relative;
}
.sparkline {
  width: 100%;
  height: 50px;
  margin-top: 4px;
  cursor: crosshair;
}
.sparkline-tooltip {
  position: absolute;
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.75rem;
  white-space: nowrap;
  pointer-events: none;
  transform: translateX(-50%);
  z-index: 10;
}
</style>
