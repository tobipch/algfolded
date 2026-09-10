import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { summarizeFlow, summarizeRuns, type FlowRun } from '@/helpers/flow_timing'

// The Ao5 tile of the flow summary: next to the current Ao5 / Ao12 it names the
// best the series ever had, so a run can be read against a personal best.

const run = (ms: number, i: number): FlowRun => ({
  at: 1700000000000 + i * 60000, pages: 4, cases: 20, ms,
  execMs: ms / 2, pauseMs: ms / 2, recoveryMs: 0, moves: 200, firstTry: 18,
})

// the fast stretch sits in the middle, so the best Ao5 is not the current one
const TIMES = [90000, 10000, 20000, 20000, 20000, 30000, 80000, 95000]
const RUNS = TIMES.map(run)

const records = [
  { key: 'c1', page: 0, index: 0, pauseMs: 500, execMs: 1500, recoveryMs: 0, moves: 10, wrong: false },
  { key: 'c2', page: 0, index: 1, pauseMs: 400, execMs: 1600, recoveryMs: 0, moves: 11, wrong: false },
]

const flow = {
  tracked: true,
  runRecorded: false,
  startedAt: 1000,
  endedAt: 61000,
  pageCount: 4,
  records,
  emaSnapshot: {},
  bucket: [] as string[],
  summary: summarizeFlow(records),
  pageSummary: { pages: 0, cases: 0, totalMs: 0, msPerCase: 0, pageTimes: [] as number[] },
  comparableRuns: RUNS,
  runStats: summarizeRuns(RUNS),
}
vi.mock('@/stores/FlowStore', () => ({ useFlowStore: () => flow }))
vi.mock('@/stores/AlgsetStore', () => ({
  useAlgsetStore: () => ({ caseLabel: (k: string) => k, caseSecondary: () => '' }),
}))
vi.mock('@/stores/SelectedStore', () => ({
  useSelectedStore: () => ({ applyFromPreset: vi.fn() }),
}))
vi.mock('@/stores/SettingsStore', () => ({
  useSettingsStore: () => ({ store: { timerPrecision: 2 } }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    // enough of the real strings to tell the lines apart
    t: (k: string, params?: Record<string, unknown>) =>
      k === 'flow.runs_ao5' ? 'Ao5'
        : k === 'flow.runs_ao12' ? 'Ao12'
          : k === 'flow.runs_best_ao' ? `best: ${params?.values}`
            : k,
    locale: { value: 'en' },
  }),
}))

const mountSummary = async () => {
  const FlowSummary = (await import('@/components/flow/FlowSummary.vue')).default
  return mount(FlowSummary, { global: { mocks: { $t: (k: string) => k } } })
}

beforeEach(() => {
  vi.resetModules()
  setActivePinia(createPinia())
})

describe('best Ao5 / Ao12 in the flow summary', () => {
  it('names the best Ao5 the series ever had, not the current one', async () => {
    const w = await mountSummary()
    const line = w.text().match(/best: [^\n]*/)?.[0] ?? ''
    // best window is runs 2..6: 10,20,20,20,30 -> 20.00s
    expect(line).toContain('Ao5 20.00')
    expect(flow.runStats.ao5).not.toBe(flow.runStats.bestAo5)
  })

  it('leaves the best out until there are five comparable runs', async () => {
    const few = RUNS.slice(0, 4)
    flow.comparableRuns = few
    flow.runStats = summarizeRuns(few)
    const w = await mountSummary()
    expect(w.text()).not.toContain('best:')
    flow.comparableRuns = RUNS
    flow.runStats = summarizeRuns(RUNS)
  })

  it('adds the best Ao12 once twelve runs exist', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => run((i + 1) * 10000, i))
    flow.comparableRuns = twelve
    flow.runStats = summarizeRuns(twelve)
    const w = await mountSummary()
    const line = w.text().match(/best: [^\n]*/)?.[0] ?? ''
    expect(line).toContain('Ao5')
    expect(line).toContain('Ao12')
    flow.comparableRuns = RUNS
    flow.runStats = summarizeRuns(RUNS)
  })
})
