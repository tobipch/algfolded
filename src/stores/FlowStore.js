import {defineStore} from 'pinia'
import {computed, ref, shallowRef, watch} from 'vue'
import {
    VISIBLE_CASES, MAX_RUNS, armAttempt, noteFirstMove, flagWrong, retryAttempt,
    rebaseAttempt, completeAttempt, attemptElapsedMs, summarizeFlow, summarizeManual,
    summarizeRuns, mergeRuns, updateTrouble, troubleCases, selectionSignature,
} from '@/helpers/flow_timing'
import {useSessionStore} from '@/stores/SessionStore'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useAuthStore} from '@/stores/AuthStore'
import {apiFetch} from '@/helpers/api'
import {readNamespaced, writeNamespaced} from '@/helpers/namespaced_storage'

// Finished runs, per algset. Capped in the helper: a run is a few dozen bytes,
// but this is the user's localStorage and nothing here is worth an unbounded
// list.
const runsKey = 'algfolded_flow_runs'

const loadRuns = (algsetId) => {
    const stored = readNamespaced(runsKey, algsetId, [])
    return Array.isArray(stored) ? stored.filter(r => r && typeof r.ms === 'number') : []
}

// The tally of cases that keep going wrong, per algset. Small: only cases
// with strikes are in it, and a case drops out again once it is clean.
const troubleKey = 'algfolded_flow_trouble'

const loadTrouble = (algsetId) => {
    const stored = readNamespaced(troubleKey, algsetId, {})
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    const out = {}
    for (const [key, entry] of Object.entries(stored)) {
        if (entry && typeof entry.strikes === 'number' && entry.strikes > 0) out[key] = entry
    }
    return out
}

/**
 * A flow run: a fixed number of cases, drilled back to back. The current case
 * is on screen with the next four under it, so the next one can be read while
 * this one is still being turned - there is no page to wait for.
 *
 * The store owns the run's data and its arithmetic. Everything to do with the
 * cube itself lives in BluetoothCubeStore and is wired up by the view, which
 * calls in here on the events that matter (armed, first move, wrong, retry,
 * done). Cases come from SessionStore's picker, and completed cases are booked
 * through SessionStore's recorder, so SRS, statistics and cloud sync are the
 * same ones the timer feeds.
 */
