import {defineStore} from 'pinia'
import {computed, reactive, ref, watch} from "vue";
import {random_element} from "@/helpers/helpers";
import {makeScramble} from "@/helpers/scramble_utils"
import {detectAlg, normalizeMoves} from "@/helpers/alg_match"
import {updateEma, caseWeight, weightedRandomPick, median} from "@/helpers/srs"
import {useSettingsStore} from "@/stores/SettingsStore"
import {useAlgsetStore} from "@/stores/AlgsetStore"
import {useSolveSyncStore} from "@/stores/SolveSyncStore"
import {useBluetoothCubeStore} from "@/stores/BluetoothCubeStore"
import {usePreferredAlgStore} from "@/stores/PreferredAlgStore"
import {useCustomAlgsStore} from "@/stores/CustomAlgsStore"
import {useDisplayStore} from "@/stores/DisplayStore"
import {i18n} from "@/locale"
import {DEFAULT_ALGSET_ID} from "@/algsets/registry"
import {readNamespaced, writeNamespaced, migrateToNamespaced,
    isFlatSession, isFlatSrs, isFlatNumber} from "@/helpers/namespaced_storage"

const statsKey = 'ltct_stats_array';
const storeKey = 'ltct_store';
const srsKey = 'ltct_srs';
const srsCounterKey = 'ltct_srs_counter';

// A fresh, empty run.
const makeDefaultStore = () => ({
    // array of keys selected
    "keys": [],

    "recapMode": false,

    // map key => count
    "keysCount": {},

    // currently (to be solved) object from allCases: {key: string, scramble: string, count: num}
    "currentKey": null,

    "currentScramble": null,

    // lookahead queue of upcoming cases [{key, scramble}], shown as a preview
    "upcoming": [],

    // array of objects: {i=index, key, scramble, ms}
    "stats": [],
})

// Legacy: stats once lived in their own key; fold them into the flat store
// once, before it gets namespaced below.
const legacyStats = JSON.parse(localStorage.getItem(statsKey) || 'null')
if (Array.isArray(legacyStats) && localStorage.getItem(storeKey) == null) {
    localStorage.setItem(storeKey, JSON.stringify({...makeDefaultStore(), stats: legacyStats}))
}

// Per-algset namespacing: lift any pre-multi-algset flat data into the
// default set's slot, so each set keeps its own run / SRS history.
migrateToNamespaced(storeKey, DEFAULT_ALGSET_ID, isFlatSession)
migrateToNamespaced(srsKey, DEFAULT_ALGSET_ID, isFlatSrs)
migrateToNamespaced(srsCounterKey, DEFAULT_ALGSET_ID, isFlatNumber)

// Read a set's run slot, defaulting to an empty run and guarding old shapes.
const loadStore = (id) => {
    const s = readNamespaced(storeKey, id, makeDefaultStore())
    if (!Array.isArray(s.upcoming)) s.upcoming = [] // pre-lookahead persisted runs
    if (!Array.isArray(s.stats)) s.stats = []
    return s
}

// Stable per-solve id so a solve can be deduplicated / deleted on the server.
const makeClientId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)

export const TimerState = Object.freeze({
    NOT_RUNNING: 0,
    AWAITING_READY: 1, // user just started to hold space but there is the gap still
    READY: 2, // space button held down to start
    RUNNING: 3,
    STOPPING: 4, // space button held down after timer stopped
});

