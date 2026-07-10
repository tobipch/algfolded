import {reactive, watch} from 'vue'
import {defineStore} from 'pinia'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {canonicalAlg, dedupeAlgs, notationRichness} from '@/helpers/alg_match'
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

    // The full alg list for a case: the collection's algs plus the user's own,
    // with canonically-equivalent spellings collapsed to one entry (a custom
    // alg in richer notation replaces the collection spelling it stands for).
    const mergedAlgs = (caseKey) => dedupeAlgs([
        ...(algset.byId[caseKey]?.algs ?? []),
        ...algsFor(caseKey),
    ])

    const isCustom = (caseKey, alg) => algsFor(caseKey).includes(alg)

    // Add an alg. Keeps parentheses-free whitespace tidy but preserves
    // commutator/conjugate brackets. Rejected when it is canonically identical
    // to an existing alg without bringing richer notation — such an entry
    // would be swallowed by mergedAlgs' dedupe and never show up. Entering a
    // *collection* alg in nicer notation (commutator for a plain sequence) is
    // still allowed — that's the point — and replaces it in the merged list.
    // Returns the cleaned alg string on success, null otherwise.
    const addAlg = (caseKey, alg) => {
        const cleaned = (alg || '').replace(/[()]/g, ' ').trim().replace(/\s+/g, ' ')
        if (!cleaned) return null
        const canon = canonicalAlg(cleaned)
        if (algsFor(caseKey).some(a => canonicalAlg(a) === canon)) return null // dup of own alg
        const coll = (algset.byId[caseKey]?.algs ?? []).find(a => canonicalAlg(a) === canon)
        if (coll && notationRichness(cleaned) <= notationRichness(coll)) return null
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
