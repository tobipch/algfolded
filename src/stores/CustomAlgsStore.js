import {reactive, watch} from 'vue'
import {defineStore} from 'pinia'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {canonicalAlg} from '@/helpers/alg_match'
import {readNamespaced, writeNamespaced} from '@/helpers/namespaced_storage'

const localStorageKey = 'algfoldedCustomAlgs'

// User-added algorithms per case (map caseKey -> [algs]), on top of the
// collection that ships with the algset. Fed by the "add your own alg" input
// and by the smart cube when it sees an unlisted solution. Kept in
// localStorage, namespaced per algset like notes / preferred algs.
export const useCustomAlgsStore = defineStore('customAlgs', () => {
    const algset = useAlgsetStore()
    const store = reactive(readNamespaced(localStorageKey, algset.activeId, {}))

    const persist = () => writeNamespaced(localStorageKey, algset.activeId, store)

    const algsFor = (caseKey) => store[caseKey] ?? []

    // The full alg list for a case: the collection's algs plus the user's own.
    const mergedAlgs = (caseKey) => [
        ...(algset.byId[caseKey]?.algs ?? []),
        ...algsFor(caseKey),
    ]

    const isCustom = (caseKey, alg) => algsFor(caseKey).includes(alg)

    // Add an alg unless it is (canonically) already in the case's list.
    // Returns the cleaned alg string on success, null otherwise.
    const addAlg = (caseKey, alg) => {
        const cleaned = (alg || '').replace(/[()]/g, ' ').trim().replace(/\s+/g, ' ')
        if (!cleaned) return null
        const canon = canonicalAlg(cleaned)
        if (mergedAlgs(caseKey).some(a => canonicalAlg(a) === canon)) return null
        store[caseKey] = [...algsFor(caseKey), cleaned]
        persist()
        return cleaned
    }

    const removeAlg = (caseKey, alg) => {
        const rest = algsFor(caseKey).filter(a => a !== alg)
        if (rest.length === 0) delete store[caseKey]
        else store[caseKey] = rest
        persist()
    }

    // switching algset -> load that set's slot
    watch(() => algset.activeId, (id) => {
        const fresh = readNamespaced(localStorageKey, id, {})
        for (const k of Object.keys(store)) delete store[k]
        Object.assign(store, fresh)
    })

    return {store, algsFor, mergedAlgs, isCustom, addAlg, removeAlg}
})
