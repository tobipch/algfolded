import {reactive, watch} from 'vue'
import {defineStore} from 'pinia'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useAuthStore} from '@/stores/AuthStore'
import {apiFetch} from '@/helpers/api'
import {readNamespaced, writeNamespaced} from '@/helpers/namespaced_storage'
import {canonicalAlg} from '@/helpers/alg_match'

const localStorageKey = 'algfoldedPreferredAlgs'

// Which algorithm the user actually uses for each case (map caseKey -> alg).
// Kept in localStorage (namespaced per algset, like notes) and mirrored to
// the account database when logged in — the server copy wins on load so a
// choice made on one device shows up on the next.
export const usePreferredAlgStore = defineStore('preferredAlgs', () => {
    const algset = useAlgsetStore()
    const auth = useAuthStore()
    const store = reactive(readNamespaced(localStorageKey, algset.activeId, {}))

    const persist = () => writeNamespaced(localStorageKey, algset.activeId, store)

    const pullFromServer = async () => {
        if (!auth.loggedIn) return
        try {
            const data = await apiFetch('/api/case-algs?algset=' + encodeURIComponent(algset.activeId))
            Object.assign(store, data?.algs || {})
            persist()
        } catch (_) { /* offline / API unavailable: keep the local copy */ }
    }

    const pushToServer = (caseKey, alg) => {
        if (!auth.loggedIn) return
        apiFetch('/api/case-algs', {
            method: 'PUT',
            body: {algset: algset.activeId, caseKey, alg},
        }).catch(() => {})
    }

    // The explicitly chosen alg for a case, or null when the default applies.
    const preferredAlg = (caseKey) => store[caseKey] ?? null

    // The user's pick resolved against the case's current alg list, falling
    // back to the list's first alg. Matches canonically too, so a choice made
    // before the collection switched notation (expanded -> commutator) still
    // finds the same algorithm in its new spelling.
    const resolvePreferred = (caseKey, algs) => {
        const p = store[caseKey]
        if (p != null) {
            if (algs.includes(p)) return p
            const c = canonicalAlg(p)
            const match = algs.find(a => canonicalAlg(a) === c)
            if (match) return match
        }
        return algs[0] ?? null
    }

    const setPreferred = (caseKey, alg) => {
        if (alg == null) delete store[caseKey]
        else store[caseKey] = alg
        persist()
        pushToServer(caseKey, alg ?? null)
    }

    // Smart-cube detection hook: store the alg the user actually executed.
    // Returns true when this changed the stored preference (caller may toast).
    const recordDetected = (caseKey, alg) => {
        if (store[caseKey] === alg) return false
        setPreferred(caseKey, alg)
        return true
    }

    // switching algset -> load that set's slot, then let the server overlay it
    watch(() => algset.activeId, (id) => {
        const fresh = readNamespaced(localStorageKey, id, {})
        for (const k of Object.keys(store)) delete store[k]
        Object.assign(store, fresh)
        pullFromServer()
    })
    watch(() => auth.loggedIn, (isIn) => { if (isIn) pullFromServer() })
    pullFromServer()

    return {store, preferredAlg, resolvePreferred, setPreferred, recordDetected}
})
