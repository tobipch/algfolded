import {reactive, watch} from 'vue'
import {defineStore} from 'pinia'
import {migrateLocalStorageKey} from '@/helpers/helpers'
import {useAlgsetStore} from '@/stores/AlgsetStore'
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

export const usePresetsStore = defineStore('presets', () => {
    const algset = useAlgsetStore()
    // {name: Set(cases), …}
    const map = reactive(loadFromLocalStorage(algset.activeId))

    // set (save) preset
    const setPreset = (name, keys) => {
        map[name] = new Set(keys)
    }

    // returns set of keys by preset name
    const getCases = presetName => {
        return map[presetName] ?? new Set()
    }

    // delete preset by name
    const deletePreset = name => {
        delete map[name]
    }

    const hasCase = (name, key) => {
        return getCases(name).has(key)
    }

    const addToPreset = (presetName, caseKey) => {
        getCases(presetName).add(caseKey)
    }

    const removeFromPreset = (presetName, caseKey) => {
        map[presetName].delete(caseKey)
    }

    const toggleAddRemove = (presetName, caseKey) => {
        if (!caseKey || typeof caseKey !== "string") {
            return console.error("toggleAddRemove: caseKey is not a string", caseKey)
        }
        console.log("toggleAddRemove to ", presetName, caseKey)
        const action = hasCase(presetName, caseKey) ? removeFromPreset : addToPreset
        action(presetName, caseKey)
    }

    watch(map, () => saveToLocalStorage(algset.activeId, map))

    // switching algset -> load that set's presets slot
    watch(() => algset.activeId, (id) => {
        const fresh = loadFromLocalStorage(id)
        for (const k of Object.keys(map)) delete map[k]
        Object.assign(map, fresh)
    })

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