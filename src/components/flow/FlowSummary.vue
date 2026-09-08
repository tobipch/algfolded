<script setup>
import {computed, nextTick, ref} from "vue";
import {useRouter} from "vue-router";
import {useFlowStore} from "@/stores/FlowStore";
import {useAlgsetStore} from "@/stores/AlgsetStore";
import {useSelectedStore} from "@/stores/SelectedStore";
import {useSettingsStore} from "@/stores/SettingsStore";
import {msToHumanReadable, msToClock} from "@/helpers/time_formatter";
import {troubleDelta} from "@/helpers/flow_timing";
import {useI18n} from "vue-i18n";

// Practice is repetition, so the summary answers the two questions a repetition
// actually raises — how fast, how clean — and then how this run sits against the
// ones before it. Everything that needs reading case by case is behind Details:
// the useful per-case output is not a table, it is the bucket.
//
// Without a smart cube only page times exist, so all of it collapses to the
// headline and the page trend rather than being shown empty.
const {t, locale} = useI18n()
const router = useRouter()
const flow = useFlowStore()
const algset = useAlgsetStore()
const selected = useSelectedStore()
const settings = useSettingsStore()

const emit = defineEmits(['again'])

const p = computed(() => settings.store.timerPrecision)
const fmt = (ms) => msToHumanReadable(ms, p.value)
// the session total is a number the user reads once, so it is exact
const fmtTotal = (ms) => msToClock(ms, true)
const label = (key) => algset.caseLabel(key)
const num = (v, digits = 1) => (v == null || !Number.isFinite(v)) ? '-' : v.toFixed(digits)

const s = computed(() => flow.summary)
const pageStats = computed(() => flow.pageSummary)
const wallMs = computed(() => Math.max(0, flow.endedAt - flow.startedAt))
const stats = computed(() => flow.runStats)

// --- how this run sits against the ones before it -------------------------

const isNewBest = computed(() =>
    flow.runRecorded && stats.value.count > 1
    && stats.value.best != null && stats.value.best.at === flow.endedAt)

const headlineContext = computed(() => {
  if (!flow.runRecorded || stats.value.count < 2) return null
  if (isNewBest.value) return {text: t('flow.new_best'), good: true}
  const reference = stats.value.ao5 ?? stats.value.mean
  if (reference == null) return null
  const delta = wallMs.value - reference
  const against = stats.value.ao5 != null ? t('flow.runs_ao5') : t('flow.runs_mean')
  if (Math.abs(delta) < 100) return {text: t('flow.vs_same', {against}), good: false}
  return {
    text: t(delta < 0 ? 'flow.vs_faster' : 'flow.vs_slower',
        {delta: fmt(Math.abs(delta)), against}),
    good: delta < 0,
  }
})

// --- the run series -------------------------------------------------------
// One chart, one list, side by side. The times themselves read better as a
// list — you compare them by looking, not by following a line — so the plot is
// left to the one thing a list cannot show at a glance: whether the practice
// is getting more fluid.

const CHART_W = 640

const makeLine = (values, height, padLeft) => {
  if (values.length === 0) return null
  const pad = {l: padLeft, r: 14, t: 12, b: 20}
  const spanX = CHART_W - pad.l - pad.r
  const spanY = height - pad.t - pad.b
  const low = Math.min(...values)
  const high = Math.max(...values)
  const margin = Math.max((high - low) * 0.3, high * 0.05, 1)
  const min = Math.max(0, low - margin)
  const max = high + margin
  const x = (i) => pad.l + (values.length === 1 ? spanX / 2 : (spanX * i) / (values.length - 1))
  const y = (v) => pad.t + spanY - (spanY * (v - min)) / ((max - min) || 1)
  return {
    width: CHART_W, height, pad,
    points: values.map((v, i) => ({i, v, x: x(i), y: y(v)})),
    path: values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' '),
    grid: [0, 0.5, 1].map((f) => {
      const v = min + (max - min) * f
      return {v, y: y(v)}
    }),
  }
}

