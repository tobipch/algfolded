// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  CASES_PER_PAGE,
  armAttempt, noteFirstMove, flagWrong, retryAttempt, completeAttempt, attemptElapsedMs,
  summarizeFlow, summarizePages, summarizeRuns,
  troubleDelta, updateTrouble, troubleCases,
  type CaseRecord, type FlowRun,
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

describe('comparing runs with each other', () => {
  const run = (ms: number, over: Partial<FlowRun> = {}): FlowRun => ({
    at: ms, pages: 5, cases: 25, ms, execMs: ms / 2, pauseMs: ms / 2,
    recoveryMs: 0, moves: 250, firstTry: 25, ...over,
  })

  it('has nothing to say about a single run', () => {
    const s = summarizeRuns([run(60000)])
    expect(s).toMatchObject({count: 1, ao5: null, ao12: null, mean: 60000})
    expect(s.best!.ms).toBe(60000)
  })

  it('averages the most recent five, best and worst dropped', () => {
    // oldest .. newest; the last five are 50,40,30,20,10 -> drop 50 and 10
    const runs = [90000, 80000, 50000, 40000, 30000, 20000, 10000].map((ms) => run(ms))
    expect(summarizeRuns(runs).ao5).toBe(30000)
  })

  it('needs twelve runs before there is an Ao12', () => {
    const eleven = Array.from({length: 11}, (_, i) => run((i + 1) * 1000))
    expect(summarizeRuns(eleven).ao12).toBeNull()
    expect(summarizeRuns([...eleven, run(12000)]).ao12).not.toBeNull()
  })

  it('finds the fastest run anywhere in the series, not just the recent ones', () => {
    const runs = [30000, 9000, 40000, 25000, 26000, 27000].map((ms) => run(ms))
    expect(summarizeRuns(runs).best!.ms).toBe(9000)
  })

  it('survives an empty history', () => {
    expect(summarizeRuns([])).toEqual({count: 0, ao5: null, ao12: null, best: null, mean: null})
  })
})

describe('the bucket of cases that keep going wrong', () => {
  const rec = (key: string, over: Partial<CaseRecord> = {}) =>
    record({key, ...over})

  // 'a' averages 2s; 'b' has no history at all
  const ema = {a: 2, b: null}

  it('counts a wrong execution twice as heavily as a slow one', () => {
    expect(troubleDelta(rec('a', {wrong: true, execMs: 500}), 2)).toBe(2)
    expect(troubleDelta(rec('a', {execMs: 3500}), 2)).toBe(1)   // 1.75x the average
  })

  it('takes a strike away for a case executed at or under its average', () => {
    expect(troubleDelta(rec('a', {execMs: 1800}), 2)).toBe(-1)
    expect(troubleDelta(rec('a', {execMs: 2000}), 2)).toBe(-1)
  })

  it('leaves a merely-a-bit-slow case alone', () => {
    expect(troubleDelta(rec('a', {execMs: 2600}), 2)).toBe(0)   // 1.3x, under the factor
  })

  it('says nothing about a case it has no average for', () => {
    expect(troubleDelta(rec('b', {execMs: 99000}), null)).toBe(0)
    // ...but a wrong execution is wrong whether or not there is history
    expect(troubleDelta(rec('b', {wrong: true}), null)).toBe(2)
  })

  it('only buckets a case once it has misbehaved repeatedly', () => {
    let trouble = updateTrouble({}, [rec('a', {wrong: true})], ema, 1)
    expect(troubleCases(trouble)).toEqual([])          // one bad run is not a pattern
    trouble = updateTrouble(trouble, [rec('a', {execMs: 9000})], ema, 2)
    expect(troubleCases(trouble)).toEqual(['a'])       // wrong + slow = trouble
  })

  it('lets a case work its way out again by being executed well', () => {
    let trouble = updateTrouble({}, [rec('a', {wrong: true}), rec('a', {wrong: true})], ema, 1)
    expect(troubleCases(trouble)).toEqual(['a'])
    for (let i = 0; i < 4; i++) trouble = updateTrouble(trouble, [rec('a', {execMs: 1500})], ema, 2)
    expect(troubleCases(trouble)).toEqual([])
    expect(trouble.a).toBeUndefined()                   // and stops being tracked at all
  })

  it('caps the tally so a case is always clearable in a few repetitions', () => {
    let trouble = {}
    for (let i = 0; i < 10; i++) trouble = updateTrouble(trouble, [rec('a', {wrong: true})], ema, i)
    expect((trouble as Record<string, {strikes: number}>).a.strikes).toBe(5)
  })

  it('sorts the worst offenders first', () => {
    const trouble = {
      mild: {strikes: 3, lastAt: 5},
      worst: {strikes: 5, lastAt: 1},
      middling: {strikes: 4, lastAt: 2},
      clean: {strikes: 1, lastAt: 9},
    }
    expect(troubleCases(trouble)).toEqual(['worst', 'middling', 'mild'])
  })

  it('never mutates the tally it was handed', () => {
    const before = {a: {strikes: 2, lastAt: 1}}
    updateTrouble(before, [rec('a', {wrong: true})], ema, 2)
    expect(before.a.strikes).toBe(2)
  })
})
