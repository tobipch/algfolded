/**
 * Flow mode: how a case attempt is timed, and the arithmetic behind the
 * session summary.
 *
 * Pure on purpose — no store, no DOM and no clock of its own. Every function
 * takes the timestamps it needs, so the whole state machine can be driven from
 * a test without a cube, a browser or a pinia instance.
 *
 * A case is measured in three parts:
 *   pause     - from the case being armed to the first move (the recall)
 *   execution - from the first move to the cube reaching the case's solved state
 *   recovery  - everything spent on attempts that were abandoned and re-armed
 *
 * Only `execution` is the same quantity the timer records elsewhere (there the
 * clock starts on the first move too), so only `execution` is ever allowed near
 * the per-case EMA. Pause and recovery are session data.
 */

import {aoN} from '@/helpers/srs'

export const CASES_PER_PAGE = 5

export interface Attempt {
    /** when the case became the current one, or was re-armed after a retry */
    armedAt: number
    /** when the first move landed; null while the user is still recalling */
    firstMoveAt: number | null
    /** time already sunk into abandoned attempts of this same case */
    recoveryMs: number
    /** a wrong execution was observed during this case */
    wrong: boolean
}

export interface CaseRecord {
    key: string
    page: number
    index: number
    pauseMs: number
    execMs: number
    recoveryMs: number
    moves: number
    wrong: boolean
}

/** Arm a case. `carriedRecoveryMs` keeps the cost of earlier attempts of it. */
export const armAttempt = (at: number, carriedRecoveryMs = 0, wrong = false): Attempt => ({
    armedAt: at,
    firstMoveAt: null,
    recoveryMs: carriedRecoveryMs,
    wrong,
})

/** The first move ends the pause. Later moves change nothing. */
export const noteFirstMove = (attempt: Attempt, at: number): Attempt =>
    attempt.firstMoveAt === null ? {...attempt, firstMoveAt: at} : attempt

export const flagWrong = (attempt: Attempt): Attempt =>
    attempt.wrong ? attempt : {...attempt, wrong: true}

/**
 * Abandon the running attempt and re-arm the same case against the cube as it
 * is now (the D4/U4 gesture, or the user undoing all the way back to the
 * start). Everything spent so far becomes recovery and is carried forward, so
 * it lands in the session total without ever reaching the case's own time.
 */
export const retryAttempt = (attempt: Attempt, at: number): Attempt =>
    armAttempt(at, attempt.recoveryMs + Math.max(0, at - attempt.armedAt), true)

/** Wall-clock time this case has cost so far, retries included. */
export const attemptElapsedMs = (attempt: Attempt, now: number): number =>
    attempt.recoveryMs + Math.max(0, now - attempt.armedAt)

/**
 * Close the attempt. Without a first move (advanced by hand, or a case solved
 * by a single move that never surfaced as a separate event) the whole wait is
 * booked as pause and execution is zero.
 */
export const completeAttempt = (
    attempt: Attempt,
    at: number,
    {key, page, index, moves = 0}: {key: string, page: number, index: number, moves?: number},
): CaseRecord => {
    const firstMoveAt = attempt.firstMoveAt ?? at
    return {
        key,
        page,
        index,
        pauseMs: Math.max(0, firstMoveAt - attempt.armedAt),
        execMs: Math.max(0, at - firstMoveAt),
        recoveryMs: attempt.recoveryMs,
        moves,
        // A retry is a wrong execution even when nothing was flagged: the user
        // would not have started over otherwise.
        wrong: attempt.wrong || attempt.recoveryMs > 0,
    }
}

const tpsOf = (moves: number, execMs: number): number | null =>
    moves > 0 && execMs > 0 ? moves / (execMs / 1000) : null

export interface RankedCase extends CaseRecord {
    totalMs: number
    tps: number | null
    /** execution against the user's own average for this case, ms; null if unknown */
    deltaMs: number | null
}

export interface PageSummary {
    index: number
    cases: number
    execMs: number
    pauseMs: number
    recoveryMs: number
    totalMs: number
    moves: number
    wrong: number
    tps: number | null
}

