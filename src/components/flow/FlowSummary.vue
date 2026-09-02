<script setup>
import {computed, ref} from "vue";
import {useRouter} from "vue-router";
import {useFlowStore} from "@/stores/FlowStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {msToHumanReadable, msToClock} from "@/helpers/time_formatter";
import {useI18n} from "vue-i18n";

// What the run actually cost, led by the few numbers that carry their own
// comparison. Everything that needs a table is behind a tab.
//
// Without a smart cube only page times exist, so the split bar, TPS and the
// per-case tables are left out rather than shown empty.
const {t} = useI18n()
const router = useRouter()
const flow = useFlowStore()
const algset = useAlgsetStore()
const settings = useSettingsStore()

defineEmits(['again'])

const p = computed(() => settings.store.timerPrecision)
const fmt = (ms) => msToHumanReadable(ms, p.value)
// the session total is a number the user reads once, so it is exact
const fmtTotal = (ms) => msToClock(ms, true)
const label = (key) => algset.caseLabel(key)
const num = (v, digits = 1) => (v == null || !Number.isFinite(v)) ? '-' : v.toFixed(digits)

const s = computed(() => flow.summary)
const pageStats = computed(() => flow.pageSummary)
const wallMs = computed(() => Math.max(0, flow.endedAt - flow.startedAt))

const tab = ref('cases')

// Execution against the user's own average for exactly these cases. That is
// the only historical reference in the app, and it measures execution, so the
// figure it is compared against measures execution too.
const perCaseContext = computed(() => {
  const ref_ = s.value?.reference
  if (!ref_) return t('flow.no_history')
  const delta = s.value.execPerCase - ref_.execPerCase
  if (Math.abs(delta) < 10) return t('flow.same_as_usual', {n: ref_.cases})
  return t(delta < 0 ? 'flow.faster_than_usual' : 'flow.slower_than_usual',
      {delta: fmt(Math.abs(delta)), n: ref_.cases})
})

const accuracyContext = computed(() =>
    t('flow.right_first_time_of', {right: s.value.firstTry, total: s.value.cases}))

// Where the time went: turning against recall against recovery. The pause
// figure above the bar shares this denominator so the two never disagree.
const splitTotalMs = computed(() =>
    s.value.execMs + s.value.pauseMs + s.value.recoveryMs + flow.abandonedMs)
const pausePct = computed(() =>
    splitTotalMs.value > 0 ? (s.value.pauseMs / splitTotalMs.value) * 100 : 0)

const splitParts = computed(() => {
  const total = splitTotalMs.value || 1
  return [
    {id: 'exec', label: t('flow.split_execution'), ms: s.value.execMs},
    {id: 'pause', label: t('flow.split_pause'), ms: s.value.pauseMs},
    {id: 'recovery', label: t('flow.split_recovery'), ms: s.value.recoveryMs + flow.abandonedMs},
  ].filter(part => part.ms > 0).map(part => ({...part, pct: (part.ms / total) * 100}))
})

// One stacked bar per case in the order drilled: pale is the pause before the
// first turn, solid the turning itself. Page boundaries are marked.
const chart = computed(() => {
  const records = flow.records
  if (records.length === 0) return null
  const width = 640, height = 200
  const padLeft = 46, padRight = 16, padTop = 14, padBottom = 24
  const spanX = width - padLeft - padRight
  const spanY = height - padTop - padBottom
  const maxValue = Math.max(...records.map(r => r.pauseMs + r.execMs)) * 1.1 || 1
  const slot = spanX / records.length
  const barWidth = Math.max(1.5, Math.min(28, slot * 0.7))
  const scale = (ms) => (spanY * ms) / maxValue
  const base = padTop + spanY

  const bars = records.map((r, i) => {
    const centre = padLeft + slot * (i + 0.5)
    const execH = scale(r.execMs)
    const pauseH = scale(r.pauseMs)
    return {
      x: centre - barWidth / 2,
      w: barWidth,
      execY: base - execH, execH,
      pauseY: base - execH - pauseH, pauseH,
      wrong: r.wrong,
      title: `${label(r.key)}: ${fmt(r.pauseMs)} + ${fmt(r.execMs)}`,
    }
  })
  const dividers = records.map((r, i) =>
      i > 0 && r.page !== records[i - 1].page ? padLeft + slot * i : null
  ).filter(x => x !== null)
  const grid = [0, 0.5, 1].map(f => {
    const value = maxValue * f
    return {y: base - scale(value), text: (value / 1000).toFixed(1) + 's'}
  })
  return {width, height, padLeft, padRight, bars, dividers, grid}
})

// Without a cube: the page-by-page trend, as bars of page time.
const pageChart = computed(() => {
  const times = pageStats.value?.pageTimes || []
  if (times.length === 0) return null
  const max = Math.max(...times) * 1.1 || 1
  return times.map((ms, i) => ({i, ms, pct: (ms / max) * 100}))
})

const goSelect = () => router.push('select')
</script>