export const useFlowStore = defineStore('flow', () => {
    const session = useSessionStore()
    const algset = useAlgsetStore()
    const auth = useAuthStore()

    const caseCount = ref(1)
    const tracked = ref(false)          // a smart cube was connected at start
    const active = ref(false)
    const finished = ref(false)

    // Every case picked so far, in order: the ones done, the current one and
    // the ones already on screen after it. Cases are picked as they come into
    // view, not all up front, so the picker's SRS weighting and cooldown see
    // the run's own solves.
    /** @type {import('vue').Ref<{key: string, scramble: string}[]>} */
    const queue = ref([])
    const caseIndex = ref(0)
    // Bumped every time a case is armed, so the view can (re)start tracking
    // even when the same case comes up twice in a row.
    const armSeq = ref(0)

    /** @type {import('vue').Ref<import('@/helpers/flow_timing').CaseRecord[]>} */
    const records = ref([])             // completed CaseRecords, in order
    // Time sunk into the case that was on screen when the run ended early: it
    // was never completed, so it is not a case record, but it did cost time.
    const abandonedMs = ref(0)
    /** @type {import('vue').Ref<number[]>} */
    const caseTimes = ref([])           // untracked runs: one wall time per case
    const wrongIndex = ref(-1)          // case in the queue shown as wrong
    const wrongFlash = ref(0)           // bumped to replay the shake

    const startedAt = ref(0)
    const endedAt = ref(0)
    // Per-case EMA read *before* this run's solves are folded in — comparing a
    // session against an average it has already moved is meaningless.
    const emaSnapshot = shallowRef({})

    let attempt = null                  // plain object from flow_timing
    let caseStartedAt = 0               // untracked runs: when the case came up

    // Finished runs on the active algset, oldest first — the series an Ao5 is
    // read off. Reloaded when the algset changes, like every other run datum.
    const runs = ref(loadRuns(algset.activeId))
    const trouble = ref(loadTrouble(algset.activeId))

    // --- the account's copy of the series ---------------------------------
    //
    // A finished run is written to localStorage first: it has to be kept
    // whether or not anyone is logged in and whether or not the network is
    // there. With an account the same runs are mirrored to it, so the series a
    // run is compared against is the user's, not the browser's — signing in on
    // another machine finds the same history instead of starting over.
    //
    // Runs are identified by when they finished, which makes every upload
    // idempotent: a retry, or a second device that still has the run locally,
    // writes the same row.

    const pushRuns = (algsetId, list) => {
        if (!auth.loggedIn || list.length === 0) return
        apiFetch('/api/flow-runs', {method: 'POST', body: {algset: algsetId, runs: list}})
            .catch(() => {}) // localStorage still has it; the next pull uploads it
    }

    const pullRuns = async () => {
        if (!auth.loggedIn) return
        const id = algset.activeId
        let remote
        try {
            const data = await apiFetch('/api/flow-runs?algset=' + encodeURIComponent(id))
            remote = data?.runs
        } catch (_) {
            return // offline / API unavailable: the local series stands
        }
        if (!Array.isArray(remote)) return
        if (id !== algset.activeId) return // switched sets while the request was in flight
        const known = new Set(remote.map(r => r?.at))
        const merged = mergeRuns(runs.value, remote)
        runs.value = merged
        writeNamespaced(runsKey, id, merged)
        // Runs this device has and the account does not: adopted, not dropped.
        pushRuns(id, merged.filter(r => !known.has(r.at)))
    }

    watch(() => algset.activeId, (id) => {
        runs.value = loadRuns(id)
        trouble.value = loadTrouble(id)
        pullRuns()
    })
    watch(() => auth.loggedIn, (isIn) => { if (isIn) pullRuns() })
    pullRuns()

    // Which selection the series is read for. A run drilled on the UBL pairs
    // and one drilled on the UBR pairs live in the same algset and may well be
    // the same length, but they are different practice and averaging them
    // together describes neither. Kept in step with the selection while no run
    // is going, and frozen for the duration of one, so a run is always filed
    // under the cases it actually drew from.
    const selection = ref(selectionSignature(session.store.keys))
    watch(() => session.store.keys, (keys) => {
        if (!active.value) selection.value = selectionSignature(keys)
    })

    /** The cases worth drilling next, worst first. */
    const bucket = computed(() => troubleCases(trouble.value))

    // Only runs over the same cases and of the same length are comparable with
    // each other, so the series is the one matching the run that was just done.
    // Runs stored before the split carry no selection and match nothing.
    // Runs from the time of pages carry `cases` too (pages times five), so a
    // run of four pages and a run of twenty cases are the same practice.
    const comparableRuns = computed(() => runs.value.filter(
        r => r.cases === caseCount.value && r.sel === selection.value))
    const runStats = computed(() => summarizeRuns(comparableRuns.value))

    const currentCase = computed(() => queue.value[caseIndex.value] || null)
    // The case after the current one: on screen already, and what a
    // cancellation into the next case is checked against.
    const nextCase = computed(() =>
        caseIndex.value + 1 < caseCount.value ? queue.value[caseIndex.value + 1] || null : null)
    const totalCases = computed(() => caseCount.value)
    const completedCases = computed(() => tracked.value
        ? records.value.length
        : caseTimes.value.length)
    const progress = computed(() => totalCases.value > 0
        ? Math.min(1, completedCases.value / totalCases.value) : 0)

    // What is on screen: the current case and the ones after it, each with its
    // position in the run (a stable key for the scroll) and its state,
    // 'current' | 'wrong' | 'ahead'.
    const visibleCases = computed(() =>
        queue.value.slice(caseIndex.value, caseIndex.value + VISIBLE_CASES).map((item, i) => {
            const index = caseIndex.value + i
            const state = i > 0 ? 'ahead' : index === wrongIndex.value ? 'wrong' : 'current'
            return {...item, index, state}
        }))

    // Top the queue up to what has to be on screen, from the session's picker:
    // SRS weighting, cooldown and the user's selection, exactly as the timer
    // gets them. Passing the keys on screen as `avoid` keeps a case from
    // appearing twice in view; with a selection smaller than that the picker
    // falls back on its own.
    const fillQueue = () => {
        const want = Math.min(caseCount.value, caseIndex.value + VISIBLE_CASES)
        while (queue.value.length < want) {
            const inView = queue.value.slice(caseIndex.value)
            const avoid = new Set(inView.map(c => c.key))
            const labels = new Set(inView.map(c => algset.caseLabel(c.key)))
            let next = null
            // Two different cases can carry the same label (the same letter
            // pair from another buffer). With no scramble on screen to tell
            // them apart that just reads as a duplicate, so try a few times for
            // a distinct one before settling for the repeat.
            for (let attempt = 0; attempt < 4; attempt++) {
                next = session.commitCase(avoid)
                if (!next) break
                avoid.add(next.key)
                if (!labels.has(algset.caseLabel(next.key))) break
            }
            if (!next) return
            queue.value.push(next)
        }
    }

    const armCurrent = (now = Date.now()) => {
        attempt = armAttempt(now)
        caseStartedAt = now
        wrongIndex.value = -1
        armSeq.value++
    }

    // Move on to the case after the current one, or end the run after the last.
    const advance = (now = Date.now()) => {
        caseIndex.value++
        if (caseIndex.value >= caseCount.value) { finish(now, true); return }
        fillQueue()
        if (!currentCase.value) { finish(now); return }
        armCurrent(now)
    }

    const start = ({cases: count, tracked: isTracked}, now = Date.now()) => {
        caseCount.value = Math.max(1, Math.floor(count) || 1)
        tracked.value = !!isTracked
        selection.value = selectionSignature(session.store.keys)
        active.value = true
        finished.value = false
        queue.value = []
        caseIndex.value = 0
        records.value = []
        caseTimes.value = []
        wrongIndex.value = -1
        abandonedMs.value = 0
        // With a cube the clock waits for the first move, the way a solve is
        // timed: reading the first case is not part of the session. Without one
        // there is no move to wait for, so it runs from the first case appearing.
        startedAt.value = isTracked ? 0 : now
        endedAt.value = 0
        const snapshot = {}
        for (const key of session.store.keys) {
            const a = session.srsData[key]?.a
            if (a != null) snapshot[key] = a
        }
        emaSnapshot.value = snapshot
        fillQueue()
        if (!currentCase.value) { finish(now); return }
        armCurrent(now)
    }

    // --- events from the cube ------------------------------------------------

    const noteMove = (now = Date.now()) => {
        if (!attempt) return
        if (!startedAt.value) {
            // The run's first move starts the clock — and the first case with
            // it. Everything before it was the user picking the cube up, not
            // recalling the case, so it is neither the case's pause nor part
            // of the session: the two clocks start at the same instant.
            startedAt.value = now
            attempt = rebaseAttempt(attempt, now)
            return
        }
        attempt = noteFirstMove(attempt, now)
    }

    /** The cube stopped in a state the case cannot reach: a wrong execution. */
    const noteWrong = () => {
        if (!attempt) return
        attempt = flagWrong(attempt)
        wrongIndex.value = caseIndex.value
        wrongFlash.value++
    }

    /**
     * Start the current case over against the cube as it is now (D4/U4, or the
     * user undoing back to the start). Cases already done stay done; the
     * abandoned attempt is booked as recovery.
     *
     * Both signals can arrive for the same gesture. Re-arming twice costs the
     * near-zero gap between them, so the second call is harmless.
     */
    const retryCurrent = (now = Date.now()) => {
        if (!attempt) return
        attempt = retryAttempt(attempt, now)
        wrongIndex.value = -1
        armSeq.value++
    }

    /**
     * The cube reached the case's solved state. `moves` is what it took.
     * `firstMoveAt` overrides when the case started being turned: when two
     * cases were finished in one go (a cancellation between them), the second
     * one never had a first move of its own that the cube could report.
     * @param {number} [moves]
     * @param {number} [now]
     * @param {number | null} [firstMoveAt]
     */
    const completeCurrent = (moves = 0, now = Date.now(), firstMoveAt = null) => {
        const item = currentCase.value
        if (!attempt || !item) return
        if (firstMoveAt != null) attempt = noteFirstMove(attempt, firstMoveAt)
        const record = completeAttempt(attempt, now, {
            key: item.key,
            index: caseIndex.value,
            moves,
        })
        records.value.push(record)
        attempt = null

        // Only the execution is the same quantity the timer records, so only
        // that reaches the EMA. Never zero: the solves API drops ms <= 0.
        session.recordSolve({
            key: record.key,
            ms: Math.max(1, Math.round(record.execMs)),
            scramble: item.scramble,
            extra: {flow: true},
        })

        wrongIndex.value = -1
        advance(now)
    }

    /** Without a cube the user says when a case is done, with space. */
    const advanceManually = (now = Date.now()) => {
        if (!active.value || finished.value || tracked.value) return
        caseTimes.value.push(Math.max(0, now - caseStartedAt))
        attempt = null
        advance(now)
    }

    // Keep a completed run so later runs have something to be compared against.
    // Runs cut short, and runs without a cube, are left out: an average over
    // unequal work, or over cases nobody measured, would mean nothing.
    const recordRun = (now) => {
        if (!tracked.value || records.value.length === 0) return
        const s = summarizeFlow(records.value)
        const run = {
            at: now,
            sel: selection.value,
            cases: s.cases,
            ms: Math.max(0, now - startedAt.value),
            execMs: Math.round(s.execMs),
            pauseMs: Math.round(s.pauseMs),
            recoveryMs: Math.round(s.recoveryMs + abandonedMs.value),
            moves: s.moves,
            firstTry: s.firstTry,
        }
        runs.value.push(run)
        if (runs.value.length > MAX_RUNS) runs.value = runs.value.slice(-MAX_RUNS)
        writeNamespaced(runsKey, algset.activeId, runs.value)
        pushRuns(algset.activeId, [run])
    }

    // Every case the cube actually measured feeds the bucket, whether or not
    // the run went the distance: a case that went wrong went wrong.
    const recordTrouble = (now) => {
        if (!tracked.value || records.value.length === 0) return
        trouble.value = updateTrouble(trouble.value, records.value, emaSnapshot.value, now)
        writeNamespaced(troubleKey, algset.activeId, trouble.value)
    }

    const finish = (now = Date.now(), completed = false) => {
        if (finished.value) return
        // Ended without ever turning the cube: a zero-length run, not one that
        // started at the epoch.
        if (!startedAt.value) startedAt.value = now
        // The case on screen was never completed, so it is not a record — but
        // the time it cost is real and belongs in the session's recovery.
        if (attempt) abandonedMs.value += attemptElapsedMs(attempt, now)
        attempt = null
        endedAt.value = now
        recordTrouble(now)
        if (completed) recordRun(now)
        finished.value = true
    }

    const reset = () => {
        active.value = false
        finished.value = false
        queue.value = []
        caseIndex.value = 0
        records.value = []
        caseTimes.value = []
        abandonedMs.value = 0
        wrongIndex.value = -1
        startedAt.value = 0
        endedAt.value = 0
        armSeq.value++
        attempt = null
    }

    /** Wall time of the run so far, for the header clock. */
    const elapsedMs = (now = Date.now()) => {
        if (!active.value || !startedAt.value) return 0
        if (finished.value) return Math.max(0, endedAt.value - startedAt.value)
        return Math.max(0, now - startedAt.value)
    }

    /** Time the current case has cost so far, retries included. */
    const currentCaseMs = (now = Date.now()) =>
        // Before the run's first move the case has cost nothing: that wait is
        // dropped on the first move, so counting it up here would only show a
        // number that is about to be thrown away.
        attempt && startedAt.value ? attemptElapsedMs(attempt, now) : 0

    /** Whether the run just finished was kept in the comparable series. */
    const runRecorded = computed(() =>
        finished.value && comparableRuns.value.some(r => r.at === endedAt.value))

    const summary = computed(() => tracked.value
        ? summarizeFlow(records.value, {emaByKey: emaSnapshot.value})
        : null)
    const manualSummary = computed(() => tracked.value
        ? null
        : summarizeManual(caseTimes.value))

    return {
        caseCount, tracked, active, finished,
        queue, caseIndex, armSeq, records, caseTimes, abandonedMs,
        wrongIndex, wrongFlash, startedAt, endedAt,
        currentCase, nextCase, visibleCases, totalCases, completedCases, progress,
        start, noteMove, noteWrong, retryCurrent, completeCurrent,
        advanceManually, finish, reset, elapsedMs, currentCaseMs,
        summary, manualSummary, runs, comparableRuns, runStats, runRecorded, selection,
        trouble, bucket, emaSnapshot, pullRuns,
    }
})
