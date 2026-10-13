import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { AlgCase } from '@/algsets/types'

// A flow run end to end: the queue gets filled from the session's picker, completed
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

// The account side of the run series. `authState` is a plain object shared
// with the store, so a test decides whether anyone is logged in; `apiCalls`
// records what the store asked the backend for and `apiReply` answers it.
const authState = { loggedIn: false }
vi.mock('@/stores/AuthStore', () => ({ useAuthStore: () => authState }))

/* eslint-disable @typescript-eslint/no-explicit-any */
const apiCalls: { path: string; method: string; body: any }[] = []
let apiReply: (path: string) => any = () => null
vi.mock('@/helpers/api', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: (path: string, options: any = {}) => {
    apiCalls.push({ path, method: options.method ?? 'GET', body: options.body })
    return Promise.resolve().then(() => apiReply(path))
  },
}))
const posted = () => apiCalls.filter((c) => c.method === 'POST')

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
const solveCase = (flow: any, at: number, pause = 500, exec = 1500, moves = 10): void => {
  flow.noteMove(at + pause)
  flow.completeCurrent(moves, at + pause + exec)
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  enqueued.length = 0
  apiCalls.length = 0
  authState.loggedIn = false
  apiReply = () => ({ runs: [] })
  setActivePinia(createPinia())
})

