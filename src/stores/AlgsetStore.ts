import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { AlgCase } from '@/algsets/types'
import { ALGSETS, DEFAULT_ALGSET_ID, getAlgset } from '@/algsets/registry'
import { buildTree } from '@/algsets/tree'
import { useSettingsStore } from '@/stores/SettingsStore'
import { useLetterSchemeStore } from '@/stores/LetterSchemeStore'
import { readString, writeString } from '@/helpers/namespaced_storage'

const activeIdKey = 'ltct_active_algset'

const getInitialId = (): string => {
  const stored = readString(activeIdKey)
  return stored && getAlgset(stored) ? stored : DEFAULT_ALGSET_ID
}

// Holds the currently active algset and its (lazily loaded) cases. This is the
// single place the rest of the app reads case data / hierarchy from.
export const useAlgsetStore = defineStore('algset', () => {
  const settings = useSettingsStore()
  const ls = useLetterSchemeStore()
  const activeId = ref(getInitialId())
  const rawData = ref<unknown>(null)
  const loaded = ref(false)

  const active = computed(() => getAlgset(activeId.value) ?? ALGSETS[0])

  // Cases are derived from the raw data + settings (e.g. the buffer order for
  // 3-twists), so they update reactively when those change.
  //
  // The algs are handed through as the collection spells them. Collections do
  // list the same algorithm in several spellings (wide vs face notation) and
  // that has to be collapsed before anything is shown — but the place that
  // shows algs, CustomAlgsStore.mergedAlgs, has to run dedupeAlgs anyway to
  // merge in the user's own algs. Doing it here as well meant canonicalising
  // every alg of every case on load and on every buffer-order change: ~1600
  // cases and 8000 algs for the edge commutators, all of it thrown away again
  // by the per-case pass.
  const cases = computed<AlgCase[]>(() => {
    if (rawData.value === null) return []
    return active.value.derive(rawData.value, {
      bufferOrder: settings.store.bufferOrder,
      edgeBufferOrder: settings.store.edgeBufferOrder,
    })
  })

  const byId = computed<Record<string, AlgCase>>(() => {
    const map: Record<string, AlgCase> = {}
    for (const c of cases.value) map[c.id] = c
    return map
  })

  const tree = computed(() => buildTree(cases.value, active.value.levels))

  // Human-readable label for a case id, delegated to the active algset so each
  // set controls its own format (both translate stickers through the scheme).
  const caseLabel = (id: string): string => {
    const c = byId.value[id]
    if (!c) return id
    return active.value.caseLabel(c, ls.toLetter)
  }

  // Secondary label shown in parentheses next to a result (piece notation).
  // Sets that don't define one fall back to the raw id; '' hides it.
  const caseSecondary = (id: string): string => {
    const c = byId.value[id]
    if (!c) return id
    return active.value.caseSecondary ? active.value.caseSecondary(c, ls.toLetter) : id
  }

  async function activate(id: string): Promise<void> {
    const set = getAlgset(id)
    if (!set) return
    activeId.value = id
    loaded.value = false
    rawData.value = null
    rawData.value = await set.load()
    loaded.value = true
    writeString(activeIdKey, id)
  }

  return { activeId, active, cases, byId, tree, loaded, activate, caseLabel, caseSecondary }
})
