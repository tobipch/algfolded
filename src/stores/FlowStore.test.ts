import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { AlgCase } from '@/algsets/types'

// A flow run end to end: pages get filled from the session's picker, completed
// cases are booked as ordinary solves, and only the execution reaches the SRS
// average. Driven with explicit timestamps so nothing here depends on a clock.

const CASES: AlgCase[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id, i) => ({
  id, path: ['UFR', 'A', id], algs: ["R U R'"], scrambles: [`S${i}`],
}))

vi.mock('@/stores/AlgsetStore', () => ({
  useAlgsetStore: () => ({
    activeId: 'testset',
    cases: CASES,
    byId: Object.fromEntries(CASES.map((c) => [c.id, c])),
    caseLabel: (id: string) => id,
  }),
}))

const enqueued: { caseKey: string; ms: number; source: string }[] = []
vi.mock('@/stores/SolveSyncStore', () => ({
  useSolveSyncStore: () => ({
    enqueue: (s: { caseKey: string; ms: number; source: string }) => { enqueued.push(s) },
    remove: () => {},
  }),
}))
vi.mock('@/stores/BluetoothCubeStore', () => ({
  useBluetoothCubeStore: () => ({ connected: false, lastSolveMoves: null }),
}))
vi.mock('@/stores/DisplayStore', () => ({
  useDisplayStore: () => ({ showToast: vi.fn() }),
}))

const ema = (session: {srsData: unknown}) =>
  session.srsData as Record<string, {a: number, n: number, s: number}>

const load = async () => {
  const { useSessionStore } = await import('@/stores/SessionStore')
  const { useFlowStore } = await import('@/stores/FlowStore')
  const session = useSessionStore()
  session.setSelectedKeys(CASES.map((c) => c.id))
  return { session, flow: useFlowStore() }
}

// Execute the current case: armed at `at`, first move after `pause`, solved
// `exec` later. The store is plain JS, so it is driven untyped here.
/* eslint-disable @typescript-eslint/no-explicit-any */
const solveCase = (flow: any, at: number, pause = 500, exec = 1500, moves = 10): boolean => {
  flow.noteMove(at + pause)
  return flow.completeCurrent(moves, at + pause + exec)
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  enqueued.length = 0
  setActivePinia(createPinia())
})

