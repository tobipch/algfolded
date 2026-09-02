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