<template>
  <div class="flow-summary">
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <h2 class="h4 mb-0">{{ $t('flow.summary_title') }}</h2>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" type="button" tabindex="-1"
                @keydown.space.prevent="" @click="$emit('again')">
          {{ $t('flow.train_again') }}
        </button>
        <button class="btn btn-outline-secondary" type="button" tabindex="-1"
                @keydown.space.prevent="" @click="goSelect">
          {{ $t('flow.back_to_select') }}
        </button>
      </div>
    </div>

    <!-- with a smart cube: every case was measured -->
    <template v-if="flow.tracked && s.cases > 0">
      <div class="mb-4">
        <div class="flow-figure-lg">
          {{ $t('flow.headline', {cases: s.cases, time: fmtTotal(wallMs)}, s.cases) }}
        </div>
        <div class="text-muted">
          {{ $t(s.tps == null ? 'flow.headline_sub_no_tps' : 'flow.headline_sub', {
            perCase: fmt(s.msPerCase),
            tps: num(s.tps),
            right: s.firstTry,
            total: s.cases,
          }) }}
        </div>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-12 col-sm-4">
          <div class="card h-100 bg-body-tertiary border">
            <div class="card-body py-3">
              <div class="text-muted text-uppercase small">{{ $t('flow.fig_pause') }}</div>
              <div class="flow-figure">{{ fmt(s.pauseMs) }}</div>
              <div class="text-muted small">{{ $t('flow.pause_share', {pct: Math.round(pausePct)}) }}</div>
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-4">
          <div class="card h-100 bg-body-tertiary border">
            <div class="card-body py-3">
              <div class="text-muted text-uppercase small">{{ $t('flow.fig_per_case') }}</div>
              <div class="flow-figure">{{ fmt(s.execPerCase) }}</div>
              <div class="text-muted small">{{ perCaseContext }}</div>
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-4">
          <div class="card h-100 bg-body-tertiary border">
            <div class="card-body py-3">
              <div class="text-muted text-uppercase small">{{ $t('flow.fig_accuracy') }}</div>
              <div class="flow-figure" :class="{'text-success': s.firstTry === s.cases}">
                {{ Math.round(s.accuracy * 100) }}%
              </div>
              <div class="text-muted small">{{ accuracyContext }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="mb-4">
        <div class="text-muted text-uppercase small mb-2">{{ $t('flow.where_time_went') }}</div>
        <div class="split-bar mb-2">
          <div v-for="part in splitParts" :key="part.id"
               :class="'split-' + part.id"
               :style="{width: part.pct + '%'}"
               :title="`${part.label} ${fmt(part.ms)}`"></div>
        </div>
        <div class="small">
          <span v-for="part in splitParts" :key="part.id" class="me-3">
            <span class="split-key" :class="'split-' + part.id"></span>
            {{ part.label }} <strong>{{ Math.round(part.pct) }}%</strong>&nbsp;<span
              class="text-muted">{{ fmt(part.ms) }}</span>
          </span>
        </div>
      </div>

      <div v-if="chart" class="mb-4">
        <div class="text-muted text-uppercase small mb-2">{{ $t('flow.per_case_chart') }}</div>
        <div class="chart-scroll">
          <svg :viewBox="`0 0 ${chart.width} ${chart.height}`" class="flow-chart"
               role="img" :aria-label="$t('flow.per_case_chart')">
            <line v-for="(g, i) in chart.grid" :key="'g' + i"
                  :x1="chart.padLeft" :y1="g.y" :x2="chart.width - chart.padRight" :y2="g.y"
                  class="chart-grid"/>
            <text v-for="(g, i) in chart.grid" :key="'t' + i"
                  :x="chart.padLeft - 8" :y="g.y + 4" text-anchor="end" class="chart-label">
              {{ g.text }}
            </text>
            <line v-for="(x, i) in chart.dividers" :key="'d' + i"
                  :x1="x" y1="14" :x2="x" :y2="chart.height - 24" class="chart-divider"/>
            <g v-for="(b, i) in chart.bars" :key="'b' + i">
              <title>{{ b.title }}</title>
              <rect :x="b.x" :y="b.execY" :width="b.w" :height="b.execH"
                    :class="b.wrong ? 'chart-bar-wrong' : 'chart-bar'"/>
              <rect :x="b.x" :y="b.pauseY" :width="b.w" :height="b.pauseH"
                    :class="b.wrong ? 'chart-bar-wrong-pause' : 'chart-bar-pause'"/>
            </g>
          </svg>
        </div>
        <p class="text-muted small mb-0 text-center">{{ $t('flow.per_case_chart_legend') }}</p>
      </div>

      <ul class="nav nav-pills gap-1 mb-3">
        <li class="nav-item">
          <button type="button" class="nav-link" :class="{active: tab === 'cases'}"
                  tabindex="-1" @keydown.space.prevent="" @click="tab = 'cases'">
            {{ $t('flow.tab_cases') }}
          </button>
        </li>
        <li class="nav-item">
          <button type="button" class="nav-link" :class="{active: tab === 'wrong'}"
                  tabindex="-1" @keydown.space.prevent="" @click="tab = 'wrong'">
            {{ $t('flow.tab_wrong') }}<span v-if="s.wrongCases.length"> ({{ s.cases - s.firstTry }})</span>
          </button>
        </li>
      </ul>

      <div v-if="tab === 'cases'" class="table-responsive">
        <table class="table table-sm align-middle mb-0">
          <thead>
          <tr>
            <th>{{ $t('flow.col_case') }}</th>
            <th>{{ $t('flow.col_total') }}</th>
            <th>{{ $t('flow.col_pause') }}</th>
            <th>{{ $t('flow.col_execution') }}</th>
            <th>{{ $t('flow.col_tps') }}</th>
            <th>{{ $t('flow.col_delta') }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(c, i) in s.perCase" :key="i">
            <td class="fw-semibold">
              {{ label(c.key) }}<span v-if="c.wrong" class="text-danger"> !</span>
            </td>
            <td>{{ fmt(c.totalMs) }}</td>
            <td class="text-muted">{{ fmt(c.pauseMs) }}</td>
            <td class="text-muted">{{ fmt(c.execMs) }}</td>
            <td>{{ num(c.tps) }}</td>
            <td :class="c.deltaMs != null && c.deltaMs > 0 ? 'text-danger' : 'text-muted'">
              <template v-if="c.deltaMs == null">-</template>
              <template v-else>{{ (c.deltaMs >= 0 ? '+' : '-') + fmt(Math.abs(c.deltaMs)) }}</template>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else>
        <p v-if="s.wrongCases.length === 0" class="text-muted mb-0">
          {{ $t('flow.no_mistakes') }}
        </p>
        <div v-else class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
            <tr>
              <th>{{ $t('flow.col_case') }}</th>
              <th>{{ $t('flow.col_times_wrong') }}</th>
              <th>{{ $t('flow.col_pages') }}</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="w in s.wrongCases" :key="w.key">
              <td class="fw-semibold">{{ label(w.key) }}</td>
              <td>{{ w.count }}</td>
              <td class="text-muted">{{ w.pages.join(', ') }}</td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- without a cube only the pages were measured -->
    <template v-else-if="!flow.tracked && pageStats.pages > 0">
      <div class="mb-4">
        <div class="flow-figure-lg">
          {{ $t('flow.headline',
              {cases: pageStats.cases, time: fmtTotal(pageStats.totalMs)}, pageStats.cases) }}
        </div>
        <div class="text-muted">
          {{ $t('flow.headline_sub_untracked', {perCase: fmt(pageStats.msPerCase)}) }}
        </div>
      </div>
      <div class="text-muted text-uppercase small mb-2">{{ $t('flow.page_trend') }}</div>
      <div v-for="row in pageChart" :key="row.i" class="d-flex align-items-center gap-2 mb-1">
        <span class="text-muted small page-no">{{ row.i + 1 }}</span>
        <div class="page-bar-track flex-grow-1">
          <div class="page-bar" :style="{width: row.pct + '%'}"></div>
        </div>
        <span class="small text-nowrap page-time">{{ fmt(row.ms) }}</span>
      </div>
      <p class="text-muted small mt-3 mb-0">{{ $t('flow.untracked_note') }}</p>
    </template>

    <p v-else class="text-muted mb-0">{{ $t('flow.nothing_recorded') }}</p>
  </div>
</template>

<style scoped>
.flow-summary {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: 1rem 0 2rem;
}
.flow-figure {
  font-size: clamp(1.35rem, 5.5vw, 2rem);
  font-weight: 600;
  line-height: 1.2;
}
.flow-figure-lg {
  font-size: clamp(1.5rem, 5vw, 2.25rem);
  font-weight: 600;
  line-height: 1.2;
}
.split-bar {
  display: flex;
  height: 14px;
  width: 100%;
  border-radius: 7px;
  overflow: hidden;
  background-color: rgba(128, 128, 128, 0.25);
}
.split-key {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 2px;
  margin-right: 0.35rem;
}
/* the same language as the chart: solid is turning, pale is the pause */
.split-exec { background-color: var(--bs-primary); }
.split-pause { background-color: var(--bs-primary); opacity: 0.4; }
.split-recovery { background-color: var(--bs-danger); }
.chart-scroll {
  overflow-x: auto;
}
.flow-chart {
  width: 100%;
  min-width: 320px;
  height: auto;
  max-height: 240px;
}
.chart-bar { fill: var(--bs-primary); }
.chart-bar-pause { fill: var(--bs-primary); opacity: 0.35; }
.chart-bar-wrong { fill: var(--bs-danger); }
.chart-bar-wrong-pause { fill: var(--bs-danger); opacity: 0.35; }
.chart-grid { stroke: currentColor; opacity: 0.18; stroke-width: 1; }
.chart-divider { stroke: currentColor; opacity: 0.25; stroke-width: 1; stroke-dasharray: 3 3; }
.chart-label { fill: currentColor; opacity: 0.6; font-size: 11px; }
.page-no { width: 1.5rem; }
.page-time { width: 5rem; text-align: right; }
.page-bar-track {
  height: 12px;
  background-color: rgba(128, 128, 128, 0.25);
  border-radius: 6px;
  overflow: hidden;
}
.page-bar {
  height: 100%;
  background-color: var(--bs-primary);
}
</style>