describe('a tracked flow run', () => {
  it('opens on a full page of five distinct cases', async () => {
    const { flow } = await load()
    flow.start({ pages: 2, tracked: true }, 0)
    expect(flow.currentPage).toHaveLength(5)
    expect(new Set(flow.currentPage.map((c: {key: string}) => c.key)).size).toBe(5)
    expect(flow.currentPage.every((c: {scramble: string}) => c.scramble)).toBe(true)
    expect(flow.pageIndex).toBe(0)
    expect(flow.caseIndex).toBe(0)
  })

  it('advances to the next case immediately and signals the end of a page', async () => {
    const { flow } = await load()
    flow.start({ pages: 2, tracked: true }, 0)
    for (let i = 0; i < 4; i++) {
      expect(solveCase(flow, i * 2000)).toBe(false)
      expect(flow.caseIndex).toBe(i + 1)
    }
    expect(solveCase(flow, 8000)).toBe(true) // fifth: page done, hold the green
    expect(flow.advancing).toBe(true)
  })

  it('swaps in a fresh page and ends after the last one', async () => {
    const { flow } = await load()
    flow.start({ pages: 2, tracked: true }, 0)
    for (let i = 0; i < 5; i++) solveCase(flow, i * 2000)
    flow.nextPage(10000)
    expect(flow.pageIndex).toBe(1)
    expect(flow.caseIndex).toBe(0)
    expect(flow.finished).toBe(false)

    for (let i = 0; i < 5; i++) solveCase(flow, 10000 + i * 2000)
    flow.nextPage(20000)
    expect(flow.finished).toBe(true)
    expect(flow.records).toHaveLength(10)
  })

  it('books each completed case as a normal solve, timed by execution alone', async () => {
    const { session, flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    const key = flow.currentCase.key
    solveCase(flow, 0, 800, 2200)

    expect(session.stats()).toHaveLength(1)
    expect(session.stats()[0]).toMatchObject({ key, ms: 2200, flow: true })
    // the EMA sees the execution, never the recall pause
    expect(ema(session)[key].a).toBeCloseTo(2.2, 6)
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({ caseKey: key, ms: 2200, source: 'timer' })
  })

  it('books an abandoned attempt as recovery and keeps the case retryable', async () => {
    const { session, flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    const key = flow.currentCase.key

    flow.noteMove(500)
    flow.retryCurrent(6000)      // botched: 6s thrown away
    expect(flow.caseIndex).toBe(0)
    flow.noteMove(6400)
    flow.completeCurrent(10, 8000)

    const record = flow.records[0]
    expect(record).toMatchObject({ key, recoveryMs: 6000, pauseMs: 400, execMs: 1600, wrong: true })
    // only the clean execution reaches the average
    expect(ema(session)[key].a).toBeCloseTo(1.6, 6)
  })

  it('keeps the cases already done on a page when one is retried', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    solveCase(flow, 0)
    solveCase(flow, 2000)
    flow.retryCurrent(5000)
    expect(flow.caseIndex).toBe(2)
    expect(flow.caseStates.slice(0, 2)).toEqual(['done', 'done'])
  })

  it('marks a wrong execution without moving on', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    flow.noteMove(400)
    flow.noteWrong()
    expect(flow.caseIndex).toBe(0)
    expect(flow.caseStates[0]).toBe('wrong')
    flow.completeCurrent(14, 5000)
    expect(flow.records[0].wrong).toBe(true)
    expect(flow.records[0].recoveryMs).toBe(0)
  })

  it('summarises against the average the cases had before the run', async () => {
    const { session, flow } = await load()
    // give every case a 3s average up front
    for (const c of CASES) ema(session)[c.id] = { a: 3, n: 5, s: 1 }
    flow.start({ pages: 1, tracked: true }, 0)
    for (let i = 0; i < 5; i++) solveCase(flow, i * 5000, 500, 2000, 10)
    flow.nextPage(25000)

    const s = flow.summary!
    expect(s.cases).toBe(5)
    expect(s.execPerCase).toBe(2000)
    expect(s.reference!.execPerCase).toBe(3000) // the pre-run average, not the moved one
    expect(s.firstTry).toBe(5)
  })

  it('leaves the clock at zero until the first move of the run', async () => {
    const { flow } = await load()
    flow.start({ pages: 2, tracked: true }, 1000)
    // reading the first case is not part of the session
    expect(flow.elapsedMs(4000)).toBe(0)
    flow.noteMove(4000)
    expect(flow.elapsedMs(6000)).toBe(2000)
    flow.completeCurrent(10, 5500)
    // and it keeps running through the recall pauses that follow
    expect(flow.elapsedMs(9000)).toBe(5000)
  })

  it('runs the clock from the page appearing when there is no cube to wait for', async () => {
    const { flow } = await load()
    flow.start({ pages: 2, tracked: false }, 1000)
    expect(flow.elapsedMs(4000)).toBe(3000)
  })

  it('a run ended without a single move is zero long, not epoch long', async () => {
    const { flow } = await load()
    flow.start({ pages: 2, tracked: true }, 1000)
    flow.finish(9000)
    expect(flow.elapsedMs(9000)).toBe(0)
    expect(flow.endedAt - flow.startedAt).toBe(0)
  })

  it('finishing early books the unfinished case as time, not as a case', async () => {
    const { flow } = await load()
    flow.start({ pages: 4, tracked: true }, 0)
    solveCase(flow, 0)
    flow.noteMove(3000)
    flow.finish(9000)
    expect(flow.finished).toBe(true)
    expect(flow.records).toHaveLength(1)
    expect(flow.abandonedMs).toBe(7000) // armed at 2000, ended at 9000
  })
})