describe('a tracked flow run', () => {
  it('shows the current case with the next four, all distinct', async () => {
    const { flow } = await load()
    flow.start({ cases: 10, tracked: true }, 0)
    const visible: {key: string, scramble: string, state: string, index: number}[] = flow.visibleCases
    expect(visible).toHaveLength(5)
    expect(new Set(visible.map((c) => c.key)).size).toBe(5)
    expect(visible.every((c) => c.scramble)).toBe(true)
    expect(visible.map((c) => c.state)).toEqual(['current', 'ahead', 'ahead', 'ahead', 'ahead'])
    expect(visible.map((c) => c.index)).toEqual([0, 1, 2, 3, 4])
    expect(flow.caseIndex).toBe(0)
    expect(flow.nextCase).toEqual(flow.queue[1])
  })

  it('moves on by one case at a time, picking the newly visible one', async () => {
    const { flow } = await load()
    flow.start({ cases: 10, tracked: true }, 0)
    for (let i = 0; i < 4; i++) {
      const next = flow.visibleCases[1].key
      solveCase(flow, i * 2000)
      expect(flow.caseIndex).toBe(i + 1)
      // what was second in line is now the current case: no page to wait for
      expect(flow.currentCase.key).toBe(next)
      expect(flow.visibleCases.map((c: {index: number}) => c.index)).toEqual([0, 1, 2, 3, 4].map((j) => j + i + 1))
      expect(flow.queue).toHaveLength(i + 6)
    }
  })

  it('shows fewer cases ahead near the end and ends after the last one', async () => {
    const { flow } = await load()
    flow.start({ cases: 7, tracked: true }, 0)
    for (let i = 0; i < 4; i++) solveCase(flow, i * 2000)
    expect(flow.visibleCases).toHaveLength(3)
    expect(flow.queue).toHaveLength(7)
    solveCase(flow, 8000)
    solveCase(flow, 10000)
    expect(flow.nextCase).toBeNull() // the last case has nothing to cancel into
    expect(flow.finished).toBe(false)
    solveCase(flow, 12000)
    expect(flow.finished).toBe(true)
    expect(flow.records).toHaveLength(7)
    expect(flow.records.map((r: {index: number}) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  // A cancellation finishes two cases with one solve: the second never had a
  // first move of its own, so the view tells the store where it started.
  it('books the second of two cases finished in one go from where it started', async () => {
    const { flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    flow.noteMove(500)
    flow.completeCurrent(7, 2000)           // first case: up to its last own move
    flow.completeCurrent(9, 3500, 2100)     // second: first move 100ms later
    expect(flow.records[1]).toMatchObject({ pauseMs: 100, execMs: 1400, moves: 9 })
    expect(flow.caseIndex).toBe(2)
  })

  it('books each completed case as a normal solve, timed by execution alone', async () => {
    const { session, flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    const key = flow.currentCase.key
    solveCase(flow, 0, 800, 2200)

    expect(session.stats()).toHaveLength(1)
    expect(session.stats()[0]).toMatchObject({ key, ms: 2200, flow: true })
    // the EMA sees the execution, never the recall pause
    expect(ema(session)[key].a).toBeCloseTo(2.2, 6)
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({ caseKey: key, ms: 2200, source: 'timer' })
  })

  // The first case sits on screen while the user is still picking the cube up,
  // so the wait in front of it is setup, not recall. The run's clock starts on
  // the first move; the case has to start there too, or the split claims more
  // time than the run ever took.
  it('starts the first case on the first move, not when it appears', async () => {
    const { flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    flow.noteMove(9000)            // cube picked up nine seconds later
    flow.completeCurrent(10, 11000)

    expect(flow.startedAt).toBe(9000)
    expect(flow.records[0]).toMatchObject({ pauseMs: 0, execMs: 2000 })
    expect(flow.currentCaseMs(5000)).toBe(0) // nothing was running before that
  })

  it('never books more time than the run took', async () => {
    const { flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    flow.noteMove(9000)
    flow.completeCurrent(10, 11000)
    for (let i = 1; i < 5; i++) solveCase(flow, 11000 + (i - 1) * 2000)

    const s = flow.summary!
    expect(s.execMs + s.pauseMs + s.recoveryMs + flow.abandonedMs)
        .toBe(flow.endedAt - flow.startedAt)
  })

  it('keeps the recall of every case after the first', async () => {
    const { flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    flow.noteMove(1000)
    flow.completeCurrent(10, 2000)
    solveCase(flow, 2000, 800, 1200)   // second case: 800ms recall is real
    expect(flow.records.map((r: {pauseMs: number}) => r.pauseMs)).toEqual([0, 800])
  })

  it('books an abandoned attempt as recovery and keeps the case retryable', async () => {
    const { session, flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    const key = flow.currentCase.key

    flow.noteMove(500)           // the run starts here, so the case does too
    flow.retryCurrent(6000)      // botched: 5.5s thrown away
    expect(flow.caseIndex).toBe(0)
    flow.noteMove(6400)
    flow.completeCurrent(10, 8000)

    const record = flow.records[0]
    expect(record).toMatchObject({ key, recoveryMs: 5500, pauseMs: 400, execMs: 1600, wrong: true })
    // only the clean execution reaches the average
    expect(ema(session)[key].a).toBeCloseTo(1.6, 6)
  })

  it('keeps the cases already done when one is retried', async () => {
    const { flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    solveCase(flow, 0)
    solveCase(flow, 2000)
    flow.retryCurrent(5000)
    expect(flow.caseIndex).toBe(2)
    expect(flow.records).toHaveLength(2)
  })

  it('marks a wrong execution without moving on', async () => {
    const { flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    flow.noteMove(400)
    flow.noteWrong()
    expect(flow.caseIndex).toBe(0)
    expect(flow.visibleCases[0].state).toBe('wrong')
    flow.completeCurrent(14, 5000)
    expect(flow.records[0].wrong).toBe(true)
    expect(flow.records[0].recoveryMs).toBe(0)
  })

  it('summarises against the average the cases had before the run', async () => {
    const { session, flow } = await load()
    // give every case a 3s average up front
    for (const c of CASES) ema(session)[c.id] = { a: 3, n: 5, s: 1 }
    flow.start({ cases: 5, tracked: true }, 0)
    for (let i = 0; i < 5; i++) solveCase(flow, i * 5000, 500, 2000, 10)

    const s = flow.summary!
    expect(s.cases).toBe(5)
    expect(s.execPerCase).toBe(2000)
    expect(s.reference!.execPerCase).toBe(3000) // the pre-run average, not the moved one
    expect(s.firstTry).toBe(5)
  })

  it('leaves the clock at zero until the first move of the run', async () => {
    const { flow } = await load()
    flow.start({ cases: 10, tracked: true }, 1000)
    // reading the first case is not part of the session
    expect(flow.elapsedMs(4000)).toBe(0)
    flow.noteMove(4000)
    expect(flow.elapsedMs(6000)).toBe(2000)
    flow.completeCurrent(10, 5500)
    // and it keeps running through the recall pauses that follow
    expect(flow.elapsedMs(9000)).toBe(5000)
  })

  it('runs the clock from the first case appearing when there is no cube to wait for', async () => {
    const { flow } = await load()
    flow.start({ cases: 10, tracked: false }, 1000)
    expect(flow.elapsedMs(4000)).toBe(3000)
  })

  it('a run ended without a single move is zero long, not epoch long', async () => {
    const { flow } = await load()
    flow.start({ cases: 10, tracked: true }, 1000)
    flow.finish(9000)
    expect(flow.elapsedMs(9000)).toBe(0)
    expect(flow.endedAt - flow.startedAt).toBe(0)
  })

  it('finishing early books the unfinished case as time, not as a case', async () => {
    const { flow } = await load()
    flow.start({ cases: 20, tracked: true }, 0)
    solveCase(flow, 0)
    flow.noteMove(3000)
    flow.finish(9000)
    expect(flow.finished).toBe(true)
    expect(flow.records).toHaveLength(1)
    expect(flow.abandonedMs).toBe(7000) // armed at 2000, ended at 9000
  })
})

describe('an untracked flow run', () => {
  it('measures each case from space to space and records no solves', async () => {
    const { session, flow } = await load()
    flow.start({ cases: 2, tracked: false }, 0)
    flow.advanceManually(10000)
    expect(flow.caseIndex).toBe(1)
    expect(flow.finished).toBe(false)
    flow.advanceManually(18000)

    expect(flow.finished).toBe(true)
    expect(session.stats()).toHaveLength(0)
    expect(enqueued).toHaveLength(0)
    expect(flow.summary).toBeNull()
    expect(flow.manualSummary).toMatchObject({ cases: 2, totalMs: 18000, msPerCase: 9000, caseTimes: [10000, 8000] })
  })

  it('ignores the manual advance once a cube is driving the run', async () => {
    const { flow } = await load()
    flow.start({ cases: 10, tracked: true }, 0)
    flow.advanceManually(5000)
    expect(flow.caseIndex).toBe(0)
    expect(flow.caseTimes).toEqual([])
  })
})

describe('a selection smaller than what is on screen', () => {
  it('still fills five slots, leaning on the picker\'s own fallback', async () => {
    const { useSessionStore } = await import('@/stores/SessionStore')
    const { useFlowStore } = await import('@/stores/FlowStore')
    const session = useSessionStore()
    session.setSelectedKeys(['c1', 'c2'])
    const flow = useFlowStore()
    flow.start({ cases: 5, tracked: true }, 0)
    const visible: {key: string}[] = flow.visibleCases
    expect(visible).toHaveLength(5)
    expect(visible.every((c) => ['c1', 'c2'].includes(c.key))).toBe(true)
  })
})

describe('comparing one run with the next', () => {
  // A full run of `cases` cases, each taking pause+exec, so the run's wall
  // clock is deterministic.
  const fullRun = async (flow: any, cases: number, at: number, exec = 1500) => {
    flow.start({ cases, tracked: true }, at)
    let t = at
    for (let c = 0; c < cases; c++) {
      flow.noteMove(t + 500)
      flow.completeCurrent(10, t + 500 + exec)
      t += 500 + exec
    }
    return t
  }

  it('keeps a completed run and compares later ones against it', async () => {
    const { flow } = await load()
    await fullRun(flow, 10, 0, 2000)
    expect(flow.comparableRuns).toHaveLength(1)
    // the clock runs from the first move, so the opening recall is not in it
    expect(flow.comparableRuns[0]).toMatchObject({ cases: 10, firstTry: 10 })
    expect(flow.comparableRuns[0].pages).toBeUndefined()
    expect(flow.runStats).toMatchObject({ count: 1, ao5: null, ao12: null })
    expect(flow.runStats.best!.ms).toBe(flow.comparableRuns[0].ms)

    await fullRun(flow, 10, 1_000_000, 1000)
    expect(flow.comparableRuns).toHaveLength(2)
    // the second run was faster, so it is the one to beat
    expect(flow.runStats.best!.ms).toBe(flow.comparableRuns[1].ms)
    expect(flow.runStats.best!.ms).toBeLessThan(flow.comparableRuns[0].ms)
  })

  it('only compares runs of the same length', async () => {
    const { flow } = await load()
    await fullRun(flow, 10, 0)
    await fullRun(flow, 15, 1_000_000)
    expect(flow.runs).toHaveLength(2)
    expect(flow.comparableRuns).toHaveLength(1)      // the 15-case series
    expect(flow.comparableRuns[0].cases).toBe(15)
  })

  it('compares a run from the time of pages with a run of as many cases', async () => {
    // Four pages of five were twenty cases then and are twenty cases now.
    const { selectionSignature } = await import('@/helpers/flow_timing')
    localStorage.setItem('algfolded_flow_runs:testset', JSON.stringify([{
      at: 1, pages: 2, cases: 10, sel: selectionSignature(CASES.map((c) => c.id)),
      ms: 60000, execMs: 30000, pauseMs: 30000, recoveryMs: 0, moves: 100, firstTry: 10,
    }]))
    const { flow } = await load()
    await fullRun(flow, 10, 1_000_000, 1000)
    expect(flow.comparableRuns.map((r: {at: number}) => r.at)[0]).toBe(1)
    expect(flow.comparableRuns).toHaveLength(2)
  })

  it('keeps the series of one selection apart from another', async () => {
    // Drilling one letter pair group and then a different one is the same
    // algset and the same length, but not the same practice.
    const { session, flow } = await load()
    session.setSelectedKeys(['c1', 'c2', 'c3'])
    await fullRun(flow, 10, 0, 2000)
    expect(flow.comparableRuns).toHaveLength(1)

    flow.reset()
    session.setSelectedKeys(['c4', 'c5', 'c6'])
    await fullRun(flow, 10, 1_000_000, 1000)
    expect(flow.runs).toHaveLength(2)            // both are kept...
    expect(flow.comparableRuns).toHaveLength(1)  // ...but compared apart
    expect(flow.runStats.count).toBe(1)
    expect(flow.runStats.best!.ms).toBe(flow.comparableRuns[0].ms)

    // and going back to the first selection brings its own series back
    flow.reset()
    session.setSelectedKeys(['c1', 'c2', 'c3'])
    await fullRun(flow, 10, 2_000_000, 3000)
    expect(flow.comparableRuns).toHaveLength(2)
    expect(flow.runStats.best!.ms).toBeLessThan(3000 * 10)
  })

  it('compares runs over the same cases whatever order they were selected in', async () => {
    const { session, flow } = await load()
    session.setSelectedKeys(['c1', 'c2', 'c3'])
    await fullRun(flow, 10, 0, 2000)
    flow.reset()
    session.setSelectedKeys(['c3', 'c1', 'c2'])
    await fullRun(flow, 10, 1_000_000, 1000)
    expect(flow.comparableRuns).toHaveLength(2)
  })

  it('does not compare a run stored before the series was split per selection', async () => {
    localStorage.setItem('algfolded_flow_runs:testset', JSON.stringify([{
      at: 1, pages: 2, cases: 10, ms: 60000, execMs: 30000, pauseMs: 30000,
      recoveryMs: 0, moves: 100, firstTry: 10,
    }]))
    const { flow } = await load()
    expect(flow.runs).toHaveLength(1)            // still there
    await fullRun(flow, 10, 1_000_000, 1000)
    expect(flow.comparableRuns).toHaveLength(1)  // only the new one
    expect(flow.comparableRuns[0].at).not.toBe(1)
  })

  it('files a finished run under the selection it was drilled from', async () => {
    const { session, flow } = await load()
    session.setSelectedKeys(['c1', 'c2', 'c3'])
    await fullRun(flow, 5, 0, 2000)
    const stored = JSON.parse(localStorage.getItem('algfolded_flow_runs:testset')!)
    expect(typeof stored[0].sel).toBe('string')
    expect(stored[0].sel).toBe(flow.selection)
  })

  it('does not keep a run that was cut short', async () => {
    const { flow } = await load()
    flow.start({ cases: 15, tracked: true }, 0)
    flow.noteMove(500)
    flow.completeCurrent(10, 2000)
    flow.finish(3000)                                 // the Finish button
    expect(flow.runs).toHaveLength(0)
  })

  it('does not keep a run nobody measured', async () => {
    const { flow } = await load()
    flow.start({ cases: 2, tracked: false }, 0)
    flow.advanceManually(10000)
    flow.advanceManually(20000)
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
    await fullRun(flow, 10, 0)
    const stored = JSON.parse(localStorage.getItem('algfolded_flow_runs:testset')!)
    expect(stored).toHaveLength(1)
    expect(stored[0].cases).toBe(10)
  })
})

describe('the bucket of difficult cases', () => {
  // Drive five cases that all go wrong (a retry books recovery, which is what
  // marks a case wrong).
  const badCases = (flow: any, at: number) => {
    for (let c = 0; c < 5; c++) {
      flow.noteMove(at + 100)
      flow.retryCurrent(at + 2000)
      flow.noteMove(at + 2100)
      flow.completeCurrent(10, at + 3000)
      at += 3000
    }
    return at
  }

  it('collects the cases that went wrong in a single run', async () => {
    // The picker draws from the whole selection, so waiting for a second
    // failure of the same case means the bucket never fills at all.
    const { flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    badCases(flow, 0)
    expect(flow.bucket).toHaveLength(5)
  })

  it('survives a reload', async () => {
    const { flow } = await load()
    flow.start({ cases: 5, tracked: true }, 0)
    badCases(flow, 0)
    const stored = JSON.parse(localStorage.getItem('algfolded_flow_trouble:testset')!)
    expect(Object.keys(stored).length).toBe(5)
  })

  it('collects a case that is repeatedly much slower than its own average', async () => {
    const { session, flow } = await load()
    for (const c of CASES) ema(session)[c.id] = { a: 1, n: 5, s: 1 }   // 1s average
    for (let run = 0; run < 3; run++) {
      flow.start({ cases: 5, tracked: true }, run * 100000)
      let t = run * 100000
      for (let c = 0; c < 5; c++) {
        flow.noteMove(t + 100)
        flow.completeCurrent(10, t + 5100)     // 5s against a 1s average
        t += 5100
      }
    }
    expect(flow.bucket.length).toBeGreaterThan(0)
  })

  it('does not collect cases that are executed cleanly and quickly', async () => {
    const { session, flow } = await load()
    for (const c of CASES) ema(session)[c.id] = { a: 5, n: 5, s: 1 }
    for (let run = 0; run < 3; run++) {
      flow.start({ cases: 5, tracked: true }, run * 100000)
      let t = run * 100000
      for (let c = 0; c < 5; c++) {
        flow.noteMove(t + 100)
        flow.completeCurrent(10, t + 1100)     // 1s against a 5s average
        t += 1100
      }
    }
    expect(flow.bucket).toEqual([])
    expect(flow.trouble).toEqual({})
  })

  it('fills from a run that was cut short too', async () => {
    const { flow } = await load()
    flow.start({ cases: 20, tracked: true }, 0)
    flow.noteMove(100)
    flow.retryCurrent(2000)
    flow.noteMove(2100)
    flow.completeCurrent(10, 3000)
    flow.finish(4000)                          // the Finish button
    expect(flow.runs).toHaveLength(0)          // not comparable...
    expect(flow.bucket).toHaveLength(1)        // ...but the case still misbehaved
  })

  it('ignores a run nobody measured', async () => {
    const { flow } = await load()
    flow.start({ cases: 5, tracked: false }, 0)
    flow.advanceManually(10000)
    expect(flow.trouble).toEqual({})
  })

  it('survives a corrupt tally', async () => {
    localStorage.setItem('algfolded_flow_trouble:testset', '[1,2,3]')
    const { flow } = await load()
    expect(flow.trouble).toEqual({})
    expect(flow.bucket).toEqual([])
  })
})

// A flow run is worth nothing if it is only in the browser that produced it:
// the series an Ao5 and a personal best are read off has to be the user's own,
// whichever machine they sit down at. Runs are still written to localStorage
// first — being logged out, or offline, must never lose one.
describe('the account\'s copy of the run series', () => {
  const storedRuns = () =>
    JSON.parse(localStorage.getItem('algfolded_flow_runs:testset') ?? '[]')

  const fullRun = (flow: any, at: number) => {
    flow.start({ cases: 5, tracked: true }, at)
    let t = at
    for (let c = 0; c < 5; c++) {
      flow.noteMove(t + 500)
      flow.completeCurrent(10, t + 2000)
      t += 2000
    }
    return t
  }

  it('uploads a finished run', async () => {
    authState.loggedIn = true
    const { flow } = await load()
    fullRun(flow, 1_000_000)

    expect(posted()).toHaveLength(1)
    expect(posted()[0].path).toBe('/api/flow-runs')
    expect(posted()[0].body.algset).toBe('testset')
    expect(posted()[0].body.runs).toHaveLength(1)
    expect(posted()[0].body.runs[0]).toMatchObject({ cases: 5, sel: flow.selection })
  })

  it('keeps the run locally when nobody is logged in', async () => {
    const { flow } = await load()
    fullRun(flow, 1_000_000)
    expect(apiCalls).toHaveLength(0)
    expect(storedRuns()).toHaveLength(1)
    expect(flow.runs).toHaveLength(1)
  })

  it('adopts the account\'s runs and uploads the ones it does not have', async () => {
    const local = {
      at: 100, pages: 1, cases: 5, sel: 'x', ms: 9000,
      execMs: 6000, pauseMs: 3000, recoveryMs: 0, moves: 50, firstTry: 5,
    }
    localStorage.setItem('algfolded_flow_runs:testset', JSON.stringify([local]))
    const remote = { ...local, at: 200, ms: 8000 }
    apiReply = () => ({ runs: [remote] })

    // Signing in on a device that already has runs of its own.
    const { flow } = await load()
    authState.loggedIn = true
    await flow.pullRuns()

    expect(flow.runs.map((r: {at: number}) => r.at)).toEqual([100, 200])
    expect(storedRuns().map((r: {at: number}) => r.at)).toEqual([100, 200])
    // only the run the account is missing goes back up
    expect(posted()).toHaveLength(1)
    expect(posted()[0].body.runs.map((r: {at: number}) => r.at)).toEqual([100])
  })

  it('leaves the local series alone when the account cannot be reached', async () => {
    const local = {
      at: 100, pages: 1, cases: 5, sel: 'x', ms: 9000,
      execMs: 6000, pauseMs: 3000, recoveryMs: 0, moves: 50, firstTry: 5,
    }
    localStorage.setItem('algfolded_flow_runs:testset', JSON.stringify([local]))
    apiReply = () => { throw new Error('offline') }

    const { flow } = await load()
    authState.loggedIn = true
    await flow.pullRuns()

    expect(flow.runs).toHaveLength(1)
    expect(posted()).toHaveLength(0)
  })

  it('asks the account for nothing while logged out', async () => {
    const { flow } = await load()
    await flow.pullRuns()
    expect(apiCalls).toHaveLength(0)
  })
})
