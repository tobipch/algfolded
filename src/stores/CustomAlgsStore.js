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

    // Whitespace/parentheses tidy-up shared by addAlg and blockingAlg, so both
    // judge exactly the same string.
    const clean = (alg) => (alg || '').replace(/[()]/g, ' ').trim().replace(/\s+/g, ' ')

    // The already-known alg that stops `alg` from being added, or null when it
    // can be added. An alg is blocked when it is canonically identical to one
    // the case already lists without bringing richer notation — such an entry
    // would be swallowed by mergedAlgs' dedupe and never show up. Entering a
    // *collection* alg in nicer notation (commutator for a plain sequence) is
    // still allowed — that's the point — and replaces it in the merged list.
    // Returned (rather than just a boolean) so the UI can point at the alg the
    // input collides with; it is often hidden past the list's display cutoff,
    // which is what makes a bare "rejected" flag so puzzling.
    const blockingAlg = (caseKey, alg) => {
        const cleaned = clean(alg)
        if (!cleaned) return null
        const canon = canonicalAlg(cleaned)
        const own = algsFor(caseKey).find(a => canonicalAlg(a) === canon)
        if (own) return own
        const coll = (algset.byId[caseKey]?.algs ?? []).find(a => canonicalAlg(a) === canon)
        if (coll && notationRichness(cleaned) <= notationRichness(coll)) return coll
        return null
    }

    // Add an alg. Returns the cleaned alg string on success, null when it is
    // blocked (see blockingAlg) or empty.
    const addAlg = (caseKey, alg) => {
        const cleaned = clean(alg)
        if (!cleaned || blockingAlg(caseKey, cleaned)) return null
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

    return {store, algsFor, mergedAlgs, isCustom, blockingAlg, addAlg, removeAlg}
})