describe('an untracked flow run', () => {
  it('measures whole pages and records no solves', async () => {
    const { session, flow } = await load()
    flow.start({ pages: 2, tracked: false }, 0)
    flow.advancePageManually(10000)
    expect(flow.pageIndex).toBe(1)
    expect(flow.finished).toBe(false)
    flow.advancePageManually(18000)

    expect(flow.finished).toBe(true)
    expect(session.stats()).toHaveLength(0)
    expect(enqueued).toHaveLength(0)
    expect(flow.summary).toBeNull()
    expect(flow.pageSummary).toMatchObject({ pages: 2, cases: 10, totalMs: 18000, msPerCase: 1800 })
  })

  it('ignores the manual page turn once a cube is driving the run', async () => {
    const { flow } = await load()
    flow.start({ pages: 2, tracked: true }, 0)
    flow.advancePageManually(5000)
    expect(flow.pageIndex).toBe(0)
    expect(flow.pageTimes).toEqual([])
  })
})

describe('a selection smaller than a page', () => {
  it('still fills five slots, leaning on the picker\'s own fallback', async () => {
    const { useSessionStore } = await import('@/stores/SessionStore')
    const { useFlowStore } = await import('@/stores/FlowStore')
    const session = useSessionStore()
    session.setSelectedKeys(['c1', 'c2'])
    const flow = useFlowStore()
    flow.start({ pages: 1, tracked: true }, 0)
    const page: {key: string}[] = flow.currentPage
    expect(page).toHaveLength(5)
    expect(page.every((c) => ['c1', 'c2'].includes(c.key))).toBe(true)
  })
})

describe('comparing one run with the next', () => {
  // A full run of `pages` pages, each case taking pause+exec, so the run's
  // wall clock is deterministic.
  const fullRun = async (flow: any, pages: number, at: number, exec = 1500) => {
    flow.start({ pages, tracked: true }, at)
    let t = at
    for (let p = 0; p < pages; p++) {
      for (let c = 0; c < 5; c++) {
        flow.noteMove(t + 500)
        flow.completeCurrent(10, t + 500 + exec)
        t += 500 + exec
      }
      flow.nextPage(t)
    }
    return t
  }

  it('keeps a completed run and compares later ones against it', async () => {
    const { flow } = await load()
    await fullRun(flow, 2, 0, 2000)
    expect(flow.comparableRuns).toHaveLength(1)
    // the clock runs from the first move, so the opening recall is not in it
    expect(flow.comparableRuns[0]).toMatchObject({ pages: 2, cases: 10, firstTry: 10 })
    expect(flow.runStats).toMatchObject({ count: 1, ao5: null, ao12: null })
    expect(flow.runStats.best!.ms).toBe(flow.comparableRuns[0].ms)

    await fullRun(flow, 2, 1_000_000, 1000)
    expect(flow.comparableRuns).toHaveLength(2)
    // the second run was faster, so it is the one to beat
    expect(flow.runStats.best!.ms).toBe(flow.comparableRuns[1].ms)
    expect(flow.runStats.best!.ms).toBeLessThan(flow.comparableRuns[0].ms)
  })

  it('only compares runs of the same length', async () => {
    const { flow } = await load()
    await fullRun(flow, 2, 0)
    await fullRun(flow, 3, 1_000_000)
    expect(flow.runs).toHaveLength(2)
    expect(flow.comparableRuns).toHaveLength(1)      // the 3-page series
    expect(flow.comparableRuns[0].pages).toBe(3)
  })

  it('does not keep a run that was cut short', async () => {
    const { flow } = await load()
    flow.start({ pages: 3, tracked: true }, 0)
    flow.noteMove(500)
    flow.completeCurrent(10, 2000)
    flow.finish(3000)                                 // the Finish button
    expect(flow.runs).toHaveLength(0)
  })

  it('does not keep a run nobody measured', async () => {
    const { flow } = await load()
    flow.start({ pages: 2, tracked: false }, 0)
    flow.advancePageManually(10000)
    flow.advancePageManually(20000)
    expect(flow.finished).toBe(true)
    expect(flow.runs).toHaveLength(0)
  })

  it('survives a corrupt or foreign run history', async () => {
    localStorage.setItem('algfolded_flow_runs:testset', '{"nicht":"ein array"}')
    const { flow } = await load()
    expect(flow.runs).toEqual([])
  })

  it('reads the history back on the next visit', async () => {
    const { flow } = await load()
    await fullRun(flow, 2, 0)
    const stored = JSON.parse(localStorage.getItem('algfolded_flow_runs:testset')!)
    expect(stored).toHaveLength(1)
    expect(stored[0].pages).toBe(2)
  })
})

