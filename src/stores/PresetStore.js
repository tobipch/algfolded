import {reactive, watch} from 'vue'
import {defineStore} from 'pinia'
import {migrateLocalStorageKey} from '@/helpers/helpers'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useAuthStore} from '@/stores/AuthStore'
import {apiFetch} from '@/helpers/api'
import {LEGACY_ALGSET_ID} from '@/algsets/registry'
import {readNamespaced, writeNamespaced, migrateToNamespaced, isFlatArrayMap} from '@/helpers/namespaced_storage'

const localStoreKey = "ltct_presets_arrays";
migrateLocalStorageKey("zbll2_presets_arrays", localStoreKey)            // zbll* -> ltct* (legacy rename)
export const starredName = "⭐" // do not make it locale-based!
migrateToNamespaced(localStoreKey, LEGACY_ALGSET_ID, isFlatArrayMap)    // flat -> { algsetId: presets }

// load the active set's slot as {name -> Set}
const loadFromLocalStorage = (algsetId) => {
    const loadedMap = readNamespaced(localStoreKey, algsetId, {[starredName]: []})
    const result = {}
    for (const name in loadedMap) {
        result[name] = new Set(loadedMap[name])
    }
    return result
}

const saveToLocalStorage = (algsetId, map) => {
    const mapToSave = {}
    for (const name in map) {
        mapToSave[name] = [...map[name]]
    }
    writeNamespaced(localStoreKey, algsetId, mapToSave)
}

// Named case selections. Kept in localStorage (namespaced per algset) and
// mirrored to the account database when logged in, so the same presets are
// there after signing in on another device.
export const usePresetsStore = defineStore('presets', () => {
    const algset = useAlgsetStore()
    const auth = useAuthStore()
    // {name: Set(cases), …}
    const map = reactive(loadFromLocalStorage(algset.activeId))

    const pushToServer = (name) => {
        if (!auth.loggedIn) return
        const cases = map[name]
        if (!cases) return
        apiFetch('/api/presets', {
            method: 'PUT',
            body: {algset: algset.activeId, name, cases: [...cases]},
        }).catch(() => {}) // offline: localStorage still has it, the next pull re-uploads
    }

    const deleteOnServer = (name) => {
        if (!auth.loggedIn) return
        apiFetch('/api/presets', {
            method: 'DELETE',
            body: {algset: algset.activeId, name},
        }).catch(() => {})
    }

    // The account copy is the shared truth: it replaces same-named presets on
    // this device. Presets the account doesn't know yet are uploaded rather
    // than dropped, so signing in on a device that already has presets adopts
    // them instead of wiping them.
    const pullFromServer = async () => {
        if (!auth.loggedIn) return
        const id = algset.activeId
        let presets
        try {
            const data = await apiFetch('/api/presets?algset=' + encodeURIComponent(id))
            presets = data?.presets
        } catch (_) {
            return // offline / API unavailable: keep the local copy
        }
        if (!presets || typeof presets !== 'object') return
        if (id !== algset.activeId) return // the user switched sets while the request was in flight
        for (const name of Object.keys(map)) {
            // Empty and unknown to the account (e.g. the default starred
            // preset): nothing worth creating a row for.
            if (name in presets || map[name].size === 0) continue
            pushToServer(name)
        }
        for (const name of Object.keys(presets)) {
            map[name] = new Set(Array.isArray(presets[name]) ? presets[name] : [])
        }
    }

    // set (save) preset
    const setPreset = (name, keys) => {
        map[name] = new Set(keys)
        pushToServer(name)
    }

    // returns set of keys by preset name
    const getCases = presetName => {
        return map[presetName] ?? new Set()
    }

    // delete preset by name
    const deletePreset = name => {
        delete map[name]
        deleteOnServer(name)
    }

    const hasCase = (name, key) => {
        return getCases(name).has(key)
    }

    const addToPreset = (presetName, caseKey) => {
        getCases(presetName).add(caseKey)
        pushToServer(presetName)
    }

    const removeFromPreset = (presetName, caseKey) => {
        map[presetName].delete(caseKey)
        pushToServer(presetName)
    }

    const toggleAddRemove = (presetName, caseKey) => {
        if (!caseKey || typeof caseKey !== "string") {
            return console.error("toggleAddRemove: caseKey is not a string", caseKey)
        }
        const action = hasCase(presetName, caseKey) ? removeFromPreset : addToPreset
        action(presetName, caseKey)
    }

    watch(map, () => saveToLocalStorage(algset.activeId, map))

    // switching algset -> load that set's presets slot, then let the account overlay it
    watch(() => algset.activeId, (id) => {
        const fresh = loadFromLocalStorage(id)
        for (const k of Object.keys(map)) delete map[k]
        Object.assign(map, fresh)
        pullFromServer()
    })
    watch(() => auth.loggedIn, (isIn) => { if (isIn) pullFromServer() })
    pullFromServer()

    return {
        map,
        setPreset,
        getCases,
        deletePreset,
        hasCase,
        addToPreset,
        removeFromPreset,
        toggleAddRemove,
        starredName
    }
});