export interface FlowSummary {
    cases: number
    totalMs: number
    execMs: number
    pauseMs: number
    recoveryMs: number
    moves: number
    /** execution only: the quantity the per-case average is comparable with */
    execPerCase: number
    /** what a case cost end to end, recovery excluded */
    msPerCase: number
    tps: number | null
    firstTry: number
    accuracy: number
    /** the user's own average over exactly the cases that came up */
    reference: {cases: number, execPerCase: number, tps: number | null} | null
    perCase: RankedCase[]
    wrongCases: {key: string, count: number, pages: number[]}[]
    pages: PageSummary[]
}

/**
 * Fold the session's case records into the numbers the summary shows.
 * `emaByKey` is the per-case EMA in *seconds* (SessionStore's srsData), read
 * before this session's solves were folded in — otherwise the session would be
 * compared against itself.
 */
export const summarizeFlow = (
    records: CaseRecord[],
    {emaByKey = {}}: {emaByKey?: Record<string, number | null | undefined>} = {},
): FlowSummary => {
    const cases = records.length
    const sum = (pick: (r: CaseRecord) => number) => records.reduce((t, r) => t + pick(r), 0)
    const execMs = sum(r => r.execMs)
    const pauseMs = sum(r => r.pauseMs)
    const recoveryMs = sum(r => r.recoveryMs)
    const moves = sum(r => r.moves)
    const firstTry = records.filter(r => !r.wrong).length

    const perCase: RankedCase[] = records.map(r => {
        const ema = emaByKey[r.key]
        return {
            ...r,
            totalMs: r.pauseMs + r.execMs,
            tps: tpsOf(r.moves, r.execMs),
            deltaMs: ema == null ? null : r.execMs - ema * 1000,
        }
    }).sort((a, b) => b.totalMs - a.totalMs)

    // The comparison is only honest over the cases we actually have history
    // for, so it is built from those records alone.
    const covered = records.filter(r => emaByKey[r.key] != null)
    const refSeconds = covered.reduce((t, r) => t + (emaByKey[r.key] as number), 0)
    const reference = covered.length > 0 ? {
        cases: covered.length,
        execPerCase: (refSeconds * 1000) / covered.length,
        tps: tpsOf(covered.reduce((t, r) => t + r.moves, 0), refSeconds * 1000),
    } : null

    const wrongMap = new Map<string, {key: string, count: number, pages: number[]}>()
    for (const r of records) {
        if (!r.wrong) continue
        const entry = wrongMap.get(r.key) || {key: r.key, count: 0, pages: []}
        entry.count++
        if (!entry.pages.includes(r.page + 1)) entry.pages.push(r.page + 1)
        wrongMap.set(r.key, entry)
    }

    const pageMap = new Map<number, PageSummary>()
    for (const r of records) {
        const p = pageMap.get(r.page) || {
            index: r.page, cases: 0, execMs: 0, pauseMs: 0, recoveryMs: 0,
            totalMs: 0, moves: 0, wrong: 0, tps: null,
        }
        p.cases++
        p.execMs += r.execMs
        p.pauseMs += r.pauseMs
        p.recoveryMs += r.recoveryMs
        p.moves += r.moves
        if (r.wrong) p.wrong++
        pageMap.set(r.page, p)
    }
    const pages = [...pageMap.values()].sort((a, b) => a.index - b.index)
    for (const p of pages) {
        p.totalMs = p.execMs + p.pauseMs + p.recoveryMs
        p.tps = tpsOf(p.moves, p.execMs)
    }

    return {
        cases,
        totalMs: execMs + pauseMs + recoveryMs,
        execMs, pauseMs, recoveryMs, moves,
        execPerCase: cases > 0 ? execMs / cases : 0,
        msPerCase: cases > 0 ? (execMs + pauseMs) / cases : 0,
        tps: tpsOf(moves, execMs),
        firstTry,
        accuracy: cases > 0 ? firstTry / cases : 1,
        reference,
        perCase,
        wrongCases: [...wrongMap.values()].sort((a, b) => b.count - a.count),
        pages,
    }
}

export interface PagesSummary {
    pages: number
    cases: number
    totalMs: number
    msPerCase: number
    pageTimes: number[]
}

/**
 * Without a smart cube nothing inside a page is observable, so a page time
 * (page shown -> space pressed) is all there is.
 */