describe('the bucket of difficult cases', () => {
  // Drive one page where every case goes wrong (a retry books recovery, which
  // is what marks a case wrong).
  const badPage = (flow: any, at: number) => {
    for (let c = 0; c < 5; c++) {
      flow.noteMove(at + 100)
      flow.retryCurrent(at + 2000)
      flow.noteMove(at + 2100)
      flow.completeCurrent(10, at + 3000)
      at += 3000
    }
    flow.nextPage(at)
    return at
  }

  it('stays empty after a single bad run — one bad run is not a pattern', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    badPage(flow, 0)
    expect(flow.bucket).toEqual([])
    expect(Object.keys(flow.trouble)).toHaveLength(5)   // ...but it is being watched
  })

  it('fills once cases keep going wrong, and survives a reload', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    const t = badPage(flow, 0)
    flow.start({ pages: 1, tracked: true }, t + 1000)
    badPage(flow, t + 1000)
    expect(flow.bucket.length).toBeGreaterThan(0)
    const stored = JSON.parse(localStorage.getItem('algfolded_flow_trouble:testset')!)
    expect(Object.keys(stored).length).toBeGreaterThan(0)
  })

  it('collects a case that is repeatedly much slower than its own average', async () => {
    const { session, flow } = await load()
    for (const c of CASES) ema(session)[c.id] = { a: 1, n: 5, s: 1 }   // 1s average
    for (let run = 0; run < 3; run++) {
      flow.start({ pages: 1, tracked: true }, run * 100000)
      let t = run * 100000
      for (let c = 0; c < 5; c++) {
        flow.noteMove(t + 100)
        flow.completeCurrent(10, t + 5100)     // 5s against a 1s average
        t += 5100
      }
      flow.nextPage(t)
    }
    expect(flow.bucket.length).toBeGreaterThan(0)
  })

  it('does not collect cases that are executed cleanly and quickly', async () => {
    const { session, flow } = await load()
    for (const c of CASES) ema(session)[c.id] = { a: 5, n: 5, s: 1 }
    for (let run = 0; run < 3; run++) {
      flow.start({ pages: 1, tracked: true }, run * 100000)
      let t = run * 100000
      for (let c = 0; c < 5; c++) {
        flow.noteMove(t + 100)
        flow.completeCurrent(10, t + 1100)     // 1s against a 5s average
        t += 1100
      }
      flow.nextPage(t)
    }
    expect(flow.bucket).toEqual([])
    expect(flow.trouble).toEqual({})
  })

  it('fills from a run that was cut short too', async () => {
    const { flow } = await load()
    flow.start({ pages: 4, tracked: true }, 0)
    flow.noteMove(100)
    flow.retryCurrent(2000)
    flow.noteMove(2100)
    flow.completeCurrent(10, 3000)
    flow.finish(4000)                          // the Finish button
    expect(flow.runs).toHaveLength(0)          // not comparable...
    expect(Object.keys(flow.trouble)).toHaveLength(1)  // ...but the case still misbehaved
  })

  it('ignores a run nobody measured', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: false }, 0)
    flow.advancePageManually(10000)
    expect(flow.trouble).toEqual({})
  })

  it('survives a corrupt tally', async () => {
    localStorage.setItem('algfolded_flow_trouble:testset', '[1,2,3]')
    const { flow } = await load()
    expect(flow.trouble).toEqual({})
    expect(flow.bucket).toEqual([])
  })
})
