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
const solveCase = (flow: any, at: number, pause = 500, exec = 1500, moves = 10): boolean => {
  flow.noteMove(at + pause)
  return flow.completeCurrent(moves, at + pause + exec)
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

  // The first case sits on screen while the user is still picking the cube up,
  // so the wait in front of it is setup, not recall. The run's clock starts on
  // the first move; the case has to start there too, or the split claims more
  // time than the run ever took.
  it('starts the first case on the first move, not when the page appears', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    flow.noteMove(9000)            // cube picked up nine seconds later
    flow.completeCurrent(10, 11000)

    expect(flow.startedAt).toBe(9000)
    expect(flow.records[0]).toMatchObject({ pauseMs: 0, execMs: 2000 })
    expect(flow.currentCaseMs(5000)).toBe(0) // nothing was running before that
  })

  it('never books more time than the run took', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    flow.noteMove(9000)
    flow.completeCurrent(10, 11000)
    for (let i = 1; i < 5; i++) solveCase(flow, 11000 + (i - 1) * 2000)
    flow.nextPage(19000)

    const s = flow.summary!
    expect(s.execMs + s.pauseMs + s.recoveryMs + flow.abandonedMs)
        .toBe(flow.endedAt - flow.startedAt)
  })

  it('keeps the recall of every case after the first', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    flow.noteMove(1000)
    flow.completeCurrent(10, 2000)
    solveCase(flow, 2000, 800, 1200)   // second case: 800ms recall is real
    expect(flow.records.map((r: {pauseMs: number}) => r.pauseMs)).toEqual([0, 800])
  })

  it('books an abandoned attempt as recovery and keeps the case retryable', async () => {
    const { session, flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
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

  it('keeps the series of one selection apart from another', async () => {
    // Drilling one letter pair group and then a different one is the same
    // algset and the same page count, but not the same practice.
    const { session, flow } = await load()
    session.setSelectedKeys(['c1', 'c2', 'c3'])
    await fullRun(flow, 2, 0, 2000)
    expect(flow.comparableRuns).toHaveLength(1)

    flow.reset()
    session.setSelectedKeys(['c4', 'c5', 'c6'])
    await fullRun(flow, 2, 1_000_000, 1000)
    expect(flow.runs).toHaveLength(2)            // both are kept...
    expect(flow.comparableRuns).toHaveLength(1)  // ...but compared apart
    expect(flow.runStats.count).toBe(1)
    expect(flow.runStats.best!.ms).toBe(flow.comparableRuns[0].ms)

    // and going back to the first selection brings its own series back
    flow.reset()
    session.setSelectedKeys(['c1', 'c2', 'c3'])
    await fullRun(flow, 2, 2_000_000, 3000)
    expect(flow.comparableRuns).toHaveLength(2)
    expect(flow.runStats.best!.ms).toBeLessThan(3000 * 10)
  })

  it('compares runs over the same cases whatever order they were selected in', async () => {
    const { session, flow } = await load()
    session.setSelectedKeys(['c1', 'c2', 'c3'])
    await fullRun(flow, 2, 0, 2000)
    flow.reset()
    session.setSelectedKeys(['c3', 'c1', 'c2'])
    await fullRun(flow, 2, 1_000_000, 1000)
    expect(flow.comparableRuns).toHaveLength(2)
  })

  it('does not compare a run stored before the series was split per selection', async () => {
    localStorage.setItem('algfolded_flow_runs:testset', JSON.stringify([{
      at: 1, pages: 2, cases: 10, ms: 60000, execMs: 30000, pauseMs: 30000,
      recoveryMs: 0, moves: 100, firstTry: 10,
    }]))
    const { flow } = await load()
    expect(flow.runs).toHaveLength(1)            // still there
    await fullRun(flow, 2, 1_000_000, 1000)
    expect(flow.comparableRuns).toHaveLength(1)  // only the new one
    expect(flow.comparableRuns[0].at).not.toBe(1)
  })

  it('files a finished run under the selection it was drilled from', async () => {
    const { session, flow } = await load()
    session.setSelectedKeys(['c1', 'c2', 'c3'])
    await fullRun(flow, 1, 0, 2000)
    const stored = JSON.parse(localStorage.getItem('algfolded_flow_runs:testset')!)
    expect(typeof stored[0].sel).toBe('string')
    expect(stored[0].sel).toBe(flow.selection)
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

  it('collects the cases that went wrong in a single run', async () => {
    // The picker draws from the whole selection, so waiting for a second
    // failure of the same case means the bucket never fills at all.
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    badPage(flow, 0)
    expect(flow.bucket).toHaveLength(5)
  })

  it('survives a reload', async () => {
    const { flow } = await load()
    flow.start({ pages: 1, tracked: true }, 0)
    badPage(flow, 0)
    const stored = JSON.parse(localStorage.getItem('algfolded_flow_trouble:testset')!)
    expect(Object.keys(stored).length).toBe(5)
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
    expect(flow.bucket).toHaveLength(1)        // ...but the case still misbehaved
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

// A flow run is worth nothing if it is only in the browser that produced it:
// the series an Ao5 and a personal best are read off has to be the user's own,
// whichever machine they sit down at. Runs are still written to localStorage
// first — being logged out, or offline, must never lose one.
describe('the account\'s copy of the run series', () => {
  const storedRuns = () =>
    JSON.parse(localStorage.getItem('algfolded_flow_runs:testset') ?? '[]')

  const fullRun = (flow: any, at: number) => {
    flow.start({ pages: 1, tracked: true }, at)
    let t = at
    for (let c = 0; c < 5; c++) {
      flow.noteMove(t + 500)
      flow.completeCurrent(10, t + 2000)
      t += 2000
    }
    flow.nextPage(t)
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
    expect(posted()[0].body.runs[0]).toMatchObject({ pages: 1, cases: 5, sel: flow.selection })
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