export const summarizePages = (
    pageTimes: number[],
    casesPerPage: number = CASES_PER_PAGE,
): PagesSummary => {
    const totalMs = pageTimes.reduce((t, ms) => t + ms, 0)
    const cases = pageTimes.length * casesPerPage
    return {
        pages: pageTimes.length,
        cases,
        totalMs,
        msPerCase: cases > 0 ? totalMs / cases : 0,
        pageTimes: [...pageTimes],
    }
}

/**
 * One finished run, kept so runs can be compared with each other. Only runs
 * that went the whole distance are stored: an Ao5 over runs of different
 * lengths would not mean anything.
 */
export interface FlowRun {
    /** when the run finished, epoch ms */
    at: number
    pages: number
    cases: number
    /** the session clock: first move to last completion */
    ms: number
    execMs: number
    pauseMs: number
    recoveryMs: number
    moves: number
    firstTry: number
}

export interface RunStats {
    count: number
    /** WCA-style averages of the most recent 5 / 12 runs, best and worst dropped */
    ao5: number | null
    ao12: number | null
    best: FlowRun | null
    mean: number | null
}

/**
 * Compare a series of runs the way a speedcuber compares solves. `runs` must be
 * oldest first and already narrowed to comparable ones (same algset, same page
 * count) — `aoN` reads the most recent n off the end.
 */
export const summarizeRuns = (runs: FlowRun[]): RunStats => {
    const times = runs.map(r => r.ms)
    return {
        count: runs.length,
        ao5: aoN(times, 5),
        ao12: aoN(times, 12),
        best: runs.length > 0 ? runs.reduce((b, r) => (r.ms < b.ms ? r : b)) : null,
        mean: times.length > 0 ? times.reduce((t, ms) => t + ms, 0) / times.length : null,
    }
}

// --- the bucket of cases that keep going wrong ----------------------------
//
// Practice is repetition, not a case-by-case post mortem, so the useful output
// of a run is not a table: it is a short list of cases worth drilling next.
// Each run adds strikes to the cases that went wrong or came out noticeably
// slower than the user's own average for them, and takes strikes away from the
// ones that went clean and quick. A case is only in the bucket once it has
// misbehaved *repeatedly*, and it leaves again by being executed well.

/** How many strikes a case needs before it counts as trouble. */
export const TROUBLE_THRESHOLD = 3
/** Ceiling, so a case can always be cleared in a few good repetitions. */
export const TROUBLE_MAX = 5
/** Slower than this multiple of the case's own average counts as a strike. */
export const TROUBLE_SLOW_FACTOR = 1.5

export interface TroubleEntry {
    strikes: number
    /** when the tally last moved, epoch ms */
    lastAt: number
}

export type TroubleMap = Record<string, TroubleEntry>

/** What one appearance of a case does to its tally. */
export const troubleDelta = (
    record: CaseRecord,
    ema: number | null | undefined,
): number => {
    if (record.wrong) return 2
    // Without history there is nothing to be slow against, so a clean
    // execution of an unknown case is neither good nor bad news.
    if (ema == null) return 0
    if (record.execMs > ema * 1000 * TROUBLE_SLOW_FACTOR) return 1
    if (record.execMs <= ema * 1000) return -1
    return 0
}

/**
 * Fold a run's records into the running tally. `emaByKey` is the per-case EMA
 * in seconds as it stood *before* the run, so a case is judged against the
 * average it had going in.
 */
export const updateTrouble = (
    trouble: TroubleMap,
    records: CaseRecord[],
    emaByKey: Record<string, number | null | undefined> = {},
    now = 0,
): TroubleMap => {
    const next: TroubleMap = {...trouble}
    for (const r of records) {
        const delta = troubleDelta(r, emaByKey[r.key])
        if (delta === 0) continue
        const strikes = Math.max(0, Math.min(TROUBLE_MAX, (next[r.key]?.strikes ?? 0) + delta))
        if (strikes === 0) delete next[r.key]
        else next[r.key] = {strikes, lastAt: now}
    }
    return next
}

/** The cases currently worth drilling, worst first. */
export const troubleCases = (
    trouble: TroubleMap,
    threshold = TROUBLE_THRESHOLD,
): string[] =>
    Object.entries(trouble)
        .filter(([, e]) => e.strikes >= threshold)
        .sort((a, b) => b[1].strikes - a[1].strikes || b[1].lastAt - a[1].lastAt)
        .map(([key]) => key)
