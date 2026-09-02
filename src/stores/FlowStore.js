import {defineStore} from 'pinia'
import {computed, ref, shallowRef} from 'vue'
import {
    CASES_PER_PAGE, armAttempt, noteFirstMove, flagWrong, retryAttempt,
    completeAttempt, attemptElapsedMs, summarizeFlow, summarizePages,
} from '@/helpers/flow_timing'
import {useSessionStore} from '@/stores/SessionStore'
import {useAlgsetStore} from '@/stores/AlgsetStore'

// The green flash on the fifth case, and nothing more. A few frames is enough
// to register that the page landed; anything longer is felt as a wait, and the
// whole point of flow is that the cases run into each other.
export const PAGE_ADVANCE_MS = 60

/**
 * A flow run: pages of five cases, drilled back to back.
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

    const pageCount = ref(1)
    const tracked = ref(false)          // a smart cube was connected at start
    const active = ref(false)
    const finished = ref(false)

    // pages[i] = [{key, scramble}, ...] — only pages already reached exist
    /** @type {import('vue').Ref<{key: string, scramble: string}[][]>} */
    const pages = ref([])
    const pageIndex = ref(0)
    const caseIndex = ref(0)
    // Bumped every time a case is armed, so the view can (re)start tracking
    // even when the same case comes up twice in a row.
    const armSeq = ref(0)
    // Advancing to the next page: the finished page is held on screen.
    const advancing = ref(false)

    /** @type {import('vue').Ref<import('@/helpers/flow_timing').CaseRecord[]>} */
    const records = ref([])             // completed CaseRecords, in order
    // Time sunk into the case that was on screen when the run ended early: it
    // was never completed, so it is not a case record, but it did cost time.
    const abandonedMs = ref(0)
    /** @type {import('vue').Ref<number[]>} */
    const pageTimes = ref([])           // untracked runs: one wall time per page
    const wrongIndex = ref(-1)          // case on this page shown as wrong
    const wrongFlash = ref(0)           // bumped to replay the shake

    const startedAt = ref(0)
    const endedAt = ref(0)
    // Per-case EMA read *before* this run's solves are folded in — comparing a
    // session against an average it has already moved is meaningless.
    const emaSnapshot = shallowRef({})

    let attempt = null                  // plain object from flow_timing
    let pageStartedAt = 0

    const currentPage = computed(() => pages.value[pageIndex.value] || [])
    const currentCase = computed(() => currentPage.value[caseIndex.value] || null)
    const totalCases = computed(() => pageCount.value * CASES_PER_PAGE)
    const completedCases = computed(() => tracked.value
        ? records.value.length
        : pageTimes.value.length * CASES_PER_PAGE)
    const progress = computed(() => totalCases.value > 0
        ? Math.min(1, completedCases.value / totalCases.value) : 0)

    // Case states for the page on screen: 'done' | 'current' | 'wrong' | 'ahead'
    const caseStates = computed(() => currentPage.value.map((_, i) => {
        if (i < caseIndex.value) return 'done'
        if (i > caseIndex.value) return 'ahead'
        return i === wrongIndex.value ? 'wrong' : 'current'
    }))

    // Fill a page from the session's picker: SRS weighting, cooldown and the
    // user's selection, exactly as the timer gets them. Passing the page's own
    // keys as `avoid` keeps a case from appearing twice on one page; with a
    // selection smaller than five the picker falls back on its own.
    const fillPage = () => {
        const page = []
        const avoid = new Set()
        const labels = new Set()
        for (let i = 0; i < CASES_PER_PAGE; i++) {
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
            if (!next) break
            labels.add(algset.caseLabel(next.key))
            page.push(next)
        }
        return page
    }

    const armCurrent = (now = Date.now()) => {
        attempt = armAttempt(now)
        wrongIndex.value = -1
        armSeq.value++
    }

    const loadPage = (index, now = Date.now()) => {
        const page = fillPage()
        if (page.length === 0) { finish(now); return }
        pages.value[index] = page
        pageIndex.value = index
        caseIndex.value = 0
        pageStartedAt = now
        armCurrent(now)
    }

    const start = ({pages: count, tracked: isTracked}, now = Date.now()) => {
        pageCount.value = Math.max(1, Math.floor(count) || 1)
        tracked.value = !!isTracked
        active.value = true
        finished.value = false
        advancing.value = false
        pages.value = []
        records.value = []
        pageTimes.value = []
        wrongIndex.value = -1
        abandonedMs.value = 0
        startedAt.value = now
        endedAt.value = 0
        const snapshot = {}
        for (const key of session.store.keys) {
            const a = session.srsData[key]?.a
            if (a != null) snapshot[key] = a
        }
        emaSnapshot.value = snapshot
        loadPage(0, now)
    }

    // --- events from the cube ------------------------------------------------

    const noteMove = (now = Date.now()) => {
        if (!attempt) return
        attempt = noteFirstMove(attempt, now)
    }

    /** The cube stopped in a state the case cannot reach: a wrong execution. */
    const noteWrong = () => {
        if (!attempt || advancing.value) return
        attempt = flagWrong(attempt)
        wrongIndex.value = caseIndex.value
        wrongFlash.value++
    }

    /**
     * Start the current case over against the cube as it is now (D4/U4, or the
     * user undoing back to the start). Cases already done on the page stay
     * done; the abandoned attempt is booked as recovery.
     *
     * Both signals can arrive for the same gesture. Re-arming twice costs the
     * near-zero gap between them, so the second call is harmless.
     */
    const retryCurrent = (now = Date.now()) => {
        if (!attempt || advancing.value) return
        attempt = retryAttempt(attempt, now)
        wrongIndex.value = -1
        armSeq.value++
    }

    /** The cube reached the case's solved state. `moves` is what it took. */
    const completeCurrent = (moves = 0, now = Date.now()) => {
        const item = currentCase.value
        if (!attempt || !item || advancing.value) return
        const record = completeAttempt(attempt, now, {
            key: item.key,
            page: pageIndex.value,
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

        caseIndex.value++
        wrongIndex.value = -1
        if (caseIndex.value < currentPage.value.length) {
            armCurrent(now)
            return false
        }
        advancing.value = true
        return true // caller holds the green, then calls nextPage()
    }

    /** After the green flash: swap in the next page, or end the run. */
    const nextPage = (now = Date.now()) => {
        advancing.value = false
        if (!active.value || finished.value) return
        const next = pageIndex.value + 1
        if (next >= pageCount.value) finish(now)
        else loadPage(next, now)
    }

    /** Without a cube the only measurable unit is the page. */
    const advancePageManually = (now = Date.now()) => {
        if (!active.value || finished.value || tracked.value) return
        pageTimes.value.push(Math.max(0, now - pageStartedAt))
        const next = pageIndex.value + 1
        if (next >= pageCount.value) finish(now)
        else loadPage(next, now)
    }

    const finish = (now = Date.now()) => {
        if (finished.value) return
        // The case on screen was never completed, so it is not a record — but
        // the time it cost is real and belongs in the session's recovery.
        if (attempt) abandonedMs.value += attemptElapsedMs(attempt, now)
        attempt = null
        advancing.value = false
        finished.value = true
        endedAt.value = now
    }

    const reset = () => {
        active.value = false
        finished.value = false
        advancing.value = false
        pages.value = []
        records.value = []
        pageTimes.value = []
        abandonedMs.value = 0
        wrongIndex.value = -1
        armSeq.value++
        attempt = null
    }

    /** Wall time of the run so far, for the header clock. */
    const elapsedMs = (now = Date.now()) => {
        if (!active.value) return 0
        if (finished.value) return endedAt.value - startedAt.value
        return Math.max(0, now - startedAt.value)
    }

    /** Time the current case has cost so far, retries included. */
    const currentCaseMs = (now = Date.now()) =>
        attempt ? attemptElapsedMs(attempt, now) : 0

    const summary = computed(() => tracked.value
        ? summarizeFlow(records.value, {emaByKey: emaSnapshot.value})
        : null)
    const pageSummary = computed(() => tracked.value
        ? null
        : summarizePages(pageTimes.value))

    return {
        CASES_PER_PAGE,
        pageCount, tracked, active, finished, advancing,
        pages, pageIndex, caseIndex, armSeq, records, pageTimes, abandonedMs,
        wrongIndex, wrongFlash, startedAt, endedAt,
        currentPage, currentCase, caseStates, totalCases, completedCases, progress,
        start, noteMove, noteWrong, retryCurrent, completeCurrent, nextPage,
        advancePageManually, finish, reset, elapsedMs, currentCaseMs,
        summary, pageSummary,
    }
})
