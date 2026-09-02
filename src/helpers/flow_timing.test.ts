// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  CASES_PER_PAGE,
  armAttempt, noteFirstMove, flagWrong, retryAttempt, completeAttempt, attemptElapsedMs,
  summarizeFlow, summarizePages,
  type CaseRecord,
} from '@/helpers/flow_timing'

// Flow mode splits a case into pause / execution / recovery, and only
// execution may reach the SRS average. These tests pin that split down,
// because getting it wrong quietly poisons every case weight the user has.

const record = (over: Partial<CaseRecord> = {}): CaseRecord => ({
  key: 'c1', page: 0, index: 0, pauseMs: 0, execMs: 0, recoveryMs: 0,
  moves: 0, wrong: false, ...over,
})

describe('timing one case', () => {
  it('splits the attempt into pause and execution', () => {
    let a = armAttempt(1000)
    a = noteFirstMove(a, 1800)
    const r = completeAttempt(a, 3300, {key: 'c1', page: 0, index: 2, moves: 10})
    expect(r).toMatchObject({
      key: 'c1', page: 0, index: 2, moves: 10,
      pauseMs: 800, execMs: 1500, recoveryMs: 0, wrong: false,
    })
  })

  it('ignores every move after the first when ending the pause', () => {
    let a = armAttempt(0)
    a = noteFirstMove(a, 500)
    a = noteFirstMove(a, 900)
    expect(completeAttempt(a, 2000, {key: 'c1', page: 0, index: 0}).pauseMs).toBe(500)
  })

  it('books the whole wait as pause when no move was ever made', () => {
    const r = completeAttempt(armAttempt(0), 2500, {key: 'c1', page: 0, index: 0})
    expect(r.pauseMs).toBe(2500)
    expect(r.execMs).toBe(0)
  })

  it('books an abandoned attempt as recovery, not as the case time', () => {
    let a = armAttempt(0)
    a = noteFirstMove(a, 400)
    a = retryAttempt(a, 5000)        // 5s thrown away
    a = noteFirstMove(a, 5600)
    const r = completeAttempt(a, 7100, {key: 'c1', page: 0, index: 0, moves: 9})
    expect(r.recoveryMs).toBe(5000)
    expect(r.pauseMs).toBe(600)
    expect(r.execMs).toBe(1500)
    // the case's own time is untouched by the botched attempt
    expect(r.pauseMs + r.execMs).toBe(2100)
  })

  it('adds up recovery across repeated retries', () => {
    let a = armAttempt(0)
    a = retryAttempt(a, 1000)
    a = retryAttempt(a, 3000)
    expect(a.recoveryMs).toBe(3000)
  })

  it('counts a retried case as not right first time', () => {
    const a = retryAttempt(armAttempt(0), 1000)
    expect(completeAttempt(a, 2000, {key: 'c1', page: 0, index: 0}).wrong).toBe(true)
  })

  it('counts a flagged wrong execution even when it was corrected without a retry', () => {
    let a = flagWrong(noteFirstMove(armAttempt(0), 100))
    const r = completeAttempt(a, 3000, {key: 'c1', page: 0, index: 0, moves: 20})
    expect(r.wrong).toBe(true)
    expect(r.recoveryMs).toBe(0)
  })

  it('reports elapsed time including what earlier attempts cost', () => {
    const a = retryAttempt(armAttempt(0), 2000)
    expect(attemptElapsedMs(a, 2500)).toBe(2500)
  })

  it('never reports a negative duration when the clock jumps backwards', () => {
    const a = noteFirstMove(armAttempt(1000), 900)
    const r = completeAttempt(a, 800, {key: 'c1', page: 0, index: 0})
    expect(r.pauseMs).toBe(0)
    expect(r.execMs).toBe(0)
  })
})

describe('summarising a tracked session', () => {
  const records = [
    record({key: 'a', page: 0, index: 0, pauseMs: 500, execMs: 1500, moves: 9}),
    record({key: 'b', page: 0, index: 1, pauseMs: 1000, execMs: 3000, moves: 12, recoveryMs: 4000, wrong: true}),
    record({key: 'a', page: 1, index: 0, pauseMs: 400, execMs: 1600, moves: 9}),
  ]

  it('adds the three quantities up separately', () => {
    const s = summarizeFlow(records)
    expect(s.execMs).toBe(6100)
    expect(s.pauseMs).toBe(1900)
    expect(s.recoveryMs).toBe(4000)
    expect(s.totalMs).toBe(12000)
    expect(s.cases).toBe(3)
  })

  it('derives TPS from execution alone', () => {
    const s = summarizeFlow(records)
    expect(s.tps).toBeCloseTo(30 / 6.1, 6)
    expect(s.execPerCase).toBeCloseTo(6100 / 3, 6)
    expect(s.msPerCase).toBeCloseTo(8000 / 3, 6)
  })

  it('counts how many cases were right first time', () => {
    const s = summarizeFlow(records)
    expect(s.firstTry).toBe(2)
    expect(s.accuracy).toBeCloseTo(2 / 3, 6)
    expect(s.wrongCases).toEqual([{key: 'b', count: 1, pages: [1]}])
  })

  it('compares against the user average for exactly the cases that came up', () => {
    // 'a' averages 2s, 'b' has no history at all
    const s = summarizeFlow(records, {emaByKey: {a: 2, c: 99}})
    expect(s.reference).not.toBeNull()
    expect(s.reference!.cases).toBe(2)
    expect(s.reference!.execPerCase).toBe(2000)
    expect(s.reference!.tps).toBeCloseTo(18 / 4, 6)
    // deltas: 1500 - 2000 and 1600 - 2000; 'b' has no reference
    const byKey = Object.fromEntries(s.perCase.map(c => [`${c.key}${c.page}`, c.deltaMs]))
    expect(byKey.a0).toBe(-500)
    expect(byKey.a1).toBe(-400)
    expect(byKey.b0).toBeNull()
  })

  it('has no reference at all when none of the cases were seen before', () => {
    expect(summarizeFlow(records).reference).toBeNull()
    expect(summarizeFlow(records, {emaByKey: {}}).reference).toBeNull()
  })

  it('ranks the cases of the session slowest first', () => {
    const s = summarizeFlow(records)
    expect(s.perCase.map(c => c.totalMs)).toEqual([4000, 2000, 2000])
  })

  it('breaks the session down page by page', () => {
    const s = summarizeFlow(records)
    expect(s.pages.map(p => p.index)).toEqual([0, 1])
    expect(s.pages[0]).toMatchObject({cases: 2, execMs: 4500, pauseMs: 1500, recoveryMs: 4000, wrong: 1})
    expect(s.pages[1]).toMatchObject({cases: 1, execMs: 1600, wrong: 0})
  })

  it('survives an empty session', () => {
    const s = summarizeFlow([])
    expect(s).toMatchObject({cases: 0, totalMs: 0, tps: null, accuracy: 1, reference: null})
    expect(s.pages).toEqual([])
  })

  it('reports no TPS when nothing was measured', () => {
    expect(summarizeFlow([record({pauseMs: 1000})]).tps).toBeNull()
  })
})

describe('summarising an untracked session', () => {
  it('derives the per-case average from the page times', () => {
    const s = summarizePages([10000, 8000])
    expect(s.pages).toBe(2)
    expect(s.cases).toBe(2 * CASES_PER_PAGE)
    expect(s.totalMs).toBe(18000)
    expect(s.msPerCase).toBe(1800)
  })

  it('survives having no pages', () => {
    expect(summarizePages([])).toMatchObject({pages: 0, cases: 0, totalMs: 0, msPerCase: 0})
  })
})
