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
