import {defineStore} from 'pinia'
import {computed, reactive, ref, watch} from "vue";
import {random_element} from "@/helpers/helpers";
import {makeScramble} from "@/helpers/scramble_utils"
import {updateEma, caseWeight, weightedRandomPick, median} from "@/helpers/srs"
import {useSettingsStore} from "@/stores/SettingsStore"
import {useAlgsetStore} from "@/stores/AlgsetStore"

const statsKey = 'ltct_stats_array';
const initialStats = JSON.parse(localStorage.getItem(statsKey)) || []
const storeKey = 'ltct_store';
const srsKey = 'ltct_srs';
const srsCounterKey = 'ltct_srs_counter';

const initialStore = JSON.parse(localStorage.getItem(storeKey)) || {
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
    "stats": initialStats,
}
// Guard for stores persisted before the lookahead queue existed.
if (!Array.isArray(initialStore.upcoming)) initialStore.upcoming = []

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
    const store = reactive(initialStore)
    const srsData = reactive(JSON.parse(localStorage.getItem(srsKey)) || {})
    const srsCounter = ref(parseInt(localStorage.getItem(srsCounterKey)) || 0)
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

    // switching algset -> the current run belongs to the old set; clear it
    watch(() => algset.activeId, () => clearSession())

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
            store.stats.push({
                "i": index,
                "key": key,
                "scramble": currentScramble.value,
                "ms": ms
            })
            store.keysCount[key]++;

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
            localStorage.setItem(srsKey, JSON.stringify(srsData))
            localStorage.setItem(srsCounterKey, srsCounter.value)
        }
        setRandomCase()
        timerState.value = TimerState.STOPPING;
        observingResult.value = index
    }

    watch(store, () => { localStorage.setItem(storeKey, JSON.stringify(store)) })

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
        localStorage.setItem(srsKey, JSON.stringify(srsData))
    }

    const unflagDidntKnow = (key) => {
        if (key in didntKnowMap) {
            if (srsData[key]) srsData[key].a = didntKnowMap[key]
            delete didntKnowMap[key]
            localStorage.setItem(srsKey, JSON.stringify(srsData))
        }
    }

    // may be undefined
    const currentScramble = computed(() => store.currentScramble)

    return { store, srsData, didntKnowMap, sessionStartedAt, clearSession, setSelectedKeys, stats, deleteResult,
        observingResult, timerStarted, timerState, getTimerReady, startTimer, stopTimer,
        startRecap, currentScramble, casesWithZeroCount, flagDidntKnow, unflagDidntKnow
    }
});