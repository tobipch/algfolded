import {defineStore} from 'pinia'
import {ref, watch} from 'vue'
import {apiFetch} from '@/helpers/api'
import {useAuthStore} from '@/stores/AuthStore'

const queueKey = 'algfolded_solve_queue'

const loadQueue = () => {
    try {
        const q = JSON.parse(localStorage.getItem(queueKey) || '[]')
        return Array.isArray(q) ? q : []
    } catch (_) {
        return []
    }
}

// Pushes solves to the backend so they land in the account's database.
// Solves are queued in localStorage first and flushed in batches, so nothing
// is lost while offline or logged out — the queue simply drains after the
// next successful login.
export const useSolveSyncStore = defineStore('solveSync', () => {
    const auth = useAuthStore()
    const queue = ref(loadQueue())
    const syncing = ref(false)
    // Bumped after every successful flush so views can refresh server stats.
    const syncedSignal = ref(0)

    const persist = () => localStorage.setItem(queueKey, JSON.stringify(queue.value))

    const flush = async () => {
        if (syncing.value || !auth.loggedIn || queue.value.length === 0) return
        syncing.value = true
        try {
            while (queue.value.length > 0 && auth.loggedIn) {
                const batch = queue.value.slice(0, 100)
                await apiFetch('/api/solves', {method: 'POST', body: {solves: batch}})
                // Only drop what was sent — new solves may have arrived meanwhile.
                queue.value = queue.value.slice(batch.length)
                persist()
            }
            syncedSignal.value++
        } catch (_) {
            // Leave the queue as-is; the next enqueue/login/online event retries.
        } finally {
            syncing.value = false
        }
    }

    // solve: {clientId, algset, caseKey, ms, scramble?, algUsed?, source?, solvedAt}
    const enqueue = (solve) => {
        queue.value.push(solve)
        persist()
        flush()
    }

    // Remove a solve everywhere: from the pending queue and (if already
    // synced) from the server. Used when the user deletes a result.
    const remove = async (clientId) => {
        const before = queue.value.length
        queue.value = queue.value.filter(s => s.clientId !== clientId)
        if (queue.value.length !== before) persist()
        if (auth.loggedIn) {
            try {
                await apiFetch('/api/solves', {method: 'DELETE', body: {clientId}})
            } catch (_) { /* best effort; server keeps at most one stray solve */ }
        }
    }

    watch(() => auth.loggedIn, (isIn) => { if (isIn) flush() })
    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => flush())
    }

    return {queue, syncing, syncedSignal, enqueue, remove, flush}
})