// store for current case/scramble and stats
export const useSessionStore = defineStore('session', () => {
    const algset = useAlgsetStore()
    const store = reactive(loadStore(algset.activeId))
    const srsData = reactive(readNamespaced(srsKey, algset.activeId, {}))
    const srsCounter = ref(readNamespaced(srsCounterKey, algset.activeId, 0))
    const recentCases = ref([])
    const sessionStartedAt = ref(0)

    const timerState = ref(TimerState.NOT_RUNNING)

    const observingResult = ref(0)

    const stats = () => store.stats

    const resetKeysCount = () => {
        store.keysCount = {}
        store.keys.forEach(k => store.keysCount[k] = 0)
    }

    const deleteResult = i => {
        // "undo" the result, recovering its recap in case of misscramble
        const key = store.stats[i].key
        if (store.keysCount[key] > 0) {
            store.keysCount[key]--
        }
        // also drop the solve from the account database / pending sync queue
        if (store.stats[i].clientId) {
            useSolveSyncStore().remove(store.stats[i].clientId)
        }
        store.stats.splice(i, 1)
        // rebuild indexes
        for (let j = Math.max(i - 1, 0); j < store.stats.length; j++) {
            store.stats[j].i = j
        }
        observingResult.value = Math.max(0, stats().length - 1)
    }

    // Date object when timer was started
    const timerStarted = ref(0)

    const casesWithZeroCount = computed(() => {
        return Object.keys(store.keysCount).filter(key => store.keysCount[key] === 0)
    });

    // How many cases to preview ahead of the current one (next + next-next).
    const LOOKAHEAD = 2

    // Keys we must not pick again right now: the current case and anything
    // already queued — so the preview never shows duplicates back-to-back.
    const reservedKeys = () => {
        const r = new Set()
        if (store.currentKey) r.add(store.currentKey)
        for (const u of store.upcoming) r.add(u.key)
        return r
    }

    // Pick a single key honoring recap mode, cooldown and the `avoid` set.
    // Returns null only when no admissible key exists (recap exhausted).
    const chooseKey = (avoid = new Set()) => {
        if (store.keys.length === 0) return null
        if (store.recapMode) {
            const zero = casesWithZeroCount.value
            const pool = zero.filter(k => !avoid.has(k))
            return pool.length > 0 ? random_element(pool) : null
        }
        const cooldown = Math.min(3, Math.floor(store.keys.length / 2))
        const recentSet = new Set(recentCases.value.slice(-cooldown))
        let candidates = store.keys.filter(k => !recentSet.has(k) && !avoid.has(k))
        if (candidates.length === 0) candidates = store.keys.filter(k => !avoid.has(k))
        if (candidates.length === 0) candidates = store.keys

        const settingsStore = useSettingsStore()
        if (settingsStore.store.smartSelection) {
            const emas = candidates
                .map(k => srsData[k]?.a)
                .filter(a => a != null)
            const med = median(emas)
            const entries = candidates.map(key => ({
                key,
                weight: caseWeight(
                    srsData[key] || { a: null, n: 0, s: 0 },
                    med, srsCounter.value, store.keys.length,
                    settingsStore.store
                )
            }))
            return weightedRandomPick(entries)
        }
        if (Math.random() < 0.2) {
            const minCount = Math.min(...Object.values(store.keysCount))
            const least = Object.keys(store.keysCount).filter(key => store.keysCount[key] === minCount && !recentSet.has(key) && !avoid.has(key))
            const fallback = Object.keys(store.keysCount).filter(key => store.keysCount[key] === minCount && !avoid.has(key))
            return random_element(least.length > 0 ? least : (fallback.length > 0 ? fallback : candidates))
        }
        return random_element(candidates)
    }

    // Choose a key, record it for cooldown, and bundle it with a fresh scramble.
    const commitCase = (avoid) => {
        const key = chooseKey(avoid)
        if (key == null) return null
        recentCases.value.push(key)
        if (recentCases.value.length > 3) recentCases.value.shift()
        return { key, scramble: makeScramble(algset.byId[key]) }
    }

    // Top the lookahead queue back up to LOOKAHEAD entries (best-effort: in recap
    // mode near the end there may not be enough distinct cases left).
    const refillUpcoming = () => {
        while (store.upcoming.length < LOOKAHEAD) {
            const next = commitCase(reservedKeys())
            if (!next) break
            store.upcoming.push(next)
        }
    }

    // Advance to the next case: pull from the lookahead queue (or pick fresh) and
    // refill the queue behind it.
    const setRandomCase = () => {
        if (store.keys.length === 0) {
            store.currentKey = null
            store.currentScramble = null
            store.upcoming = []
            return
        }
        // Recap finished: drop the queue chosen under recap constraints.
        if (store.recapMode && casesWithZeroCount.value.length === 0) {
            store.recapMode = false
            store.upcoming = []
        }
        let next = store.upcoming.shift()
        if (!next) {
            next = commitCase(reservedKeys())
            if (!next) { // recap exhausted with an empty queue
                store.recapMode = false
                next = commitCase(reservedKeys())
            }
        }
        if (!next) return
        store.currentKey = next.key
        store.currentScramble = next.scramble
        refillUpcoming()
    }

    const setSelectedKeys = (keys) => {
        timerState.value = TimerState.NOT_RUNNING
        // Only reset recap/counts when the selection actually changed. This
        // preserves recap progress across page reloads, since App.vue calls
        // this on every boot.
        const sameKeys = keys.length === store.keys.length
            && keys.every(k => store.keys.includes(k))
        if (sameKeys) {
            // Drop queue entries produced before the algset data had loaded
            // (they carry empty scrambles) and regenerate the current one.
            store.upcoming = store.upcoming.filter(u => u.scramble)
            if (!store.currentScramble && store.currentKey && algset.byId[store.currentKey]) {
                store.currentScramble = makeScramble(algset.byId[store.currentKey])
            }
            if (!store.currentScramble) setRandomCase()
            else refillUpcoming() // ensure the preview queue is populated after a reload
            return
        }
        store.recapMode = false
        store.keys = keys
        recentCases.value = []
        store.upcoming = []
        resetKeysCount()
        setRandomCase()
    }

    const clearSession = () => {
        store.stats = [];
        observingResult.value = 0
        sessionStartedAt.value = 0
    }

    // Switching algset: persist the run/SRS we're leaving and load the one we're
    // entering, so each set keeps its own session and spaced-repetition history.
    watch(() => algset.activeId, (newId, oldId) => {
        if (oldId) {
            writeNamespaced(storeKey, oldId, store)
            writeNamespaced(srsKey, oldId, srsData)
            writeNamespaced(srsCounterKey, oldId, srsCounter.value)
        }
        const fresh = loadStore(newId)
        for (const k of Object.keys(store)) delete store[k]
        Object.assign(store, fresh)
        for (const k of Object.keys(srsData)) delete srsData[k]
        Object.assign(srsData, readNamespaced(srsKey, newId, {}))
        srsCounter.value = readNamespaced(srsCounterKey, newId, 0)
        recentCases.value = []
        for (const k of Object.keys(didntKnowMap)) delete didntKnowMap[k]
        observingResult.value = Math.max(0, store.stats.length - 1)
        timerState.value = TimerState.NOT_RUNNING
    })

    // when the competitor places his hands on the timer (aka holds spacebar)
    const getTimerReady = (timerStartDelayMs) => {
        if (timerState.value !== TimerState.NOT_RUNNING) {
            return // do nothing if timer is already running / waiting
        }
        if (timerStartDelayMs > 0) {
            timerState.value = TimerState.AWAITING_READY
            setTimeout(() => {
                if (timerState.value === TimerState.AWAITING_READY) {
                    timerState.value = TimerState.READY
                }
            }, timerStartDelayMs)
        } else {
            timerState.value = TimerState.READY
        }
    }

    const startTimer = () => {
        timerStarted.value = Date.now();
        timerState.value = TimerState.RUNNING;
    }

    const stopTimer = () => {
        const index = store.stats.length
        if (!sessionStartedAt.value) sessionStartedAt.value = Date.now()
        if (store.currentKey !== null) {
            const key = store.currentKey
            const ms = Date.now() - timerStarted.value
            const clientId = makeClientId()

            // Smart cube: which algorithm the cube actually saw for this solve
            // (null when solved by keyboard/touch or when nothing matched).
            const bt = useBluetoothCubeStore()
            const solveMoves = bt.connected ? bt.consumeSolveMoves() : null
            let algUsed = null
            if (solveMoves && solveMoves.length > 0) {
                const customAlgs = useCustomAlgsStore()
                const prefs = usePreferredAlgStore()
                algUsed = detectAlg(solveMoves, customAlgs.mergedAlgs(key))
                if (algUsed) {
                    if (prefs.recordDetected(key, algUsed)) {
                        useDisplayStore().showToast(
                            i18n.global.t('timer.alg_detected_toast', {alg: algUsed}), 'success')
                    }
                } else {
                    // Unlisted solution: record it as the user's own alg for
                    // this case. Skip long sequences — those are fumbled
                    // solves with corrections, not an algorithm.
                    const norm = normalizeMoves(solveMoves)
                    if (norm.length > 0 && norm.length <= 30) {
                        const added = customAlgs.addAlg(key, norm.join(' '))
                        if (added) {
                            algUsed = added
                            prefs.recordDetected(key, added)
                            useDisplayStore().showToast(
                                i18n.global.t('timer.alg_added_toast', {alg: added}), 'success')
                        }
                    }
                }
            }

            store.stats.push({
                "i": index,
                "key": key,
                "scramble": currentScramble.value,
                "ms": ms,
                "clientId": clientId
            })
            store.keysCount[key]++;

            // Persist the solve to the account database (queued while offline).
            useSolveSyncStore().enqueue({
                clientId,
                algset: algset.activeId,
                caseKey: key,
                ms,
                scramble: currentScramble.value,
                algUsed,
                source: bt.connected ? 'smartcube' : 'timer',
                solvedAt: new Date().toISOString(),
            })

            // Clear "Didn't know" flag so it can be re-applied next time
            delete didntKnowMap[key]

            // Update SRS data
            srsCounter.value++
            const old = srsData[key] || { a: null, n: 0, s: 0 }
            srsData[key] = {
                a: updateEma(old.a, ms / 1000),
                n: old.n + 1,
                s: srsCounter.value
            }
            writeNamespaced(srsKey, algset.activeId, srsData)
            writeNamespaced(srsCounterKey, algset.activeId, srsCounter.value)
        }
        setRandomCase()
        timerState.value = TimerState.STOPPING;
        observingResult.value = index
    }

    watch(store, () => { writeNamespaced(storeKey, algset.activeId, store) })

    const startRecap = () => {
        resetKeysCount()
        store.recapMode = true
        store.upcoming = [] // drop non-recap picks so the queue reflects recap order
        setRandomCase()
    }

    const didntKnowMap = reactive({}) // key -> original EMA, for undo

    const flagDidntKnow = (key) => {
        const emas = store.keys.map(k => srsData[k]?.a).filter(a => a != null)
        const med = median(emas)
        if (!srsData[key]) srsData[key] = { a: null, n: 0, s: 0 }
        didntKnowMap[key] = srsData[key].a
        srsData[key].a = med * 5
        writeNamespaced(srsKey, algset.activeId, srsData)
    }

    const unflagDidntKnow = (key) => {
        if (key in didntKnowMap) {
            if (srsData[key]) srsData[key].a = didntKnowMap[key]
            delete didntKnowMap[key]
            writeNamespaced(srsKey, algset.activeId, srsData)
        }
    }

    // may be undefined
    const currentScramble = computed(() => store.currentScramble)

    return { store, srsData, didntKnowMap, sessionStartedAt, clearSession, setSelectedKeys, stats, deleteResult,
        observingResult, timerStarted, timerState, getTimerReady, startTimer, stopTimer,
        startRecap, currentScramble, casesWithZeroCount, flagDidntKnow, unflagDidntKnow
    }
});