const series = computed(() => flow.comparableRuns)
const hasSeries = computed(() => series.value.length >= 2)

// Flow is the share of the run actually spent turning. Stated positively on
// purpose: the line going up means the practice is getting more fluid, which
// is the thing worth chasing. Its mirror image, the pause, is right there in
// the split bar below for anyone who wants it that way round.
const flowShare = (r) => {
  const total = r.execMs + r.pauseMs + r.recoveryMs
  return total > 0 ? (r.execMs / total) * 100 : 0
}
const flowChart = computed(() => hasSeries.value
    ? makeLine(series.value.map(flowShare), 240, 44) : null)

const bestAt = computed(() => stats.value.best?.at ?? null)
const isCurrent = (run) => flow.runRecorded && run.at === flow.endedAt
const pointClass = (run) => isCurrent(run) ? 'chart-dot-current' : 'chart-dot-quiet'

// --- hover ----------------------------------------------------------------

// A viewBox plus max-height letterboxes the drawing inside its element, so
// mapping the pointer by element width alone puts the tooltip beside the mark
// it belongs to. The SVG's own screen matrix is exact whatever the scaling.
const svgPointer = (svg, clientX) => {
  const ctm = svg.getScreenCTM()
  return ctm ? (clientX - ctm.e) / ctm.a : null
}
const svgToBox = (svg, x, y) => {
  const ctm = svg.getScreenCTM()
  const rect = svg.getBoundingClientRect()
  if (!ctm) return {left: 0, top: 0}
  return {left: x * ctm.a + ctm.e - rect.left, top: y * ctm.d + ctm.f - rect.top}
}

const chartRef = ref(null)
const hover = ref(null)

const onChartMove = (e) => {
  const svg = chartRef.value
  const chart = flowChart.value
  if (!svg || !chart) return
  const xInView = svgPointer(svg, e.clientX)
  if (xInView == null) return
  let nearest = chart.points[0]
  for (const pt of chart.points) {
    if (Math.abs(pt.x - xInView) < Math.abs(nearest.x - xInView)) nearest = pt
  }
  const run = series.value[nearest.i]
  hover.value = {
    ...svgToBox(svg, nearest.x, nearest.y),
    crosshair: nearest.x,
    text: `#${nearest.i + 1} · ${Math.round(flowShare(run))}% · ${fmtTotal(run.ms)}`,
  }
}
const onChartLeave = () => { hover.value = null }

// Hovering a bar names the case and what it cost — the chart is otherwise a
// shape without labels.
const caseChartRef = ref(null)
const caseHover = ref(null)

const onCaseMove = (e) => {
  const svg = caseChartRef.value
  const chart = caseChart.value
  if (!svg || !chart) return
  const xInView = svgPointer(svg, e.clientX)
  if (xInView == null) return
  const centre = (b) => b.x + b.w / 2
  let nearest = 0
  for (let i = 1; i < chart.bars.length; i++) {
    if (Math.abs(centre(chart.bars[i]) - xInView) < Math.abs(centre(chart.bars[nearest]) - xInView)) {
      nearest = i
    }
  }
  const bar = chart.bars[nearest]
  const record = flow.records[nearest]
  caseHover.value = {
    ...svgToBox(svg, centre(bar), bar.pauseY),
    label: label(record.key),
    text: fmt(record.pauseMs + record.execMs),
    wrong: record.wrong,
  }
}
const onCaseLeave = () => { caseHover.value = null }

// --- the bucket -----------------------------------------------------------

const BUCKET_SHOWN = 24
const bucketShown = computed(() => flow.bucket.slice(0, BUCKET_SHOWN))
const bucketRest = computed(() => Math.max(0, flow.bucket.length - BUCKET_SHOWN))

// Drill exactly the cases that keep going wrong, then start over. The
// selection change reaches SessionStore through App.vue's watcher, so the new
// run has to be started after it has landed.
const drillBucket = async () => {
  if (flow.bucket.length === 0) return
  selected.applyFromPreset(new Set(flow.bucket))
  await nextTick()
  emit('again')
}

// --- details --------------------------------------------------------------

const tab = ref('cases')

const splitTotalMs = computed(() =>
    s.value.execMs + s.value.pauseMs + s.value.recoveryMs + flow.abandonedMs)
const flowPct = computed(() =>
    splitTotalMs.value > 0 ? (s.value.execMs / splitTotalMs.value) * 100 : 0)

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
const caseChart = computed(() => {
  const records = flow.records
  if (records.length === 0) return null
  const width = 640, height = 200
  const padLeft = 46, padRight = 16, padTop = 14, padBottom = 24
  const spanX = width - padLeft - padRight
  const spanY = height - padTop - padBottom
  const maxValue = Math.max(...records.map(r => r.pauseMs + r.execMs)) * 1.1 || 1
  const slot = spanX / records.length
  const barWidth = Math.max(1.5, Math.min(24, slot * 0.7))
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
      // a 2px gap so the two segments read as two, not one long bar
      pauseY: base - execH - pauseH - 2, pauseH: Math.max(0, pauseH - 2),
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

const runRows = computed(() => series.value
    .map((r, i) => ({
      ...r,
      nr: i + 1,
      isBest: bestAt.value != null && r.at === bestAt.value,
      isCurrent: isCurrent(r),
    }))
    .reverse()
    .slice(0, 50))
const when = (at) => new Date(at).toLocaleString(locale.value, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

// The cases of THIS run that gave trouble: the ones that went wrong, and the
// ones that came out well off the user's own pace. Same judgement the bucket
// uses, so the two never contradict each other.
const struggled = computed(() => {
  const seen = new Map()
  for (const r of flow.records) {
    const delta = troubleDelta(r, flow.emaSnapshot[r.key])
    if (delta <= 0) continue
    const entry = seen.get(r.key)
    if (!entry || delta > entry.delta) {
      seen.set(r.key, {key: r.key, delta, wrong: r.wrong, execMs: r.execMs})
    }
  }
  return [...seen.values()].sort((a, b) => b.delta - a.delta || b.execMs - a.execMs)
})

// The best run is worth naming, not just timing: "run 3 of 8" tells you
// whether you are still improving or peaked a while ago.
const bestNr = computed(() => {
  const i = series.value.findIndex(r => r.at === bestAt.value)
  return i < 0 ? null : i + 1
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
        <div class="flow-hero">
          {{ $t('flow.headline', {cases: s.cases, time: fmtTotal(wallMs)}, s.cases) }}
        </div>
        <div v-if="headlineContext" class="flow-hero-context"
             :class="headlineContext.good ? 'text-success' : 'text-muted'">
          {{ headlineContext.text }}
        </div>
        <div v-else class="flow-hero-context text-muted">
          {{ $t('flow.runs_none', {pages: flow.pageCount}, flow.pageCount) }}
        </div>
      </div>

      <!-- Each tile says what its number is in the number itself: "3 von 5"
           needs no caption, a bare "60%" does. The icon carries the meaning
           before the label is even read. -->
      <div class="row g-3 mb-4">
        <div class="col-12" :class="hasSeries ? 'col-sm-4' : 'col-sm-6'">
          <div class="card h-100 bg-body-tertiary border">
            <div class="card-body py-3">
              <div class="tile-label">
                <i class="bi bi-check2-circle"></i> {{ $t('flow.fig_accuracy') }}
              </div>
              <div class="flow-figure" :class="{'text-success': s.firstTry === s.cases}">
                {{ $t('flow.right_of_total', {right: s.firstTry, total: s.cases}) }}
              </div>
              <div class="tile-meter mt-2">
                <div class="tile-meter-fill" :style="{width: (s.accuracy * 100) + '%'}"></div>
              </div>
            </div>
          </div>
        </div>
        <template v-if="hasSeries">
          <div class="col-6 col-sm-4">
            <div class="card h-100 bg-body-tertiary border">
              <div class="card-body py-3">
                <div class="tile-label">
                  <i class="bi bi-speedometer2"></i> {{ $t('flow.fig_ao5') }}
                </div>
                <div class="flow-figure">{{ stats.ao5 == null ? '-' : fmtTotal(stats.ao5) }}</div>
                <div class="text-muted small">
                  <template v-if="stats.ao12 != null">
                    {{ $t('flow.runs_ao12') }} {{ fmtTotal(stats.ao12) }}
                  </template>
                  <template v-else-if="stats.ao5 == null">{{ $t('flow.ao5_needs_more') }}</template>
                  <template v-else>{{ $t('flow.ao12_needs_more') }}</template>
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-sm-4">
            <div class="card h-100 bg-body-tertiary border">
              <div class="card-body py-3">
                <div class="tile-label">
                  <i class="bi bi-trophy"></i> {{ $t('flow.fig_best') }}
                </div>
                <div class="flow-figure text-success">
                  {{ stats.best == null ? '-' : fmtTotal(stats.best.ms) }}
                </div>
                <div class="text-muted small">
                  {{ bestNr == null ? '' : $t('flow.best_run_nr', {nr: bestNr, total: stats.count}) }}
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- how the runs compare with each other: the plot for the trend,
           the list for the times themselves -->
      <div v-if="hasSeries" class="row g-3 mb-4">
        <div class="col-12 col-lg-7">
          <div class="text-muted text-uppercase small mb-1">{{ $t('flow.chart_flow_share') }}</div>
          <div class="chart-hover-wrap">
            <svg ref="chartRef" :viewBox="`0 0 ${flowChart.width} ${flowChart.height}`"
                 class="flow-chart" role="img" :aria-label="$t('flow.chart_flow_share')"
                 @mousemove="onChartMove" @mouseleave="onChartLeave">
              <line v-for="(g, i) in flowChart.grid" :key="'g' + i"
                    :x1="flowChart.pad.l" :y1="g.y"
                    :x2="flowChart.width - flowChart.pad.r" :y2="g.y" class="chart-grid"/>
              <text v-for="(g, i) in flowChart.grid" :key="'t' + i"
                    :x="flowChart.pad.l - 8" :y="g.y + 4" text-anchor="end" class="chart-label">
                {{ Math.round(g.v) }}%
              </text>
              <line v-if="hover" :x1="hover.crosshair" :y1="flowChart.pad.t"
                    :x2="hover.crosshair" :y2="flowChart.height - flowChart.pad.b"
                    class="chart-crosshair"/>
              <path :d="flowChart.path" class="chart-line chart-line-quiet" fill="none"/>
              <circle v-for="pt in flowChart.points" :key="pt.i"
                      :cx="pt.x" :cy="pt.y" :r="isCurrent(series[pt.i]) ? 6 : 4"
                      :class="pointClass(series[pt.i])"/>
            </svg>
            <div v-if="hover" class="chart-tooltip"
                 :style="{left: hover.left + 'px', top: (hover.top - 34) + 'px'}">
              {{ hover.text }}
            </div>
          </div>
          <p class="text-muted small mb-0">
            {{ $t('flow.flow_share', {pct: Math.round(flowPct)}) }}
          </p>
        </div>

        <div class="col-12 col-lg-5">
          <div class="text-muted text-uppercase small mb-1">
            {{ $t('flow.runs_title') }} ({{ stats.count }})
          </div>
          <div class="run-list">
            <table class="table table-sm align-middle mb-0">
              <thead>
              <tr>
                <th class="run-col-nr">{{ $t('flow.col_run') }}</th>
                <th>{{ $t('flow.col_time') }}</th>
                <th class="text-end">{{ $t('flow.col_right') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="r in runRows" :key="r.at" :title="when(r.at)"
                  :class="{'run-current': r.isCurrent}">
                <td class="text-muted">{{ r.nr }}</td>
                <td class="fw-semibold" :class="{'text-success': r.isBest}">
                  {{ fmtTotal(r.ms) }}<span v-if="r.isBest">&nbsp;{{ $t('flow.runs_best_marker') }}</span>
                </td>
                <td class="text-muted text-end">{{ r.firstTry }} / {{ r.cases }}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- where the time went, and what each case cost -->
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

      <div v-if="caseChart" class="mb-4">
        <div class="text-muted text-uppercase small mb-2">{{ $t('flow.per_case_chart') }}</div>
        <div class="chart-hover-wrap">
          <svg ref="caseChartRef" :viewBox="`0 0 ${caseChart.width} ${caseChart.height}`"
               class="flow-chart" role="img" :aria-label="$t('flow.per_case_chart')"
               @mousemove="onCaseMove" @mouseleave="onCaseLeave">
            <line v-for="(g, i) in caseChart.grid" :key="'g' + i"
                  :x1="caseChart.padLeft" :y1="g.y"
                  :x2="caseChart.width - caseChart.padRight" :y2="g.y" class="chart-grid"/>
            <text v-for="(g, i) in caseChart.grid" :key="'t' + i"
                  :x="caseChart.padLeft - 8" :y="g.y + 4" text-anchor="end" class="chart-label">
              {{ g.text }}
            </text>
            <line v-for="(x, i) in caseChart.dividers" :key="'d' + i"
                  :x1="x" y1="14" :x2="x" :y2="caseChart.height - 24" class="chart-divider"/>
            <g v-for="(b, i) in caseChart.bars" :key="'b' + i">
              <rect :x="b.x" :y="b.execY" :width="b.w" :height="b.execH"
                    :class="b.wrong ? 'chart-bar-wrong' : 'chart-bar'"/>
              <rect :x="b.x" :y="b.pauseY" :width="b.w" :height="b.pauseH"
                    :class="b.wrong ? 'chart-bar-wrong-pause' : 'chart-bar-pause'"/>
            </g>
          </svg>
          <div v-if="caseHover" class="chart-tooltip"
               :style="{left: caseHover.left + 'px', top: (caseHover.top - 34) + 'px'}">
            <strong>{{ caseHover.label }}</strong> {{ caseHover.text }}
          </div>
        </div>
        <!-- the cases of this run that gave trouble, right under the shape
             that shows them -->
        <div v-if="struggled.length" class="mt-3 d-flex flex-wrap align-items-center gap-2">
          <span class="text-muted small me-1">{{ $t('flow.struggled_title') }}</span>
          <span v-for="c in struggled" :key="c.key" class="case-chip"
                :class="c.wrong ? 'case-chip-wrong' : 'case-chip-slow'"
                :title="$t(c.wrong ? 'flow.struggled_wrong' : 'flow.struggled_slow')">
            <i class="bi" :class="c.wrong ? 'bi-x-lg' : 'bi-hourglass-split'"></i>
            {{ label(c.key) }}
          </span>
        </div>
      </div>

      <!-- the cases worth drilling next; nothing to show when nothing is due -->
      <div v-if="flow.bucket.length" class="mb-4">
        <div class="text-muted text-uppercase small mb-2" :title="$t('flow.bucket_intro')">
          {{ $t('flow.bucket_title') }} ({{ flow.bucket.length }})
        </div>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <span v-for="key in bucketShown" :key="key" class="bucket-chip">{{ label(key) }}</span>
            <span v-if="bucketRest" class="text-muted small">
              {{ $t('flow.bucket_more', {n: bucketRest}) }}
            </span>
          </div>
        <button class="btn btn-warning mt-3" type="button" tabindex="-1"
                @keydown.space.prevent="" @click="drillBucket">
          {{ $t('flow.bucket_drill', {n: flow.bucket.length}) }}
        </button>
      </div>

      <details class="flow-details">
        <summary class="text-muted">{{ $t('flow.details') }}</summary>
        <div class="pt-3 table-responsive">
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
      </details>
    </template>

    <!-- without a cube only the pages were measured -->
    <template v-else-if="!flow.tracked && pageStats.pages > 0">
      <div class="mb-4">
        <div class="flow-hero">
          {{ $t('flow.headline',
              {cases: pageStats.cases, time: fmtTotal(pageStats.totalMs)}, pageStats.cases) }}
        </div>
        <div class="flow-hero-context text-muted">
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
.flow-hero {
  font-size: clamp(1.8rem, 6vw, 3rem);
  font-weight: 700;
  line-height: 1.1;
}
.flow-hero-context {
  font-size: 1.05rem;
  margin-top: 0.15rem;
}
/* icon + plain label; sentence case, so tiles do not read as section headers */
.tile-label {
  font-size: 0.9rem;
  color: var(--bs-secondary-color, #6c757d);
  margin-bottom: 0.1rem;
}
.tile-label .bi {
  margin-right: 0.2rem;
}
/* the ratio, drawn: how much of the run was right first time */
.tile-meter {
  height: 6px;
  border-radius: 3px;
  background-color: rgba(128, 128, 128, 0.25);
  overflow: hidden;
}
.tile-meter-fill {
  height: 100%;
  background-color: var(--bs-success);
}
.flow-figure {
  font-size: clamp(1.35rem, 5.5vw, 2rem);
  font-weight: 600;
  line-height: 1.2;
}
.split-bar {
  display: flex;
  gap: 2px;
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
.chart-hover-wrap {
  position: relative;
}
.flow-chart {
  width: 100%;
  min-width: 280px;
  height: auto;
  max-height: 240px;
  cursor: crosshair;
}
/* the list stands beside the chart, so it is capped at roughly the chart's
   rendered height and scrolls past that */
.run-list {
  max-height: 220px;
  overflow-y: auto;
}
.run-list thead th {
  position: sticky;
  top: 0;
  background: var(--bs-body-bg);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--bs-secondary-color, #6c757d);
}
.run-col-nr { width: 3rem; }
.run-current > td {
  background: rgba(var(--bs-primary-rgb), 0.08);
}
.chart-tooltip {
  position: absolute;
  transform: translateX(-50%);
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.78rem;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
.chart-bar { fill: var(--bs-primary); }
.chart-bar-pause { fill: var(--bs-primary); opacity: 0.35; }
.chart-bar-wrong { fill: var(--bs-danger); }
.chart-bar-wrong-pause { fill: var(--bs-danger); opacity: 0.35; }
.chart-grid { stroke: currentColor; opacity: 0.18; stroke-width: 1; }
.chart-divider { stroke: currentColor; opacity: 0.25; stroke-width: 1; stroke-dasharray: 3 3; }
.chart-crosshair { stroke: currentColor; opacity: 0.35; stroke-width: 1; }
.chart-label { fill: currentColor; opacity: 0.6; font-size: 11px; }
.chart-line {
  stroke: var(--bs-primary);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.chart-line-quiet { stroke: var(--bs-primary); opacity: 0.45; }
.chart-dot-quiet { fill: var(--bs-primary); opacity: 0.55; }
/* the run just finished, so it can be found on the line */
.chart-dot-current {
  fill: var(--bs-primary);
  stroke: var(--bs-body-bg);
  stroke-width: 2;
}
/* this run's problem cases: icon plus label, so the tint is never the only
   thing carrying the meaning */
.case-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--bs-border-color);
  font-weight: 600;
  font-size: 0.95rem;
}
.case-chip-wrong {
  color: var(--bs-danger);
  border-color: var(--bs-danger);
}
.case-chip-slow {
  color: var(--bs-body-color);
}
.bucket-chip {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--bs-border-color);
  background: var(--bs-body-bg);
  font-weight: 600;
  font-size: 0.95rem;
}
.flow-details > summary {
  cursor: pointer;
  padding: 0.25rem 0;
}
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
